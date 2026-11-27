// Arma lo que dice Alexa a partir de la cola. Funciones puras (datos + hora) para poder probarlas sin red.
const MIN = 60000, HORA = 3600000, DIA = 86400000;
const BOLIVIA = -4 * HORA; // America/La_Paz, sin horario de verano

export const inicioDia = (ms) => Math.floor((ms + BOLIVIA) / DIA) * DIA - BOLIVIA;
const num = (x) => Number(x) || 0;

// ── Cómo se dice ──
export const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
export function lista(cosas, max = 3) {
  const c = cosas.filter(Boolean);
  if (!c.length) return "";
  const vistas = c.slice(0, max), resto = c.length - vistas.length;
  if (resto > 0) return vistas.join(", ") + " y " + plural(resto, "más", "más");
  return vistas.length === 1 ? vistas[0] : vistas.slice(0, -1).join(", ") + " y " + vistas[vistas.length - 1];
}
export function tiempo(min) {
  min = Math.max(0, Math.round(min));
  if (min < 60) return plural(min, "minuto", "minutos");
  const h = Math.floor(min / 60), m = min % 60;
  return plural(h, "hora", "horas") + (m ? " y " + plural(m, "minuto", "minutos") : "");
}
export const bs = (n) => `${Math.round(n).toLocaleString("es-BO")} bolivianos`;
export function hora(ms) {
  const d = new Date(ms + BOLIVIA);
  const h = d.getUTCHours(), m = d.getUTCMinutes();
  return `a las ${h}${m ? ":" + String(m).padStart(2, "0") : ""}`;
}
const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
function nombreDia(desde, ahora) {
  const hoy = inicioDia(ahora);
  if (desde === hoy) return "hoy";
  if (desde === hoy + DIA) return "mañana";
  if (desde === hoy - DIA) return "ayer";
  const d = new Date(desde + BOLIVIA);
  return `el ${DIAS[d.getUTCDay()]} ${d.getUTCDate()}`;
}

// ── Trabajos ──
const esDiseno = (j) => j.jobType === "design";
const nombre = (j) => (j.fileName || "un trabajo").trim() + (num(j.quantity) > 1 ? ` por ${num(j.quantity)}` : "");
export const faltan = (j, ahora) => j.status === "paused" || !j.runStart
  ? num(j.remaining)
  : Math.max(0, num(j.remaining) - Math.floor((ahora - num(j.runStart)) / MIN));
const saldo = (j) => Math.max(0, num(j.price) - num(j.deposit));
const porPrioridad = (a, b) => num(a.priority || a.createdAt) - num(b.priority || b.createdAt);
const impresoraDe = (printers, id) => printers.find((p) => p.id === id);
const nombreImpresora = (p) => (p?.name || "").replace(/^Creality\s+|^Elegoo\s+/i, "") || "la impresora";

// Agrupa por cliente: "Carla Suárez con Organizador de cafetería"
function porCliente(jobs) {
  const g = new Map();
  jobs.forEach((j) => { const k = (j.clientName || "sin nombre").trim(); g.set(k, [...(g.get(k) || []), j]); });
  return [...g.entries()].map(([cliente, js]) => js.length === 1 ? `${cliente} con ${nombre(js[0])}` : `${cliente} con ${plural(js.length, "trabajos", "trabajos")}`);
}

export function estado({ jobs, deben = [], printers = [] }, ahora) {
  const imprimiendo = jobs.filter((j) => !esDiseno(j) && ["printing", "paused"].includes(j.status));
  const cola = jobs.filter((j) => !esDiseno(j) && j.status === "pending").sort(porPrioridad);
  const disenos = jobs.filter((j) => esDiseno(j) && ["pending", "printing", "paused"].includes(j.status));
  const listos = jobs.filter((j) => ["done", "shipping"].includes(j.status));
  const atrasados = jobs.filter((j) => ["pending", "printing", "paused"].includes(j.status) && j.deliveryAt && num(j.deliveryAt) < ahora);
  const sinRecoger = listos.filter((j) => !esDiseno(j) && j.endedAt && ahora - num(j.endedAt) > 3 * DIA);
  return { imprimiendo, cola, disenos, listos, atrasados, sinRecoger, deben, printers, jobs };
}

// Una oración por impresora ocupada
function fraseImprimiendo(e, ahora, filtro) {
  const lista_ = filtro ? e.imprimiendo.filter((j) => filtro(impresoraDe(e.printers, j.printer))) : e.imprimiendo;
  return lista_.map((j) => {
    const p = nombreImpresora(impresoraDe(e.printers, j.printer)), f = faltan(j, ahora);
    if (j.status === "paused") return `La ${p} está en pausa con ${nombre(j)}, le faltan ${tiempo(f)}.`;
    return f > 0
      ? `La ${p} está con ${nombre(j)}: faltan ${tiempo(f)}, termina ${hora(ahora + f * MIN)}.`
      : `La ${p} ya debería haber terminado ${nombre(j)}.`;
  }).join(" ");
}

function fraseWeb(web) {
  if (!web) return "";
  const esperando = web.filter((p) => p.estado === "enviado" && p.tipo !== "cotizacion");
  const cotiz = web.filter((p) => p.estado === "enviado" && p.tipo === "cotizacion");
  const pagados = web.filter((p) => p.estado === "pago confirmado");
  const partes = [];
  if (pagados.length) partes.push(`${plural(pagados.length, "pedido pagado", "pedidos pagados")} para pasar a la cola`);
  if (esperando.length) partes.push(`${plural(esperando.length, "pedido", "pedidos")} esperando pago`);
  if (cotiz.length) partes.push(`${plural(cotiz.length, "pedido de cotización", "pedidos de cotización")}`);
  return partes.length ? `En la web tenés ${lista(partes, 3)}.` : "";
}

// ── Respuestas por pregunta ──
export function resumen(e, ahora, web) {
  const hoy = inicioDia(ahora), manana = hoy + DIA;
  const entregasHoy = e.jobs.filter((j) => j.deliveryAt && num(j.deliveryAt) >= hoy && num(j.deliveryAt) < manana && j.status !== "shipped");
  const frases = [];
  const clientes = [...new Set(entregasHoy.map((j) => (j.clientName || "sin nombre").trim()))];
  frases.push(clientes.length
    ? `Hoy tenés ${plural(clientes.length, "entrega", "entregas")}: ${lista(clientes, 4)}.`
    : "Hoy no tenés entregas con fecha.");
  frases.push(fraseImprimiendo(e, ahora) || "No hay nada imprimiéndose.");
  if (e.cola.length) frases.push(`En cola ${e.cola.length === 1 ? "hay 1 trabajo" : `hay ${e.cola.length} trabajos`}.`);
  if (e.listos.length) frases.push(`${plural(e.listos.length, "trabajo está listo", "trabajos están listos")} para entregar.`);
  if (e.atrasados.length) frases.push(`Ojo, ${plural(e.atrasados.length, "atrasado", "atrasados")}: ${lista(porCliente(e.atrasados), 2)}.`);
  const w = fraseWeb(web);
  if (w) frases.push(w);
  return frases.join(" ");
}

export function imprimiendo(e, ahora, buscado) {
  if (buscado) {
    const coincide = (p) => coincideImpresora(p, buscado);
    const existe = e.printers.some(coincide);
    if (!existe) return `No encontré una impresora que se llame ${buscado}. ${imprimiendo(e, ahora)}`;
    const imp = fraseImprimiendo(e, ahora, coincide);
    if (imp) return imp;
    const p = e.printers.find(coincide);
    const sigue = e.cola.find((j) => j.printer === p.id);
    return `La ${nombreImpresora(p)} está libre.` + (sigue ? ` Lo próximo para esa impresora es ${nombre(sigue)}.` : "");
  }
  return fraseImprimiendo(e, ahora) || "No hay nada imprimiéndose ahora." + (e.cola.length ? ` En cola hay ${plural(e.cola.length, "trabajo", "trabajos")}.` : "");
}

export function cola(e) {
  if (!e.cola.length) return "No hay nada en cola." + (e.disenos.length ? ` Tenés ${plural(e.disenos.length, "diseño pendiente", "diseños pendientes")}.` : "");
  const min = e.cola.reduce((s, j) => s + num(j.remaining || j.duration), 0);
  return `En cola ${e.cola.length === 1 ? "hay 1 trabajo" : `hay ${e.cola.length} trabajos`}` +
    (min ? `, unas ${tiempo(min)} de impresión en total` : "") +
    `. Lo próximo: ${lista(e.cola.map(nombre), 3)}.` +
    (e.disenos.length ? ` Además, ${plural(e.disenos.length, "diseño pendiente", "diseños pendientes")}.` : "");
}

export function entregas(e, ahora, rango) {
  const { desde, hasta, dicho } = rango || { desde: inicioDia(ahora), hasta: inicioDia(ahora) + DIA, dicho: "hoy" };
  const lista_ = e.jobs.filter((j) => j.deliveryAt && num(j.deliveryAt) >= desde && num(j.deliveryAt) < hasta && j.status !== "shipped");
  const frases = [];
  if (lista_.length) {
    const g = porCliente(lista_);
    const listos = lista_.filter((j) => ["done", "shipping"].includes(j.status)).length;
    frases.push(`Para ${dicho} tenés ${plural(g.length, "entrega", "entregas")}: ${lista(g, 4)}.` +
      (listos === lista_.length ? " Todo ya está listo." : listos ? ` ${plural(listos, "trabajo ya está listo", "trabajos ya están listos")}.` : ""));
  } else frases.push(`No tenés entregas con fecha para ${dicho}.`);
  const otros = e.listos.filter((j) => !lista_.includes(j));
  if (otros.length) frases.push(`Listos esperando que los recojan: ${lista(porCliente(otros), 3)}.`);
  if (e.sinRecoger.length) frases.push(`${plural(e.sinRecoger.length, "trabajo lleva", "trabajos llevan")} más de 3 días sin recoger.`);
  return frases.join(" ");
}

export function atrasados(e, ahora) {
  if (!e.atrasados.length) return "No hay nada atrasado.";
  return `${plural(e.atrasados.length, "trabajo atrasado", "trabajos atrasados")}: ${lista(porCliente(e.atrasados), 4)}.`;
}

export function porCobrar(e) {
  const pendientes = e.jobs.filter((j) => saldo(j) > 0);
  const total = pendientes.reduce((s, j) => s + saldo(j), 0);
  const deben = e.deben.filter((j) => saldo(j) > 0);
  const totalDeben = deben.reduce((s, j) => s + saldo(j), 0);
  if (!total && !totalDeben) return "No tenés nada por cobrar.";
  const frases = [];
  if (total) frases.push(`Por cobrar de lo que todavía no se entregó: ${bs(total)}.`);
  if (totalDeben) {
    const quien = new Map();
    deben.forEach((j) => { const k = (j.clientName || "sin nombre").trim(); quien.set(k, (quien.get(k) || 0) + saldo(j)); });
    frases.push(`Te deben ${bs(totalDeben)}: ${lista([...quien.entries()].sort((a, b) => b[1] - a[1]).map(([c, m]) => `${c}, ${bs(m)}`), 3)}.`);
  }
  return frases.join(" ");
}

// Mismas cuentas que el resumen semanal del Manager (respaldo/Codigo.gs)
export function cobrado(movs, rango) {
  const en = (t) => num(t) >= rango.desde && num(t) < rango.hasta;
  let adelantos = 0, saldos = 0, tomados = 0, vendido = 0;
  movs.forEach((j) => {
    const precio = num(j.price), adel = Math.min(num(j.deposit), precio || Infinity);
    if (en(j.createdAt)) { tomados++; vendido += precio; if (adel > 0) adelantos += adel; }
    if (j.status === "shipped" && !j.debe && precio > adel && en(j.saldoCobradoAt || j.shippedAt || j.endedAt || j.createdAt)) saldos += precio - adel;
  });
  const total = adelantos + saldos;
  const cuando = rango.dicho;
  if (!total && !tomados) return `${cuando[0].toUpperCase() + cuando.slice(1)} no entró plata ni pedidos nuevos.`;
  return `${cuando[0].toUpperCase() + cuando.slice(1)} cobraste ${bs(total)}` +
    (adelantos && saldos ? `, ${bs(adelantos)} de adelantos y ${bs(saldos)} de saldos` : "") +
    `. Pedidos tomados: ${tomados}` + (vendido ? `, por ${bs(vendido)} en total` : "") + ".";
}

export const pedidosWeb = (web) => {
  if (web === null) return "Todavía no conecté los pedidos de la web. Falta poner la clave de Supabase en Vercel.";
  return fraseWeb(web) || "No hay pedidos web esperando pago ni pagados por pasar a la cola.";
};

// ── Impresoras: lo que dice Alexa → impresora ──
const normal = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
const DICHOS = [
  [/\bk ?1\b|ka uno|k uno|cauno|la grande/, "k1"],
  [/ender|ender tres|ke\b/, "ender"],
  [/centauri|carbon/, "centauri"],
  [/resina|ld ?002|ele ?de/, "resina"],
  [/\bhi\b|jai|creality hi/, "hi"],
];
export function coincideImpresora(p, buscado) {
  if (!p) return false;
  const b = normal(buscado), n = normal(p.name);
  if (!b) return false;
  if (n.includes(b) || b.includes(n)) return true;
  for (const [re, clave] of DICHOS) {
    if (!re.test(b)) continue;
    if (clave === "resina") return /resina/i.test(p.type || "") || /ld-?002|resina/.test(n);
    if (clave === "hi") return /\bhi\b/.test(n);
    return n.includes(clave);
  }
  return false;
}

// ── Fechas de AMAZON.DATE → rango del día/semana/mes en Bolivia ──
export function rangoFecha(valor, ahora) {
  const hoy = inicioDia(ahora);
  if (!valor) return { desde: hoy, hasta: hoy + DIA, dicho: "hoy" };
  let m;
  if ((m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor))) {
    const desde = Date.UTC(+m[1], +m[2] - 1, +m[3]) - BOLIVIA;
    return { desde, hasta: desde + DIA, dicho: nombreDia(desde, ahora) };
  }
  if ((m = /^(\d{4})-W(\d{2})(-WE)?$/.exec(valor))) {
    // Semana ISO: el lunes de la semana 1 es el lunes de la semana que contiene el 4 de enero
    const ene4 = Date.UTC(+m[1], 0, 4), dow = (new Date(ene4).getUTCDay() + 6) % 7;
    const lunes = ene4 - dow * DIA + (+m[2] - 1) * 7 * DIA - BOLIVIA;
    if (m[3]) return { desde: lunes + 5 * DIA, hasta: lunes + 7 * DIA, dicho: "el fin de semana" };
    const actual = lunes <= ahora && ahora < lunes + 7 * DIA;
    return { desde: lunes, hasta: lunes + 7 * DIA, dicho: actual ? "esta semana" : lunes > ahora ? "la próxima semana" : "la semana pasada" };
  }
  if ((m = /^(\d{4})-(\d{2})$/.exec(valor))) {
    const desde = Date.UTC(+m[1], +m[2] - 1, 1) - BOLIVIA, hasta = Date.UTC(+m[1], +m[2], 1) - BOLIVIA;
    const actual = desde <= ahora && ahora < hasta;
    return { desde, hasta, dicho: actual ? "este mes" : "ese mes" };
  }
  return { desde: hoy, hasta: hoy + DIA, dicho: "hoy" };
}
