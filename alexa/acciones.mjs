// Acciones por voz sobre la cola: marcar listo, iniciar/reanudar, pausar y entregar.
// Mismos cambios que hace el Manager (src/App.js: completeJ, startJ, resumeJ, pauseJ, shippedJ/resolverCobro).
// Funciones puras: elegir el trabajo, armar lo que se va a decir y los campos a cambiar. Guardar está en datos.mjs.
import { coincideImpresora, faltan, lista, bs, tiempo } from "./respuestas.mjs";

const num = (x) => Number(x) || 0;
const normal = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
const singular = (t) => normal(t).split(" ").map((w) => w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w).join(" ");
const saldoDe = (j) => Math.max(0, num(j.price) - num(j.deposit));
const porPrioridad = (a, b) => num(a.priority || a.createdAt) - num(b.priority || b.createdAt);
const nombreImp = (p) => (p?.name || "").replace(/^Creality\s+|^Elegoo\s+/i, "") || "la impresora";
const esDiseno = (j) => j.jobType === "design";
export const nombreTrabajo = (j) => (j.fileName || "un trabajo").trim() + (num(j.quantity) > 1 ? ` por ${num(j.quantity)}` : "");

export function coincideCliente(j, dicho) {
  const d = normal(dicho), n = normal(j.clientName);
  if (!d || !n) return false;
  return n === d || n.startsWith(d + " ") || n.split(" ")[0] === d;
}
export function coincideTrabajo(j, dicho) {
  const d = singular(dicho).split(" ").filter((w) => w.length > 2 && !["del", "las", "los", "con", "para"].includes(w));
  const n = singular(j.fileName);
  return d.length > 0 && d.every((w) => n.includes(w));
}

const filtrar = (jobs, { impresora, cliente, trabajo }, printers) => jobs.filter((j) =>
  (!impresora || coincideImpresora(printers.find((p) => p.id === j.printer), impresora)) &&
  (!cliente || coincideCliente(j, cliente)) &&
  (!trabajo || coincideTrabajo(j, trabajo)));

// Lo que se guarda en la sesión para hacerlo después de la confirmación
const foto = (j) => ({ id: j.id, upd: j._upd, printer: j.printer, fileName: j.fileName, quantity: j.quantity, remaining: j.remaining, runStart: j.runStart,
  duration: j.duration, price: j.price, deposit: j.deposit, status: j.status, clientName: j.clientName });

// Respuesta: { decir } (no hay nada que hacer), { elegir: [...] } (hay que preguntar cuál) o { accion, pregunta } (confirmar)
export function proponer(tipo, { jobs, printers = [] }, objetivo = {}, ahora = Date.now()) {
  const imp = objetivo.impresora && printers.find((p) => coincideImpresora(p, objetivo.impresora));
  if (objetivo.impresora && !imp) return { decir: `No encontré una impresora que se llame ${objetivo.impresora}.` };
  const deImp = (estados) => jobs.filter((j) => !esDiseno(j) && j.printer === imp.id && estados.includes(j.status));

  if (tipo === "listo") {
    let c = filtrar(jobs.filter((j) => ["printing", "paused"].includes(j.status)), objetivo, printers);
    if (!c.length && (objetivo.cliente || objetivo.trabajo)) c = filtrar(jobs.filter((j) => j.status === "pending"), objetivo, printers);
    if (!c.length) return { decir: imp ? `La ${nombreImp(imp)} no está imprimiendo nada.` : "No encontré ese trabajo en lo que se está imprimiendo ni en la cola." };
    if (c.length > 1) return { elegir: c.slice(0, 4).map(foto), tipo, permiteTodos: true, pregunta: preguntaCual(c, printers) };
    return confirmar(tipo, [c[0]], printers, ahora);
  }
  if (tipo === "pausar") {
    let c = filtrar(jobs.filter((j) => j.status === "printing" && !esDiseno(j)), objetivo, printers);
    if (!c.length) return { decir: imp ? `La ${nombreImp(imp)} no está imprimiendo nada.` : "No hay nada imprimiéndose que se pueda pausar." };
    if (c.length > 1) return { elegir: c.slice(0, 4).map(foto), tipo, pregunta: preguntaCual(c, printers) };
    return confirmar(tipo, [c[0]], printers, ahora);
  }
  if (tipo === "iniciar") {
    if (!imp) {
      // Sin impresora: un trabajo nombrado de la cola o uno en pausa
      const c = filtrar(jobs.filter((j) => ["pending", "paused"].includes(j.status) && !esDiseno(j)), objetivo, printers).sort(porPrioridad);
      if (!objetivo.cliente && !objetivo.trabajo) return { decir: "¿En qué impresora? Decí, por ejemplo, inicia lo siguiente en la ka uno." };
      if (!c.length) return { decir: "No encontré ese trabajo en la cola." };
      if (c.length > 1) return { elegir: c.slice(0, 4).map(foto), tipo, pregunta: preguntaCual(c, printers) };
      const ocupada = jobs.find((j) => j.printer === c[0].printer && j.status === "printing" && j.id !== c[0].id);
      if (ocupada) return { decir: `La ${nombreImp(printers.find((p) => p.id === c[0].printer))} está ocupada con ${nombreTrabajo(ocupada)}.` };
      return confirmar(tipo, [c[0]], printers, ahora);
    }
    const imprimiendo = deImp(["printing"]);
    if (imprimiendo.length) return { decir: `La ${nombreImp(imp)} ya está imprimiendo ${nombreTrabajo(imprimiendo[0])}.` };
    const pausado = deImp(["paused"]);
    if (pausado.length && !objetivo.trabajo && !objetivo.cliente) return confirmar(tipo, [pausado[0]], printers, ahora);
    const cola = filtrar(deImp(["pending", "paused"]), { cliente: objetivo.cliente, trabajo: objetivo.trabajo }, printers).sort(porPrioridad);
    if (!cola.length) return { decir: objetivo.trabajo || objetivo.cliente ? `No encontré ese trabajo en la cola de la ${nombreImp(imp)}.` : `No hay nada en cola para la ${nombreImp(imp)}.` };
    return confirmar(tipo, [cola[0]], printers, ahora);
  }
  if (tipo === "entregar") {
    if (!objetivo.cliente && !objetivo.trabajo) return { decir: "¿Quién recogió? Decí, por ejemplo, Linda ya recogió." };
    const listos = filtrar(jobs.filter((j) => ["done", "shipping"].includes(j.status)), objetivo, printers);
    if (!listos.length) {
      const enProceso = filtrar(jobs.filter((j) => ["pending", "printing", "paused"].includes(j.status)), objetivo, printers);
      return { decir: enProceso.length ? `Lo de ${enProceso[0].clientName || "ese cliente"} todavía no está listo: ${lista(enProceso.map(nombreTrabajo), 3)}.` : "No encontré nada listo para entregar con ese nombre." };
    }
    // Si coincide más de un cliente ("Juan"), preguntar cuál; si es un solo cliente, se entrega todo lo suyo junto
    const clientes = [...new Set(listos.map((j) => normal(j.clientName)))];
    if (clientes.length > 1) {
      const uno = clientes.map((k) => listos.find((j) => normal(j.clientName) === k));
      return { elegir: uno.slice(0, 4).map(foto), tipo, porCliente: true, pregunta: "¿De quién? " + uno.slice(0, 4).map((j, i) => `${i + 1}: ${j.clientName}`).join(". ") + "." };
    }
    return confirmar(tipo, listos, printers, ahora);
  }
  return { decir: "No entendí qué hacer." };
}

function preguntaCual(c, printers) {
  return "¿Cuál? " + c.slice(0, 4).map((j, i) => {
    const p = printers.find((x) => x.id === j.printer);
    return `${i + 1}: ${nombreTrabajo(j)}${j.clientName ? " de " + j.clientName.trim() : ""}${p && ["printing", "paused"].includes(j.status) ? " en la " + nombreImp(p) : ""}`;
  }).join(". ") + (c.length > 4 ? ". Hay más; si no está, decí el nombre." : ".");
}

export function confirmar(tipo, js, printers, ahora = Date.now()) {
  const j = js[0], p = printers.find((x) => x.id === j.printer), enImp = p ? ` en la ${nombreImp(p)}` : "";
  const accion = { tipo, trabajos: js.map(foto) };
  if (tipo === "listo") return { accion, pregunta: js.length > 1 ? `¿Marco como listos ${lista(js.map(nombreTrabajo), 4)}?` : `¿Marco ${nombreTrabajo(j)}${j.clientName ? " de " + j.clientName.trim() : ""} como listo?` };
  if (tipo === "pausar") return { accion, pregunta: `¿Pauso ${nombreTrabajo(j)}${enImp}? Le faltan ${tiempo(faltan(j, ahora))}.` };
  if (tipo === "iniciar") return { accion, pregunta: j.status === "paused" ? `¿Reanudo ${nombreTrabajo(j)}${enImp}?` : `¿Inicio ${nombreTrabajo(j)}${enImp}?` };
  if (tipo === "entregar") {
    const saldo = js.reduce((s, x) => s + saldoDe(x), 0), quien = j.clientName?.trim() || "el cliente";
    const que = `${quien} se lleva ${lista(js.map(nombreTrabajo), 4)}.`;
    if (saldo > 0) return { accion: { ...accion, saldo }, pago: true, pregunta: `${que} Tiene un saldo de ${bs(saldo)}. ¿Te pagó en efectivo, por QR, o queda debiendo?` };
    return { accion: { ...accion, saldo: 0 }, pregunta: `${que} Ya está pagado. ¿Lo marco como entregado?` };
  }
  return { decir: "No entendí qué hacer." };
}

// Campos que cambian en Firestore para un trabajo (igual que el Manager)
export function cambios(tipo, j, ahora = Date.now(), metodo) {
  if (tipo === "listo") return { status: "done", endedAt: ahora, remaining: 0, runStart: null };
  if (tipo === "pausar") return { status: "paused", remaining: Math.max(0, faltan(j, ahora)), runStart: null };
  if (tipo === "iniciar") return j.status === "paused"
    ? { status: "printing", runStart: ahora }
    : { status: "printing", startedAt: ahora, runStart: ahora, remaining: num(j.duration) * Math.max(1, num(j.quantity) || 1) };
  if (tipo === "entregar") {
    if (saldoDe(j) <= 0) return { status: "shipped", shippedAt: ahora, debe: false };
    return metodo === "debe"
      ? { status: "shipped", shippedAt: ahora, debe: true, pagoSaldo: null, saldoCobradoAt: null }
      : { status: "shipped", shippedAt: ahora, debe: false, pagoSaldo: metodo, saldoCobradoAt: ahora };
  }
  throw new Error("acción desconocida " + tipo);
}

export function hecho(tipo, js, metodo, saldo) {
  const que = lista(js.map(nombreTrabajo), 3);
  if (tipo === "listo") return `Listo, ${que} ${js.length > 1 ? "quedaron listos" : "quedó listo"} para entregar.`;
  if (tipo === "pausar") return `Pausé ${que}.`;
  if (tipo === "iniciar") return `Listo, ${que} está imprimiendo.`;
  if (tipo === "entregar") {
    if (!saldo) return `Entregado: ${que}.`;
    return metodo === "debe" ? `Entregado. Queda debiendo ${bs(saldo)}.` : `Entregado y cobrado ${bs(saldo)} ${metodo === "qr" ? "por QR" : "en efectivo"}.`;
  }
  return "Listo.";
}

export const metodoDePago = (dicho) => {
  const d = normal(dicho);
  if (/debe|fiado|no pago|despues|deuda|pendiente|todavia no/.test(d)) return "debe";
  if (/qr|cu ?erre|transfer|banco|tigo|deposit/.test(d)) return "qr";
  if (/efectivo|cash|en mano|billete|plata/.test(d)) return "efectivo";
  return null;
};
