// Reglas del puente de impresoras, sin red: qué impresora del Manager es cada máquina y qué hacer con el
// trabajo cuando la máquina termina. Se prueban sin Firebase (impresoras/prueba.mjs).

export const OCUPADA = new Set(["preparando", "imprimiendo", "pausada"]);
export const PC_VIVA_MS = 200000;   // la PC late cada ~2 min; si pasan más de 3 y pico, el celular toma el control

const RUIDO = new Set(["creality", "elegoo", "cr", "centauri", "centuri", "impresora", "3d"]);
const palabras = (t) => String(t || "").toLowerCase().replace(/ender-?3/g, "ender3").split(/[^a-z0-9]+/).filter((x) => x && !RUIDO.has(x));

// Impresora del Manager que corresponde a la máquina: la vinculada a mano (printer.maquina) o, si no hay,
// la única cuyo nombre contiene todas las palabras del modelo ("Creality K1 Max" ↔ "K1 Max").
// Dos iguales (las dos Hi) no se adivinan: se eligen en el Manager.
export function impresoraDe(maquina, impresoras) {
  const vinc = impresoras.find((p) => p.maquina === maquina.id);
  if (vinc) return vinc.id;
  const clave = palabras(maquina.modelo);
  if (!clave.length) return null;
  const libres = impresoras.filter((p) => !p.maquina && p.type !== "Resina");
  const exactas = libres.filter((p) => { const n = palabras(p.name); return n.length === clave.length && clave.every((c) => n.includes(c)); });
  if (exactas.length === 1) return exactas[0].id;
  const contienen = libres.filter((p) => { const n = palabras(p.name); return clave.every((c) => n.includes(c)); });
  return contienen.length === 1 ? contienen[0].id : null;
}

// ¿La máquina acaba de terminar? Con "antes" (lo último que mandó el puente) es seguro. Sin "antes"
// (el puente recién arrancó y la encontró terminada) solo cuenta si esa impresión empezó después que el trabajo.
export function terminoAhora(m) {
  return m.estado === "terminada" && (OCUPADA.has(m.antes) || m.antes == null);
}

// Gramos a partir de los milímetros de filamento de 1,75 mm que informa la impresora
const DENSIDAD = { PLA: 1.24, PETG: 1.27, ABS: 1.04, ASA: 1.07, TPU: 1.21, NYLON: 1.14 };
export function gramosDe(mm, material) {
  if (!(Number(mm) > 0)) return null;
  const d = DENSIDAD[String(material || "").toUpperCase().replace(/[^A-Z]/g, "")] || 1.24;
  return Math.round(Number(mm) * Math.PI * 0.875 * 0.875 / 1000 * d * 10) / 10;
}

// Qué escribir en un trabajo "imprimiendo" de esa impresora cuando la máquina terminó.
// null = no tocarlo. Varias unidades con mucho tiempo por delante = terminó una tanda: queda en pausa con lo que falta.
export function cierreDe(job, m, ahora) {
  if (job.status !== "printing" || job.jobType === "design") return null;
  const inicioJob = Number(job.runStart || job.startedAt || 0);
  if (m.antes == null && !(m.inicio && inicioJob && m.inicio >= inicioJob - 15 * 60000)) return null;
  const unidades = Math.max(1, Number(job.quantity) || 1);
  const total = (Number(job.duration) || 0) * unidades;
  const restante = Math.max(0, (Number(job.remaining) || 0) - (inicioJob && job.runStart ? Math.floor((ahora - Number(job.runStart)) / 60000) : 0));
  // Lo que gastó de verdad (se suma tanda a tanda): minutos y gramos que informa la impresora
  const reales = {};
  if (m.tiempoSeg > 0) reales.minReales = Math.round((Number(job.minReales) || 0) + m.tiempoSeg / 60);
  const g = gramosDe(m.usadoMm, job.material);
  if (g) reales.gramosReales = Math.round(((Number(job.gramosReales) || 0) + g) * 10) / 10;
  if (unidades > 1 && restante > Math.max(20, total * 0.25)) {
    return { status: "paused", remaining: restante, runStart: null, tandaAt: ahora, tandas: (Number(job.tandas) || 0) + 1, ...reales };
  }
  return { status: "done", endedAt: ahora, finAuto: ahora, remaining: 0, runStart: null, finImpresora: true, ...reales };
}

// Registro de cada impresión que terminó o se canceló (para el uso real de cada máquina)
export function impresionDe(m, printer, ahora) {
  if (!(m.estado === "terminada" || m.estado === "cancelada") || !OCUPADA.has(m.antes)) return null;
  const seg = m.tiempoSeg > 0 ? m.tiempoSeg : null;
  const inicio = m.inicio || (seg ? ahora - seg * 1000 : null);
  if (!inicio) return null;
  return {
    id: `${m.id}-${Math.round(inicio / 60000)}`,
    datos: { maquina: m.id, printer: printer || null, archivo: m.archivo || null, inicio, fin: ahora, seg, mm: m.usadoMm || null, estado: m.estado },
  };
}

const ESTADOS = new Set(["libre", "preparando", "imprimiendo", "pausada", "terminada", "cancelada", "apagada"]);
const texto = (x, n = 120) => (x == null ? null : String(x).slice(0, n));
const numero = (x) => (Number.isFinite(Number(x)) && x !== null && x !== "" ? Number(x) : null);

// Lo que manda el puente, limpio (nada raro entra a Firestore)
export function limpiarMaquina(m) {
  if (!m || typeof m !== "object" || !/^[\w-]{3,64}$/.test(String(m.id || ""))) return null;
  if (!ESTADOS.has(m.estado)) return null;
  return {
    id: String(m.id), marca: texto(m.marca, 20), modelo: texto(m.modelo, 40), nombre: texto(m.nombre, 60), ip: texto(m.ip, 40),
    estado: m.estado, antes: ESTADOS.has(m.antes) ? m.antes : null, archivo: texto(m.archivo, 160),
    progreso: numero(m.progreso), faltaSeg: numero(m.faltaSeg), inicio: numero(m.inicio),
    capa: numero(m.capa), capas: numero(m.capas), error: numero(m.error) || 0,
    tiempoSeg: numero(m.tiempoSeg), usadoMm: numero(m.usadoMm), camara: m.camara === true,
  };
}
