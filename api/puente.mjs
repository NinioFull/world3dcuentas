// Puente de impresoras → Manager. El programa del taller (PC o celular) manda acá lo que ve en cada impresora;
// esto lo guarda en Firestore (maquinas/<id>) y, cuando una máquina termina de verdad, cierra el trabajo que
// estaba imprimiendo en ella (el aviso de Telegram lo manda el Apps Script, igual que con el contador).
// La clave la crea el Manager (Impresoras → Conexión) y vive en config/puente: no hay variables nuevas en Vercel.
import { timingSafeEqual } from "node:crypto";
import { cuentaServicio, tokenGoogle, aObjeto } from "../alexa/datos.mjs";
import { impresoraDe, terminoAhora, cierreDe, limpiarMaquina, PC_VIVA_MS } from "../impresoras/logica.mjs";

const base = () => `https://firestore.googleapis.com/v1/projects/${cuentaServicio().project_id}/databases/(default)/documents`;
const aValor = (x) => x === null || x === undefined ? { nullValue: null }
  : typeof x === "boolean" ? { booleanValue: x }
  : typeof x === "number" ? (Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x })
  : { stringValue: String(x) };

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { authorization: "Bearer " + (await tokenGoogle()), "content-type": "application/json" } });
  return r;
}
async function leerDoc(ruta) {
  const r = await pedir(`${base()}/${ruta}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error("leer " + ruta + " " + r.status);
  return aObjeto(await r.json());
}
// Escribe solo los campos dados (los demás quedan). Con "siNoCambio" falla si alguien lo tocó desde que se leyó.
async function escribir(ruta, campos, siNoCambio) {
  const q = Object.keys(campos).map((c) => "updateMask.fieldPaths=" + encodeURIComponent(c)).join("&")
    + (siNoCambio ? "&currentDocument.updateTime=" + encodeURIComponent(siNoCambio) : "");
  const fields = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, aValor(v)]));
  const r = await pedir(`${base()}/${ruta}?${q}`, { method: "PATCH", body: JSON.stringify({ fields }) });
  if (!r.ok && !siNoCambio) throw new Error("escribir " + ruta + " " + r.status + ": " + (await r.text()).slice(0, 200));
  return r.ok;
}
async function trabajosImprimiendo(printerId) {
  const igual = (campo, v) => ({ fieldFilter: { field: { fieldPath: campo }, op: "EQUAL", value: { stringValue: v } } });
  const r = await pedir(`${base()}:runQuery`, { method: "POST", body: JSON.stringify({ structuredQuery: {
    from: [{ collectionId: "jobs" }], where: { compositeFilter: { op: "AND", filters: [igual("printer", printerId), igual("status", "printing")] } },
  } }) });
  if (!r.ok) throw new Error("buscar trabajos " + r.status);
  return (await r.json()).filter((x) => x.document).map((x) => ({ ...aObjeto(x.document), _updateTime: x.document.updateTime }));
}

// Se reutilizan entre pedidos mientras la función siga despierta
let cacheConfig = { at: 0, datos: null }, cacheImpresoras = { at: 0, lista: [] };
async function configPuente(fresca) {
  if (!fresca && cacheConfig.datos && Date.now() - cacheConfig.at < 60000) return cacheConfig.datos;
  cacheConfig = { at: Date.now(), datos: await leerDoc("config/puente") };
  return cacheConfig.datos;
}
async function impresoras() {
  if (Date.now() - cacheImpresoras.at < 120000) return cacheImpresoras.lista;
  const r = await pedir(`${base()}/printers?pageSize=50`);
  if (!r.ok) throw new Error("impresoras " + r.status);
  cacheImpresoras = { at: Date.now(), lista: ((await r.json()).documents || []).map(aObjeto) };
  return cacheImpresoras.lista;
}
const mismaClave = (a, b) => {
  const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || ""));
  return x.length === y.length && x.length >= 16 && timingSafeEqual(x, y);
};

export async function POST(request) {
  let cuerpo;
  try { cuerpo = await request.json(); } catch { return Response.json({ error: "JSON no válido" }, { status: 400 }); }
  try {
    let cfg = await configPuente(false);
    if (!cfg || !mismaClave(cuerpo.clave, cfg.clave)) {
      cfg = await configPuente(true);   // quizá la clave se cambió recién en el Manager
      if (!cfg || !mismaClave(cuerpo.clave, cfg.clave)) return Response.json({ error: "clave" }, { status: 401 });
    }
    const ahora = Date.now(), fuente = cuerpo.fuente === "celu" ? "celu" : "pc";
    const latido = fuente === "pc" ? { latidoPc: ahora, versionPc: String(cuerpo.version || "").slice(0, 12) } : { latidoCelu: ahora, versionCelu: String(cuerpo.version || "").slice(0, 12) };

    // El celular es respaldo: si la PC latió hace poco, queda en espera y no se guarda nada de lo que mande
    if (fuente === "celu") {
      const fresca = await configPuente(true);
      if (ahora - Number(fresca?.latidoPc || 0) < PC_VIVA_MS) {
        if (cuerpo.latido) await escribir("config/puente", { ...latido, activo: "pc" });
        return Response.json({ ok: true, espera: true });
      }
    }
    if (cuerpo.latido) await escribir("config/puente", { ...latido, activo: fuente });

    const maquinas = (Array.isArray(cuerpo.maquinas) ? cuerpo.maquinas : []).slice(0, 12).map(limpiarMaquina).filter(Boolean);
    let cerrados = 0;
    if (maquinas.length) {
      const lista = await impresoras();
      for (const m of maquinas) {
        const printer = impresoraDe(m, lista);
        const { antes, id, ...datos } = m;
        await escribir(`maquinas/${id}`, { ...datos, printer, at: ahora, fuente, ...(antes !== m.estado ? { cambioAt: ahora, estadoAntes: antes } : {}) });
        if (printer && terminoAhora(m)) {
          for (const j of await trabajosImprimiendo(printer)) {
            const cambios = cierreDe(j, m, ahora);
            if (cambios && await escribir(`jobs/${j.id}`, cambios, j._updateTime)) cerrados++;
          }
        }
      }
    }
    return Response.json({ ok: true, espera: false, cerrados });
  } catch (e) {
    console.error("Puente:", e);
    return Response.json({ error: "No pude guardar: " + e.message }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ ok: true, puente: "WORLD3D", listo: !!process.env.FIREBASE_SERVICE_ACCOUNT });
}
