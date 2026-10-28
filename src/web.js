// Conexión con la base del sitio world3d.com.bo (Supabase): los pedidos de la web viven ahí.
// La clave es la pública "anon" (la misma que está en config.js del sitio); los permisos los pone Supabase (RLS).
import { createClient } from "@supabase/supabase-js";

export const SITIO = "https://world3d.com.bo";
export const SUPABASE_URL = "https://swlmlwmjicsewwtudeah.supabase.co";
export const SUPABASE_KEY = "sb_publishable_pbWjcSpwmO1fhBNiYVAoow_OsUHX-y0";

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

// Modo demo (REACT_APP_DEMO=1 al compilar): entra sin cuenta y muestra pedidos de ejemplo, para probar la pestaña Web sin tocar la base
export const DEMO = process.env.REACT_APP_DEMO === "1";
const PEDIDOS_DEMO = [
  { id: 118, tipo: "compra", origen: "carrito", estado: "enviado", total: 95, recepcion: "Recojo en el taller", nota: "", creado: new Date(Date.now() - 3600000).toISOString(), cliente_nombre: "Carla Suárez", cliente_telefono: "70011223", rastreo: "abc", items: [{ id: "organizador", nombre: "Organizador de cafetería (Rojo)", precio: 95, cant: 1 }] },
  { id: 117, tipo: "compra", origen: "carrito", estado: "pago confirmado", total: 160, recepcion: "Delivery en Santa Cruz (se cotiza por Yango)", nota: "Para el viernes si se puede", creado: new Date(Date.now() - 86400000).toISOString(), cliente_nombre: "Jorge Mamani", cliente_telefono: "77788899", rastreo: "def", items: [{ id: "soporte", nombre: "Soporte de mando de Pikachu (Amarillo)", precio: 80, cant: 2 }] },
  { id: 116, tipo: "compra", origen: "carrito", estado: "en produccion", total: 45, recepcion: "Envío a Cochabamba (por pagar)", nota: "", creado: new Date(Date.now() - 2 * 86400000).toISOString(), cliente_nombre: "Ana Rojas", cliente_telefono: "68855443", rastreo: "ghi", items: [{ id: "llavero:LEO", nombre: "Llavero personalizado LEO", precio: 45, cant: 1, det: "Forma: hexágono · Base: Negro · Letra: Dorado impreso en 3D" }] },
  { id: 115, tipo: "cotizacion", origen: "formulario", estado: "enviado", total: 0, recepcion: "", nota: "", creado: new Date(Date.now() - 4 * 86400000).toISOString(), cliente_nombre: "Luis Vaca", cliente_telefono: "71234567", items: [{ nombre: "Trofeo de pádel con nombre grabado, 20 cm, dorado", precio: 0, cant: 1 }] },
  { id: 110, tipo: "compra", origen: "carrito", estado: "entregado", total: 120, recepcion: "Recojo en el taller", creado: new Date(Date.now() - 9 * 86400000).toISOString(), cliente_nombre: "María Pérez", cliente_telefono: "76543210", items: [{ nombre: "Figura de capibara de 12cm (Café)", precio: 60, cant: 2 }] },
];

export const ESTADOS_WEB = ["enviado", "pago confirmado", "en produccion", "listo", "entregado", "cancelado"];
export const ESTADO_WEB = {
  "enviado":         { label: "Esperando pago",  icon: "💳" },
  "pago confirmado": { label: "Pagado",          icon: "✅" },
  "en produccion":   { label: "En producción",   icon: "🖨" },
  "listo":           { label: "Listo",           icon: "🎉" },
  "entregado":       { label: "Entregado",       icon: "🚚" },
  "cancelado":       { label: "Cancelado",       icon: "✕" },
};

// Entrar con Google (misma cuenta admin que en el panel del sitio)
export const entrarConGoogle = () =>
  sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin + window.location.pathname } });

export const salir = () => sb.auth.signOut();

// ¿La cuenta que entró es admin de WORLD3D? (tabla admins: cada uno solo puede ver su propia fila)
export const esAdmin = async (userId) => {
  if (DEMO) return true;
  if (!userId) return false;
  const { data, error } = await sb.from("admins").select("user_id").eq("user_id", userId).maybeSingle();
  return !error && !!data;
};

// Pedidos abiertos del sitio (los cerrados de los últimos 30 días también, para el historial)
export const cargarPedidos = async () => {
  if (DEMO) return PEDIDOS_DEMO.map(normalizarPedido);
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await sb
    .from("pedidos")
    .select("*, perfiles(nombre, telefono)")
    .or(`estado.in.(enviado,"pago confirmado","en produccion",listo),creado.gte.${desde}`)
    .order("creado", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []).map(normalizarPedido);
};

// Nombre y teléfono: primero lo que escribió en el carrito, si no, el perfil de la cuenta
export const normalizarPedido = (p) => ({
  ...p,
  cliente_nombre: p.cliente_nombre || p.perfiles?.nombre || "",
  cliente_telefono: p.cliente_telefono || p.perfiles?.telefono || "",
  items: Array.isArray(p.items) ? p.items : [],
});

export const cambiarEstadoPedido = async (id, estado) => {
  if (DEMO) { const p = PEDIDOS_DEMO.find(x => x.id === id); if (p) p.estado = estado; return; }
  const { error } = await sb.from("pedidos").update({ estado }).eq("id", id);
  if (error) throw error;
};

export const numPedido = (p) => "#" + String(p.id).padStart(5, "0");

// El nombre de un ítem del carrito trae el color entre paréntesis: "Organizador (Rojo)"
export const partirNombre = (nombre) => {
  const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(nombre || "");
  return m ? { nombre: m[1], color: m[2] } : { nombre: nombre || "", color: "" };
};
