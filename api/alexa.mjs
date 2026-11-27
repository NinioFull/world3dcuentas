// Skill de Alexa "Mi taller": consultar el Manager por voz y anotar pedidos (con confirmación).
// Endpoint: https://<dominio-del-manager>/api/alexa  (configurado en la consola de Alexa, tipo HTTPS)
// Variables en Vercel: ALEXA_SKILL_ID, FIREBASE_SERVICE_ACCOUNT y (opcional) SUPABASE_SECRET_KEY.
import { verificarAlexa } from "../alexa/verificar.mjs";
import { createHash } from "node:crypto";
import { leerCola, leerMovimientos, leerWeb, leerParaPedido, crearTrabajo } from "../alexa/datos.mjs";
import * as R from "../alexa/respuestas.mjs";
import { armarPedido } from "../alexa/pedidos.mjs";

const AYUDA = "Podés preguntarme qué tenés para hoy, qué se está imprimiendo, cuánto le falta a una impresora, qué hay en cola, qué entregas tenés, qué está atrasado, cuánto te deben, cuánto cobraste o si hay pedidos en la web. También podés anotar un pedido: decí, por ejemplo, anota diez llaveros negros para Juan.";

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function decir(texto, { seguir = false, reprompt, directivas } = {}) {
  return Response.json({
    version: "1.0",
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
    case "AnotarPedidoIntent":
      return anotarPedido(pedido, intent);
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
