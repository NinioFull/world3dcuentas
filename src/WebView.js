// Pestaña "Web": los pedidos que entran por world3d.com.bo, con un toque pasan a la cola de impresión.
import { useState, useRef } from "react";
import { CreditCard, CheckCircle2, Printer, PartyPopper, FileText, MessageCircle, RefreshCw, Ticket, Truck, X, Globe, ListPlus } from "lucide-react";
import { C, STATUS } from "./tema";
import { ESTADO_WEB, numPedido } from "./web";
import { esSoloVale, telWa, mensajeEstado, mensajeSinPago, mensajeRecordatorio } from "./mensajes-estado";

const bs = (n) => `Bs. ${Number(n || 0).toFixed(2)}`;
const fecha = (iso) => new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const hace = (iso) => { const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
const waLink = (p, texto) => { const t = telWa(p.cliente_telefono); return t ? `https://wa.me/${t}?text=${encodeURIComponent(texto)}` : ""; };

const Btn = ({ children, onClick, href, bg = C.bg3, color = C.t1, border = C.bg5, grow, ocupado, label }) => {
  const st = { background: bg, color, border: `1px solid ${border}`, borderRadius: C.rSm, padding: "0 16px", minHeight: 44, minWidth: 44, fontSize: 14, fontWeight: 800, cursor: ocupado ? "wait" : "pointer", opacity: ocupado ? 0.6 : 1, textDecoration: "none", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, flex: grow ? 1 : "none", whiteSpace: "nowrap", transition: "opacity .15s, transform .1s" };
  if (href) return <a href={href} target="_blank" rel="noopener noreferrer" style={st} aria-label={label}>{children}</a>;
  return <button onClick={onClick} disabled={ocupado} aria-busy={ocupado || undefined} aria-label={label} style={st}>{ocupado ? <><Spinner />Guardando…</> : children}</button>;
};
const Spinner = () => (
  <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid currentColor", borderRightColor: "transparent", display: "inline-block", animation: "w3dGira .7s linear infinite" }} />
);

const Seccion = ({ titulo, sub, color, children, vacio, Icono }) => (
  <section style={{ marginBottom: 26 }}>
    <div style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", columnGap: 10, rowGap: 2, marginBottom: 10 }}>
      <h2 style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 16, fontWeight: 900, color, margin: 0 }}>{Icono && <Icono size={18} aria-hidden="true" />}{titulo}{children.length > 0 && <span style={{ fontSize: 13, color: C.t3, fontWeight: 700 }}>· {children.length}</span>}</h2>
      {sub && <div style={{ fontSize: 12, color: C.t3 }}>{sub}</div>}
    </div>
    {children.length === 0
      ? <div style={{ fontSize: 13, color: C.t4, padding: "14px 16px", background: C.bg2, borderRadius: C.rMd, border: `1px dashed ${C.bg4}` }}>{vacio}</div>
      : <div className="cards-grid">{children}</div>}
  </section>
);

export default function WebView({ pedidos, cargando, error, recargar, jobs, printers, pasarACola, cambiarEstado, goToJob, sesion, salir }) {
  const [confirmar, setConfirmar] = useState(null); // {p, estado}
  const [busca, setBusca] = useState("");
  const [verCerrados, setVerCerrados] = useState(false);
  // Un pedido a la vez: mientras se guarda, sus botones quedan bloqueados (evita duplicar trabajos con un doble toque)
  const [ocupados, setOcupados] = useState({});
  const enCurso = useRef(new Set());
  const correr = async (p, fn) => {
    if (enCurso.current.has(p.id)) return;
    enCurso.current.add(p.id); setOcupados(o => ({ ...o, [p.id]: true }));
    try { await fn(); } finally { enCurso.current.delete(p.id); setOcupados(o => { const n = { ...o }; delete n[p.id]; return n; }); }
  };

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
    correr(p, () => cambiarEstado(p, estado));
  };

  const Tarjeta = ({ p }) => {
    const e = ESTADO_WEB[p.estado] || ESTADO_WEB.enviado;
    const vale = esSoloVale(p);
    const tj = trabajosDe(p);
    const hechos = tj.filter(j => ["done", "shipping", "shipped"].includes(j.status)).length;
    const envio = /^Envío a /i.test(p.recepcion || "");
    const oc = !!ocupados[p.id];
    return (
      <div style={{ background: C.bg2, border: `1px solid ${C.bg4}`, borderRadius: C.r, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, marginBottom: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 15, fontWeight: 900, color: C.t1 }}>{numPedido(p)}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: C.orange, background: C.orangeBg, border: `1px solid ${C.orange}44`, borderRadius: C.rPill, padding: "2px 9px" }}>{e.label}</span>
              {p.tipo === "cotizacion" && <span style={{ fontSize: 12, fontWeight: 800, color: C.purple, background: C.purpleBg, borderRadius: C.rPill, padding: "2px 9px" }}>Cotización</span>}
              {vale && <span style={{ fontSize: 12, fontWeight: 800, color: C.yellow, background: C.yellowBg, borderRadius: C.rPill, padding: "2px 9px" }}>Vale</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, color: C.t1, marginTop: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.cliente_nombre || "Sin nombre"}</div>
            <div style={{ fontSize: 12, color: C.t3 }}>{p.cliente_telefono || "sin teléfono"} · {fecha(p.creado)} ({hace(p.creado)})</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: C.green }}>{bs(p.total)}</div>
            {Number(p.vale_monto) > 0 && <div style={{ fontSize: 12, color: C.yellow }}>vale −{bs(p.vale_monto)}</div>}
          </div>
        </div>

        <div style={{ background: C.bg1, borderRadius: C.rMd, padding: "10px 12px", marginBottom: 10 }}>
          {p.items.map((it, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 13, padding: "3px 0", borderBottom: i < p.items.length - 1 ? `1px solid ${C.bg3}` : "none" }}>
              <div style={{ color: C.t2, minWidth: 0 }}>
                <span style={{ color: C.orange, fontWeight: 800 }}>{it.cant || 1}×</span> {it.nombre}
                {it.det && <div style={{ fontSize: 12, color: C.t4, whiteSpace: "pre-wrap" }}>{it.det}</div>}
              </div>
              <div style={{ color: C.t3, flexShrink: 0 }}>{bs((Number(it.precio) || 0) * (it.cant || 1))}</div>
            </div>
          ))}
          {p.recepcion && <div style={{ fontSize: 12, color: envio ? C.purple : C.t3, marginTop: 6 }}>{p.recepcion}</div>}
          {p.nota && <div style={{ fontSize: 12, color: C.t3, marginTop: 3, whiteSpace: "pre-wrap" }}>{p.nota}</div>}
          {p.aviso && <div style={{ fontSize: 12, color: C.t4, marginTop: 3 }}>Aviso: {p.aviso}</div>}
        </div>

        {tj.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
            {tj.map(j => { const s = STATUS[j.status] || STATUS.pending; return (
              <button key={j.id} onClick={() => goToJob(j.id)} style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, borderRadius: C.rPill, padding: "4px 10px", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
                {s.label} · {j.fileName}
              </button>); })}
            <span style={{ fontSize: 12, color: C.t4, alignSelf: "center" }}>{hechos}/{tj.length} terminados</span>
          </div>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {p.estado === "enviado" && p.tipo === "compra" && <Btn ocupado={oc} onClick={() => pedir(p, "pago confirmado")} bg={C.greenBg} color={C.green} border={C.greenD + "66"} grow><CheckCircle2 size={16} aria-hidden="true" />Pago confirmado</Btn>}
          {p.estado === "enviado" && p.tipo === "cotizacion" && <Btn ocupado={oc} onClick={() => pedir(p, "pago confirmado")} bg={C.greenBg} color={C.green} border={C.greenD + "66"} grow><CheckCircle2 size={16} aria-hidden="true" />Cotizada y pagada</Btn>}
          {p.estado === "enviado" && <Btn href={waLink(p, p.tipo === "cotizacion" ? mensajeRecordatorio(p) : mensajeSinPago(p))} bg={C.waBg} color={C.wa} border={C.wa + "55"}><MessageCircle size={16} aria-hidden="true" />Recordar</Btn>}
          {p.estado === "pago confirmado" && !vale && tj.length === 0 && <Btn ocupado={oc} onClick={() => correr(p, () => pasarACola(p))} bg={`linear-gradient(135deg,${C.orange},${C.orangeD})`} color="#191513" border="transparent" grow><ListPlus size={16} aria-hidden="true" />Pasar a la cola</Btn>}
          {p.estado === "pago confirmado" && vale && <Btn ocupado={oc} onClick={() => pedir(p, "listo")} bg={C.yellowBg} color={C.yellow} border={C.yellow + "55"} grow><Ticket size={16} aria-hidden="true" />Vale emitido</Btn>}
          {p.estado === "en produccion" && <Btn ocupado={oc} onClick={() => pedir(p, "listo")} bg={C.blueBg} color={C.blue} border={C.blueD + "66"} grow><PartyPopper size={16} aria-hidden="true" />Marcar listo</Btn>}
          {p.estado === "listo" && <Btn ocupado={oc} onClick={() => pedir(p, "entregado")} bg={C.tealBg} color={C.teal} border={C.teal + "55"} grow><Truck size={16} aria-hidden="true" />Entregado</Btn>}
          {p.estado !== "enviado" && p.estado !== "cancelado" && <Btn href={waLink(p, mensajeEstado(p, p.estado))} bg={C.waBg} color={C.wa} border={C.wa + "55"}><MessageCircle size={16} aria-hidden="true" />Avisar</Btn>}
          {["enviado", "pago confirmado"].includes(p.estado) && <Btn ocupado={oc} label={`Cancelar pedido ${numPedido(p)}`} onClick={() => pedir(p, "cancelado")} bg={C.bg3} color={C.t3}><X size={18} aria-hidden="true" /></Btn>}
        </div>
      </div>
    );
  };

  return (
    <div className="view-pad">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 22, fontWeight: 900, color: C.t1 }}><Globe size={24} color={C.orange} aria-hidden="true" />Pedidos web</div>
          <div style={{ fontSize: 12, color: C.t3 }}>world3d.com.bo · {sesion?.user?.email}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn onClick={recargar}><RefreshCw size={16} aria-hidden="true" style={cargando ? { animation: "w3dGira 1s linear infinite" } : undefined} />Actualizar</Btn>
          <Btn onClick={salir} color={C.t3}>Salir</Btn>
        </div>
      </div>
      <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por N°, nombre, teléfono o producto…"
        style={{ width: "100%", padding: "12px 16px", borderRadius: C.rMd, border: `1.5px solid ${C.bg5}`, fontSize: 16, color: C.t1, background: C.bg3, outline: "none", marginBottom: 20, fontFamily: "inherit" }} />

      {error && <div style={{ background: C.redBg, border: `1px solid ${C.red}66`, color: C.red, borderRadius: C.rMd, padding: 14, fontSize: 13, marginBottom: 16 }}>No se pudieron cargar los pedidos: {error}</div>}

      <Seccion Icono={CreditCard} titulo="Esperando pago" sub="pidieron por QR, verificá en la app del banco" color={C.yellow} vacio="Nadie está esperando que confirmes un pago.">
        {esperando.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion Icono={CheckCircle2} titulo="Pagados, por fabricar" sub="un toque y entran a la cola" color={C.green} vacio="Todo lo pagado ya está en la cola.">
        {pagados.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion Icono={Printer} titulo="En producción" sub="se marcan listos solos cuando terminan sus trabajos" color={C.orange} vacio="Nada de la web en las impresoras ahora.">
        {produccion.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion Icono={PartyPopper} titulo="Listos para entregar" color={C.blue} vacio="Sin pedidos web listos.">
        {listos.map(p => <Tarjeta key={p.id} p={p} />)}
      </Seccion>
      <Seccion Icono={FileText} titulo="Cotizaciones abiertas" sub="consultas sin cerrar" color={C.purple} vacio="No hay cotizaciones pendientes.">
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
              <Btn onClick={() => { const { p: cp, estado: ce } = confirmar; setConfirmar(null); correr(cp, () => cambiarEstado(cp, ce)); }} bg={confirmar.estado === "cancelado" ? C.redBg : C.greenBg} color={confirmar.estado === "cancelado" ? C.red : C.green} border="transparent" grow>
                {confirmar.estado === "cancelado" ? "Sí, cancelar" : "Sí, lo vi"}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
