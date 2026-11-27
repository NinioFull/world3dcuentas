// Aviso hablado de pedido web nuevo: lo llama un webhook de Supabase (Database › Webhooks, tabla pedidos, INSERT).
// No confía en lo que llega: con el id vuelve a leer el pedido en Supabase (SUPABASE_SECRET_KEY), solo avisa
// pedidos recientes y una sola vez por pedido (config/avisosWeb en Firestore). Así no hace falta otra clave.
import { leerDoc, actualizarDoc } from "../alexa/datos.mjs";
import { avisar } from "../alexa/avisar.mjs";
import { lista } from "../alexa/respuestas.mjs";

const SUPABASE_URL = "https://swlmlwmjicsewwtudeah.supabase.co";

async function leerPedido(id) {
  const clave = process.env.SUPABASE_SECRET_KEY;
  if (!clave) throw new Error("falta SUPABASE_SECRET_KEY");
  const q = `select=id,estado,tipo,total,cliente_nombre,creado,items,perfiles(nombre)&id=eq.${encodeURIComponent(id)}&limit=1`;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/pedidos?${q}`, { headers: { apikey: clave } });
  if (!r.ok) throw new Error("Supabase " + r.status);
  return (await r.json())[0] || null;
}

// Qué decir (null = no se avisa)
export function textoPedido(p, ahora = Date.now()) {
  if (!p || p.estado !== "enviado") return null;
  if (ahora - Date.parse(p.creado || 0) > 30 * 60000) return null;   // solo pedidos recién hechos
  const quien = (p.cliente_nombre || p.perfiles?.nombre || "").trim();
  const items = (Array.isArray(p.items) ? p.items : []).filter((it) => !/^vale:/.test(it.id || ""));
  const nombre = (it) => String(it.nombre || "").replace(/\s*\([^()]*\)\s*$/, "").trim();
  if (p.tipo === "cotizacion") return `Nueva cotización por la web${quien ? ` de ${quien}` : ""}${items[0] ? `: ${nombre(items[0])}` : ""}.`;
  const que = items.length ? lista(items.map((it) => (Number(it.cant) > 1 ? `${Number(it.cant)} ` : "") + nombre(it)), 2) : "";
  const total = Math.round(Number(p.total) || 0);
  return `Nuevo pedido por la web, número ${p.id}${quien ? `, de ${quien}` : ""}${que ? `: ${que}` : ""}${total ? `, ${total} bolivianos` : ""}. Está esperando el pago.`;
}

export async function POST(request) {
  let cuerpo;
  try { cuerpo = await request.json(); } catch { return Response.json({ error: "JSON no válido" }, { status: 400 }); }
  const id = Number(cuerpo?.record?.id ?? cuerpo?.id);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ ok: true, aviso: false });
  try {
    const p = await leerPedido(id);
    const texto = textoPedido(p);
    if (!texto) return Response.json({ ok: true, aviso: false });
    // Una sola vez por pedido
    const reg = await leerDoc("config/avisosWeb");
    const ids = Array.isArray(reg?.ids) ? reg.ids : [];
    if (ids.includes(id)) return Response.json({ ok: true, aviso: false, repetido: true });
    const guardado = await actualizarDoc("config", "avisosWeb", { ids: [...ids, id].slice(-200) }, reg?._upd);
    if (!guardado) return Response.json({ ok: true, aviso: false, repetido: true });   // otro aviso le ganó
    const ok = await avisar(texto);
    return Response.json({ ok: true, aviso: ok });
  } catch (e) {
    console.error("aviso-web:", e);
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ ok: true, aviso: "pedidos web" });
}
