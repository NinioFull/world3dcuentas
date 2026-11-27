// Avisos en voz alta en el parlante, con Voice Monkey (voicemonkey.io): Alexa no deja que una skill propia
// hable sola, así que el aviso pasa por su API. Variables en Vercel:
//   VOICEMONKEY_TOKEN    token de la API (Voice Monkey › Settings › API)
//   VOICEMONKEY_DEVICE   id del "Speaker" creado en Voice Monkey (uno o varios separados por coma)
//   VOICEMONKEY_SILENCIO opcional, horas sin avisos en hora de Bolivia, por defecto "22-7"
// Sin token no hace nada. Nunca hace fallar a quien lo llama.

const BOLIVIA = -4 * 3600000;

export function enSilencio(ahora = Date.now(), rango = process.env.VOICEMONKEY_SILENCIO || "22-7") {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec(String(rango).trim());
  if (!m) return false;
  const h = new Date(ahora + BOLIVIA).getUTCHours(), desde = +m[1], hasta = +m[2];
  return desde > hasta ? h >= desde || h < hasta : h >= desde && h < hasta;
}

export async function avisar(texto, ahora = Date.now()) {
  const token = process.env.VOICEMONKEY_TOKEN, device = process.env.VOICEMONKEY_DEVICE;
  if (!token || !device || !texto || enSilencio(ahora)) return false;
  try {
    const r = await fetch("https://api-v3.voicemonkey.io/announce", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, device: device.split(",").map((d) => d.trim()).filter(Boolean), speech: texto }),
      signal: AbortSignal.timeout(4000),
    });
    if (!r.ok) console.warn("Voice Monkey", r.status, (await r.text()).slice(0, 200));
    return r.ok;
  } catch (e) {
    console.warn("Voice Monkey:", e.message);
    return false;
  }
}

const nombreImp = (p) => (p?.name || "").replace(/^Creality\s+|^Elegoo\s+/i, "") || "una impresora";
const limpio = (a) => String(a || "").replace(/\.(gcode|3mf|bgcode)$/i, "").replace(/[_-]+/g, " ").trim();

// Qué decir cuando una máquina cambia de estado (lo llama el puente). null = nada que avisar.
export function avisoDeCambio(m, printer, trabajos = []) {
  if (m.antes == null || m.antes === m.estado) return null;
  const imp = nombreImp(printer), que = trabajos[0]?.fileName?.trim() || limpio(m.archivo);
  const ocupada = ["preparando", "imprimiendo", "pausada"].includes(m.antes);
  if (m.estado === "terminada" && ocupada) return `Terminó ${que || "la impresión"} en la ${imp}.`;
  if (m.estado === "pausada" && m.antes === "imprimiendo") return `Atención: la ${imp} se pausó${que ? ` con ${que}` : ""}.`;
  if (m.estado === "cancelada" && ocupada) return `Atención: se canceló la impresión en la ${imp}.`;
  return null;
}
