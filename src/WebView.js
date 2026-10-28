// Pestaña "Web": los pedidos que entran por world3d.com.bo, con un toque pasan a la cola de impresión.
import { useState } from "react";
import { C, STATUS } from "./tema";
import { ESTADO_WEB, numPedido } from "./web";
import { esSoloVale, telWa, mensajeEstado, mensajeSinPago, mensajeRecordatorio } from "./mensajes-estado";

const bs = (n) => `Bs. ${Number(n || 0).toFixed(2)}`;
const fecha = (iso) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const hace = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
const waLink = (p, texto) => { const t = telWa(p.cliente_telefono); return t ? `https://wa.me/${t}?text=${encodeURIComponent(texto)}` : ""; };

const Btn = ({ children, onClick, href, bg = C.bg3, color = C.t1, border = C.bg5, grow }) => {
  const st = { background: bg, color, border: `1px solid ${border}`, borderRadius: C.rSm, padding: "10px 14px", fontSize: 13, fontWeight: 800, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: grow ? 1 : "none", whiteSpace: "nowrap" };
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" style={st}>{children}</a>
    : <button onClick={onClick} style={st}>{children}</button>;
};

const Seccion = ({ titulo, sub, color, children, vacio }) => (
  <div style={{ marginBottom: 26 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color }}>{titulo}</div>
      {sub && <div style={{ fontSize: 12, color: C.t3 }}>{sub}</div>}
    </div>
    {children.length === 0
      ? <div style={{ fontSize: 13, color: C.t4, padding: "14px 16px", background: C.bg2, borderRadius: C.rMd, border: `1px dashed ${C.bg4}` }}>{vacio}</div>
      : <div className="cards-grid">{children}</div>}
  </div>
);

export default function WebView({ pedidos, cargando, error, recargar, jobs, printers, pasarACola, cambiarEstado, goToJob, sesion, salir }) {
  const [confirmar, setConfirmar] = useState(null); // {p, estado}
  const [busca, setBusca] = useState("");
  const [verCerrados, setVerCerrados] = useState(false);

  const q = busca.trim().toLowerCase();
  const filtra = (p) => !q || numPedido(p).includes(q) || (p.cliente_nombre || "").toLowerCase().includes(q) || (p.cliente_telefono || "").includes(q) || p.items.some(i => (i.nombre || "").toLowerCase().includes(q));
  const lista = pedidos.filter(filtra);
  const compras = lista.filter(p => p.tipo === "compra");
  const esperando = compras.filter(p => p.estado === "enviado");
  const cotizaciones = lista.filter(p => p.tipo === "cotizacion" && p.estado === "enviado");
  const pagados = lista.filter(p => p.estado === "pago confirmado");
  const produccion = lista.filter(p => p.estado === "en produccion");
  const listos = lista.filter(p => p.estado === "listo");
  const cerrados = lista.filter(p => p.estado === "entregado" || p.estado === "cancelado");

  const trabajosDe = (p) => jobs.filter(j => j.webPedido === p.id);

  const pedir = (p, estado) => {
    const pagadosE = ["pago confirmado", "en produccion", "listo", "entregado"];
    if (p.tipo === "compra" && !pagadosE.includes(p.estado) && pagadosE.includes(estado)) { setConfirmar({ p, estado }); return; }
    if (estado === "cancelado") { setConfirmar({ p, estado }); return; }
    cambiarEstado(p, estado);
  };

  const Tarjeta = ({ p }) => {
    const e = ESTADO_WEB[p.estado] || ESTADO_WEB.enviado;
    const vale = esSoloVale(p);
    const tj = trabajosDe(p);
    const hechos = tj.filter(j => ["done", "shipping", "shipped"].includes(j.status)).length;
    const envio = /^Envío a /i.test(p.recepcion || "");
    return (
      <div style={{ background: C.bg2, border: `1px solid ${C.bg4}`, borderRadius: C.r, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.t1 }}>{numPedido(p)}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: C.orange, background: C.orangeBg, border: `1px solid ${C.orange}44`, borderRadius: C.rPill, padding: "2px 9px" }}>{e.icon} {e.label}</span>
              {p.tipo === "cotizacion" && <span style={{ fontSize: 11, fontWeight: 800, color: C.purple, background: C.purpleBg, borderRadius: C.rPill, padding: "2px 9px" }}>Cotización</span>}
              {vale && <span style={{ fontSize: 11, fontWeight: 800, color: C.yellow, background: C.yellowBg, borderRadius: C.rPill, padding: "2px 9px" }}>🎟 Vale</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.cliente_nombre || "Sin nombre"}</div>
            <div style={{ fontSize: 12, color: C.t3 }}>{p.cliente_telefono || "sin teléfono"} · {fecha(p.creado)} ({hace(p.creado)})</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.green }}>{bs(p.total)}</div>
            {Number(p.vale_monto) > 0 && <div style={{ fontSize: 11, color: C.yellow }}>vale −{bs(p.vale_monto)}</div>}
          </div>
        </div>

        <div style={{ background: C.bg1, borderRadius: C.rMd, padding: "10px 12px", marginBottom: 10 }}>
          {p.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "3px 0", borderBottom: i < p.items.length - 1 ? `1px solid ${C.bg3}` : "none" }}>
              <div style={{ color: C.t2, minWidth: 0 }}>
                <span style={{ color: C.orange, fontWeight: 800 }}>{it.cant || 1}×</span> {it.nombre}
                {it.det && <div style={{ fontSize: 11, color: C.t4, whiteSpace: "pre-wrap" }}>{it.det}</div>}
              </div>
              <div style={{ color: C.t3, flexShrink: 0 }}>{bs((Number(it.precio) || 0) * (it.cant || 1))}</div>
            </div>
          ))}
          {p.recepcion && <div style={{ fontSize: 12, color: envio ? C.purple : C.t3, marginTop: 6 }}>📍 {p.recepcion}</div>}
          {p.nota && <div style={{ fontSize: 12, color: C.t3, marginTop: 3, whiteSpace: "pre-wrap" }}>📝 {p.nota}</div>}
          {p.aviso && <div style={{ fontSize: 11, color: C.t4, marginTop: 3 }}>Aviso: {p.aviso}</div>}
        </div>

        {tj.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {tj.map(j => { const s = STATUS[j.status] || STATUS.pending; return (
              <button key={j.id} onClick={() => goToJob(j.id)} style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, borderRadius: C.rPill, padding: "4px 10px", fontSize: 11, fontWeight: 800, cursor: "pointer" }}>
                {s.label} · {j.fileName}
              </button>); })}
            <span style={{ fontSize: 11, color: C.t4, alignSelf: "center" }}>{hechos}/{tj.length} terminados</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {p.estado === "enviado" && p.tipo === "compra" && <Btn onClick={() => pedir(p, "pago confirmado")} bg={C.greenBg} color={C.green} border={C.greenD + "66"} grow>✅ Pago confirmado</Btn>}
          {p.estado === "enviado" && p.tipo === "cotizacion" && <Btn onClick={() => pedir(p, "pago confirmado")} bg={C.greenBg} color={C.green} border={C.greenD + "66"} grow>✅ Cotizada y pagada</Btn>}
          {p.estado === "enviado" && <Btn href={waLink(p, p.tipo === "cotizacion" ? mensajeRecordatorio(p) : mensajeSinPago(p))} bg={C.waBg} color={C.wa} border={C.wa + "55"}>💬 Recordar</Btn>}
          {p.estado === "pago confirmado" && !vale && tj.length === 0 && <Btn onClick={() => pasarACola(p)} bg={`linear-gradient(135deg,${C.orange},${C.orangeD})`} color="#fff" border="transparent" grow>🖨 Pasar a la cola</Btn>}
          {p.estado === "pago confirmado" && vale && <Btn onClick={() => pedir(p, "listo")} bg={C.yellowBg} color={C.yellow} border={C.yellow + "55"} grow>🎟 Vale emitido</Btn>}
          {p.estado === "en produccion" && <Btn onClick={() => pedir(p, "listo")} bg={C.blueBg} color={C.blue} border={C.blueD + "66"} grow>🎉 Marcar listo</Btn>}
          {p.estado === "listo" && <Btn onClick={() => pedir(p, "entregado")} bg={C.tealBg} color={C.teal} border={C.teal + "55"} grow>🚚 Entregado</Btn>}
          {p.estado !== "enviado" && p.estado !== "cancelado" && <Btn href={waLink(p, mensajeEstado(p, p.estado))} bg={C.waBg} color={C.wa} border={C.wa + "55"}>💬 Avisar</Btn>}
          {["enviado", "pago confirmado"].includes(p.estado) && <Btn onClick={() => pedir(p, "cancelado")} bg={C.bg3} color={C.t3}>✕</Btn>}
        </div>
      </div>
    );
  };

  return (
    <div className="view-pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: C.t1 }}>🌐 Pedidos web</div>
          <div style={{ fontSize: 12, color: C.t3 }}>world3d.com.bo · {sesion?.user?.email}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={recargar}>{cargando ? "⏳" : "↻"} Actualizar</Btn>
          <Btn onClick={salir} color={C.t3}>Salir</Btn>
        </div>
      </div>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por N°, nombre, teléfono o producto…"
        style={{ width: "100%", padding: "12px 16px", borderRadius: C.rMd, border: `1.5px solid ${C.bg5}`, fontSize: 14, color: C.t1, background: C.bg3, outline: "none", marginBottom: 20, fontFamily: "inherit" }} />

      {error && <div style={{ background: C.redBg, border: `1px solid ${C.red}66`, color: C.red, borderRadius: C.rMd, padding: 14, fontSize: 13, marginBottom: 16 }}>No se pudieron cargar los pedidos: {error}</div>}

      <Seccion titulo="💳 Esperando pago" sub="pidieron por QR, verificá en la app del banco" color={C.yellow} vacio="Nadie está esperando que confirmes un pago.">
        {esperando.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion titulo="✅ Pagados, por fabricar" sub="un toque y entran a la cola" color={C.green} vacio="Todo lo pagado ya está en la cola.">
        {pagados.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion titulo="🖨 En producción" sub="se marcan listos solos cuando terminan sus trabajos" color={C.orange} vacio="Nada de la web en las impresoras ahora.">
        {produccion.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion titulo="🎉 Listos para entregar" color={C.blue} vacio="Sin pedidos web listos.">
        {listos.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion titulo="📝 Cotizaciones abiertas" sub="consultas sin cerrar" color={C.purple} vacio="No hay cotizaciones pendientes.">
        {cotizaciones.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>

      <button onClick={() => setVerCerrados(v => !v)} style={{ background: "transparent", border: "none", color: C.t3, fontSize: 13, fontWeight: 800, cursor: "pointer", padding: "6px 0" }}>
        {verCerrados ? "▾" : "▸"} Entregados y cancelados (últimos 30 días) · {cerrados.length}
      </button>
      {verCerrados && <div className="cards-grid" style={{ marginTop: 10 }}>{cerrados.map(p => <Tarjeta key={p.id} p={p} />)}</div>}

      {confirmar && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={e => { if (e.target === e.currentTarget) setConfirmar(null); }}>
          <div style={{ background: C.bg2, borderRadius: C.r, padding: 24, maxWidth: 420, width: "100%", border: `1px solid ${C.bg4}` }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: C.t1, marginBottom: 8 }}>
              {confirmar.estado === "cancelado" ? "¿Cancelar el pedido?" : "¿Ya viste el dinero?"}
            </div>
            <div style={{ fontSize: 14, color: C.t2, lineHeight: 1.5, marginBottom: 20 }}>
              {confirmar.estado === "cancelado"
                ? `El pedido ${numPedido(confirmar.p)} de ${confirmar.p.cliente_nombre || "este cliente"} queda cancelado. Si tenía un vale, el saldo se devuelve solo.`
                : `Confirmá que ${bs(confirmar.p.total)} del pedido ${numPedido(confirmar.p)} ya aparece en tu app del banco. Las capturas de comprobante se pueden falsificar.`}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn onClick={() => setConfirmar(null)} grow>Volver</Btn>
              <Btn onClick={() => { cambiarEstado(confirmar.p, confirmar.estado); setConfirmar(null); }} bg={confirmar.estado === "cancelado" ? C.redBg : C.greenBg} color={confirmar.estado === "cancelado" ? C.red : C.green} border="transparent" grow>
                {confirmar.estado === "cancelado" ? "Sí, cancelar" : "Sí, lo vi"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
