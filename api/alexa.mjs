// Skill de Alexa "Mi taller": consultar el Manager por voz, anotar pedidos y mover la cola (siempre con confirmación).
// Endpoint: https://<dominio-del-manager>/api/alexa  (configurado en la consola de Alexa, tipo HTTPS)
// Variables en Vercel: ALEXA_SKILL_ID, FIREBASE_SERVICE_ACCOUNT y (opcional) SUPABASE_SECRET_KEY.
import { verificarAlexa } from "../alexa/verificar.mjs";
import { createHash } from "node:crypto";
import { leerCola, leerMovimientos, leerWeb, leerParaPedido, crearTrabajo, actualizarTrabajo, actualizarDoc, crearDoc,
  leerParaMantenimiento, leerStock, leerProductos, leerCostos } from "../alexa/datos.mjs";
import * as T from "../alexa/taller.mjs";
import { avisar, enSilencio } from "../alexa/avisar.mjs";
import * as A from "../alexa/acciones.mjs";
import * as R from "../alexa/respuestas.mjs";
import { armarPedido } from "../alexa/pedidos.mjs";

const AYUDA = "Podés preguntarme qué tenés para hoy, qué se está imprimiendo, cuánto le falta a una impresora, qué hay en cola, qué entregas tenés, qué está atrasado, cuánto te deben, cuánto cobraste o si hay pedidos en la web. También podés anotar un pedido, por ejemplo: anota diez llaveros negros para Juan. Y cambiar la cola: marca como listo lo de la ka uno, inicia lo siguiente en la ender, pausa la hi, Linda ya recogió, o falló la ka uno. Además: qué impresoras están libres, cuánto cuestan veinte llaveros, qué mantenimiento toca, qué hay en stock, o el cierre del día.";

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function decir(texto, { seguir = false, reprompt, directivas, sesion } = {}) {
  return Response.json({
    version: "1.0",
    ...(sesion ? { sessionAttributes: sesion } : {}),
    response: {
      outputSpeech: { type: "SSML", ssml: `<speak>${esc(texto)}</speak>` },
      card: { type: "Simple", title: "WORLD3D · Mi taller", content: texto },
      ...(seguir ? { reprompt: { outputSpeech: { type: "SSML", ssml: `<speak>${esc(reprompt || "¿Qué más querés saber?")}</speak>` } } } : {}),
      ...(directivas ? { directives: directivas } : {}),
      shouldEndSession: directivas ? undefined : !seguir,
    },
  });
}

const valorCrudo = (intent, nombre) => intent?.slots?.[nombre]?.value || "";

// Anotar pedido: Alexa pregunta lo que falta (modelo de diálogo); acá se arma, se confirma y recién ahí se guarda
async function anotarPedido(pedido, intent) {
  if (intent.confirmationStatus === "DENIED") return decir("Bueno, no anoté nada. Podés dictarlo de nuevo cuando quieras.");
  if (pedido.request.dialogState && pedido.request.dialogState !== "COMPLETED") {
    return Response.json({ version: "1.0", response: { directives: [{ type: "Dialog.Delegate", updatedIntent: intent }] } });
  }
  const slots = {
    producto: slot(intent, "producto"), cantidad: valorCrudo(intent, "cantidad"), color: slot(intent, "color"),
    cliente: valorCrudo(intent, "cliente"), precio: valorCrudo(intent, "precio"), adelanto: valorCrudo(intent, "adelanto"),
  };
  const p = armarPedido({ ...slots, producto: valorCrudo(intent, "producto") || slots.producto, productoAlt: slots.producto }, await leerParaPedido());
  if (intent.confirmationStatus !== "CONFIRMED") {
    return decir(`${p.resumen} ¿Lo anoto en la cola?`, { directivas: [{ type: "Dialog.ConfirmIntent", updatedIntent: intent }] });
  }
  // Mismo id para la misma sesión y los mismos datos: si Alexa reintenta, no se duplica
  const id = "alexa-" + createHash("sha256").update((pedido.session?.sessionId || pedido.request.requestId) + JSON.stringify(slots)).digest("hex").slice(0, 20);
  const nuevo = await crearTrabajo(id, p.job);
  return decir(nuevo ? `Listo, anoté ${p.corto}. Ya está en la cola.` : `Ese pedido ya estaba anotado.`);
}

const slot = (intent, nombre) => {
  const s = intent?.slots?.[nombre];
  if (!s) return "";
  const res = s.resolutions?.resolutionsPerAuthority?.find((a) => a.status?.code === "ER_SUCCESS_MATCH");
  return res?.values?.[0]?.value?.name || s.value || "";
};

// ── Acciones sobre la cola (listo, iniciar, pausar, entregar): proponer → elegir si hay varios → confirmar → guardar ──
const TIPO = { ListoIntent: "listo", IniciarIntent: "iniciar", PausarIntent: "pausar", EntregadoIntent: "entregar" };

function preguntar(r, printers) {
  if (r.decir) return decir(r.decir);
  if (r.elegir) return decir(r.pregunta, { seguir: true, reprompt: "Decí el número. " + r.pregunta, sesion: { eleccion: { tipo: r.tipo, opciones: r.elegir, permiteTodos: !!r.permiteTodos, porCliente: !!r.porCliente } } });
  const pendiente = { ...r.accion, pago: !!r.pago };
  return decir(r.pregunta, { seguir: true, reprompt: r.pago ? "¿Efectivo, QR, o queda debiendo?" : "¿Sí o no?", sesion: { pendiente } });
}

async function accionCola(tipo, intent) {
  const cola = R.anotarVivo(await leerCola(), Date.now());
  const busqueda = valorCrudo(intent, "busqueda");
  const objetivo = { impresora: slot(intent, "impresora"), cliente: valorCrudo(intent, "cliente"), trabajo: valorCrudo(intent, "trabajo"),
    ...(busqueda ? A.interpretar(busqueda, cola.jobs, cola.printers) : {}) };
  console.log("acción", tipo, JSON.stringify({ busqueda, ...objetivo }));
  return preguntar(A.proponer(tipo, cola, objetivo), cola.printers);
}

async function elegir(sesion, intent) {
  const e = sesion.eleccion;
  const dicho = (slot(intent, "orden") || valorCrudo(intent, "orden")).toLowerCase();
  const NUM = { uno: 1, primero: 1, primera: 1, dos: 2, segundo: 2, segunda: 2, tres: 3, tercero: 3, tercera: 3, cuatro: 4, cuarto: 4, cuarta: 4 };
  const n = NUM[dicho] || parseInt(dicho, 10);
  const cola = R.anotarVivo(await leerCola(), Date.now());
  if (/tod|ambo|los dos|las dos/.test(dicho)) {
    if (!e.permiteTodos) return decir("Acá decime uno solo, con el número.", { seguir: true, sesion });
    return preguntar(A.confirmar(e.tipo, e.opciones, cola.printers), cola.printers);
  }
  const o = e.opciones[n - 1];
  if (!o) return decir(`Decí un número del 1 al ${e.opciones.length}.`, { seguir: true, sesion });
  if (e.porCliente) return preguntar(A.proponer("entregar", cola, { cliente: o.clientName }), cola.printers);
  if (e.tipo === "falla") return seguirFalla(o.id, e.motivo);
  return preguntar(A.confirmar(e.tipo, [o], cola.printers), cola.printers);
}

async function ejecutar(p, metodo) {
  if (p.tipo === "falla") {
    if (!(await actualizarTrabajo(p.id, p.cambios, p.upd))) return decir("No anoté nada: ese trabajo cambió en el Manager mientras hablábamos. Pedímelo de nuevo.");
    await crearDoc("fallas", p.falla);
    return decir(`Listo, anoté la falla y ${p.falla.fileName} volvió a la cola.`);
  }
  if (p.tipo === "mant") {
    if (!(await actualizarDoc("printers", p.printerId, { mant: p.mant }, p.upd))) return decir("No anoté nada: esa impresora cambió en el Manager mientras hablábamos. Pedímelo de nuevo.");
    return decir("Listo, anotado. El contador de esa tarea arranca de cero.");
  }
  const ahora = Date.now(), fallaron = [];
  for (const j of p.trabajos) {
    const ok = await actualizarTrabajo(j.id, A.cambios(p.tipo, j, ahora, metodo), j.upd);
    if (!ok) fallaron.push(j);
  }
  const hechos = p.trabajos.filter((j) => !fallaron.includes(j));
  if (!hechos.length) return decir("No toqué nada: ese trabajo cambió en el Manager mientras hablábamos. Pedímelo de nuevo.");
  const aviso = fallaron.length ? ` Pero ${A.nombreTrabajo(fallaron[0])} cambió en el Manager y no lo toqué.` : "";
  const saldo = hechos.reduce((s, j) => s + Math.max(0, (Number(j.price) || 0) - (Number(j.deposit) || 0)), 0);
  return decir(A.hecho(p.tipo, hechos, metodo, saldo) + aviso);
}

// ── Falla: elegir trabajo → motivo → confirmar → guardar (como el botón Falló del Manager) ──
async function anotarFalla(intent) {
  const cola = R.anotarVivo(await leerCola(), Date.now());
  const busqueda = valorCrudo(intent, "busqueda");
  const objetivo = { impresora: slot(intent, "impresora"), cliente: valorCrudo(intent, "cliente"), trabajo: valorCrudo(intent, "trabajo"),
    ...(busqueda ? A.interpretar(busqueda, cola.jobs, cola.printers) : {}) };
  const motivo = T.motivoDe(slot(intent, "motivo") || valorCrudo(intent, "motivo"));
  const c = T.candidatosFalla(cola, objetivo);
  if (!c.length) return decir("No encontré qué trabajo falló. Decí, por ejemplo, falló la ka uno.");
  if (c.length > 1) {
    const opciones = c.slice(0, 4).map(A.foto);
    const pregunta = "¿Cuál falló? " + c.slice(0, 4).map((j, i) => `${i + 1}: ${A.nombreTrabajo(j)}`).join(". ") + ".";
    return decir(pregunta, { seguir: true, reprompt: "Decí el número. " + pregunta, sesion: { eleccion: { tipo: "falla", opciones, motivo } } });
  }
  return seguirFalla(c[0].id, motivo, cola);
}
async function seguirFalla(id, motivo, cola) {
  cola = cola || R.anotarVivo(await leerCola(), Date.now());
  const j = cola.jobs.find((x) => x.id === id);
  if (!j) return decir("Ese trabajo ya no está en la cola.");
  if (!motivo) return decir(T.preguntaMotivo, { seguir: true, reprompt: T.preguntaMotivo, sesion: { faltaMotivo: { id } } });
  const { falla, cambios } = T.datosFalla(j, motivo, await leerCostos());
  return decir(T.fraseFalla(j, falla, cola.printers), { seguir: true, reprompt: "¿Sí o no?", sesion: { pendiente: { tipo: "falla", id, upd: j._upd, falla, cambios } } });
}

async function mantHecho(intent) {
  const r = T.proponerMantHecho(await leerParaMantenimiento(), slot(intent, "impresora"), slot(intent, "tarea") || valorCrudo(intent, "tarea"));
  if (r.decir) return decir(r.decir);
  return decir(r.pregunta, { seguir: true, reprompt: "¿Sí o no?", sesion: { pendiente: { tipo: "mant", printerId: r.printer.id, upd: r.printer._upd, mant: r.mant } } });
}

async function precio(intent) {
  let cantidad = valorCrudo(intent, "cantidad"), dicho = valorCrudo(intent, "producto");
  const b = valorCrudo(intent, "busqueda");
  if (b) { const s = T.separarCantidad(b); dicho = s.resto; cantidad = cantidad || s.cantidad; }
  if (!dicho) return decir("¿De qué producto? Decí, por ejemplo, cuánto cuestan veinte llaveros personalizados.");
  return decir(T.precio(await leerProductos(), dicho, cantidad));
}

const leerWebSinFallar = () => leerWeb().catch((e) => { console.error("web:", e.message); return undefined; });

async function responder(pedido) {
  const tipo = pedido.request?.type;
  const ahora = Date.now();
  if (tipo === "SessionEndedRequest") return Response.json({ version: "1.0", response: {} });

  if (tipo === "LaunchRequest") {
    const [cola, web] = await Promise.all([leerCola(), leerWebSinFallar()]);
    return decir(R.resumen(R.estado(cola, ahora), ahora, web) + " ¿Querés saber algo más?", { seguir: true, reprompt: AYUDA });
  }
  if (tipo !== "IntentRequest") return decir("No entendí eso.");

  const intent = pedido.request.intent || {};
  const sesion = pedido.session?.attributes || {};
  if (TIPO[intent.name]) return accionCola(TIPO[intent.name], intent);
  if (intent.name === "FallaIntent") return anotarFalla(intent);
  if (intent.name === "MantHechoIntent") return mantHecho(intent);
  if (sesion.faltaMotivo && intent.name !== "AMAZON.NoIntent" && intent.name !== "AMAZON.CancelIntent" && intent.name !== "AMAZON.StopIntent") {
    const m = T.motivoDe(slot(intent, "motivo") || valorCrudo(intent, "motivo") || (intent.name === "MotivoIntent" ? "otro" : ""));
    if (m) return seguirFalla(sesion.faltaMotivo.id, m);
    return decir(T.preguntaMotivo, { seguir: true, sesion });
  }
  if (sesion.faltaMotivo) return decir("Bueno, no anoté nada.");
  if (intent.name === "ElegirIntent" && sesion.eleccion) return elegir(sesion, intent);
  if (sesion.pendiente) {
    const p = sesion.pendiente;
    if (intent.name === "AMAZON.NoIntent" || intent.name === "AMAZON.CancelIntent") return decir("Bueno, no cambié nada.");
    if (p.pago) {
      const metodo = intent.name === "PagoIntent" ? A.metodoDePago(slot(intent, "metodo") || valorCrudo(intent, "metodo")) : null;
      if (metodo) return ejecutar(p, metodo);
      return decir("¿Te pagó en efectivo, por QR, o queda debiendo?", { seguir: true, sesion });
    }
    if (intent.name === "AMAZON.YesIntent") return ejecutar(p);
    return decir("¿Lo hago? Decí sí o no.", { seguir: true, sesion });
  }
  if (sesion.eleccion && (intent.name === "AMAZON.NoIntent" || intent.name === "AMAZON.CancelIntent")) return decir("Bueno, no cambié nada.");
  switch (intent.name) {
    case "ResumenIntent": {
      const [cola, web] = await Promise.all([leerCola(), leerWebSinFallar()]);
      return decir(R.resumen(R.estado(cola, ahora), ahora, web));
    }
    case "ImprimiendoIntent":
      return decir(R.imprimiendo(R.estado(await leerCola(), ahora), ahora, slot(intent, "impresora")));
    case "ColaIntent":
      return decir(R.cola(R.estado(await leerCola(), ahora)));
    case "EntregasIntent":
      return decir(R.entregas(R.estado(await leerCola(), ahora), ahora, R.rangoFecha(slot(intent, "fecha"), ahora)));
    case "AtrasadosIntent":
      return decir(R.atrasados(R.estado(await leerCola(), ahora), ahora));
    case "PorCobrarIntent":
      return decir(R.porCobrar(R.estado(await leerCola(), ahora)));
    case "CobradoIntent": {
      const rango = R.rangoFecha(slot(intent, "fecha"), ahora);
      return decir(R.cobrado(await leerMovimientos(rango.desde), rango));
    }
    case "PedidosWebIntent": {
      const web = await leerWebSinFallar();
      return decir(web === undefined ? "No pude leer los pedidos de la web ahora. Probá en un rato." : R.pedidosWeb(web));
    }
    case "ProbarAvisoIntent": {
      if (!process.env.VOICEMONKEY_TOKEN || !process.env.VOICEMONKEY_DEVICE) return decir("Los avisos todavía no están configurados: faltan las claves de Voice Monkey en Vercel.");
      if (enSilencio(ahora)) return decir("Ahora es horario de silencio, de diez de la noche a siete de la mañana, así que no mando avisos.");
      const ok = await avisar("Prueba de aviso de WORLD3D. Si escuchás esto, los avisos funcionan.", ahora);
      return decir(ok ? "Listo, mandé un aviso de prueba. En unos segundos lo vas a escuchar." : "No pude mandar el aviso. Revisá el token y el speaker de Voice Monkey.");
    }
    case "LibresIntent":
      return decir(R.libres(R.estado(await leerCola(), ahora), ahora));
    case "PrecioIntent":
      return precio(intent);
    case "MantenimientoIntent":
      return decir(T.resumenMant(await leerParaMantenimiento(), slot(intent, "impresora")));
    case "StockIntent": {
      const { stock } = await leerStock();
      return decir(T.stock(stock, valorCrudo(intent, "busqueda") || valorCrudo(intent, "producto")));
    }
    case "CierreIntent": {
      const [movs, cola] = await Promise.all([leerMovimientos(R.inicioDia(ahora)), leerCola()]);
      return decir(T.cierre(movs, cola, ahora));
    }
    case "AnotarPedidoIntent":
      return anotarPedido(pedido, intent);
    case "ElegirIntent":
    case "PagoIntent":
    case "MotivoIntent":
    case "AMAZON.YesIntent":
    case "AMAZON.NoIntent":
      return decir("¿Qué querés saber o anotar?", { seguir: true, reprompt: AYUDA });
    case "AMAZON.HelpIntent":
      return decir(AYUDA + " ¿Qué querés saber?", { seguir: true });
    case "AMAZON.CancelIntent":
    case "AMAZON.StopIntent":
      return decir("Listo.");
    case "AMAZON.NavigateHomeIntent":
    case "AMAZON.FallbackIntent":
    default:
      return decir("No entendí. " + AYUDA, { seguir: true });
  }
}

export async function POST(request) {
  const cuerpo = await request.text();
  let pedido;
  try { pedido = JSON.parse(cuerpo); } catch { return new Response("JSON no válido", { status: 400 }); }

  // Solo esta skill: el ID de la consola de Alexa tiene que coincidir
  const id = pedido?.context?.System?.application?.applicationId || pedido?.session?.application?.applicationId;
  if (!process.env.ALEXA_SKILL_ID || id !== process.env.ALEXA_SKILL_ID) return new Response("Skill no autorizada", { status: 403 });

  const error = await verificarAlexa(request.headers, cuerpo, pedido);
  if (error) { console.warn("Pedido rechazado:", error); return new Response("Firma no válida", { status: 400 }); }

  try {
    return await responder(pedido);
  } catch (e) {
    console.error("Alexa:", e);
    return decir("No pude leer el Manager ahora. Probá de nuevo en un rato.");
  }
}

export function GET() {
  return new Response("Skill de Alexa de WORLD3D Manager. Se configura en la consola de Alexa.", { headers: { "content-type": "text/plain; charset=utf-8" } });
}
