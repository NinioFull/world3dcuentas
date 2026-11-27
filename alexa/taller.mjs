// Más cosas por voz, con las mismas cuentas que el Manager (src/App.js): fallas, precios del catálogo,
// mantenimiento por horas, stock y cierre del día. Funciones puras (datos + hora); guardar está en datos.mjs.
import { coincideImpresora, faltan, lista, plural, bs, tiempo, inicioDia } from "./respuestas.mjs";
import { parecidoTrabajo, coincideCliente, nombreTrabajo } from "./acciones.mjs";

const num = (x) => Number(x) || 0;
const nombreImp = (p) => (p?.name || "").replace(/^Creality\s+|^Elegoo\s+/i, "") || "la impresora";
const unidades = (j) => Math.max(1, num(j.quantity) || 1);
const minutosTotales = (j) => num(j.duration) * unidades(j);
const DIA = 86400000;

// ── Fallas (botón "Falló" del Manager) ──
export const MOTIVOS = ["Se despegó / warping", "Atasco o sin extrusión", "Capas corridas", "Se cortó la luz", "Problema del archivo", "Otro"];
export function motivoDe(dicho) {
  const d = String(dicho || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (!d) return null;
  if (/despeg|warping|levant|cama|adher|solto/.test(d)) return MOTIVOS[0];
  if (/atasc|extru|tap|boquilla|no sal|filamento/.test(d)) return MOTIVOS[1];
  if (/capa|corri|desplaz|movi|salto/.test(d)) return MOTIVOS[2];
  if (/luz|corte|energia|apag/.test(d)) return MOTIVOS[3];
  if (/archivo|gcode|laminad|slicer|stl/.test(d)) return MOTIVOS[4];
  return MOTIVOS[5];
}
const avance = (j, ahora) => {
  if (j._vivo?.progreso != null) return Math.max(0, Math.min(100, Math.round(j._vivo.progreso)));
  const t = minutosTotales(j);
  return t > 0 ? Math.max(0, Math.min(100, Math.round((1 - faltan(j, ahora) / t) * 100))) : 0;
};
// Igual que abrirFalla + registrarFalla
export function datosFalla(j, motivo, { matCosts = {}, operacion = {} }, ahora = Date.now()) {
  const hecho = j.status === "done" ? 1 : avance(j, ahora) / 100;
  const gramos = Math.round(num(j.weight) * unidades(j) * hecho), minutos = Math.round(minutosTotales(j) * hecho);
  const kg = num(matCosts[j.material]), porHora = num(operacion.luzHora) + num(operacion.desgasteHora);
  const costo = Math.round((gramos / 1000 * kg + minutos / 60 * porHora) * 100) / 100;
  return {
    falla: { jobId: j.id, fileName: j.fileName || "", clientName: j.clientName || "", printer: j.printer || "", material: j.material || "", motivo, gramos, minutos, costo, at: ahora },
    cambios: { status: "pending", remaining: minutosTotales(j), runStart: null, startedAt: null, endedAt: null, finAuto: null, fallas: num(j.fallas) + 1 },
  };
}
export function candidatosFalla(cola, objetivo) {
  const base = cola.jobs.filter((j) => j.jobType !== "design" && ["printing", "paused", "done"].includes(j.status));
  let c = base.filter((j) =>
    (!objetivo.impresora || coincideImpresora(cola.printers.find((p) => p.id === j.printer), objetivo.impresora)) &&
    (!objetivo.cliente || coincideCliente(j, objetivo.cliente)));
  if (objetivo.trabajo) {
    const pts = c.map((j) => [j, parecidoTrabajo(j, objetivo.trabajo)]).filter(([, p]) => p >= 0.6);
    const mejor = Math.max(0, ...pts.map(([, p]) => p));
    c = pts.filter(([, p]) => p >= mejor - 0.01).map(([j]) => j);
  }
  // Primero lo que se está imprimiendo; lo terminado solo si no hay nada en marcha
  const enMarcha = c.filter((j) => j.status !== "done");
  return enMarcha.length ? enMarcha : c;
}
export const preguntaMotivo = "¿Qué pasó? Se despegó, atasco, capas corridas, se cortó la luz, problema del archivo, u otro.";
export function fraseFalla(j, f, printers) {
  const p = printers.find((x) => x.id === j.printer);
  const perdido = [f.gramos ? `unos ${f.gramos} gramos perdidos` : "", f.costo ? bs(f.costo) : ""].filter(Boolean).join(", ");
  return `¿Anoto la falla de ${nombreTrabajo(j)}${p ? ` en la ${nombreImp(p)}` : ""}: ${f.motivo.split(" / ")[0].toLowerCase()}${perdido ? ", " + perdido : ""}? El trabajo vuelve a la cola.`;
}

// ── Precios del catálogo ──
const NUMS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80,
  noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, quinientos: 500, mil: 1000 };
// "veinte llaveros personalizados" → { cantidad: 20, resto: "llaveros personalizados" }
export function separarCantidad(texto) {
  const pal = String(texto || "").trim().split(/\s+/);
  let n = 0, i = 0;
  const norm = (w) => w.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  while (i < pal.length) {
    const w = norm(pal[i]);
    if (/^\d+$/.test(w)) { n += Number(w); i++; continue; }
    if (NUMS[w] != null) { n += NUMS[w]; i++; continue; }
    if (w === "y" && n && i + 1 < pal.length && NUMS[norm(pal[i + 1])] != null) { i++; continue; }
    break;
  }
  return { cantidad: n || null, resto: pal.slice(i).join(" ").replace(/^(de|del)\s+/i, "") };
}
export function precio(productos, dicho, cantidad) {
  const conPrecio = productos.filter((p) => p.name && num(p.price) > 0);
  const pts = conPrecio.map((p) => [p, parecidoTrabajo({ fileName: p.name }, dicho)]).filter(([, x]) => x >= 0.6);
  if (!pts.length) return `No encontré "${dicho}" en el catálogo con precio. Los personalizados se cotizan en la web.`;
  const mejor = Math.max(...pts.map(([, x]) => x));
  const top = pts.filter(([, x]) => x >= mejor - 0.01).map(([p]) => p).sort((a, b) => a.name.length - b.name.length);
  const cant = Math.max(1, Math.round(num(cantidad)) || 1);
  if (top.length > 1) return `Encontré ${top.length}: ${lista(top.map((p) => `${p.name.trim()}, ${bs(num(p.price))}`), 4)}.` + (cant > 1 ? ` Decime cuál y te saco el total de ${cant}.` : "");
  const p = top[0], u = num(p.price);
  return `${p.name.trim()} cuesta ${bs(u)} cada uno, precio de lista.` + (cant > 1 ? ` ${cant} serían ${bs(u * cant)}.` : "");
}

// ── Mantenimiento por horas impresas ──
const MANT_FDM = [
  { id: "cama", nombre: "Lavar la cama (agua y jabón)", cada: 50 },
  { id: "lubricar", nombre: "Limpiar y lubricar ejes", cada: 200 },
  { id: "correas", nombre: "Revisar correas y tornillos", cada: 300 },
  { id: "boquilla", nombre: "Cambiar boquilla", cada: 600 },
];
const MANT_RESINA = [
  { id: "fep", nombre: "Revisar y limpiar el FEP", cada: 40 },
  { id: "filtrar", nombre: "Filtrar la resina del tanque", cada: 60 },
  { id: "plataforma", nombre: "Nivelar la plataforma", cada: 150 },
];
export function horasDe(pid, { trabajos = [], fallas = [] }) {
  let min = 0;
  trabajos.forEach((j) => {
    if (j.printer !== pid || j.jobType === "design") return;
    if (["done", "shipping", "shipped"].includes(j.status)) min += minutosTotales(j);
    else if (["printing", "paused"].includes(j.status)) min += Math.max(0, minutosTotales(j) - num(j.remaining));
  });
  fallas.forEach((f) => { if (f.printer === pid) min += num(f.minutos); });
  return min / 60;
}
export function tareasDe(p, datos) {
  const horas = horasDe(p.id, datos);
  return (Array.isArray(p.mant) ? p.mant : (p.type === "FDM" ? MANT_FDM : MANT_RESINA).map((t) => ({ ...t, ultima: 0 }))).map((t) => {
    const uso = horas - num(t.ultima), faltanH = num(t.cada) - uso;
    return { ...t, horas, uso, faltan: faltanH, vencida: faltanH <= 0, pronto: faltanH > 0 && faltanH <= Math.max(5, num(t.cada) * 0.1) };
  });
}
const tareaCorta = (t) => t.nombre.replace(/\s*\(.*\)/, "").toLowerCase();
export function resumenMant(datos, impresoraDicha) {
  const ps = datos.printers.filter((p) => Array.isArray(p.mant) && (!impresoraDicha || coincideImpresora(p, impresoraDicha)));
  if (impresoraDicha && !ps.length) {
    const sinPlan = datos.printers.find((p) => coincideImpresora(p, impresoraDicha));
    return sinPlan ? `La ${nombreImp(sinPlan)} todavía no tiene plan de mantenimiento. Abrí Máquinas en el Manager una vez.` : `No encontré una impresora que se llame ${impresoraDicha}.`;
  }
  const venc = [], pronto = [];
  ps.forEach((p) => tareasDe(p, datos).forEach((t) => {
    if (t.vencida) venc.push(`${tareaCorta(t)} de la ${nombreImp(p)}`);
    else if (t.pronto) pronto.push(`${tareaCorta(t)} de la ${nombreImp(p)}, en ${Math.round(t.faltan)} horas`);
  }));
  if (!venc.length && !pronto.length) {
    if (impresoraDicha && ps[0]) {
      const prox = tareasDe(ps[0], datos).sort((a, b) => a.faltan - b.faltan)[0];
      return `La ${nombreImp(ps[0])} está al día. Lo próximo es ${tareaCorta(prox)}, en ${Math.round(prox.faltan)} horas.`;
    }
    return "Todo el mantenimiento está al día.";
  }
  return (venc.length ? `Vencido: ${lista(venc, 5)}.` : "Nada vencido.") + (pronto.length ? ` Pronto: ${lista(pronto, 3)}.` : "");
}
const SINON_TAREA = { cama: /cama|lav|base|placa/, lubricar: /lubric|eje|grasa|aceit/, correas: /correa|tornill|ajust/, boquilla: /boquilla|nozzle|pico/,
  fep: /fep|film|pelicula/, filtrar: /filtr|tanque|resina/, plataforma: /plataforma|nivel/ };
export function proponerMantHecho(datos, impresoraDicha, tareaDicha) {
  const p = datos.printers.find((x) => coincideImpresora(x, impresoraDicha));
  if (!p) return { decir: impresoraDicha ? `No encontré una impresora que se llame ${impresoraDicha}.` : "¿De qué impresora? Decí, por ejemplo, ya lavé la cama de la ka uno." };
  if (!Array.isArray(p.mant)) return { decir: `La ${nombreImp(p)} todavía no tiene plan de mantenimiento. Abrí Máquinas en el Manager una vez.` };
  const d = String(tareaDicha || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const tareas = tareasDe(p, datos);
  const t = tareas.find((x) => SINON_TAREA[x.id]?.test(d)) || tareas.find((x) => d && x.nombre.toLowerCase().includes(d));
  if (!t) return { decir: `¿Qué tarea? La ${nombreImp(p)} tiene: ${lista(tareas.map(tareaCorta), 5)}.` };
  const listaNueva = tareas.map(({ horas, uso, faltan: _f, vencida, pronto, ...x }) => x.id === t.id ? { ...x, ultima: Math.round(horas * 10) / 10, hechoAt: Date.now() } : x);
  return { printer: p, tarea: t, mant: listaNueva, pregunta: `¿Anoto ${tareaCorta(t)} de la ${nombreImp(p)} como hecho?` };
}

// ── Stock ──
export function stock(stockDocs, dicho) {
  const hay = stockDocs.filter((s) => num(s.qty) > 0);
  if (!hay.length) return "No hay nada en stock.";
  if (!dicho) return `En stock: ${lista(hay.sort((a, b) => num(b.qty) - num(a.qty)).map((s) => `${num(s.qty)} ${s.name}`), 6)}.`;
  const pts = hay.map((s) => [s, parecidoTrabajo({ fileName: s.name }, dicho)]).filter(([, x]) => x >= 0.6);
  if (!pts.length) return `No hay "${dicho}" en stock.`;
  return `En stock: ${lista(pts.map(([s]) => `${num(s.qty)} ${s.name}${s.color ? " " + s.color.toLowerCase() : ""}`), 5)}.`;
}

// ── Cierre del día ──
export function cierre(movs, cola, ahora) {
  const hoy = inicioDia(ahora), manana = hoy + DIA;
  const en = (t) => num(t) >= hoy && num(t) < manana;
  let cobrado = 0;
  movs.forEach((j) => {
    const precio_ = num(j.price), adel = Math.min(num(j.deposit), precio_ || Infinity);
    if (en(j.createdAt) && adel > 0) cobrado += adel;
    if (j.status === "shipped" && !j.debe && precio_ > adel && en(j.saldoCobradoAt || j.shippedAt || j.endedAt || j.createdAt)) cobrado += precio_ - adel;
  });
  const entregados = movs.filter((j) => j.status === "shipped" && en(j.shippedAt)).length;
  const tomados = movs.filter((j) => en(j.createdAt)).length;
  const terminadosHoy = cola.jobs.filter((j) => ["done", "shipping"].includes(j.status) && en(j.endedAt)).length;
  const mananaE = cola.jobs.filter((j) => j.deliveryAt && num(j.deliveryAt) >= manana && num(j.deliveryAt) < manana + DIA && j.status !== "shipped");
  const clientesM = [...new Set(mananaE.map((j) => (j.clientName || "sin nombre").trim()))];
  const enCola = cola.jobs.filter((j) => j.status === "pending" && j.jobType !== "design").length;
  return [
    `Hoy cobraste ${bs(cobrado)}, ${plural(tomados, "pedido nuevo", "pedidos nuevos")} y ${plural(entregados, "entrega", "entregas")}.`,
    terminadosHoy ? `Terminaste ${plural(terminadosHoy, "trabajo", "trabajos")}.` : "",
    clientesM.length ? `Mañana tenés ${plural(clientesM.length, "entrega", "entregas")}: ${lista(clientesM, 4)}.` : "Mañana no tenés entregas con fecha.",
    enCola ? `${enCola === 1 ? "Queda" : "Quedan"} ${plural(enCola, "trabajo", "trabajos")} en cola.` : "La cola está vacía.",
  ].filter(Boolean).join(" ");
}

export { tiempo };
