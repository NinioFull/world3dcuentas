// Copia de mensajes-estado.js del sitio (repo world3dsitio). Si cambiás el texto allá, copialo acá también.
/* eslint-disable */
// WORLD3D · Mensajes de WhatsApp para avisar al cliente cada cambio de estado.
// Lo usan el panel (cuenta.html) y la función de Telegram (se copia dentro de index.ts con armar.py),
// así el texto es el mismo en los dos lados.
var W3D_TALLER = "Calle Diego López #3740, Barrio La Chacarilla (Av. Guapay, 4 cuadras del 4to anillo)";
var W3D_MAPA = "https://maps.app.goo.gl/TYS1frNgv6iUbdeo6";
var W3D_HORARIO = "lunes a viernes de 9:00 a 12:15 y de 15:00 a 19:00, sábados de 8:30 a 13:00";

// Número para wa.me: solo dígitos y con 591 si es un celular boliviano de 8 cifras
function telWa(t) {
  var d = String(t || "").replace(/[^0-9]/g, "").replace(/^00/, "");
  if (/^[67]\d{7}$/.test(d)) d = "591" + d;
  return d.length >= 10 && d.length <= 15 ? d : "";
}
function linkSeguimiento(p, sitio) {
  return p && p.rastreo ? (sitio || "https://world3d.com.bo") + "/seguimiento?c=" + p.rastreo : "";
}
function primerNombre(n) {
  var x = String(n || "").replace(/\s+/g, " ").trim().split(" ")[0] || "";
  return x ? x.charAt(0).toUpperCase() + x.slice(1) : "";
}
// Pedido que es solo vales de regalo (no se fabrica nada: se emite el código y se manda por WhatsApp)
function esSoloVale(p) {
  var it = (p && p.items) || [];
  return /^Vale digital/i.test((p && p.recepcion) || "") ||
    (it.length > 0 && it.every(function (x) { return /^vale:/.test(x.id || "") || /^Vale de regalo/i.test(x.nombre || ""); }));
}
// Texto del WhatsApp para el cliente según el estado (el que se acaba de poner)
function mensajeEstado(p, estado, sitio) {
  if (esSoloVale(p)) return mensajeEstadoVale(p, estado, sitio);
  var nom = primerNombre(p.cliente_nombre), num = String(p.id).padStart(5, "0");
  var cot = p.tipo === "cotizacion", que = cot ? "tu pedido (cotización N° " + num + ")" : "tu pedido N° " + num;
  var envio = /^Envío a /i.test(p.recepcion || ""), ciudad = envio ? String(p.recepcion).replace(/^Envío a /i, "").replace(/\s*\(por pagar\)\s*$/i, "").trim() : "";
  var delivery = /^Delivery/i.test(p.recepcion || "");
  var link = linkSeguimiento(p, sitio), seg = link ? "\n\nPuedes ver el avance de tu pedido acá:\n" + link : "";
  var hola = "Hola" + (nom ? " " + nom : "") + ", te escribimos de WORLD3D. ";
  var t;
  switch (estado) {
    case "pago confirmado":
      t = hola + "✅ Confirmamos el pago de " + que + ". ¡Muchas gracias! En breve empezamos a fabricarlo y te avisamos cuando esté listo." + seg; break;
    case "en produccion":
      t = hola + "🛠 " + que.charAt(0).toUpperCase() + que.slice(1) + " ya está en producción en nuestras impresoras. Te avisamos apenas esté listo." + seg; break;
    case "listo":
      t = envio
        ? hola + "📦 " + que.charAt(0).toUpperCase() + que.slice(1) + " ya está listo y lo estamos preparando para enviarlo a " + ciudad + ". Va por pagar: el costo del envío lo pagas al recibirlo. Te pasamos los datos del envío apenas lo despachemos." + seg
        : delivery ? hola + "🎉 " + que.charAt(0).toUpperCase() + que.slice(1) + " ya está listo. Pásanos tu ubicación por acá y te cotizamos el delivery para coordinar la entrega." + seg
        : hola + "🎉 " + que.charAt(0).toUpperCase() + que.slice(1) + " ya está listo para recoger.\n\n📍 " + W3D_TALLER + "\n🗺 " + W3D_MAPA + "\n🕒 " + W3D_HORARIO + "\n\nSi prefieres que te lo llevemos, avísanos y coordinamos." + seg;
      break;
    case "entregado":
      t = hola + (envio ? "🚚 Ya despachamos " + que + " a " + ciudad + ". " : "🤝 Ya entregamos " + que + ". ") +
        "¡Gracias por elegirnos! Si te gustó, nos ayudas mucho contándonos qué te pareció o etiquetándonos en Instagram @world3d.bo." + seg; break;
    case "cancelado":
      t = hola + "Te contamos que " + que + " quedó cancelado. Si fue un error o quieres retomarlo, responde este mensaje y lo vemos."; break;
    default:
      t = cot
        ? hola + "Recibimos tu consulta (cotización N° " + num + "). En un momento te confirmamos disponibilidad y tiempo de entrega." + seg
        : hola + "Recibimos " + que + ". Estamos verificando el pago y te confirmamos en un momento." + seg;
  }
  return t;
}
function mensajeEstadoVale(p, estado, sitio) {
  var nom = primerNombre(p.cliente_nombre), num = String(p.id).padStart(5, "0");
  var link = linkSeguimiento(p, sitio), seg = link ? "\n\nPuedes ver el estado de tu vale aquí:\n" + link : "";
  var hola = "Hola" + (nom ? " " + nom : "") + ", te escribimos de WORLD3D. ";
  switch (estado) {
    case "pago confirmado":
    case "en produccion":
      return hola + "✅ Confirmamos el pago de tu vale de regalo (pedido N° " + num + "). ¡Muchas gracias! En un momento te mandamos el vale con su código." + seg;
    case "listo":
      return hola + "🎁 Tu vale de regalo ya está emitido con su código único y vale por 6 meses. Te mandamos la imagen por aquí para que lo regales." + seg;
    case "entregado":
      return hola + "🎁 Te enviamos tu vale de regalo. Para usarlo, la persona que lo recibe escribe el código en el carrito de world3d.com.bo o nos lo dice por WhatsApp. ¡Gracias por elegirnos!" + seg;
    case "cancelado":
      return hola + "Te contamos que tu vale de regalo (pedido N° " + num + ") quedó cancelado. Si fue un error, responde este mensaje y lo vemos.";
    default:
      return hola + "Recibimos el pedido de tu vale de regalo (N° " + num + "). Estamos verificando el pago y te confirmamos en un momento." + seg;
  }
}
// Seguimiento de una cotización que quedó sin respuesta
function mensajeRecordatorio(p, sitio) {
  var nom = primerNombre(p.cliente_nombre), num = String(p.id).padStart(5, "0");
  var items = (p.items || []).map(function (x) { return x.nombre; }).filter(Boolean);
  var lista = items.length ? (items.length === 1 ? items[0] : items.slice(0, -1).join(", ") + " y " + items[items.length - 1]) : "tu pedido";
  if (lista.length > 160) lista = lista.slice(0, 157) + "…";
  return "Hola" + (nom ? " " + nom : "") + ", te escribimos de WORLD3D 😊 Hace unos días nos consultaste por " + lista + " (cotización N° " + num + "). " +
    "¿Pudiste decidirte? Si quieres, te lo reservamos y empezamos a fabricarlo apenas confirmes el pago por QR. Cualquier duda o cambio, responde este mensaje.";
}
// Pedido del carrito que dijo "ya pagué" pero el comprobante nunca llegó
function mensajeSinPago(p, sitio) {
  var nom = primerNombre(p.cliente_nombre), num = String(p.id).padStart(5, "0");
  var link = linkSeguimiento(p, sitio);
  return "Hola" + (nom ? " " + nom : "") + ", te escribimos de WORLD3D 😊 Tenemos tu pedido N° " + num + " por Bs " + Number(p.total || 0) + ", pero todavía no nos llegó el comprobante del pago. " +
    "¿Nos lo puedes mandar por acá? Apenas lo veamos lo confirmamos y " + (esSoloVale(p) ? "te mandamos tu vale." : "empezamos a fabricarlo.") + " Si tuviste algún problema para pagar, cuéntanos y te ayudamos." + (link ? "\n\nTu pedido: " + link : "");
}
export { esSoloVale, telWa, linkSeguimiento, primerNombre, mensajeEstado, mensajeRecordatorio, mensajeSinPago };
