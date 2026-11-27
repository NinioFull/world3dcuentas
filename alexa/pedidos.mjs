// Anotar un pedido por voz: arma el trabajo como lo haría el Manager (mismos campos) a partir de lo que dijo Sebastián,
// completando con el catálogo (material, tiempo, peso, precio de lista) y con el teléfono si el cliente ya existe.
// Funciones puras para poder probarlas sin red; la escritura está en datos.mjs (crearTrabajo).
import { COLORES } from "./colores.mjs";

const normal = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9ñ ]/g, " ").replace(/\s+/g, " ").trim();
// "llaveros negros" → "llavero negro" (singular aproximado, palabra por palabra)
const singular = (t) => normal(t).split(" ").map((w) => w.length > 4 && /es$/.test(w) && !/[aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w).join(" ");
const titulo = (t) => String(t || "").trim().replace(/\s+/g, " ").replace(/(^|\s)(\p{L})/gu, (m, e, l) => e + l.toUpperCase());
const num = (x) => Number(x) || 0;

export function buscarProducto(dicho, productos) {
  const d = singular(dicho);
  if (!d) return null;
  const conNombre = productos.filter((p) => p.name);
  const exacto = conNombre.find((p) => singular(p.name) === d);
  if (exacto) return exacto;
  // Solo si todas las palabras del producto se dijeron: "llaveros" no elige "Llavero Zelda", pero
  // "llavero de zelda" sí. Entre varios, gana el de nombre más largo (el más específico).
  const VACIAS = new Set(["de", "del", "con", "en", "para", "el", "la", "los", "las", "y", "un", "una"]);
  const dichas = new Set(d.split(" ").filter((w) => !VACIAS.has(w)));
  const parecidos = conNombre.filter((p) => {
    const pal = singular(p.name).split(" ").filter((w) => !VACIAS.has(w));
    return pal.length > 0 && pal.every((w) => dichas.has(w));
  }).sort((a, b) => b.name.length - a.name.length);
  return parecidos[0] || null;
}

export function buscarColor(dicho) {
  const d = singular(dicho);
  if (!d) return "";
  const exacto = COLORES.find(([c]) => singular(c) === d);
  if (exacto) return exacto[0];
  if (/dorad/.test(d)) return /bronce/.test(d) ? "Dorado bronce pintado con spray" : /spray|pintad/.test(d) ? "Dorado pintado con spray" : "Dorado impreso en 3D";
  if (/celeste/.test(d)) return "Celeste pastel";
  if (/morad|lila|violet/.test(d)) return "Púrpura";
  if (/gris/.test(d)) return /oscur/.test(d) ? "Plomo oscuro" : "Plomo";
  if (/rosad|rosa/.test(d)) return /oscur|fucsia/.test(d) ? "Rosado oscuro" : "Rosado claro";
  if (/verde/.test(d)) return /claro/.test(d) ? "Verde claro" : "Verde oscuro";
  if (/plat/.test(d)) return "Plateado";
  if (/marron|cafe/.test(d)) return "Café";
  const parcial = COLORES.find(([c]) => singular(c).startsWith(d) || d.startsWith(singular(c)));
  return parcial ? parcial[0] : titulo(dicho);
}

// clientes: [{ clientName, clientPhone, createdAt }]. Devuelve { nombre, telefono, conocido }
export function buscarCliente(dicho, trabajos) {
  const d = normal(dicho);
  if (!d) return { nombre: "", telefono: "", conocido: false };
  const porNombre = new Map();
  [...trabajos].sort((a, b) => num(a.createdAt) - num(b.createdAt)).forEach((j) => {
    const n = (j.clientName || "").trim();
    if (!n) return;
    const k = normal(n), prev = porNombre.get(k);
    porNombre.set(k, { nombre: n, telefono: j.clientPhone || prev?.telefono || "" });
  });
  const exacto = porNombre.get(d);
  if (exacto) return { ...exacto, conocido: true };
  // "Linda" → "Linda Claros", solo si hay uno solo que empiece así
  const empiezan = [...porNombre.entries()].filter(([k]) => k.startsWith(d + " ") || k.split(" ")[0] === d);
  if (empiezan.length === 1) return { ...empiezan[0][1], conocido: true };
  return { nombre: titulo(dicho), telefono: "", conocido: false };
}

// slots: { producto, productoAlt, cantidad, color, cliente, precio, adelanto } (texto/números tal como llegan de Alexa;
// productoAlt es el valor que resolvió Alexa con los sinónimos, por si lo dicho no aparece tal cual en el catálogo)
export function armarPedido(slots, { productos = [], trabajos = [], printers = [] }, ahora = Date.now()) {
  const cant = Math.max(1, Math.round(num(slots.cantidad)) || 1);
  const prod = buscarProducto(slots.producto, productos) || buscarProducto(slots.productoAlt, productos);
  const color = slots.color ? buscarColor(slots.color) : (prod?.color || "");
  const cli = buscarCliente(slots.cliente, trabajos);
  const lista = num(prod?.price);
  let precio = num(slots.precio), catalogo = false;
  if (!precio && lista) { precio = Math.round(lista * cant * 100) / 100; catalogo = true; }
  const adelanto = Math.min(num(slots.adelanto), precio || Infinity);
  const dur = num(prod?.duration);
  const job = {
    fileName: prod?.name?.trim() || titulo(slots.producto) || "Pedido por voz",
    printer: printers[0]?.id ?? "", jobType: "print",
    material: prod?.material || "", color,
    weight: num(prod?.weight), duration: dur, remaining: dur * cant,
    price: precio || "", unitPrice: precio ? Math.round(precio / cant * 100) / 100 : "",
    quantity: cant, deposit: adelanto || "",
    notes: "Anotado por voz con Alexa",
    status: "pending", clientName: cli.nombre, clientPhone: cli.telefono,
    deliveryAt: null, createdAt: ahora, startedAt: null, endedAt: null, shippedAt: null, runStart: null, priority: ahora,
  };
  const partes = [`${cant} ${job.fileName}${color ? ` en ${color}` : ""}`];
  partes.push(precio ? `${Math.round(precio)} bolivianos${catalogo ? " a precio de catálogo" : ""}` : "sin precio todavía");
  partes.push(adelanto ? `con ${Math.round(adelanto)} de adelanto` : "sin adelanto");
  const quien = cli.nombre ? `Pedido para ${cli.nombre}${cli.conocido && cli.telefono ? ", ya tengo su número" : ""}` : "Pedido sin nombre de cliente";
  return { job, resumen: `${quien}: ${partes.join(", ")}.`, corto: `${cant} ${job.fileName} para ${cli.nombre || "sin nombre"}` };
}
