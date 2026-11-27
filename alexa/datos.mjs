// Lectura de la cola (Firestore) con una cuenta de servicio de Firebase, y de los pedidos web (Supabase).
// Variables de entorno en Vercel:
//   FIREBASE_SERVICE_ACCOUNT  JSON de la clave privada (Firebase > Configuración > Cuentas de servicio).
//                            Lee la cola y solo escribe al anotar un pedido confirmado (crearTrabajo).
//   SUPABASE_SECRET_KEY       opcional: clave secreta de Supabase, para contar los pedidos web esperando pago / pagados.
import { createSign } from "node:crypto";

const SUPABASE_URL = "https://swlmlwmjicsewwtudeah.supabase.co";

let cuenta = null;
export function cuentaServicio() {
  if (cuenta) return cuenta;
  let raw = process.env.FIREBASE_SERVICE_ACCOUNT || "";
  if (!raw.trim().startsWith("{")) raw = Buffer.from(raw, "base64").toString("utf8"); // por si se pegó en base64
  const c = JSON.parse(raw);
  if (!c.client_email || !c.private_key || !c.project_id) throw new Error("FIREBASE_SERVICE_ACCOUNT incompleta");
  c.private_key = c.private_key.replace(/\\n/g, "\n");
  return (cuenta = c);
}

const b64url = (x) => Buffer.from(typeof x === "string" ? x : JSON.stringify(x)).toString("base64url");

// Se pide una vez y se reutiliza mientras dure (también entre consultas en paralelo)
let token = { promesa: null, hasta: 0 };
export function tokenGoogle() {
  if (token.promesa && token.hasta > Date.now() + 60000) return token.promesa;
  token = { promesa: pedirToken(), hasta: Date.now() + 3000000 };
  token.promesa.catch(() => { token = { promesa: null, hasta: 0 }; });
  return token.promesa;
}
async function pedirToken() {
  const c = cuentaServicio();
  const ahora = Math.floor(Date.now() / 1000);
  const sinFirma = b64url({ alg: "RS256", typ: "JWT" }) + "." + b64url({
    iss: c.client_email, scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600,
  });
  const firma = createSign("RSA-SHA256").update(sinFirma).sign(c.private_key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: sinFirma + "." + firma }),
  });
  if (!r.ok) throw new Error("token Google " + r.status + ": " + (await r.text()).slice(0, 200));
  const j = await r.json();
  token.hasta = Date.now() + (j.expires_in || 3600) * 1000;
  return j.access_token;
}

function valor(v) {
  if ("stringValue" in v) return v.stringValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("nullValue" in v) return null;
  if ("timestampValue" in v) return Date.parse(v.timestampValue);
  if ("mapValue" in v) { const o = {}; for (const k in v.mapValue.fields || {}) o[k] = valor(v.mapValue.fields[k]); return o; }
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(valor);
  return "";
}
// _upd: hora de la última modificación (para no pisar un cambio hecho desde el Manager mientras se hablaba)
export const aObjeto = (d) => { const o = { id: d.name.split("/").pop(), _upd: d.updateTime }; for (const k in d.fields || {}) o[k] = valor(d.fields[k]); return o; };
const aFirestore = (x) => x === null || x === undefined ? { nullValue: null }
  : typeof x === "number" ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x })
  : typeof x === "boolean" ? { booleanValue: x }
  : Array.isArray(x) ? { arrayValue: { values: x.map(aFirestore) } }
  : typeof x === "object" ? { mapValue: { fields: Object.fromEntries(Object.entries(x).map(([k, v]) => [k, aFirestore(v)])) } }
  : { stringValue: String(x) };
const raiz = () => `https://firestore.googleapis.com/v1/projects/${cuentaServicio().project_id}/databases/(default)/documents`;
const literal = (x) => typeof x === "number" ? { integerValue: String(Math.round(x)) } : typeof x === "boolean" ? { booleanValue: x } : { stringValue: String(x) };

async function consulta(col, filtro, campos) {
  const c = cuentaServicio();
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${c.project_id}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { authorization: "Bearer " + (await tokenGoogle()), "content-type": "application/json" },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: col }],
      ...(filtro ? { where: filtro } : {}),
      ...(campos ? { select: { fields: campos.map((fieldPath) => ({ fieldPath })) } } : {}),
    } }),
  });
  if (!r.ok) throw new Error("Firestore " + col + " " + r.status + ": " + (await r.text()).slice(0, 200));
  return (await r.json()).filter((x) => x.document).map((x) => aObjeto(x.document));
}
const campo = (fieldPath, op, v) => ({ fieldFilter: { field: { fieldPath }, op, value: Array.isArray(v) ? { arrayValue: { values: v.map(literal) } } : literal(v) } });

export const ACTIVOS = ["pending", "printing", "paused", "done", "shipping"];

// Todo lo que no está entregado + lo entregado que quedó debiendo + impresoras
export async function leerCola() {
  const [activos, deben, printers, maquinas, puente] = await Promise.all([
    consulta("jobs", campo("status", "IN", ACTIVOS)),
    consulta("jobs", campo("debe", "EQUAL", true)),
    consulta("printers"),
    consulta("maquinas").catch(() => []),
    leerDoc("config/puente").catch(() => null),
  ]);
  return { jobs: activos, deben: deben.filter((j) => j.status === "shipped"), printers, maquinas, puente };
}

export async function leerDoc(ruta) {
  const r = await fetch(`${raiz()}/${ruta}`, { headers: { authorization: "Bearer " + (await tokenGoogle()) } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("leer " + ruta + " " + r.status);
  return aObjeto(await r.json());
}

// Horas de cada impresora (como el Manager): todos los trabajos (campos justos) y las fallas
export async function leerParaMantenimiento() {
  const [trabajos, fallas, printers] = await Promise.all([
    consulta("jobs", null, ["printer", "status", "jobType", "duration", "quantity", "remaining"]),
    consulta("fallas", null, ["printer", "minutos"]).catch(() => []),
    consulta("printers"),
  ]);
  return { trabajos, fallas, printers };
}
export const leerStock = async () => { const [stock, productos] = await Promise.all([consulta("stock"), consulta("products")]); return { stock, productos }; };
export const leerProductos = () => consulta("products");
export async function leerCostos() {
  const [mat, op] = await Promise.all([leerDoc("config/matCosts").catch(() => null), leerDoc("config/operacion").catch(() => null)]);
  return { matCosts: mat || {}, operacion: op || {} };
}

// Documento nuevo con id generado por Firestore
export async function crearDoc(col, campos) {
  const r = await fetch(`${raiz()}/${col}`, {
    method: "POST",
    headers: { authorization: "Bearer " + (await tokenGoogle()), "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, aFirestore(v)])) }),
  });
  if (!r.ok) throw new Error("crear " + col + " " + r.status + ": " + (await r.text()).slice(0, 200));
  return aObjeto(await r.json()).id;
}

// Trabajos que tocan plata desde una fecha: tomados (adelanto) o entregados/cobrados (saldo)
export async function leerMovimientos(desde) {
  const [tomados, entregados, cobrados] = await Promise.all([
    consulta("jobs", campo("createdAt", "GREATER_THAN_OR_EQUAL", desde)),
    consulta("jobs", campo("shippedAt", "GREATER_THAN_OR_EQUAL", desde)),
    consulta("jobs", campo("saldoCobradoAt", "GREATER_THAN_OR_EQUAL", desde)),
  ]);
  const porId = new Map();
  [...tomados, ...entregados, ...cobrados].forEach((j) => porId.set(j.id, j));
  return [...porId.values()];
}

// Pedidos web abiertos (null si no hay clave de Supabase configurada)
export async function leerWeb() {
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!clave) return null;
  const q = 'select=id,estado,tipo,total,cliente_nombre,creado&estado=in.(enviado,"pago confirmado")&order=creado.desc&limit=50';
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?${q}`, { headers: { apikey: clave } });
  if (!r.ok) throw new Error("Supabase " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.json();
}

// Catálogo, clientes (nombre y teléfono de cada trabajo) e impresoras, para completar un pedido dictado
export async function leerParaPedido() {
  const [productos, trabajos, printers] = await Promise.all([
    consulta("products"),
    consulta("jobs", null, ["clientName", "clientPhone", "createdAt"]),
    consulta("printers"),
  ]);
  return { productos, trabajos, printers };
}

// Crea el trabajo con un id fijo: si Alexa repite el mismo pedido, no se anota dos veces (devuelve false)
export async function crearTrabajo(id, job) {
  const c = cuentaServicio();
  const fields = Object.fromEntries(Object.entries(job).map(([k, v]) => [k, aFirestore(v)]));
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${c.project_id}/databases/(default)/documents/jobs?documentId=${encodeURIComponent(id)}`, {
    method: "POST",
    headers: { authorization: "Bearer " + (await tokenGoogle()), "content-type": "application/json" },
    body: JSON.stringify({ fields }),
  });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error("crear trabajo " + r.status + ": " + (await r.text()).slice(0, 200));
  return true;
}

// Cambia campos de un trabajo solo si nadie lo tocó desde que se leyó (updateTime). Devuelve false si cambió.
export const actualizarTrabajo = (id, cambios, updateTime) => actualizarDoc("jobs", id, cambios, updateTime);
export async function actualizarDoc(col, id, cambios, updateTime) {
  const mask = Object.keys(cambios).map((k) => "updateMask.fieldPaths=" + encodeURIComponent(k)).join("&");
  const pre = updateTime ? "&currentDocument.updateTime=" + encodeURIComponent(updateTime) : "";
  const r = await fetch(`${raiz()}/${col}/${encodeURIComponent(id)}?${mask}${pre}`, {
    method: "PATCH",
    headers: { authorization: "Bearer " + (await tokenGoogle()), "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(cambios).map(([k, v]) => [k, aFirestore(v)])) }),
  });
  if (r.status === 400 || r.status === 409 || r.status === 412) {
    const t = await r.text();
    if (/FAILED_PRECONDITION|updateTime|ABORTED/i.test(t)) return false;
    throw new Error("actualizar " + r.status + ": " + t.slice(0, 200));
  }
  if (!r.ok) throw new Error("actualizar " + r.status + ": " + (await r.text()).slice(0, 200));
  return true;
}
