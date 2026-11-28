// Prueba del puente sin internet: Firestore falso en memoria. Correr: node impresoras/prueba.mjs
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { impresoraDe, cierreDe, gramosDe, impresionDe } from "./logica.mjs";

const P = [
  { id: "p1", name: "Creality K1 Max", type: "FDM" }, { id: "p2", name: "Creality Hi 1", type: "FDM" },
  { id: "p3", name: "Creality Hi 2", type: "FDM" }, { id: "p4", name: "Creality LD-002R", type: "Resina" },
  { id: "e1", name: "Elegoo Centuri Carbon 2", type: "FDM" },
];
assert.equal(impresoraDe({ id: "a", modelo: "K1 Max" }, P), "p1");
assert.equal(impresoraDe({ id: "b", modelo: "Centauri Carbon 2" }, P), "e1");
assert.equal(impresoraDe({ id: "c", modelo: "Creality Hi" }, P), null, "dos Hi: no se adivina");
assert.equal(impresoraDe({ id: "c", modelo: "Creality Hi" }, P.map((p) => p.id === "p3" ? { ...p, maquina: "c" } : p)), "p3");
assert.equal(impresoraDe({ id: "d", modelo: "Creality Hi" }, P.map((p) => p.id === "p3" ? { ...p, maquina: "c" } : p)), "p2", "la otra Hi queda sola");

const ahora = Date.now();
const job = { status: "printing", duration: 120, quantity: 1, remaining: 120, runStart: ahora - 90 * 60000 };
assert.equal(cierreDe(job, { estado: "terminada", antes: "imprimiendo" }, ahora).status, "done");
assert.equal(cierreDe({ ...job, quantity: 4, remaining: 480 }, { estado: "terminada", antes: "imprimiendo" }, ahora).status, "paused", "tanda");
assert.equal(cierreDe(job, { estado: "terminada", antes: null, inicio: ahora - 10 * 3600000 }, ahora), null, "impresión vieja no cierra");
assert.equal(cierreDe(job, { estado: "terminada", antes: null, inicio: ahora - 80 * 60000 }, ahora).status, "done");

assert.equal(gramosDe(1000, "PLA"), 3);   // 1 m de PLA 1,75 ≈ 3 g
const real = cierreDe(job, { estado: "terminada", antes: "imprimiendo", tiempoSeg: 5400, usadoMm: 10000 }, ahora);
assert.equal(real.minReales, 90); assert.equal(real.gramosReales, 29.8);
const t1 = cierreDe({ ...job, quantity: 4, remaining: 480, material: "PETG" }, { estado: "terminada", antes: "imprimiendo", tiempoSeg: 3600, usadoMm: 5000 }, ahora);
assert.equal(t1.tandas, 1); assert.equal(t1.minReales, 60);
assert.equal(impresionDe({ id: "k", estado: "terminada", antes: "imprimiendo", inicio: 1000 * 60000, tiempoSeg: 60 }, "p1", ahora).id, "k-1000");
assert.equal(impresionDe({ id: "k", estado: "terminada", antes: null, inicio: 5 }, "p1", ahora), null);

// ── Firestore falso ──
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({ client_email: "x@y", project_id: "demo", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
const db = new Map(); let version = 1;
const guardar = (ruta, campos) => db.set(ruta, { ...(db.get(ruta) || {}), ...campos, _t: String(version++) });
guardar("config/puente", { clave: "abcdefghijklmnopqrstuvwx" });
P.forEach((p) => guardar("printers/" + p.id, p));
guardar("jobs/j1", { ...job, printer: "p1", fileName: "Llavero" });
guardar("jobs/j2", { ...job, printer: "p2", fileName: "Otro" });
const aF = (o) => ({ fields: Object.fromEntries(Object.entries(o).filter(([k]) => k !== "_t").map(([k, v]) => [k, v === null ? { nullValue: null } : typeof v === "number" ? { integerValue: String(v) } : typeof v === "boolean" ? { booleanValue: v } : { stringValue: String(v) }])) });
const valor = (v) => "nullValue" in v ? null : "integerValue" in v ? Number(v.integerValue) : "doubleValue" in v ? v.doubleValue : "booleanValue" in v ? v.booleanValue : v.stringValue;
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(url), js = (x, s = 200) => new Response(JSON.stringify(x), { status: s });
  if (u.host === "oauth2.googleapis.com") return js({ access_token: "t", expires_in: 3600 });
  const ruta = decodeURIComponent(u.pathname.split("/documents")[1] || "").replace(/^\//, "");
  if (u.pathname.endsWith(":commit")) {
    for (const w of JSON.parse(op.body).writes) {
      const r = w.transform.document.split("/documents/")[1], d = db.get(r) || {}, c = {};
      for (const t of w.transform.fieldTransforms) {
        if (t.increment) c[t.fieldPath] = (Number(d[t.fieldPath]) || 0) + Number(t.increment.integerValue);
        if (t.minimum) c[t.fieldPath] = d[t.fieldPath] == null ? Number(t.minimum.integerValue) : Math.min(Number(d[t.fieldPath]), Number(t.minimum.integerValue));
      }
      guardar(r, c);
    }
    return js({});
  }
  if (u.pathname.endsWith(":runQuery")) {
    const f = JSON.parse(op.body).structuredQuery.where.compositeFilter.filters.map((x) => [x.fieldFilter.field.fieldPath, x.fieldFilter.value.stringValue]);
    return js([...db].filter(([k, v]) => k.startsWith("jobs/") && f.every(([c, val]) => v[c] === val)).map(([k, v]) => ({ document: { name: "x/" + k, ...aF(v), updateTime: v._t } })));
  }
  if (op.method === "PATCH") {
    const pre = u.searchParams.get("currentDocument.updateTime");
    if (pre && db.get(ruta)?._t !== pre) return js({ error: "cambió" }, 400);
    const campos = Object.fromEntries(Object.entries(JSON.parse(op.body).fields).map(([k, v]) => [k, valor(v)]));
    guardar(ruta, campos); return js({});
  }
  if (ruta === "printers") return js({ documents: [...db].filter(([k]) => k.startsWith("printers/")).map(([k, v]) => ({ name: "x/" + k, ...aF(v) })) });
  const d = db.get(ruta); return d ? js({ name: "x/" + ruta, ...aF(d) }) : js({}, 404);
};
const { POST } = await import("../api/puente.mjs");
const enviar = async (cuerpo) => { const r = await POST(new Request("http://x/api/puente", { method: "POST", body: JSON.stringify(cuerpo) })); return { s: r.status, ...(await r.json()) }; };
const K = { clave: "abcdefghijklmnopqrstuvwx" };
const k1 = { id: "creality-k1max", marca: "Creality", modelo: "K1 Max", estado: "imprimiendo", progreso: 40, faltaSeg: 3000, archivo: "llavero" };

assert.equal((await enviar({ clave: "mal-mal-mal-mal-mal-mal" })).s, 401);
assert.equal((await enviar({ ...K, fuente: "pc", latido: true, maquinas: [{ ...k1, antes: null }] })).s, 200);
assert.equal(db.get("maquinas/creality-k1max").printer, "p1");
assert.equal(db.get("jobs/j1").status, "printing");
// El celular queda en espera mientras la PC late
const c = await enviar({ ...K, fuente: "celu", latido: true, maquinas: [{ ...k1, estado: "terminada", antes: "imprimiendo" }] });
assert.equal(c.espera, true); assert.equal(db.get("jobs/j1").status, "printing", "el celular en espera no toca nada");
// La PC ve que terminó: se cierra el trabajo de la K1 Max y no el de la Hi
const t = await enviar({ ...K, fuente: "pc", maquinas: [{ ...k1, estado: "terminada", progreso: 100, faltaSeg: 0, antes: "imprimiendo", inicio: Date.now() - 3600000, tiempoSeg: 3600, usadoMm: 8000 }] });
assert.equal(t.cerrados, 1); assert.equal(db.get("jobs/j1").status, "done"); assert.equal(db.get("jobs/j1").finImpresora, true);
assert.equal(db.get("jobs/j1").finAuto, db.get("jobs/j1").endedAt, "finAuto = endedAt para el aviso de Telegram");
assert.equal(db.get("jobs/j2").status, "printing");
assert.ok([...db.keys()].some((k) => k.startsWith("impresiones/creality-k1max-")), "queda registrada la impresión");
assert.equal(db.get("printers/p1").segPuente, 3600, "suma las horas reales a la máquina");
await enviar({ ...K, fuente: "pc", maquinas: [{ ...k1, estado: "terminada", progreso: 100, faltaSeg: 0, antes: "imprimiendo", inicio: Date.now() - 3600000, tiempoSeg: 3600, usadoMm: 8000 }] });
assert.equal(db.get("printers/p1").segPuente, 3600, "la misma impresión no se cuenta dos veces");
// PC apagada (latido viejo): el celular toma el control
guardar("config/puente", { latidoPc: Date.now() - 10 * 60000 });
const c2 = await enviar({ ...K, fuente: "celu", latido: true, maquinas: [] });
assert.equal(c2.espera, false); assert.equal(db.get("config/puente").activo, "celu");
console.log("Puente: todo bien");
