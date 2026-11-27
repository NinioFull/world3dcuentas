// Genera alexa/modelo/es-US.json y es-MX.json (modelo de voz de la skill). Uso: node alexa/modelo/generar.mjs
const intents = [
  { name: "ResumenIntent", slots: [], samples: [
    "qué tengo para hoy", "qué tengo hoy", "qué hay para hoy", "cómo va el día", "cómo va el taller", "cómo vamos",
    "dame el resumen", "dame un resumen", "el resumen", "resumen del día", "cómo está todo", "qué hay de nuevo", "cómo está el taller" ] },
  { name: "ImprimiendoIntent", slots: [{ name: "impresora", type: "IMPRESORA" }], samples: [
    "qué se está imprimiendo", "qué está imprimiendo", "qué se imprime", "qué se imprime ahora", "qué hay imprimiéndose",
    "cómo van las impresoras", "cómo van las impresiones", "cuánto falta", "cuánto les falta a las impresoras",
    "cuánto le falta a la {impresora}", "cuánto le queda a la {impresora}", "cómo va la {impresora}", "qué imprime la {impresora}",
    "qué está imprimiendo la {impresora}", "qué hay en la {impresora}", "cuánto falta en la {impresora}", "está libre la {impresora}",
    "cuándo termina la {impresora}", "a qué hora termina la {impresora}" ] },
  { name: "ColaIntent", slots: [], samples: [
    "qué hay en cola", "qué hay en la cola", "qué sigue", "qué sigue en la cola", "qué falta imprimir", "cuántos trabajos hay en cola",
    "cuántos trabajos faltan", "qué tengo pendiente", "qué tengo que imprimir", "qué es lo próximo", "la cola" ] },
  { name: "EntregasIntent", slots: [{ name: "fecha", type: "AMAZON.DATE" }], samples: [
    "qué entregas tengo", "qué entregas hay", "qué tengo que entregar", "qué hay para entregar", "qué está listo", "qué está listo para entregar",
    "quién tiene que recoger", "qué tienen que recoger", "qué entregas tengo {fecha}", "qué tengo que entregar {fecha}", "qué entregas hay {fecha}",
    "qué hay para entregar {fecha}", "las entregas de {fecha}", "entregas para {fecha}", "qué se entrega {fecha}" ] },
  { name: "AtrasadosIntent", slots: [], samples: [
    "qué está atrasado", "hay algo atrasado", "qué trabajos están atrasados", "qué pedidos están atrasados", "qué se me pasó", "los atrasados" ] },
  { name: "PorCobrarIntent", slots: [], samples: [
    "cuánto me deben", "quién me debe", "cuánto tengo por cobrar", "qué tengo por cobrar", "cuánto falta cobrar", "cuánta plata me deben", "los saldos" ] },
  { name: "CobradoIntent", slots: [{ name: "fecha", type: "AMAZON.DATE" }], samples: [
    "cuánto cobré", "cuánto vendí", "cuánta plata entró", "cuánto entró", "cuánto gané", "cuánto cobré {fecha}", "cuánto vendí {fecha}",
    "cuánto entró {fecha}", "cuánta plata entró {fecha}", "cuánto se cobró {fecha}", "cómo estuvo la venta {fecha}", "cuánto hicimos {fecha}" ] },
  { name: "PedidosWebIntent", slots: [], samples: [
    "hay pedidos nuevos", "hay pedidos en la web", "pedidos de la web", "qué pedidos hay en la página", "hay pedidos esperando pago",
    "hay pedidos pagados", "pagaron algún pedido", "entró algún pedido", "hay algo en la web" ] },
  { name: "AnotarPedidoIntent", slots: [
      { name: "producto", type: "PRODUCTO", samples: ["{producto}", "es un {producto}", "son {producto}", "es una {producto}", "un {producto}", "una {producto}"] },
      { name: "cantidad", type: "AMAZON.NUMBER", samples: ["{cantidad}", "{cantidad} unidades", "son {cantidad}"] },
      { name: "color", type: "COLOR" },
      { name: "cliente", type: "AMAZON.Person", samples: ["{cliente}", "para {cliente}", "es para {cliente}", "a nombre de {cliente}"] },
      { name: "precio", type: "AMAZON.NUMBER", samples: ["{precio}", "{precio} bolivianos", "{precio} bs", "en total {precio}", "en total {precio} bolivianos", "cobro {precio}"] },
      { name: "adelanto", type: "AMAZON.NUMBER", samples: ["{adelanto}", "{adelanto} bolivianos", "dejó {adelanto}", "dejó {adelanto} bolivianos", "me dejó {adelanto}", "de adelanto {adelanto}"] },
    ], samples: [
    "anota un pedido", "anotá un pedido", "nuevo pedido", "quiero anotar un pedido", "agrega un pedido", "anota un pedido para {cliente}", "nuevo pedido para {cliente}",
    "anota {cantidad} {producto}", "anota {cantidad} {producto} {color}", "anota {cantidad} {producto} para {cliente}", "anota {cantidad} {producto} {color} para {cliente}",
    "anota {cantidad} {producto} para {cliente} por {precio} bolivianos", "anota {cantidad} {producto} {color} para {cliente} por {precio} bolivianos",
    "anota {cantidad} {producto} {color} para {cliente} por {precio} bolivianos con {adelanto} de adelanto", "anota {cantidad} {producto} para {cliente} por {precio} bolivianos con {adelanto} de adelanto",
    "anotá {cantidad} {producto} para {cliente}", "anotá {cantidad} {producto} {color} para {cliente}", "agrega {cantidad} {producto} para {cliente}", "agrega {cantidad} {producto} {color} para {cliente}",
    "nuevo pedido de {cantidad} {producto}", "nuevo pedido de {cantidad} {producto} para {cliente}", "nuevo pedido de {cantidad} {producto} {color} para {cliente}",
    "pedido de {cantidad} {producto} para {cliente}", "anota un {producto} para {cliente}", "anota una {producto} para {cliente}", "anota un {producto} {color} para {cliente}",
    "que anote {cantidad} {producto} para {cliente}", "que anote {cantidad} {producto} {color} para {cliente}", "que anote un pedido",
    "{cliente} quiere {cantidad} {producto}", "{cliente} pidió {cantidad} {producto}", "{cliente} pidió {cantidad} {producto} {color}" ] },
  { name: "AMAZON.YesIntent", samples: [] },
  { name: "AMAZON.NoIntent", samples: [] },
  { name: "AMAZON.HelpIntent", samples: ["qué puedes hacer", "qué le puedo preguntar"] },
  { name: "AMAZON.CancelIntent", samples: [] },
  { name: "AMAZON.StopIntent", samples: [] },
  { name: "AMAZON.NavigateHomeIntent", samples: [] },
  { name: "AMAZON.FallbackIntent", samples: [] },
];
const types = [{ name: "IMPRESORA", values: [
  { id: "k1", name: { value: "K1 Max", synonyms: ["ka uno", "ka uno max", "k uno", "k uno max", "kay uno", "la grande", "creality ka uno", "ka uno máx"] } },
  { id: "ender", name: { value: "Ender", synonyms: ["ender tres", "ender tres v tres", "la ender", "ender ke", "ender tres ke"] } },
  { id: "centauri", name: { value: "Centauri", synonyms: ["centauri carbon", "elegoo centauri", "la centauri", "centauri carbon dos", "la carbon"] } },
  { id: "hi", name: { value: "Hi", synonyms: ["creality hi", "la hi", "jai", "la jai"] } },
  { id: "resina", name: { value: "resina", synonyms: ["la de resina", "impresora de resina", "elegoo de resina", "ele de cero cero dos", "la elegoo"] } },
]}];
const plurales = (v) => [...new Set([v.toLowerCase(), v.toLowerCase().replace(/(\S+)/, (w) => /[aeiou]$/.test(w) ? w + "s" : w + "es")])];
const PRODUCTOS = ["llavero", "llavero personalizado", "llavero con nombre", "trofeo", "trofeo personalizado", "medalla", "figura", "figura personalizada", "figura pintada",
  "cortador de galletas", "cortagalletas", "stand", "exhibidor", "organizador", "organizador de escritorio", "soporte de mando", "soporte de celular", "soporte de auriculares",
  "porta celular", "porta mochilas", "portalapiceros", "maceta", "adorno navideño", "adorno de huellita", "huellita con nombre", "portacromos", "maqueta", "repuesto",
  "pieza", "réplica", "logo en 3D", "letrero", "placa", "molde", "busto", "lámpara", "caja", "estuche", "topper de torta", "imán"];
types.push({ name: "PRODUCTO", values: PRODUCTOS.map((v) => ({ name: { value: v, synonyms: plurales(v).filter((x) => x !== v) } })) });
const COLORES = ["Blanco", "Negro", "Rojo", "Plomo", "Café", "Amarillo", "Celeste pastel", "Púrpura", "Verde oscuro", "Verde claro", "Beige", "Rosado claro", "Plateado",
  "Rosado oscuro", "Plomo oscuro", "Dorado impreso en 3D", "Dorado pintado con spray", "Dorado bronce pintado con spray"];
const SIN_COLOR = { "Blanco": ["blancos", "blancas", "blanca"], "Negro": ["negros", "negras", "negra"], "Rojo": ["rojos", "rojas", "roja"], "Plomo": ["plomos", "gris", "grises"],
  "Café": ["cafés", "marrón", "marrones"], "Amarillo": ["amarillos", "amarillas", "amarilla"], "Celeste pastel": ["celeste", "celestes"], "Púrpura": ["morado", "morados", "morada", "lila"],
  "Verde oscuro": ["verde", "verdes"], "Verde claro": ["verdes claros", "verde clarito"], "Beige": ["beiges", "crema"], "Rosado claro": ["rosado", "rosados", "rosada", "rosa"],
  "Plateado": ["plateados", "plateada", "plata"], "Rosado oscuro": ["fucsia", "rosado fuerte"], "Plomo oscuro": ["gris oscuro"], "Dorado impreso en 3D": ["dorado", "dorados", "dorada", "dorado impreso"],
  "Dorado pintado con spray": ["dorado pintado", "dorado con spray"], "Dorado bronce pintado con spray": ["bronce", "dorado bronce"] };
types.push({ name: "COLOR", values: COLORES.map((v) => ({ name: { value: v.toLowerCase(), synonyms: SIN_COLOR[v] || [] } })) });

const PREGUNTAS = {
  producto: "¿Qué producto es?",
  cliente: "¿Para quién es el pedido?",
  precio: "¿Cuánto cobrás en total, en bolivianos? Si va el precio del catálogo, decí cero.",
  adelanto: "¿Cuánto dejó de adelanto? Decí cero si no dejó nada.",
};
const anotar = intents.find((i) => i.name === "AnotarPedidoIntent");
const dialog = { delegationStrategy: "ALWAYS", intents: [{
  name: "AnotarPedidoIntent", delegationStrategy: "ALWAYS", confirmationRequired: false, prompts: {},
  slots: anotar.slots.map((s) => ({ name: s.name, type: s.type, confirmationRequired: false, elicitationRequired: !!PREGUNTAS[s.name],
    prompts: PREGUNTAS[s.name] ? { elicitation: "Elicit.Slot.Anotar." + s.name } : {} })),
}] };
const prompts = Object.entries(PREGUNTAS).map(([k, v]) => ({ id: "Elicit.Slot.Anotar." + k, variations: [{ type: "PlainText", value: v }] }));
const modelo = { interactionModel: {
  languageModel: { invocationName: "mi taller", intents: intents.map(i => ({ name: i.name, slots: i.slots || [], samples: i.samples })), types },
  dialog, prompts,
} };
const fs = await import("node:fs");
for (const loc of ["es-US", "es-MX"]) fs.writeFileSync(new URL(`./${loc}.json`, import.meta.url), JSON.stringify(modelo, null, 2) + "\n");
console.log("ok", intents.reduce((s, i) => s + i.samples.length, 0), "frases");
