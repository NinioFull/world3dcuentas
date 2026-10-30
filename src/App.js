import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { initializeApp } from "firebase/app";
import {
  getFirestore, collection, onSnapshot, addDoc, updateDoc,
  deleteDoc, doc, setDoc,
} from "./datos";
import { getAuth, onAuthStateChanged, signInWithCredential, GoogleAuthProvider, signOut } from "firebase/auth";
import * as XLSX from "xlsx";
import { C, STATUS, COLORS, ISOTIPO, FUENTES_URL, FUENTE_TEXTO, etiquetaColor } from "./tema";
import { sb, DEMO, esAdmin, entrarConGoogle, salir as salirSupabase, cargarPedidos, cambiarEstadoPedido, numPedido, partirNombre } from "./web";
import WebView from "./WebView";
import LoginView from "./LoginView";
import Icono from "./Icono";
import { WifiOff, Undo2, ChevronDown, Play, Pause, CheckCircle2, Clock, User, PackageOpen, Lock, Home, ListOrdered, Globe, Truck, Users, BarChart3, Package, Printer, MoreHorizontal, FileSpreadsheet, MonitorSmartphone, X, Hourglass, CalendarClock, AlertTriangle, PackageCheck, ChevronRight, ChevronLeft, CalendarDays, Wallet, Search, Banknote, QrCode, MessageCircle, Plus } from "lucide-react";
import { desbloquearSonido, sonarCampana, ponerNumerito, leerAvisados, guardarAvisados } from "./aviso";

const firebaseConfig = {
  apiKey: "AIzaSyCZ2MG8VEPL7WcLQCojJk4Ola3SUkkud70",
  authDomain: "printmanager-dae85.firebaseapp.com",
  projectId: "printmanager-dae85",
  storageBucket: "printmanager-dae85.firebasestorage.app",
  messagingSenderId: "1050513732631",
  appId: "1:1050513732631:web:453cfe9f5f7ae6d6139852",
};
const fbApp = initializeApp(firebaseConfig);
const db = getFirestore(fbApp);
// La cola en Firebase solo la puede leer/escribir la cuenta admin (ver firestore.rules).
// Se entra a Firebase con la misma cuenta de Google que a Supabase: no hay que iniciar sesión dos veces.
const fbAuth = getAuth(fbApp);
const salir = () => Promise.all([salirSupabase(), signOut(fbAuth)]);

// ─── RESPONSIVE HOOK ─────────────────────────────────────────────────────────
const useBreakpoint = () => {
  const [w, setW] = useState(typeof window !== "undefined" ? window.innerWidth : 430);
  useEffect(() => {
    const handler = () => setW(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return { w, isMobile: w < 640, isTablet: w >= 640 && w < 1024, isDesktop: w >= 1024 };
};



const IMG = {
  k1max: "https://cdn.shopify.com/s/files/1/0893/0603/8637/files/k1MAX-01-01.png?v=1762200517",
  hi: "https://cdn.shopify.com/s/files/1/0893/0603/8637/files/PNG.png?v=1764033706",
  ld002r: "https://cdn.shopify.com/s/files/1/0593/2587/4251/files/d25803d93bb8fcdc8b0ce533bbe5ed41.png?v=1734924489",
};

const DEFAULT_PRINTERS = [
  { id: "p1", name: "Creality K1 Max", type: "FDM", brand: "Creality", connected: true, img: IMG.k1max, imgBg: "#1e1e1e" },
  { id: "p2", name: "Creality Hi 1", type: "FDM", brand: "Creality", connected: true, img: IMG.hi, imgBg: "#1e1e1e" },
  { id: "p3", name: "Creality Hi 2", type: "FDM", brand: "Creality", connected: true, img: IMG.hi, imgBg: "#1e1e1e" },
  { id: "p4", name: "Creality LD-002R", type: "Resina", brand: "Creality", connected: false, img: IMG.ld002r, imgBg: "#000000" },
];

const FLOW = [
  { key: "pending", icon: "⏳", label: "Cola" },
  { key: "printing", icon: "🖨", label: "Imprimiendo" },
  { key: "done", icon: "✅", label: "Listo" },
  { key: "shipping", icon: "📦", label: "Envío" },
  { key: "shipped", icon: "🚚", label: "Entregado" },
];
const FLOW_STEP = { pending: 0, printing: 1, paused: 1, done: 2, shipping: 3, shipped: 4 };
const FLOW_DESIGN = [
  { key: "pending",  icon: "📝", label: "Pendiente" },
  { key: "printing", icon: "🎨", label: "En diseño"  },
  { key: "done",     icon: "✅", label: "Listo"      },
  { key: "shipped",  icon: "🚚", label: "Entregado"  },
];


// Costo de máquina por hora (editable en Stats > Utilidad). Luz: ~Bs 225/mes con 4 máquinas. Desgaste: K1 Max Bs 12.000 en ~6.000 h.
const OP0 = { luzHora: 0.15, desgasteHora: 2, margenMin: 30 };
// Mantenimiento por horas impresas (se puede cambiar cada intervalo en Máquinas)
const MANT_FDM = [
  { id:"cama",     nombre:"Lavar la cama (agua y jabón)",  cada:50  },
  { id:"lubricar", nombre:"Limpiar y lubricar ejes",       cada:200 },
  { id:"correas",  nombre:"Revisar correas y tornillos",   cada:300 },
  { id:"boquilla", nombre:"Cambiar boquilla",              cada:600 },
];
const MANT_RESINA = [
  { id:"fep",        nombre:"Revisar y limpiar el FEP",     cada:40  },
  { id:"filtrar",    nombre:"Filtrar la resina del tanque", cada:60  },
  { id:"plataforma", nombre:"Nivelar la plataforma",        cada:150 },
];
const MOTIVOS_FALLA = ["Se despegó / warping", "Atasco o sin extrusión", "Capas corridas", "Se cortó la luz", "Problema del archivo", "Otro"];

const MATERIALS = ["PLA","PLA+","PETG","ABS","ASA","TPU","Nylon","Resina","Resina ABS-Like","Resina Water Wash"];

const fmtTime = (m) => { if (!m || m <= 0) return "—"; const h = Math.floor(m/60), r = m%60; return h===0?`${r}min`:r===0?`${h}h`:`${h}h ${r}m`; };
const fmtDate = (ts) => { if (!ts) return ""; return new Date(ts).toLocaleDateString("es-ES",{day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"}); };
const fmtDateShort = (ts) => { if (!ts) return ""; return new Date(ts).toLocaleDateString("es-ES",{day:"2-digit",month:"short",year:"2-digit"}); };
// ── Tiempo de un trabajo ──
// "duration" es por unidad; "remaining" guarda lo que falta para TODAS las unidades (desde esta versión).
const unidades = (j) => Math.max(1, Number(j?.quantity) || 1);
const minutosTotales = (j) => (Number(j?.duration) || 0) * unidades(j);
const avanceJob = (j) => { const t = minutosTotales(j); return t > 0 ? Math.max(0, Math.min(100, Math.round((1 - (Number(j.remaining) || 0) / t) * 100))) : 0; };
// ── Entregas ──
// Atrasado = la fecha acordada ya pasó y el trabajo todavía no está hecho (en cola, imprimiendo o en pausa).
// Lo que ya está listo o para envío no se cuenta como atrasado: solo falta entregarlo.
const EN_PRODUCCION = ["pending", "printing", "paused"];
const finDelDia = () => { const d = new Date(); d.setHours(23, 59, 59, 999); return d.getTime(); };
const esAtrasado = (j) => EN_PRODUCCION.includes(j.status) && !!j.deliveryAt && Number(j.deliveryAt) < Date.now();
const esParaHoy = (j) => j.status !== "shipped" && !!j.deliveryAt && Number(j.deliveryAt) >= Date.now() && Number(j.deliveryAt) <= finDelDia();
// Plata de un trabajo. Al entregar se puede marcar "queda debiendo" (debe: true): sigue en Por cobrar hasta que se cobre.
const saldoDe = (j) => Math.max(0, (Number(j?.price) || 0) - (Number(j?.deposit) || 0));
const porCobrarDe = (j) => j.status === "shipped" ? (j.debe ? saldoDe(j) : 0) : saldoDe(j);
const DIA = 86400000;
// Listo hace más de 3 días y nadie lo recogió
const sinRecoger = (j) => ["done", "shipping"].includes(j.status) && j.jobType !== "design" && !!j.endedAt && Date.now() - Number(j.endedAt) > 3 * DIA;
const haceDias = (ts) => { const d = Math.floor((Date.now() - Number(ts)) / DIA); return d <= 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`; };
const fmtMoney = (n) => `Bs. ${Number(n||0).toFixed(2)}`;
const startOfDay = (d=new Date()) => { const x=new Date(d); x.setHours(0,0,0,0); return x.getTime(); };
const startOfMonth = (d=new Date()) => new Date(d.getFullYear(),d.getMonth(),1).getTime();
const monthLabel = (d) => d.toLocaleDateString("es-ES",{month:"short",year:"2-digit"});
const initials = (n) => n.split(" ").slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("");
const todayMidnight = () => { const d=new Date(); d.setHours(0,0,0,0); return d.getTime(); };

const waUrl = (job) => {
  if (!job.clientPhone) return null;
  const phone = job.clientPhone.replace(/\D/g,"");
  const name = job.clientName||"cliente";
  const msgs = {
    pending:`Hola ${name}! Tu pedido *${job.fileName}* esta en cola. Te avisamos cuando empiece. 🖨`,
    printing:`Hola ${name}! Tu pedido *${job.fileName}* se esta imprimiendo ahora mismo. 🖨`,
    paused:`Hola ${name}! Tu pedido *${job.fileName}* esta pausado temporalmente.`,
    done:`Hola ${name}! Tu pedido *${job.fileName}* esta listo para recoger. 🎉`,
    shipping:`Hola ${name}! Tu pedido *${job.fileName}* esta listo y en camino. 📦`,
    shipped:`Hola ${name}! Tu pedido *${job.fileName}* ya fue entregado. Gracias! 🚚`,
  };
  return `https://wa.me/${phone}?text=${encodeURIComponent(msgs[job.status]||"")}`;
};

const exportExcel = (jobs, printers) => {
  const rows = jobs.map(j => {
    const p = printers.find(x=>x.id===j.printer);
    return { Archivo:j.fileName||"", Impresora:p?.name||"", Estado:STATUS[j.status]?.label||j.status, Material:j.material||"", Color:j.color||"", Cantidad:j.quantity||1, "Precio unitario (Bs.)":j.unitPrice||"", "Adelanto (Bs.)":j.deposit||"", "Por cobrar (Bs.)":j.deposit&&j.price?(Number(j.price)-Number(j.deposit)).toFixed(2):"", "Precio total (Bs.)":j.price||"", "Peso (g)":j.weight||"", "Duracion (min)":j.duration||"", Cliente:j.clientName||"", Telefono:j.clientPhone||"", "Fecha creacion":j.createdAt?fmtDate(j.createdAt):"", "Fecha fin":j.endedAt?fmtDate(j.endedAt):"", Notas:j.notes||"" };
  });
  const fin = jobs.filter(j=>["done","shipping","shipped"].includes(j.status));
  const rev = fin.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Trabajos");
  XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet([{Resumen:"Total",Valor:jobs.length},{Resumen:"Completados",Valor:fin.length},{Resumen:"Ingresos",Valor:rev.toFixed(2)}]),"Resumen");
  XLSX.writeFile(wb,`PrintManager_${new Date().toISOString().slice(0,10)}.xlsx`);
};

// ─── DESIGN TOKENS ────────────────────────────────────────────────────────────

// ─── SHARED STYLES ────────────────────────────────────────────────────────────
const inputSt = {
  width: "100%",
  padding: "13px 16px",
  borderRadius: C.rMd,
  border: `1.5px solid ${C.bg5}`,
  fontSize: 16,
  color: C.t1,
  background: C.bg3,
  boxSizing: "border-box",
  outline: "none",
  fontFamily: "inherit",
  transition: "border-color .15s",
};

const FormField = ({ label, hint, children }) => (
  <div style={{ marginBottom: 18 }}>
    <label style={{ display:"block", fontSize:12, fontWeight:700, color:C.t3, marginBottom:7, textTransform:"uppercase", letterSpacing:0.8 }}>{label}</label>
    {children}
    {hint && <div style={{ fontSize:12, color:C.t4, marginTop:5, lineHeight:1.5 }}>{hint}</div>}
  </div>
);

const FormDivider = ({ label }) => (
  <div style={{ display:"flex", alignItems:"center", gap:10, margin:"4px 0 20px" }}>
    <div style={{ flex:1, height:1, background:C.bg4 }} />
    <span style={{ fontSize:12, fontWeight:800, color:C.t4, textTransform:"uppercase", letterSpacing:1, whiteSpace:"nowrap" }}>{label}</span>
    <div style={{ flex:1, height:1, background:C.bg4 }} />
  </div>
);

// ─── iOS WHEEL PICKER ─────────────────────────────────────────────────────────
const ITEM_H = 44;

const WheelColumn = ({ items, selected, onChange, width=80 }) => {
  const ref = useRef(null);
  const startY = useRef(0);
  const startIdx = useRef(0);
  const clamp = (v,mn,mx) => Math.max(mn,Math.min(mx,v));
  const scrollTo = (idx) => { if (!ref.current) return; ref.current.scrollTop = idx*ITEM_H; };
  useEffect(() => { scrollTo(selected); }, [selected]);
  const onTouchStart = (e) => { startY.current=e.touches[0].clientY; startIdx.current=selected; };
  const onTouchMove = (e) => { e.preventDefault(); const moved=startY.current-e.touches[0].clientY; const delta=Math.round(moved/ITEM_H); const ni=clamp(startIdx.current+delta,0,items.length-1); if(ni!==selected) onChange(ni); };
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const handler = (e) => { e.preventDefault(); const dir=e.deltaY>0?1:-1; onChange(clamp(selected+dir,0,items.length-1)); };
    el.addEventListener("wheel",handler,{passive:false});
    return () => el.removeEventListener("wheel",handler);
  }, [selected,items.length]);
  return (
    <div style={{ position:"relative", width, height:ITEM_H*5, overflow:"hidden", flexShrink:0 }}>
      <div style={{ position:"absolute", inset:0, background:"linear-gradient(to bottom,#191513 0%,transparent 30%,transparent 70%,#191513 100%)", zIndex:2, pointerEvents:"none" }} />
      <div style={{ position:"absolute", top:ITEM_H*2, left:6, right:6, height:ITEM_H, background:"rgba(241,132,27,0.08)", border:"1.5px solid rgba(241,132,27,0.25)", borderRadius:10, zIndex:1, pointerEvents:"none" }} />
      <div ref={ref} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={()=>{}} style={{ height:"100%", overflowY:"hidden", scrollbarWidth:"none" }}>
        <div style={{ height:ITEM_H*2 }} />
        {items.map((item,i) => (
          <div key={i} onClick={() => onChange(i)} style={{ height:ITEM_H, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", fontSize:i===selected?16:13, fontWeight:i===selected?800:400, color:i===selected?C.t1:C.t4, transition:"font-size .1s,color .1s", userSelect:"none" }}>
            {item}
          </div>
        ))}
        <div style={{ height:ITEM_H*2 }} />
      </div>
    </div>
  );
};

// Fecha que se propone al tocar "Poner fecha de entrega": mañana a esta hora, redondeada a 5 minutos
const fechaPropuesta = () => { const d = new Date(Date.now() + 86400000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); return d.getTime(); };
const BotonPonerFecha = ({ onClick }) => (
  <button type="button" onClick={onClick} style={{ width:"100%", minHeight:48, borderRadius:C.rMd, border:`1.5px dashed ${C.bg5}`, background:"transparent", color:C.t2, fontSize:15, fontWeight:700, cursor:"pointer" }}>
    + Poner fecha de entrega
  </button>
);
const DateTimePicker = ({ value, onChange }) => {
  const MONTHS = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
  const WEEKDAYS = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const dayLabels = Array.from({length:31},(_,i) => { const d=new Date(todayMidnight()+i*86400000); if(i===0)return`Hoy, ${d.getDate()} ${MONTHS[d.getMonth()]}`; if(i===1)return`Mañana, ${d.getDate()} ${MONTHS[d.getMonth()]}`; return`${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`; });
  const hours = Array.from({length:24},(_,i)=>String(i).padStart(2,"0"));
  const minutes = Array.from({length:12},(_,i)=>String(i*5).padStart(2,"0"));
  const computeInits = () => { const now=todayMidnight(); const base=value?value:Date.now()+3600000; const d=new Date(base); const dMid=new Date(d); dMid.setHours(0,0,0,0); const dayI=Math.min(30,Math.max(0,Math.round((dMid.getTime()-now)/86400000))); const hourI=d.getHours(); const minI=Math.min(11,Math.round(d.getMinutes()/5)); return [dayI,hourI,minI]; };
  const [inits] = useState(computeInits);
  const [dayIdx,setDayIdx] = useState(inits[0]);
  const [hourIdx,setHourIdx] = useState(inits[1]);
  const [minIdx,setMinIdx] = useState(inits[2]);
  // Solo avisa cuando la persona mueve una rueda: abrir el formulario (o editar un trabajo viejo) no cambia la fecha
  const primeraVez = useRef(true);
  useEffect(() => { if (primeraVez.current) { primeraVez.current = false; return; } const base=new Date(todayMidnight()+dayIdx*86400000); base.setHours(parseInt(hours[hourIdx]),parseInt(minutes[minIdx]),0,0); onChange(base.getTime()); }, [dayIdx,hourIdx,minIdx]);
  return (
    <div style={{ background:C.bg2, borderRadius:C.rMd, border:`1.5px solid ${C.bg5}`, overflow:"hidden" }}>
      <div style={{ display:"flex", borderBottom:`1px solid ${C.bg4}`, padding:"8px 0 6px" }}>
        {[{w:140,l:"Día"},{w:54,l:"Hora"},{w:54,l:"Min"}].map(({w,l},i) => (
          <div key={l} style={{ width:w+(i===0?0:10), textAlign:"center", fontSize:12, fontWeight:800, color:C.t4, textTransform:"uppercase", letterSpacing:0.8, ...(i>0?{marginLeft:i>0?10:0}:{}) }}>{l}</div>
        ))}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center" }}>
        <WheelColumn items={dayLabels} selected={dayIdx} onChange={setDayIdx} width={140} />
        <div style={{ fontSize:18, fontWeight:800, color:C.t4, flexShrink:0, marginBottom:4 }}>:</div>
        <WheelColumn items={hours} selected={hourIdx} onChange={setHourIdx} width={54} />
        <div style={{ fontSize:18, fontWeight:800, color:C.t4, flexShrink:0, marginBottom:4 }}>:</div>
        <WheelColumn items={minutes} selected={minIdx} onChange={setMinIdx} width={54} />
      </div>
    </div>
  );
};

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, pulse=false }) => {
  const st = STATUS[status] || STATUS.pending;
  return (
    <div style={{ display:"flex", alignItems:"center", gap:5, background:st.bg, border:`1px solid ${st.border}`, borderRadius:C.rPill, padding:"4px 11px", flexShrink:0 }}>
      <div style={{ width:6, height:6, borderRadius:"50%", background:st.dot, boxShadow: pulse?`0 0 8px ${st.dot}`:undefined }} />
      <span style={{ fontSize:12, fontWeight:800, color:st.color, letterSpacing:0.2 }}>{st.label}</span>
    </div>
  );
};

// ─── CHIP ─────────────────────────────────────────────────────────────────────
const Chip = ({ children, color=C.t3, bg=C.bg4 }) => (
  <span style={{ fontSize:12, background:bg, color, borderRadius:C.rPill, padding:"3px 10px", fontWeight:600, flexShrink:0, whiteSpace:"nowrap" }}>{children}</span>
);

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const { w, isMobile, isTablet, isDesktop } = useBreakpoint();
  const [view, setView] = useState("dashboard");
  const [showMas, setShowMas] = useState(false);
  // Alto real del encabezado: la barra lateral se pega justo debajo
  const cabRef = useRef(null);
  useEffect(() => {
    const el = cabRef.current; if (!el || !window.ResizeObserver) return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty("--w3d-cab", el.offsetHeight + "px"));
    ro.observe(el); return () => ro.disconnect();
  });
  // jobsDb: tal cual vienen de Firebase. jobs: con el tiempo restante calculado al momento (ver más abajo)
  const [jobsDb, setJobs] = useState([]);
  const [ahora, setAhora] = useState(Date.now());
  const jobs = useMemo(() => jobsDb.map(j => {
    if (j.status !== "printing" || !j.runStart) return j;
    const pasados = Math.floor(Math.max(0, ahora - j.runStart) / 60000);  // el reloj de la pantalla puede ir unos segundos atrás
    return { ...j, remaining: Math.max(0, (Number(j.remaining) || 0) - pasados) };
  }), [jobsDb, ahora]);
  const [kioskMode, setKioskMode] = useState(false);
  // Al cambiar de sección o entrar/salir del kiosco se empieza desde arriba
  useEffect(() => { try { window.scrollTo(0, 0); } catch (e) {} }, [view, kioskMode]);
  const [kioskPinInput, setKioskPinInput] = useState("");
  // Kiosco: "maquinas" (una columna por impresora) o "calendario" (entregas de la semana). Se recuerda en el dispositivo.
  const [kioskVista, setKioskVistaE] = useState(() => { try { return localStorage.getItem("w3d-kiosco-vista") || "maquinas"; } catch (e) { return "maquinas"; } });
  const setKioskVista = (v) => { setKioskVistaE(v); try { localStorage.setItem("w3d-kiosco-vista", v); } catch (e) {} };
  const [kioskSemana, setKioskSemana] = useState(0);
  const [kioskSel, setKioskSel] = useState(null);   // id del trabajo tocado en el calendario
  const [showKioskExit, setShowKioskExit] = useState(false);
  const KIOSK_PIN = "1234";
  const [showRevenue, setShowRevenue] = useState(false); // default pin
  const [printers, setPrinters] = useState([]);
  const [products, setProducts] = useState([]);
  const [stock, setStock] = useState({});
  const [prodTab, setProdTab] = useState("catalogo");
  const [prodCatFilter, setProdCatFilter] = useState("all");
  const [prodSearch, setProdSearch] = useState("");
  const [showProductForm, setShowProductForm] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [multiMode, setMultiMode] = useState(false);
  const [orderItems, setOrderItems] = useState([]);
  const [orderClient, setOrderClient] = useState({name:'',phone:'',deliveryAt:null,deposit:'',notes:''});
  const [orderClientSugOpen, setOrderClientSugOpen] = useState(false);
  const [showPForm, setShowPForm] = useState(false);
  const [editJob, setEditJob] = useState(null);
  const [editP, setEditP] = useState(null);
  const [fStatus, setFStatus] = useState("all");
  const [fPrinter, setFPrinter] = useState("all");
  const [toast, setToast] = useState(null);
  // Conexión: sin internet la cola sigue funcionando desde el dispositivo (ver datos.js)
  const [enLinea, setEnLinea] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true), off = () => setEnLinea(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  const [selectedClient, setSelectedClient] = useState(null);
  // Buscador rápido (lupa del encabezado, o "/" en teclado)
  const [showBuscar, setShowBuscar] = useState(false);
  const [buscarQ, setBuscarQ] = useState("");
  useEffect(() => {
    const tecla = (e) => {
      const escribiendo = /input|textarea|select/i.test(e.target?.tagName || "") || e.target?.isContentEditable;
      if ((e.key === "/" && !escribiendo) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k")) { e.preventDefault(); setBuscarQ(""); setShowBuscar(true); }
      else if (e.key === "Escape") setShowBuscar(false);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);
  const [sortMode, setSortMode] = useState(false);
  const [queueViewMode, setQueueViewMode] = useState("detail"); // "detail" | "summary" | "calendar"
  const [queueSearch, setQueueSearch] = useState("");
  const [queueSort, setQueueSort] = useState("priority"); // "priority" | "delivery" | "created" | "waiting"
  const [queueWeekOffset, setQueueWeekOffset] = useState(0);
  const [confirmDel, setConfirmDel] = useState(null);
  const [clientSugOpen, setClientSugOpen] = useState(false);
  const [prodSugOpen, setProdSugOpen] = useState(false);
  const [showAllWeek, setShowAllWeek] = useState(false);
  const [highlightJob, setHighlightJob] = useState(null);
  // Listas largas (entregados, historial): de a 30, con "Ver más". Cada lista se identifica con una clave
  // que incluye sus filtros, así al cambiar de filtro vuelve a empezar en 30.
  const PASO = 30;
  const [cuantos, setCuantos] = useState({});
  const lim = (clave) => cuantos[clave] || PASO;
  const VerMas = (clave, total) => total <= lim(clave) ? null : (
    <button onClick={()=>setCuantos(c=>({...c,[clave]:lim(clave)+PASO}))} style={{ display:"block", width:"100%", minHeight:48, margin:"8px 0 20px", borderRadius:C.rMd, border:`1px solid ${C.bg5}`, background:C.bg2, color:C.t2, fontSize:14, fontWeight:800, cursor:"pointer" }}>
      Ver {Math.min(PASO, total-lim(clave))} más · quedan {total-lim(clave)}
    </button>
  );
  // Tarjetas de trabajo: resumidas por defecto; las que abrís quedan abiertas
  const [abiertas, setAbiertas] = useState(() => new Set());
  const [gruposCerrados, setGruposCerrados] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem("w3d-grupos-cerrados")||"[]")); } catch (e) { return new Set(); } });
  const alternarTarjeta = (id) => setAbiertas(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [statPeriod, setStatPeriod] = useState("month");
  const [matCosts, setMatCosts] = useState({});
  const [operacion, setOperacion] = useState(OP0);
  const [recontactos, setRecontactos] = useState({});
  // Colores que agregás desde el Manager (se suman a los del catálogo). config/colores = { lista: [{ nombre, recargo }] }
  const [coloresExtra, setColoresExtra] = useState([]);
  const [nuevoColor, setNuevoColor] = useState(null);   // { aplicar: (nombre) => ..., nombre, recargo }   // clave de cliente → cuándo se le escribió
  const [fallas, setFallas] = useState([]);
  const [editingCost, setEditingCost] = useState(null);
  const [costInput, setCostInput] = useState("");
  const timerRef = useRef(null);

  // ── Cuenta (Google vía Supabase, misma base que el sitio) ──
  const [sesion, setSesion] = useState(undefined);   // undefined = todavía no sabemos
  const [admin, setAdmin] = useState(null);           // null = revisando, true/false
  // ── Pedidos de world3d.com.bo ──
  const [pedidos, setPedidos] = useState([]);
  const [pedidosCargando, setPedidosCargando] = useState(false);
  const [pedidosError, setPedidosError] = useState("");
  const pedidosListos = useRef(false);

  useEffect(() => {
    if (DEMO) { setSesion({ user: { id: "demo", email: "demo@world3d.com.bo" } }); return; }
    sb.auth.getSession().then(({ data }) => setSesion(data.session || null));
    const { data: sub } = sb.auth.onAuthStateChange((_ev, s) => setSesion(s || null));
    return () => sub.subscription.unsubscribe();
  }, []);
  // ── Firebase: se conecta con el token de Google que trae la sesión de Supabase justo después de entrar ──
  const [fbUser, setFbUser] = useState(DEMO ? { email: "demo" } : undefined); // undefined = revisando
  const [fbError, setFbError] = useState("");
  useEffect(() => { if (DEMO) return; return onAuthStateChanged(fbAuth, u => setFbUser(u || null)); }, []);
  useEffect(() => {
    if (DEMO || !sesion || fbUser !== null || !sesion.provider_token) return;
    signInWithCredential(fbAuth, GoogleAuthProvider.credential(null, sesion.provider_token))
      .then(() => setFbError(""))
      .catch(e => setFbError(e.code || e.message || String(e)));
  }, [sesion, fbUser]);
  // Si la cuenta de Firebase no es la misma que la de Supabase (cambiaste de cuenta), se vuelve a conectar
  useEffect(() => {
    if (DEMO || !sesion || !fbUser || !fbUser.email || !sesion.user?.email) return;
    if (fbUser.email.toLowerCase() !== sesion.user.email.toLowerCase()) signOut(fbAuth);
  }, [sesion, fbUser]);

  useEffect(() => {
    if (!sesion) { setAdmin(null); return; }
    let vivo = true;
    esAdmin(sesion.user.id).then(ok => { if (vivo) setAdmin(ok); });
    return () => { vivo = false; };
  }, [sesion]);

  const recargarPedidos = async () => {
    if (!admin) return;
    setPedidosCargando(true);
    try { setPedidos(await cargarPedidos()); setPedidosError(""); pedidosListos.current = true; }
    catch (e) { setPedidosError(e.message || String(e)); }
    setPedidosCargando(false);
  };
  // Se actualizan solos: al entrar, cada minuto y cada vez que volvés a la app (el iPad al lado de las impresoras)
  useEffect(() => {
    if (!admin) return;
    recargarPedidos();
    // En vivo: Supabase avisa apenas cambia un pedido (nuevo, pagado, cancelado) y recargamos.
    // Respaldo: igual se revisa cada 60 s por si la conexión en vivo se corta.
    let canal = null;
    if (!DEMO) {
      canal = sb.channel("pedidos-manager")
        .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => recargarPedidos())
        .subscribe();
    }
    const t = setInterval(recargarPedidos, 60000);
    const alVolver = () => { if (document.visibilityState === "visible") recargarPedidos(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", alVolver); if (canal) sb.removeChannel(canal); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [admin]);

  // ── Aviso de pedido nuevo (con la app abierta en el iPad) ──
  const [avisoNuevo, setAvisoNuevo] = useState(null); // pedido que se muestra en el cartel
  const avisados = useRef(null);
  useEffect(() => {
    const desbloquear = () => desbloquearSonido();
    window.addEventListener("pointerdown", desbloquear);
    return () => window.removeEventListener("pointerdown", desbloquear);
  }, []);
  useEffect(() => {
    if (!admin) return;
    const atender = pedidos.filter(p => p.estado === "enviado" || p.estado === "pago confirmado");
    ponerNumerito(atender.length);
    if (!pedidosListos.current) return;          // todavía no llegó la primera carga
    if (avisados.current === null) {
      const previos = leerAvisados();
      if (!previos || !previos.size) {           // primera vez en este dispositivo: se toma lo que hay como ya visto, sin sonar
        avisados.current = new Set(atender.map(p => p.id)); guardarAvisados(avisados.current); return;
      }
      avisados.current = previos;
    }
    const nuevos = atender.filter(p => !avisados.current.has(p.id));
    if (!nuevos.length) return;
    nuevos.forEach(p => avisados.current.add(p.id));
    guardarAvisados(avisados.current);
    sonarCampana();
    setAvisoNuevo({ ...nuevos[0], otros: nuevos.length - 1 });
  }, [pedidos, admin]);

  const cambiarEstadoWeb = async (p, estado) => {
    try {
      await cambiarEstadoPedido(p.id, estado);
      setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, estado } : x));
      toast_(`${numPedido(p)} → ${estado}. Avisale por WhatsApp desde la tarjeta`);
    } catch (e) { toast_("No se pudo cambiar el estado: " + (e.message || e), "err"); }
  };

  // Un pedido web pagado entra a la cola: un trabajo por ítem, con el pago ya registrado como adelanto
  const pasarACola = async (p) => {
    if (jobs.some(j => j.webPedido === p.id)) { toast_(`${numPedido(p)} ya está en la cola`); return; }
    const pid = printers[0]?.id ?? "";
    const notaBase = [`Pedido web ${numPedido(p)}`, p.recepcion, p.nota].filter(Boolean).join(" · ");
    const items = p.items.filter(it => !/^vale:/.test(it.id || ""));
    // Precio real: el sitio guarda en p.total lo que el cliente paga (productos − referido − cupón).
    // Se reparte ese total entre los productos según su precio de lista; lo pagado con vale de regalo
    // (p.vale_monto) es plata ya cobrada cuando se vendió el vale, así que el pedido entra como pagado completo.
    const bruto = p.items.reduce((t, it) => t + (Number(it.precio) || 0) * (Number(it.cant) || 1), 0);
    const factor = bruto > 0 && Number(p.total) >= 0 ? Math.min(1, Number(p.total) / bruto) : 1;
    const precios = items.map(it => Math.round((Number(it.precio) || 0) * (Number(it.cant) || 1) * factor * 100) / 100);
    const objetivo = Math.round(items.reduce((t, it) => t + (Number(it.precio) || 0) * (Number(it.cant) || 1), 0) * factor * 100) / 100;
    if (precios.length) precios[precios.length - 1] = Math.round((precios[precios.length - 1] + objetivo - precios.reduce((a, b) => a + b, 0)) * 100) / 100;  // que sume exacto
    try {
      await Promise.all(items.map((it, i) => {
        const { nombre, color } = partirNombre(it.nombre);
        const cant = Number(it.cant) || 1, total = precios[i], unit = Math.round(total / cant * 100) / 100;
        const prod = products.find(x => x.name && nombre && x.name.trim().toLowerCase() === nombre.trim().toLowerCase());
        const dur = Number(prod?.duration) || 0;
        return addDoc(collection(db, "jobs"), {
          fileName: nombre, printer: pid, jobType: "print",
          material: prod?.material || "", color: COLORS.includes(color) ? color : (color || prod?.color || ""),
          weight: Number(prod?.weight) || 0, duration: dur, remaining: dur * cant,
          price: total, unitPrice: unit, quantity: cant, deposit: total,
          notes: [notaBase, factor < 1 ? `Con descuento (lista ${fmtMoney((Number(it.precio)||0)*cant)})` : "", Number(p.vale_monto) > 0 && i === 0 ? `Pagado en parte con vale ${p.codigo || ""} (${fmtMoney(p.vale_monto)})` : "", it.det].filter(Boolean).join("\n"),
          status: "pending", clientName: p.cliente_nombre || "", clientPhone: p.cliente_telefono || "",
          deliveryAt: null, createdAt: Date.now(), startedAt: null, endedAt: null, shippedAt: null, priority: Date.now() + i,
          webPedido: p.id, webItem: i,
        });
      }));
      await cambiarEstadoPedido(p.id, "en produccion");
      setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, estado: "en produccion" } : x));
      toast_(`${numPedido(p)}: ${items.length} trabajo${items.length === 1 ? "" : "s"} en la cola`);
    } catch (e) { toast_("No se pudo pasar a la cola: " + (e.message || e), "err"); }
  };

  // Sincronía automática: cuando todos los trabajos de un pedido web terminan, el pedido pasa a "listo";
  // cuando todos se entregan, a "entregado". Así el seguimiento del sitio se mueve solo.
  const sincronizando = useRef(new Set());
  useEffect(() => {
    pedidos.forEach(p => {
      if (!["en produccion", "listo"].includes(p.estado) || sincronizando.current.has(p.id)) return;
      const tj = jobs.filter(j => j.webPedido === p.id);
      if (!tj.length) return;
      const todosListos = tj.every(j => ["done", "shipping", "shipped"].includes(j.status));
      const todosEntregados = tj.every(j => j.status === "shipped");
      const nuevo = todosEntregados ? "entregado" : todosListos ? "listo" : null;
      if (!nuevo || nuevo === p.estado) return;
      sincronizando.current.add(p.id);
      cambiarEstadoPedido(p.id, nuevo)
        .then(() => { setPedidos(prev => prev.map(x => x.id === p.id ? { ...x, estado: nuevo } : x)); toast_(`${numPedido(p)} ${nuevo === "listo" ? "listo" : "entregado"} · avisale desde Web`); })
        .catch(() => {})
        .finally(() => sincronizando.current.delete(p.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, pedidos]);

  const goToJob = (jobId) => { setView("queue"); setFStatus("all"); setFPrinter("all"); setHighlightJob(jobId); setTimeout(()=>setHighlightJob(null),3000); };

  const todosColores = [...COLORS, ...coloresExtra.map(c=>c.nombre).filter(n=>n&&!COLORS.includes(n))];
  const etiquetaCol = (n) => { const x = coloresExtra.find(c=>c.nombre===n); return x && Number(x.recargo)>0 ? `${n} (+${x.recargo} Bs)` : etiquetaColor(n); };
  // Opciones del selector de color: catálogo + agregados + el color actual si vino de otro lado (pedido web viejo) + "Agregar otro"
  const opcionesColor = (actual) => (<>
    {todosColores.map(c=><option key={c} value={c}>{etiquetaCol(c)}</option>)}
    {actual && !todosColores.includes(actual) && <option value={actual}>{actual}</option>}
    <option value="__nuevo">+ Agregar otro color…</option>
  </>);
  const elegirColor = (valor, aplicar) => { if (valor === "__nuevo") setNuevoColor({ aplicar, nombre:"", recargo:"" }); else aplicar(valor); };
  const guardarColorNuevo = async () => {
    const nombre = (nuevoColor?.nombre||"").trim().replace(/\s+/g," ");
    if (!nombre) return;
    const nom = nombre.charAt(0).toUpperCase()+nombre.slice(1);
    const existe = todosColores.find(c=>c.toLowerCase()===nom.toLowerCase());
    if (!existe) await setDoc(doc(db,"config","colores"), { lista:[...coloresExtra, { nombre:nom, recargo:Math.max(0, Number(nuevoColor.recargo)||0) }] });
    nuevoColor.aplicar(existe || nom);
    setNuevoColor(null);
    toast_(existe ? `"${existe}" ya estaba en la lista` : `Color "${nom}" agregado`);
  };
  const borrarColorExtra = (nombre) => setDoc(doc(db,"config","colores"), { lista:coloresExtra.filter(c=>c.nombre!==nombre) });

  const J0 = { fileName:"", printer:"", material:"", weight:"", duration:"", notes:"", status:"pending", color:"", clientName:"", clientPhone:"", price:"", quantity:"1", unitPrice:"", deliveryAt:null, deposit:"", jobType:"print" };
  const P0 = { name:"", type:"FDM", brand:"", connected:true, img:"", imgBg:"#1e1e1e" };
  const [form, setForm] = useState(J0);
  const [pForm, setPForm] = useState(P0);

  // ── Borradores: lo que estás cargando se guarda en el dispositivo mientras escribís.
  // Si el formulario se cierra sin querer (tocar afuera), al volver a abrirlo sigue donde quedó.
  const BORR = { trabajo:"w3d-borrador-trabajo", pedido:"w3d-borrador-pedido", edicion:"w3d-borrador-edicion" };
  const leerBorr = (k) => { try { const d = JSON.parse(localStorage.getItem(k)||"null"); return d && Date.now()-(d.at||0) < 3*DIA ? d : null; } catch (e) { return null; } };
  const guardarBorr = (k, d) => { try { localStorage.setItem(k, JSON.stringify({ ...d, at:Date.now() })); } catch (e) {} };
  const borrarBorr = (k) => { try { localStorage.removeItem(k); } catch (e) {} };
  const [borradorAviso, setBorradorAviso] = useState(null);   // cuándo se guardó el borrador que se recuperó
  const formOriginal = useRef("");   // al editar: cómo estaba el trabajo, para no guardar borrador si no cambiaste nada
  useEffect(() => {
    if (!showForm) return;
    if (multiMode) {
      const vacio = !orderClient.name && !orderClient.phone && !orderClient.notes && orderItems.every(i=>!i.fileName && !i.unitPrice);
      vacio ? borrarBorr(BORR.pedido) : guardarBorr(BORR.pedido, { orderItems, orderClient });
    } else if (editJob) {
      JSON.stringify(form) === formOriginal.current ? borrarBorr(BORR.edicion) : guardarBorr(BORR.edicion, { jobId:editJob.id, status:editJob.status, form });
    } else {
      const vacio = !form.fileName && !form.clientName && !form.clientPhone && !form.price && !form.unitPrice && !form.notes && !form.deposit;
      vacio ? borrarBorr(BORR.trabajo) : guardarBorr(BORR.trabajo, { form });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm, multiMode, editJob, form, orderItems, orderClient]);
  const abrirNuevoTrabajo = (prefill = {}) => {
    setMultiMode(false); setEditJob(null);
    const b = leerBorr(BORR.trabajo), conPrefill = Object.keys(prefill).length > 0;
    if (b && b.form && (!conPrefill || normNombre(b.form.clientName) === normNombre(prefill.clientName))) { setForm({ ...J0, ...b.form }); setBorradorAviso(b.at); }
    else { setForm({ ...J0, printer:printers[0]?.id??"", ...prefill }); setBorradorAviso(null); }
    setShowForm(true);
  };
  const empezarDeCero = () => {
    setBorradorAviso(null);
    if (multiMode) { borrarBorr(BORR.pedido); setOrderItems([{...ITEM0, id:Date.now(), printer:printers[0]?.id??""}]); setOrderClient({name:'',phone:'',deliveryAt:null,deposit:'',notes:''}); }
    else if (editJob) { borrarBorr(BORR.edicion); setForm(JSON.parse(formOriginal.current)); }
    else { borrarBorr(BORR.trabajo); setForm({ ...J0, printer:printers[0]?.id??"" }); }
  };
  // Tocar afuera cierra pero conserva el borrador; Cancelar lo descarta
  const cerrarForm = (descartar) => {
    const k = multiMode ? BORR.pedido : editJob ? BORR.edicion : BORR.trabajo;
    if (descartar) borrarBorr(k); else if (leerBorr(k)) toast_(editJob ? "Tus cambios quedaron como borrador" : "Quedó guardado como borrador");
    setShowForm(false); setEditJob(null); setMultiMode(false); setBorradorAviso(null);
  };

  useEffect(() => {
    document.title = "WORLD3D Manager";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FUENTES_URL;
    document.head.appendChild(link);
    const style = document.createElement("style");
    style.textContent = `
      * { font-family: 'Outfit', system-ui, sans-serif !important; box-sizing:border-box; }
      .w3d-titulo { font-family: 'Rubik', 'Outfit', system-ui, sans-serif !important; text-transform: uppercase; }
      select option { background: #221D1B; color: #FFF7F3; }
      /* Foco visible al navegar con teclado (iPad con teclado, compu) */
      button:focus-visible, a:focus-visible, select:focus-visible, [role="button"]:focus-visible { outline: 2px solid #F1841B !important; outline-offset: 2px; }
      input:focus, textarea:focus, select:focus { border-color: #F1841B !important; }
      button:active:not(:disabled) { transform: scale(.97); }
      @keyframes w3dGira { to { transform: rotate(360deg); } }
      /* En pantallas táctiles (iPad, celu) todo botón mide al menos 44px: se toca con el dedo sin errar */
      @media (pointer: coarse) { button { min-height: 44px; min-width: 44px; } }
      @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation-duration: .01ms !important; transition-duration: .01ms !important; } }
      body { margin:0; }
      /* Job card grid */
      .cards-grid { display:flex; flex-direction:column; gap:10px; }
      @media(min-width:1024px){ .cards-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; } }
      @media(min-width:1400px){ .cards-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; } }
      /* Dashboard 2-col */
      .dash-layout { display:flex; flex-direction:column; gap:0; }
      @media(min-width:1024px){ .dash-layout { display:grid; grid-template-columns:minmax(0,1fr) 340px; gap:0; align-items:start; } }
      @media(min-width:1300px){ .dash-layout { grid-template-columns:minmax(0,1fr) 380px; } }
      /* Stats grid */
      .stats-row { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
      .stats-row-sm { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
      /* View padding */
      .view-pad { padding:16px; }
      @media(min-width:640px){ .view-pad { padding:20px; } }
      @media(min-width:1024px){ .view-pad { padding:28px 32px; } }
      /* Sidebar */
      .sidebar-btn { display:flex; align-items:center; border:none; cursor:pointer; width:100%; transition:background .15s; }
      .sidebar-btn:hover { background: rgba(255,255,255,.05) !important; }
      /* Client + Product cards */
      .client-cards { display:grid; grid-template-columns:1fr; gap:10px; }
      @media(min-width:1024px){ .client-cards { grid-template-columns:1fr 1fr; } }
      @media(min-width:1400px){ .client-cards { grid-template-columns:1fr 1fr 1fr; } }
      /* Stats 2-col on desktop */
      .stats-layout { display:flex; flex-direction:column; }
      @media(min-width:1100px){ .stats-layout { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(0,1fr); gap:32px; } }
      /* Printers grid */
      .printers-grid { display:grid; grid-template-columns:1fr; gap:12px; }
      @media(min-width:900px){ .printers-grid { grid-template-columns:1fr 1fr; } }
      @media(min-width:1300px){ .printers-grid { grid-template-columns:1fr 1fr 1fr; } }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!fbUser) return;
    const unsubC = onSnapshot(collection(db,"config"),(snap) => { snap.docs.forEach(d => { if(d.id==="matCosts") setMatCosts(d.data()||{}); if(d.id==="operacion") setOperacion({...OP0, ...(d.data()||{})}); if(d.id==="recontactos") setRecontactos(d.data()||{}); if(d.id==="colores") setColoresExtra(Array.isArray(d.data()?.lista)?d.data().lista:[]); }); });
    return () => unsubC();
  }, [fbUser]);

  const saveCost = async (material, value) => {
    const val = Number(value); if(isNaN(val)||val<=0) return;
    const updated = {...matCosts,[material]:val};
    await setDoc(doc(db,"config","matCosts"),updated);
    setMatCosts(updated); setEditingCost(null); setCostInput("");
    toast_("Costo guardado");
  };
  const deleteCost = async (material) => {
    const updated = {...matCosts}; delete updated[material];
    await setDoc(doc(db,"config","matCosts"),updated); setMatCosts(updated);
  };

  useEffect(() => {
    if (!fbUser) return;
    const unsubJ = onSnapshot(collection(db,"jobs"),(snap) => { setJobs(snap.docs.map(d=>({id:d.id,...d.data()}))); setLoading(false); }, ()=>setLoading(false));
    const unsubProd = onSnapshot(collection(db,"products"),(snap)=>{ setProducts(snap.docs.map(d=>({id:d.id,...d.data()}))); });
    const unsubStock = onSnapshot(collection(db,"stock"),(snap)=>{ const s={}; snap.docs.forEach(d=>{s[d.id]=d.data();}); setStock(s); });
    const unsubF = onSnapshot(collection(db,"fallas"),(snap)=>setFallas(snap.docs.map(d=>({id:d.id,...d.data()}))));
    const unsubP = onSnapshot(collection(db,"printers"),(snap) => { const data=snap.docs.map(d=>({id:d.id,...d.data()})); if(data.length===0) DEFAULT_PRINTERS.forEach(p=>setDoc(doc(db,"printers",p.id),p)); else setPrinters(data); });
    return () => { unsubJ(); unsubP(); unsubProd(); unsubStock(); unsubF(); };
  }, [fbUser]);

  // ── Contador de impresión ──
  // Antes cada pantalla abierta restaba 1 minuto por su cuenta: con iPad + celu + compu el tiempo corría 3 veces más rápido.
  // Ahora se guarda cuándo arrancó el tramo actual (runStart) y lo que faltaba en ese momento (remaining);
  // cada pantalla calcula lo que falta con el reloj, sin escribir nada mientras imprime.
  useEffect(() => {
    timerRef.current = setInterval(() => setAhora(Date.now()), 20000);
    return () => clearInterval(timerRef.current);
  }, []);
  const cerrando = useRef(new Set());
  useEffect(() => {
    jobsDb.forEach(j => {
      if (j.status !== "printing" || j.jobType === "design" || cerrando.current.has(j.id)) return;
      // Trabajos que ya imprimían con la versión anterior: arrancan a contar desde ahora con lo que les quedaba
      if (!j.runStart) { cerrando.current.add(j.id); updateDoc(doc(db,"jobs",j.id),{runStart:Date.now()}).finally(()=>cerrando.current.delete(j.id)); return; }
      const dur = Number(j.duration) || 0, falta = (Number(j.remaining) || 0) - Math.floor(Math.max(0, ahora - j.runStart) / 60000);
      if (dur > 0 && falta <= 0) {
        cerrando.current.add(j.id);
        // finAuto = endedAt: marca que terminó solo (por el contador). El aviso de Telegram usa esa marca.
        const fin = Date.now();
        updateDoc(doc(db,"jobs",j.id),{status:"done",endedAt:fin,finAuto:fin,remaining:0,runStart:null}).finally(()=>cerrando.current.delete(j.id));
      }
    });
  }, [jobsDb, ahora]);

  // Botones de guardar: un solo envío a la vez (un doble toque ya no crea el trabajo dos veces)
  const [guardando, setGuardando] = useState(false);
  const guardandoRef = useRef(false);
  const conGuardado = (fn) => async (...a) => {
    if (guardandoRef.current) return;
    guardandoRef.current = true; setGuardando(true);
    try { await fn(...a); } finally { guardandoRef.current = false; setGuardando(false); }
  };
  // Avisos cortos abajo. Con "deshacer" quedan 5 s y muestran el botón Deshacer.
  const toastTimer = useRef(null);
  const toast_ = (msg,type="ok",deshacer=null) => {
    clearTimeout(toastTimer.current);
    setToast({msg,type,deshacer,id:Date.now()});
    toastTimer.current = setTimeout(()=>setToast(null), deshacer?5000:3000);
  };
  // Borrar con red de seguridad: se guarda una copia y Deshacer la vuelve a escribir con el mismo id
  const borrarConDeshacer = (col, id, datos, msg) => {
    if (!datos) return;
    const { id: _x, ...copia } = datos;
    deleteDoc(doc(db,col,id));
    toast_(msg, "err", () => { setDoc(doc(db,col,id), copia); toast_("Recuperado"); });
  };

  const movePriority = async (jobId,dir) => {
    const sorted=[...pending]; const idx=sorted.findIndex(j=>j.id===jobId); const ni=idx+dir;
    if(ni<0||ni>=sorted.length) return;
    const a=sorted[idx],b=sorted[ni];
    await Promise.all([updateDoc(doc(db,"jobs",a.id),{priority:b.priority??b.createdAt??0}),updateDoc(doc(db,"jobs",b.id),{priority:a.priority??a.createdAt??0})]);
  };

  const PROD0 = { name:"", price:"", duration:"", weight:"", material:"", color:"", notes:"", category:"" };
  const [prodForm, setProdForm] = useState({ name:"", price:"", duration:"", weight:"", material:"", color:"", notes:"", category:"" });

  const submitProduct = conGuardado(async () => {
    if(!prodForm.name.trim()) return;
    if(editProduct) {
      await updateDoc(doc(db,"products",editProduct.id), prodForm);
      toast_("Producto actualizado");
    } else {
      await addDoc(collection(db,"products"), { ...prodForm, createdAt:Date.now() });
      toast_("Producto guardado");
    }
    setProdForm({ name:"", price:"", duration:"", weight:"", material:"", color:"", notes:"" });
    setShowProductForm(false); setEditProduct(null);
  });

  const deleteProduct = (id) => borrarConDeshacer("products", id, products.find(x=>x.id===id), "Producto eliminado");

  const addToStock = async (prod) => {
    const existing = stock[prod.id];
    const qty = existing ? (existing.qty||0)+1 : 1;
    await setDoc(doc(db,"stock",prod.id),{ productId:prod.id, name:prod.name, qty, material:prod.material||"", color:prod.color||"", price:prod.price||"", updatedAt:Date.now() });
    toast_("Stock actualizado: " + prod.name);
  };

  const removeFromStock = async (prodId, currentQty) => {
    if(currentQty<=1) { await deleteDoc(doc(db,"stock",prodId)); }
    else { await setDoc(doc(db,"stock",prodId),{ ...stock[prodId], qty:currentQty-1, updatedAt:Date.now() }); }
  };

  const quickAddFromStock = async (prodId) => {
    const prod = products.find(p=>p.id===prodId);
    if(!prod) return;
    // La pieza ya está impresa: entra como "Listo" (no se vuelve a imprimir) y sale del stock
    await addDoc(collection(db,"jobs"),{ fileName:prod.name, printer:"", material:prod.material||"", color:prod.color||"", weight:Number(prod.weight)||0, duration:Number(prod.duration)||0, remaining:0, price:prod.price||"", unitPrice:prod.price||"", quantity:1, deposit:"", notes:"Desde stock", status:"done", clientName:"", clientPhone:"", deliveryAt:null, createdAt:Date.now(), startedAt:null, endedAt:Date.now(), shippedAt:null, priority:Date.now() });
    await removeFromStock(prodId, stock[prodId]?.qty||1);
    toast_(prod.name + " (de stock) listo para entregar");
  };

  const sellFromStock = async (prodId) => {
    const s = stock[prodId];
    const prod = products.find(p=>p.id===prodId);
    if(!prod||!s||s.qty<=0) return;
    // Register as a completed sold job so it shows in revenue/stats
    await addDoc(collection(db,"jobs"),{
      fileName: prod.name,
      printer: "",   // venta de stock: no se imprimió ahora, no cuenta para ninguna máquina
      material: prod.material||"",
      color: prod.color||"",
      weight: Number(prod.weight)||0,
      duration: Number(prod.duration)||0,
      remaining: 0,
      price: prod.price||"",
      unitPrice: prod.price||"",
      quantity: 1,
      deposit: prod.price||"",
      notes: prod.notes||"",
      status: "shipped",
      clientName: "",
      clientPhone: "",
      deliveryAt: null,
      createdAt: Date.now(),
      startedAt: Date.now(),
      endedAt: Date.now(),
      shippedAt: Date.now(),
      priority: Date.now(),
    });
    await removeFromStock(prodId, s.qty);
    toast_("Vendido: " + prod.name + (prod.price?" · Bs. "+Number(prod.price).toFixed(2):""));
  };

  const quickAddProduct = async (prod) => {
    const pid = printers[0]?.id ?? "";
    await addDoc(collection(db,"jobs"),{
      fileName: prod.name,
      printer: pid,
      material: prod.material||"",
      color: prod.color||"",
      weight: Number(prod.weight)||0,
      duration: Number(prod.duration)||0,
      remaining: Number(prod.duration)||0,
      price: prod.price||"",
      unitPrice: prod.price||"",
      quantity: 1,
      deposit: "",
      notes: prod.notes||"",
      status: "pending",
      clientName: "",
      clientPhone: "",
      deliveryAt: null,
      createdAt: Date.now(),
      startedAt: null,
      endedAt: null,
      shippedAt: null,
      priority: Date.now(),
    });
    toast_(prod.name + " agregado a la cola");
  };


  const ITEM0 = { fileName:"", material:"", color:"", weight:"", duration:"", quantity:"1", unitPrice:"", printer:"" };

  const addOrderItem = (prefill={}) => setOrderItems(prev=>[...prev, {...ITEM0,...prefill, id:Date.now()+Math.random()}]);
  const removeOrderItem = (id) => setOrderItems(prev=>prev.filter(x=>x.id!==id));
  const updateOrderItem = (id, field, value) => setOrderItems(prev=>prev.map(x=>x.id===id?{...x,[field]:value}:x));

  const openMultiForm = () => {
    setMultiMode(true); setEditJob(null);
    const b = leerBorr(BORR.pedido);
    if (b && Array.isArray(b.orderItems) && b.orderItems.length) { setOrderItems(b.orderItems); setOrderClient(b.orderClient||{name:'',phone:'',deliveryAt:null,deposit:'',notes:''}); setBorradorAviso(b.at); }
    else {
      setOrderItems([{...ITEM0, id:Date.now(), printer:printers[0]?.id??""}]);
      setOrderClient({name:'',phone:'',deliveryAt:null,deposit:'',notes:''});
      setBorradorAviso(null);
    }
    setShowForm(true);
  };

  const submitOrder = conGuardado(async () => {
    const validItems = orderItems.filter(x=>x.fileName.trim());
    if(validItems.length===0) return;
    const orderId = 'order_'+Date.now();
    const pid = printers[0]?.id??"";
    await Promise.all(validItems.map(item =>
      addDoc(collection(db,"jobs"),{
        fileName: item.fileName.trim(),
        printer: item.printer||pid,
        material: item.material||"",
        color: item.color||"",
        weight: Number(item.weight)||0,
        duration: Number(item.duration)||0,
        remaining: (Number(item.duration)||0) * (Number(item.quantity)||1),
        price: item.unitPrice?String(Number(item.unitPrice)*(Number(item.quantity)||1)):"",
        unitPrice: item.unitPrice||"",
        quantity: Number(item.quantity)||1,
        deposit: "",
        notes: orderClient.notes||"",
        status: "pending",
        clientName: orderClient.name||"",
        clientPhone: orderClient.phone||"",
        deliveryAt: orderClient.deliveryAt||null,
        createdAt: Date.now(),
        startedAt: null,
        endedAt: null,
        shippedAt: null,
        priority: Date.now(),
        orderId,
      })
    ));
    // Also auto-add to catalog if not exists
    for(const item of validItems) {
      const nameKey = item.fileName.trim().toLowerCase();
      const alreadyExists = products.some(p=>p.name.toLowerCase()===nameKey);
      if(!alreadyExists) {
        await addDoc(collection(db,"products"),{
          name: item.fileName.trim(),
          price: item.unitPrice||"",
          duration: Number(item.duration)||"",
          weight: Number(item.weight)||"",
          material: item.material||"",
          color: item.color||"",
          notes: "",
          category: "",
          createdAt: Date.now(),
        });
      }
    }
    const totalPrice = validItems.reduce((s,x)=>(s+Number(x.unitPrice||0)*(Number(x.quantity)||1)),0);
    toast_("Pedido con "+validItems.length+" productos agregado" + (totalPrice>0?" · Bs."+totalPrice.toFixed(2):""));
    borrarBorr(BORR.pedido); setBorradorAviso(null);
    setShowForm(false);
    setMultiMode(false);
    setOrderItems([]);
  });

  const submitJob = conGuardado(async () => {
    if(!form.fileName.trim()) return;
    const pid = form.printer||(printers[0]?.id??"");
    const data = {...form, printer:form.jobType==="design"?"":pid, duration:Number(form.duration), weight:Number(form.weight), quantity:Number(form.quantity)||1};
    if(editJob) {
      await updateDoc(doc(db,"jobs",editJob.id),{...data,
        // Si sigue en marcha o en pausa, se conserva lo que falta; si no, se recalcula para todas las unidades
        ...(["printing","paused"].includes(editJob.status)&&data.status===editJob.status
            ? {remaining:editJob.remaining, runStart:data.status==="printing"?Date.now():null}
            : {remaining:data.status==="done"||data.status==="shipping"||data.status==="shipped"?0:minutosTotales(data), runStart:data.status==="printing"?Date.now():null}),
        // Al cambiar el estado desde el formulario también se registran las fechas
        ...(data.status!==editJob.status&&["done","shipping","shipped"].includes(data.status)&&!editJob.endedAt?{endedAt:Date.now()}:{}),
        ...(data.status==="shipped"&&editJob.status!=="shipped"?{shippedAt:Date.now()}:{})});
      toast_("Trabajo actualizado");
    } else {
      await addDoc(collection(db,"jobs"),{...data,remaining:minutosTotales(data),createdAt:Date.now(),startedAt:null,endedAt:null,shippedAt:null,priority:Date.now()});
      // Auto-add to catalog if product doesn't exist yet
      const nameKey = form.fileName.trim().toLowerCase();
      const alreadyExists = products.some(p=>p.name.toLowerCase()===nameKey);
      if(!alreadyExists && form.fileName.trim()) {
        await addDoc(collection(db,"products"),{
          name: form.fileName.trim(),
          price: form.unitPrice||form.price||"",
          duration: Number(form.duration)||"",
          weight: Number(form.weight)||"",
          material: form.material||"",
          color: form.color||"",
          notes: form.notes||"",
          category: "",
          createdAt: Date.now(),
        });
      }
      toast_("Agregado a la cola");
    }
    borrarBorr(editJob ? BORR.edicion : BORR.trabajo); setBorradorAviso(null);
    setForm(J0); setShowForm(false); setEditJob(null);
  });

  const submitP = conGuardado(async () => {
    if(!pForm.name.trim()) return;
    if(editP) { await updateDoc(doc(db,"printers",editP.id),pForm); toast_("Impresora actualizada"); }
    else { await addDoc(collection(db,"printers"),pForm); toast_("Impresora agregada"); }
    setPForm(P0); setShowPForm(false); setEditP(null);
  });

  // Cambio de estado con Deshacer (5 s): se guarda cómo estaba el trabajo y Deshacer lo deja igual
  const CAMPOS_ESTADO = ["status","remaining","runStart","startedAt","endedAt","shippedAt","debe","pagoSaldo","saldoCobradoAt","finAuto","fallas"];
  const cambiarEstadoJ = (id, cambios, msg) => {
    const antes = jobsDb.find(x=>x.id===id);
    updateDoc(doc(db,"jobs",id), cambios);
    if (!antes) { toast_(msg); return; }
    const previo = {}; CAMPOS_ESTADO.forEach(k => { previo[k] = antes[k] ?? null; });
    toast_(msg, "ok", () => { updateDoc(doc(db,"jobs",id), previo); toast_("Se deshizo el cambio"); });
  };
  const startJ  = (j)  => { const t=Date.now(); cambiarEstadoJ(j.id, {status:"printing",startedAt:t,runStart:t,remaining:minutosTotales(j)}, "Impresión iniciada"); };
  // Al pausar se congela lo que falta; al reanudar arranca un tramo nuevo
  const pauseJ  = (id) => { const j=jobs.find(x=>x.id===id); cambiarEstadoJ(id, {status:"paused",remaining:j?Number(j.remaining)||0:0,runStart:null}, "Trabajo pausado"); };
  const resumeJ = (id) => cambiarEstadoJ(id, {status:"printing",runStart:Date.now()}, "Impresión reanudada");
  const completeJ= (id) => cambiarEstadoJ(id, {status:"done",endedAt:Date.now(),remaining:0,runStart:null}, "Listo para entregar");
  const toShipJ = (id) => cambiarEstadoJ(id, {status:"shipping"}, "Marcado para envío");
  // Entregar: si falta cobrar algo, primero pregunta si lo cobraste (efectivo o QR) o si queda debiendo
  const [cobro, setCobro] = useState(null);   // { job, modo: "entrega" | "deuda" }
  const shippedJ= (id,job) => {
    const j = job || jobs.find(x=>x.id===id);
    if (j && saldoDe(j) > 0) { setCobro({ job:j, modo:"entrega" }); return; }
    cambiarEstadoJ(id, {status:"shipped",shippedAt:Date.now(),debe:false}, "Entregado");
  };
  const cobrarDeuda = (job) => setCobro({ job, modo:"deuda" });
  // ── Fallas: se anota motivo y filamento perdido, y el trabajo vuelve a la cola ──
  const [falla, setFalla] = useState(null);   // { job, motivo, gramos, minutos }
  const abrirFalla = (job) => {
    const hecho = job.status==="done" ? 1 : avanceJob(job)/100;
    setFalla({ job, motivo:"", gramos:String(Math.round((Number(job.weight)||0)*unidades(job)*hecho)), minutos:Math.round(minutosTotales(job)*hecho) });
  };
  const registrarFalla = async () => {
    if (!falla || !falla.motivo) return;
    const { job, motivo, minutos } = falla, gramos = Math.max(0, Number(falla.gramos)||0);
    const kg = matCosts[job.material]||0, porHora = (Number(operacion.luzHora)||0)+(Number(operacion.desgasteHora)||0);
    const costo = Math.round((gramos/1000*kg + minutos/60*porHora)*100)/100;
    setFalla(null);
    await addDoc(collection(db,"fallas"), { jobId:job.id, fileName:job.fileName||"", clientName:job.clientName||"", printer:job.printer||"", material:job.material||"", motivo, gramos, minutos, costo, at:Date.now() });
    cambiarEstadoJ(job.id, {status:"pending",remaining:minutosTotales(job),runStart:null,startedAt:null,endedAt:null,finAuto:null,fallas:(Number(job.fallas)||0)+1}, `Falla anotada (${fmtMoney(costo)}) · volvió a la cola`);
  };
  const resolverCobro = (metodo) => {   // metodo: "efectivo" | "qr" | null (queda debiendo)
    if (!cobro) return;
    const { job, modo } = cobro, t = Date.now(), monto = fmtMoney(saldoDe(job));
    setCobro(null);
    if (modo === "deuda") {
      if (!metodo) return;
      cambiarEstadoJ(job.id, {debe:false,pagoSaldo:metodo,saldoCobradoAt:t}, `Cobrado ${monto} (${metodo==="qr"?"QR":"efectivo"})`);
      return;
    }
    cambiarEstadoJ(job.id, metodo
      ? {status:"shipped",shippedAt:t,debe:false,pagoSaldo:metodo,saldoCobradoAt:t}
      : {status:"shipped",shippedAt:t,debe:true,pagoSaldo:null,saldoCobradoAt:null},
      metodo ? `Entregado · cobraste ${monto}` : `Entregado · queda debiendo ${monto}`);
  };
  // jobsDb guarda los datos tal cual (sin el tiempo restante recalculado)
  const deleteJ = (id) => { borrarConDeshacer("jobs", id, jobsDb.find(x=>x.id===id), "Trabajo eliminado"); setConfirmDel(null); };
  const deleteP = (id) => borrarConDeshacer("printers", id, printers.find(x=>x.id===id), "Impresora eliminada");
  const duplicateJ = async (job) => {
    const {id,...rest} = job;
    await addDoc(collection(db,"jobs"),{...rest,fileName:job.fileName+" (copia)",createdAt:Date.now(),startedAt:null,endedAt:null,shippedAt:null,status:"pending",remaining:minutosTotales(job),runStart:null,webPedido:null,webItem:null,priority:Date.now()});
    toast_("Trabajo duplicado");
  };
  const openEJ = (job) => {
    setEditJob(job); setMultiMode(false);
    const original = { fileName:job.fileName, printer:job.printer, material:job.material||"", jobType:job.jobType||"print", weight:job.weight||"", duration:job.duration||"", notes:job.notes||"", status:job.status, color:job.color||"", clientName:job.clientName||"", clientPhone:job.clientPhone||"", price:job.price||"", quantity:job.quantity||"1", unitPrice:job.unitPrice||"", deliveryAt:job.deliveryAt||null, deposit:job.deposit||"" };
    formOriginal.current = JSON.stringify(original);
    // Borrador de edición: solo si es de este trabajo y el trabajo no cambió de estado mientras tanto
    const b = leerBorr(BORR.edicion);
    if (b && b.jobId===job.id && b.status===job.status && b.form) { setForm(b.form); setBorradorAviso(b.at); setShowForm(true); return; }
    setBorradorAviso(null);
    setForm({ fileName:job.fileName, printer:job.printer, material:job.material||"", jobType:job.jobType||"print", weight:job.weight||"", duration:job.duration||"", notes:job.notes||"", status:job.status, color:job.color||"", clientName:job.clientName||"", clientPhone:job.clientPhone||"", price:job.price||"", quantity:job.quantity||"1", unitPrice:job.unitPrice||"", deliveryAt:job.deliveryAt||null, deposit:job.deposit||"" });
    setShowForm(true);
  };
  const openEP = (p) => { setEditP(p); setPForm({name:p.name,type:p.type,brand:p.brand,connected:p.connected,img:p.img||"",imgBg:p.imgBg||"#1e1e1e"}); setShowPForm(true); };

  // ─── DERIVED ──────────────────────────────────────────────────────────────
  const printing = jobs.filter(j=>j.status==="printing");
  const pending  = jobs.filter(j=>j.status==="pending").sort((a,b)=>(a.priority??a.createdAt??0)-(b.priority??b.createdAt??0));
  const paused   = jobs.filter(j=>j.status==="paused");
  const done     = jobs.filter(j=>j.status==="done");
  const shipping = jobs.filter(j=>j.status==="shipping");
  const shipped  = jobs.filter(j=>j.status==="shipped");
  // Para Inicio: lo de impresión (los diseños tienen su propio filtro)
  const enMarcha = [...printing, ...paused].filter(j=>j.jobType!=="design");
  const enCola   = pending.filter(j=>j.jobType!=="design");
  // Abre la Cola mostrando exactamente lo que cuenta la tarjeta tocada (sin filtros viejos de impresora o búsqueda)
  const abrirCola = (filtro) => { setFStatus(filtro); setFPrinter("all"); setQueueSearch(""); setQueueViewMode("detail"); setQueueSort(filtro==="hoy"||filtro==="atrasados"?"delivery":"priority"); setSortMode(false); setView("queue"); };
  const finished = jobs.filter(j=>["done","shipping","shipped"].includes(j.status));
  const revenue  = jobs.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0);
  const filtered = jobs.filter(j=>(fPrinter==="all"||j.printer===fPrinter)&&(fStatus==="all"||(fStatus==="design"?j.jobType==="design":j.status===fStatus))).sort((a,b)=>a.status==="pending"&&b.status==="pending"?(a.priority??a.createdAt??0)-(b.priority??b.createdAt??0):0);
  const pActive  = (pid) => jobs.find(j=>j.printer===pid&&j.status==="printing");
  const pPend    = (pid) => jobs.filter(j=>j.printer===pid&&j.status==="pending").length;
  const last6 = Array.from({length:6},(_,i)=>{ const hoy=new Date(); const d=new Date(hoy.getFullYear(),hoy.getMonth()-i,1); const ms=startOfMonth(d),me=startOfMonth(new Date(d.getFullYear(),d.getMonth()+1,1)),mj=jobs.filter(j=>j.price&&(j.createdAt||0)>=ms&&(j.createdAt||0)<me); return {label:monthLabel(d),jobs:mj.length,rev:mj.reduce((s,j)=>s+Number(j.price),0)}; }).reverse();
  const maxRev = Math.max(...last6.map(m=>m.rev),1);
  // ── Cobrado: la plata que entró de verdad ──
  // El adelanto se cuenta el día que se tomó el pedido; el saldo (precio − adelanto), el día que se entregó.
  const cobradoEntre = (desde, hasta = Infinity) => jobs.reduce((s,j) => {
    const precio = Number(j.price)||0, adel = Math.min(Number(j.deposit)||0, precio || Infinity);
    const tPedido = j.createdAt||0, tSaldo = j.saldoCobradoAt||j.shippedAt||j.endedAt||j.createdAt||0;
    if (adel>0 && tPedido>=desde && tPedido<hasta) s += adel;
    // El saldo cuenta el día que lo cobraste (al entregar, o después si quedó debiendo)
    if (j.status==="shipped" && !j.debe && precio>adel && tSaldo>=desde && tSaldo<hasta) s += precio-adel;
    return s;
  }, 0);
  const cobradoHoy = cobradoEntre(startOfDay()), cobradoMes = cobradoEntre(startOfMonth());

  const getPeriodStart = (period) => {
    const now=new Date();
    if(period==="day") return startOfDay(now);
    if(period==="week") { const d=new Date(now); d.setDate(d.getDate()-((d.getDay()+6)%7)); d.setHours(0,0,0,0); return d.getTime(); }  // desde el lunes
    if(period==="month") return startOfMonth(now);
    if(period==="year") return new Date(now.getFullYear(),0,1).getTime();
    return 0;
  };
  const periodStart = getPeriodStart(statPeriod);
  const periodJobs = jobs.filter(j=>j.price&&(j.createdAt||0)>=periodStart);
  const periodRev  = periodJobs.reduce((s,j)=>s+Number(j.price),0);
  const periodByPrinter = printers.map(p=>({name:p.name,total:periodJobs.filter(j=>j.printer===p.id).length,rev:periodJobs.filter(j=>j.printer===p.id&&j.price).reduce((s,j)=>s+Number(j.price),0)})).filter(p=>p.total>0).sort((a,b)=>b.rev-a.rev);
  const periodByMaterial = {};
  periodJobs.forEach(j=>{ if(j.material) periodByMaterial[j.material]=(periodByMaterial[j.material]||0)+1; });
  const topMaterials = Object.entries(periodByMaterial).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const periodLabels = {day:"Hoy",week:"Esta semana",month:"Este mes",year:"Este año"};

  // Clientes: el mismo teléfono es la misma persona aunque el nombre esté escrito distinto;
  // sin teléfono, se compara el nombre sin tildes, mayúsculas ni espacios de más ("Juan Pérez" = "juan  perez")
  const normNombre = (n) => (n||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
  const normTel = (t) => { const d=(t||"").replace(/\D/g,""); return d.length>=7 ? d.slice(-8) : ""; };
  const telDeNombre = {};
  jobs.forEach(j=>{ const t=normTel(j.clientPhone), n=normNombre(j.clientName); if(t&&n&&!telDeNombre[n]) telDeNombre[n]=t; });
  const clientMap = {};
  [...jobs].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).forEach(j=>{
    const n=normNombre(j.clientName); if(!n) return;
    const t=normTel(j.clientPhone)||telDeNombre[n]||"";
    const k=t?"tel:"+t:"nom:"+n;
    if(!clientMap[k]) clientMap[k]={key:k,name:j.clientName.trim(),phone:j.clientPhone||"",jobs:[]};   // nombre y teléfono del pedido más reciente
    clientMap[k].jobs.push(j);
    if(!clientMap[k].phone&&j.clientPhone) clientMap[k].phone=j.clientPhone;
  });
  const clients = Object.values(clientMap).map(c=>({...c,totalJobs:c.jobs.length,totalRevenue:c.jobs.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0),completed:c.jobs.filter(j=>j.status==="shipped").length,active:c.jobs.filter(j=>["pending","printing","paused"].includes(j.status)).length,lastJob:Math.max(...c.jobs.map(j=>j.createdAt||0))})).sort((a,b)=>b.lastJob-a.lastJob);

  const claveCliente = (j) => { const n=normNombre(j?.clientName); if(!n) return null; const t=normTel(j.clientPhone)||telDeNombre[n]||""; return t?"tel:"+t:"nom:"+n; };
  const abrirCliente = (j) => { const k=claveCliente(j); if(!k) return; setSelectedClient(k); setShowBuscar(false); setShowMas(false); setKioskMode(false); setView("clients"); };
  // Recordatorio por WhatsApp a quien no recogió su pedido (queda anotado cuándo se le recordó)
  const recordarRecojo = (job) => {
    if (!job.clientPhone) return;
    const fecha = new Date(Number(job.endedAt)).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"long"});
    const saldo = porCobrarDe(job);
    const msg = `Hola ${job.clientName||""}! Te escribimos de WORLD3D 👋 Tu pedido *${job.fileName}* está listo desde el ${fecha}. ¿Cuándo podrías pasar a recogerlo?${saldo>0?` Queda un saldo de Bs ${saldo.toFixed(2)}.`:""}`;
    window.open(`https://wa.me/${job.clientPhone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank","noopener,noreferrer");
    updateDoc(doc(db,"jobs",job.id),{recordadoAt:Date.now()});
  };
  // ── Nota de entrega: imagen con el logo para mandar por WhatsApp (en iPad/celu se comparte directo) ──
  const notaEntrega = async (job) => {
    try {
      const grupo = job.orderId ? jobs.filter(x=>x.orderId===job.orderId) : job.webPedido ? jobs.filter(x=>x.webPedido===job.webPedido) : [job];
      const total = grupo.reduce((t,j)=>t+(Number(j.price)||0),0), adel = grupo.reduce((t,j)=>t+Math.min(Number(j.deposit)||0, Number(j.price)||0),0);
      const debe = grupo.reduce((t,j)=>t+porCobrarDe(j),0), cobradoAhora = total-adel-debe;
      const fecha = new Date(Math.max(...grupo.map(j=>Number(j.shippedAt)||Number(j.endedAt)||Date.now())));
      const numero = job.webPedido ? `Pedido web #${String(job.webPedido).padStart(5,"0")}` : `N.º ${String(job.id).slice(-6).toUpperCase()}`;
      try { await document.fonts.ready; } catch (e) {}
      const W = 1080, filaH = 92, H = 448 + grupo.length*filaH + 80 + 60 + (adel>0?52:0) + (cobradoAhora>0.004?52:0) + 16 + 92 + 150;
      const cv = document.createElement("canvas"); cv.width = W; cv.height = H;
      const x = cv.getContext("2d");
      const F = (peso, tam, fam="Outfit") => `${peso} ${tam}px '${fam}', system-ui, sans-serif`;
      x.fillStyle = "#191513"; x.fillRect(0,0,W,H);
      x.fillStyle = "#F1841B"; x.fillRect(0,0,W,14);
      const logo = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = ISOTIPO; });
      if (logo) x.drawImage(logo, 70, 70, 86, 108);
      x.fillStyle = "#FFF7F3"; x.font = F(900, 58, "Rubik"); x.fillText("WORLD", 180, 140);
      const wW = x.measureText("WORLD").width; x.fillStyle = "#F1841B"; x.fillText("3D", 180+wW, 140);
      x.fillStyle = "#D9CCC4"; x.font = F(600, 26); x.fillText("Impresión y diseño 3D · Santa Cruz", 182, 176);
      x.textAlign = "right"; x.fillStyle = "#FFF7F3"; x.font = F(900, 34); x.fillText("NOTA DE ENTREGA", W-70, 118);
      x.fillStyle = "#D9CCC4"; x.font = F(600, 26); x.fillText(numero, W-70, 156);
      x.fillText(fecha.toLocaleDateString("es-ES",{day:"numeric",month:"long",year:"numeric"}), W-70, 190); x.textAlign = "left";
      let y = 260;
      x.fillStyle = "#2A2421"; x.fillRect(70, y, W-140, 110);
      x.fillStyle = "#A8998F"; x.font = F(700, 22); x.fillText("CLIENTE", 100, y+42);
      x.fillStyle = "#FFF7F3"; x.font = F(800, 34); x.fillText(job.clientName||"—", 100, y+86);
      if (job.clientPhone) { x.textAlign = "right"; x.fillStyle = "#D9CCC4"; x.font = F(600, 28); x.fillText(job.clientPhone, W-100, y+86); x.textAlign = "left"; }
      y += 170;
      x.fillStyle = "#A8998F"; x.font = F(700, 22); x.fillText("PRODUCTO", 70, y); x.textAlign = "right"; x.fillText("CANT.", W-300, y); x.fillText("IMPORTE", W-70, y); x.textAlign = "left";
      y += 18; x.fillStyle = "#3A322E"; x.fillRect(70, y, W-140, 2);
      const corta = (t, max) => { let r = t; while (x.measureText(r).width > max && r.length > 3) r = r.slice(0,-2); return r===t ? t : r+"…"; };
      grupo.forEach(j => {
        y += filaH;
        x.fillStyle = "#FFF7F3"; x.font = F(700, 32); x.fillText(corta(j.fileName||"", W-520), 70, y-30);
        const det = [j.material, j.color].filter(Boolean).join(" · ");
        if (det) { x.fillStyle = "#A8998F"; x.font = F(500, 22); x.fillText(det, 70, y-2); }
        x.textAlign = "right"; x.fillStyle = "#D9CCC4"; x.font = F(700, 30); x.fillText(String(unidades(j)), W-300, y-30);
        x.fillStyle = "#FFF7F3"; x.fillText(`Bs ${(Number(j.price)||0).toFixed(2)}`, W-70, y-30); x.textAlign = "left";
        x.fillStyle = "#2A2421"; x.fillRect(70, y+10, W-140, 1);
      });
      y += 80;
      const linea = (l, v, color="#D9CCC4", tam=30, peso=700) => { x.font = F(peso, tam); x.fillStyle = "#A8998F"; x.fillText(l, W-520, y); x.textAlign = "right"; x.fillStyle = color; x.fillText(v, W-70, y); x.textAlign = "left"; y += tam+22; };
      linea("Total", `Bs ${total.toFixed(2)}`, "#FFF7F3", 38, 900);
      if (adel > 0) linea("Adelanto", `Bs ${adel.toFixed(2)}`);
      if (cobradoAhora > 0.004) linea("Pagado al entregar", `Bs ${cobradoAhora.toFixed(2)}`);
      y += 16;
      const pagado = debe < 0.005;
      x.fillStyle = pagado ? "#F1841B" : "#3A1510"; x.fillRect(70, y, W-140, 92);
      x.textAlign = "center"; x.font = F(900, 40); x.fillStyle = pagado ? "#191513" : "#FF8A6B";
      x.fillText(pagado ? "PAGADO ✓" : `SALDO PENDIENTE: Bs ${debe.toFixed(2)}`, W/2, y+60); x.textAlign = "left";
      x.textAlign = "center"; x.fillStyle = "#D9CCC4"; x.font = F(600, 28); x.fillText("¡Gracias por confiar en WORLD3D!", W/2, H-70); x.textAlign = "left";
      const blob = await new Promise(r => cv.toBlob(r, "image/png"));
      const nombreArchivo = `nota-world3d-${(job.clientName||"cliente").replace(/\s+/g,"-").toLowerCase()}.png`;
      const archivo = new File([blob], nombreArchivo, { type:"image/png" });
      const texto = `Hola ${job.clientName||""}! Te enviamos la nota de entrega de tu pedido. ¡Gracias por tu compra! — WORLD3D`;
      if (navigator.canShare && navigator.canShare({ files:[archivo] })) {
        try { await navigator.share({ files:[archivo], text:texto }); return; } catch (e) { if (e && e.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = nombreArchivo; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast_(job.clientPhone ? "Nota descargada · adjuntala en el chat que se abrió" : "Nota descargada");
      if (job.clientPhone) window.open(`https://wa.me/${job.clientPhone.replace(/\D/g,"")}?text=${encodeURIComponent(texto)}`,"_blank","noopener,noreferrer");
    } catch (e) { toast_("No se pudo armar la nota: " + (e.message||e), "err"); }
  };
  const listosSinRecoger = jobs.filter(sinRecoger).sort((a,b)=>(a.endedAt||0)-(b.endedAt||0));
  const deudores = jobs.filter(j=>j.status==="shipped"&&j.debe&&saldoDe(j)>0).sort((a,b)=>(a.shippedAt||0)-(b.shippedAt||0));

  // ── Costo real de un trabajo: filamento + horas de máquina (luz + desgaste). Los diseños no gastan máquina. ──
  const porHoraMaq = (Number(operacion.luzHora)||0) + (Number(operacion.desgasteHora)||0);
  const costoDe = (j) => {
    if (j.jobType==="design") return { mat:0, maq:0, luz:0, desgaste:0, total:0, sinMat:false, sinPeso:false, sinDatos:true };
    const g = (Number(j.weight)||0)*unidades(j), kg = matCosts[j.material]||0, horas = minutosTotales(j)/60;
    const luz = horas*(Number(operacion.luzHora)||0), desgaste = horas*(Number(operacion.desgasteHora)||0);
    const mat = kg>0 ? g/1000*kg : 0, maq = luz+desgaste;
    return { mat, maq, luz, desgaste, horas, total:mat+maq, sinMat:g>0&&!kg, sinPeso:!g&&horas>0, sinDatos:!g&&!horas };
  };
  const precioSugerido = (j) => { const m = Math.min(90, Number(operacion.margenMin)||30)/100; return costoDe(j).total/(1-m); };

  // ── Horas impresas por máquina (trabajos terminados, lo que va del actual y lo que se imprimió antes de fallar) ──
  const horasDe = (pid) => {
    let min = 0;
    jobs.forEach(j => {
      if (j.printer!==pid || j.jobType==="design") return;
      if (["done","shipping","shipped"].includes(j.status)) min += minutosTotales(j);
      else if (["printing","paused"].includes(j.status)) min += Math.max(0, minutosTotales(j)-(Number(j.remaining)||0));
    });
    fallas.forEach(f => { if (f.printer===pid) min += Number(f.minutos)||0; });
    return min/60;
  };
  const tareasDe = (p) => (p.mant || (p.type==="FDM"?MANT_FDM:MANT_RESINA).map(t=>({...t, ultima:0}))).map(t => {
    const horas = horasDe(p.id), uso = horas-(Number(t.ultima)||0), faltan = (Number(t.cada)||0)-uso;
    return { ...t, horas, uso, faltan, vencida:faltan<=0, pronto:faltan>0&&faltan<=Math.max(5,(Number(t.cada)||0)*0.1) };
  });
  const mantPendiente = printers.flatMap(p => p.mant ? tareasDe(p).filter(t=>t.vencida).map(t=>({p,t})) : []);
  const mantHecho = (p, tid) => {
    const lista = tareasDe(p).map(({horas,uso,faltan,vencida,pronto,...t}) => t.id===tid ? {...t, ultima:Math.round(horas*10)/10, hechoAt:Date.now()} : t);
    updateDoc(doc(db,"printers",p.id), { mant:lista }); toast_("Mantenimiento anotado");
  };
  const mantCada = (p, tid, cada) => {
    const n = Number(cada); if (!n || n<=0) return;
    const lista = tareasDe(p).map(({horas,uso,faltan,vencida,pronto,...t}) => t.id===tid ? {...t, cada:n} : t);
    updateDoc(doc(db,"printers",p.id), { mant:lista });
  };

  // Primera vez: cada máquina arranca su plan de mantenimiento desde las horas que ya lleva (no todo "vencido")
  const mantIniciado = useRef(new Set());
  useEffect(() => {
    if (loading || !jobsDb.length) return;
    printers.forEach(p => {
      if (p.mant || mantIniciado.current.has(p.id)) return;
      mantIniciado.current.add(p.id);
      const h = Math.round(horasDe(p.id)*10)/10;
      updateDoc(doc(db,"printers",p.id), { mant:(p.type==="FDM"?MANT_FDM:MANT_RESINA).map(t=>({...t, ultima:h})) });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, printers, jobsDb.length]);

  // ── Clientes para recontactar: compraron, no piden hace 60+ días y no se les escribió en los últimos 30 ──
  const paraRecontactar = clients.filter(c => c.phone && c.completed>0 && !c.jobs.some(j=>j.status!=="shipped")
    && Date.now()-c.lastJob > 60*DIA && Date.now()-(Number(recontactos[c.key])||0) > 30*DIA)
    .sort((a,b)=>b.totalRevenue-a.totalRevenue);
  const marcarRecontacto = (c) => setDoc(doc(db,"config","recontactos"), { ...recontactos, [c.key]:Date.now() });
  const recontactar = (c) => {
    const ultimo = [...c.jobs].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0))[0];
    const nombre = (c.name||"").split(" ")[0];
    const msg = `Hola ${nombre}! Te saluda WORLD3D 👋 Hace un tiempo te hicimos *${ultimo?.fileName||"tu pedido"}*. ¿Necesitas algo más? Tenemos diseños nuevos y podemos imprimir en 3D lo que imagines 🖨✨`;
    window.open(`https://wa.me/${c.phone.replace(/\D/g,"")}?text=${encodeURIComponent(msg)}`,"_blank","noopener,noreferrer");
    marcarRecontacto(c);
  };

  const todayDeliveries = (() => { const dayStart=startOfDay(); return jobs.filter(j=>j.deliveryAt&&j.deliveryAt>=dayStart&&j.deliveryAt<dayStart+86400000&&j.status!=="shipped").sort((a,b)=>a.deliveryAt-b.deliveryAt); })();
  const upcomingDeliveries = (() => { const dayEnd=startOfDay()+86400000; return jobs.filter(j=>j.deliveryAt&&j.deliveryAt>=dayEnd&&j.deliveryAt<startOfDay()+7*86400000&&j.status!=="shipped").sort((a,b)=>a.deliveryAt-b.deliveryAt); })();
  const overdueDeliveries = jobs.filter(esAtrasado);
  const needs_attention = [...printing,...paused,...shipping].length;

  const getPrinterQueueInfo = (pid) => {
    const activeJob=jobs.find(j=>j.printer===pid&&j.status==="printing");
    const activeMins=activeJob?Number(activeJob.remaining)||0:0;
    const queuedJobs=jobs.filter(j=>j.printer===pid&&j.status==="pending").sort((a,b)=>(a.priority??a.createdAt??0)-(b.priority??b.createdAt??0));
    const queuedMins=queuedJobs.reduce((s,j)=>s+minutosTotales(j),0);
    return {activeMins,queuedMins,queueCount:queuedJobs.length,totalWait:activeMins+queuedMins,activeJob};
  };
  const getEstimatedReady = (pid,dur) => { const {totalWait}=getPrinterQueueInfo(pid); return Date.now()+(totalWait+Number(dur||0))*60000; };
  const fmtReadyDate = (ts) => { if(!ts) return ""; const d=new Date(ts); const now=new Date(); const diff=ts-Date.now(); const diffH=Math.floor(diff/3600000); const diffD=Math.floor(diff/86400000); const DAYS=["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"]; const MONTHS=["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"]; const t=d.toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}); const isSameDay=d.getDate()===now.getDate()&&d.getMonth()===now.getMonth(); if(isSameDay) return`hoy ${t}`; const tom=new Date(now); tom.setDate(tom.getDate()+1); const isTom=d.getDate()===tom.getDate()&&d.getMonth()===tom.getMonth(); if(isTom) return`mañana ${t}`; return`${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${t}`; };
  const suggestBestPrinter = (type="FDM") => { const compat=printers.filter(p=>p.type===type||(type==="FDM"&&["FDM"].includes(p.type))||(type==="Resina"&&["Resina","SLA","DLP"].includes(p.type))); if(compat.length===0) return null; return compat.reduce((best,p)=>getPrinterQueueInfo(p.id).totalWait<getPrinterQueueInfo(best.id).totalWait?p:best); };

  // ─── JOB CARD ─────────────────────────────────────────────────────────────
  const JobCard = ({ job, compact=false, showPriority=false, idx=0, total=0 }) => {
    const printer = printers.find(x=>x.id===job.printer);
    const pct = avanceJob(job);
    const qty = Number(job.quantity)||1;
    const wa = waUrl(job);
    const st = STATUS[job.status]||STATUS.pending;
    const flowStep = FLOW_STEP[job.status]??0;
    const isPrinting = job.status==="printing";
    const isPaused = job.status==="paused";
    const isHighlighted = highlightJob===job.id;
    const isDesign = job.jobType==="design";
    // Resumida: nombre, avance, cliente y plata en una línea y la acción principal. El resto, al tocar "Ver detalle".
    const resumida = !compact && !abiertas.has(job.id) && !isHighlighted;

    // Acción principal de cada trabajo, solo con colores de la marca
    const primaryAction = () => {
      const naranja = `linear-gradient(135deg,${C.orange},${C.orangeD})`, sombra = "0 4px 20px rgba(241,132,27,0.30)";
      if(job.status==="pending")   return {label:isDesign?"Iniciar diseño":"Iniciar impresión",fn:()=>startJ(job),bg:naranja,shadow:sombra};
      if(job.status==="printing")  return {label:isDesign?"Diseño terminado":"Marcar como listo",fn:()=>completeJ(job.id),bg:"#E9521E",color:"#191513",shadow:"0 4px 20px rgba(233,82,30,0.30)"};
      if(job.status==="paused")    return {label:"Reanudar",fn:()=>resumeJ(job.id),bg:naranja,shadow:sombra};
      if(job.status==="done")      return {label:"Listo para envío",fn:()=>toShipJ(job.id),bg:"#FFF0DE",color:"#191513",shadow:"none"};
      if(job.status==="shipping")  return {label:"Marcar como entregado",fn:()=>shippedJ(job.id,job),bg:"#FFF7F3",color:"#191513",shadow:"none"};
      if(job.status==="shipped"&&job.debe) return {label:`Cobrar saldo ${fmtMoney(saldoDe(job))}`,fn:()=>cobrarDeuda(job),bg:naranja,shadow:sombra};
      return null;
    };
    const action = primaryAction();
    // Deslizar con el dedo: a la derecha hace la acción principal, a la izquierda pausa (si está imprimiendo).
    // Sin hooks (JobCard se llama como función): el arrastre se guarda en el propio elemento.
    const puedeDeslizar = !showPriority && (!!action || isPrinting);
    const capas = (el) => [el.querySelector("[data-capa]"), el.querySelector("[data-pista]")];
    const soltar = (el) => { const [capa, pista] = capas(el); if (capa) { capa.style.transition = "transform .2s"; capa.style.transform = "none"; } if (pista) pista.style.opacity = 0; };
    const gestos = !puedeDeslizar ? {} : {
      onTouchStart: (e) => { const t = e.touches[0]; e.currentTarget._g = { x:t.clientX, y:t.clientY, dx:0, eje:null }; },
      onTouchMove: (e) => {
        const el = e.currentTarget, g = el._g; if (!g) return;
        const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
        if (!g.eje) { if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; g.eje = Math.abs(dx) > Math.abs(dy) * 1.3 ? "x" : "y"; }
        if (g.eje !== "x") return;
        let d = dx; if (d > 0 && !action) d = 0; if (d < 0 && !isPrinting) d = 0;
        d = Math.max(-140, Math.min(140, d)); g.dx = d;
        const [capa, pista] = capas(el);
        capa.style.transition = "none"; capa.style.transform = `translateX(${d}px)`;
        pista.style.opacity = 1;
        pista.children[0].style.opacity = d > 0 ? Math.min(1, d / 90) : 0;
        pista.children[1].style.opacity = d < 0 ? Math.min(1, -d / 90) : 0;
      },
      onTouchEnd: (e) => {
        const el = e.currentTarget, g = el._g; el._g = null; soltar(el);
        if (!g || g.eje !== "x") return;
        if (g.dx >= 90 && action) action.fn(); else if (g.dx <= -90 && isPrinting) pauseJ(job.id);
      },
      onTouchCancel: (e) => { e.currentTarget._g = null; soltar(e.currentTarget); },
    };

    return (
      <div style={{ display:"flex", gap:0, marginBottom:10 }}>
        {showPriority && (
          <div style={{ width:42, flexShrink:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, background:C.bg2, borderRadius:`${C.r}px 0 0 ${C.r}px`, border:`1px solid ${C.bg5}`, borderRight:"none", paddingBlock:10 }}>
            <div style={{ fontSize:12, fontWeight:900, color:C.orange, lineHeight:1 }}>#{idx+1}</div>
            <button onClick={()=>movePriority(job.id,-1)} disabled={idx===0} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${C.bg5}`, background:C.bg3, cursor:idx===0?"not-allowed":"pointer", fontSize:12, color:idx===0?C.bg5:C.t2, opacity:idx===0?.3:1 }}>▲</button>
            <button onClick={()=>movePriority(job.id,+1)} disabled={idx===total-1} style={{ width:28, height:28, borderRadius:8, border:`1px solid ${C.bg5}`, background:C.bg3, cursor:idx===total-1?"not-allowed":"pointer", fontSize:12, color:idx===total-1?C.bg5:C.t2, opacity:idx===total-1?.3:1 }}>▼</button>
          </div>
        )}
        <div {...gestos} style={{ flex:1, minWidth:0, position:"relative", touchAction:puedeDeslizar?"pan-y":undefined }}>
        {puedeDeslizar && (
          <div data-pista aria-hidden="true" style={{ position:"absolute", inset:0, borderRadius:C.r, background:C.bg3, display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 18px", opacity:0, fontSize:14, fontWeight:900 }}>
            <span style={{ color:C.orange, opacity:0 }}>{action ? `${action.label} →` : ""}</span>
            <span style={{ color:C.t2, opacity:0 }}>← Pausar</span>
          </div>
        )}
        <div data-capa style={{ background:isHighlighted?C.orangeBg:C.bg2, borderRadius:showPriority?`0 ${C.r}px ${C.r}px 0`:C.r, border:`1px solid ${isHighlighted?C.orange:isPrinting?STATUS.printing.border:isPaused?STATUS.paused.border:C.bg4}`, overflow:"hidden", transition:"border-color .3s,background .3s", position:"relative" }}>
          {/* Left status accent bar */}
          <div style={{ position:"absolute", left:0, top:0, bottom:0, width:4, background:isDesign?"#E9521E":st.dot, borderRadius:"4px 0 0 4px", opacity:0.9 }} />

          <div style={{ padding:"16px 16px 14px 20px" }}>
            {/* Row 1: filename + status */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:8 }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                  {isDesign && <span style={{ fontSize:12, background:"#2E1309", color:"#FFF0DE", border:"1px solid #6B2812", borderRadius:C.rPill, padding:"2px 8px", fontWeight:800, flexShrink:0 }}>Diseño 3D</span>}
                  <div style={{ fontSize:15, fontWeight:900, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", letterSpacing:-.2 }}>{job.fileName}</div>
                </div>
                {printer && !isDesign && <div style={{ fontSize:12, color:C.t3, marginTop:2, display:"flex", alignItems:"center", gap:4 }}><span><Icono e="🖨" /></span>{printer.name}</div>}
                {isDesign && job.quantity>1 && <div style={{ fontSize:12, color:"#FFF0DE", marginTop:2 }}>{job.quantity} piezas</div>}
              </div>
              <StatusBadge status={job.status} pulse={isPrinting} />
            </div>

            {/* Row 2: chips */}
            <div style={{ display:"flex", flexWrap:"wrap", gap:4, marginBottom:10 }}>
              {!isDesign && job.material && <Chip bg={C.bg4} color={C.t2}>{job.material}</Chip>}
              {!isDesign && job.color    && <Chip bg={C.bg4} color={C.t2}>{job.color}</Chip>}
              {!isDesign && job.weight>0 && <Chip bg={C.bg4} color={C.t3}>{job.weight}g</Chip>}
              {job.duration>0 && <Chip bg={C.bg4} color={C.t3}>{fmtTime(job.duration * (qty>1?qty:1))}{qty>1&&<span style={{opacity:.6}}> (×{qty})</span>}</Chip>}
              {qty>1 && <Chip bg={C.purpleBg} color={C.purple}>×{qty} {isDesign?"piezas":"uds."}</Chip>}
            </div>

            {/* Progress */}
            {isPrinting && (
              <div style={{ marginBottom:12 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:5 }}>
                  <span style={{ color:C.green, fontWeight:800 }}>{pct}% completado</span>
                  <span style={{ color:C.t2 }}><Icono e="⏳" /><strong style={{ color:C.t1 }}>{fmtTime(job.remaining)}</strong> restante</span>
                </div>
                <div style={{ height:7, background:C.bg4, borderRadius:7 }}>
                  <div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.green},#F1841B)`, borderRadius:7, transition:"width 1s" }} />
                </div>
              </div>
            )}

            {/* Status messages */}
            {job.status==="shipping"&&job.endedAt && <div style={{ fontSize:12, color:C.purple, marginBottom:8 }}>Impreso el {fmtDate(job.endedAt)} — esperando envío</div>}
            {job.status==="shipped"&&job.shippedAt && <div style={{ fontSize:12, color:C.teal, marginBottom:8 }}>Entregado el {fmtDate(job.shippedAt)}</div>}
            {job.status==="done"&&job.endedAt && <div style={{ fontSize:12, color:C.t3, marginBottom:8 }}>Terminado el {fmtDate(job.endedAt)}</div>}
            {isPaused && <div style={{ fontSize:12, color:STATUS.paused.color, marginBottom:8 }}>En pausa — toca Reanudar para continuar</div>}
            {sinRecoger(job) && (
              <div style={{ display:"flex", alignItems:"center", gap:10, background:C.yellowBg, border:"1px solid #4A3F36", borderRadius:C.rSm, padding:"8px 8px 8px 12px", marginBottom:10 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:800, color:C.yellow }}>Listo {haceDias(job.endedAt)} · no lo recogieron</div>
                  {job.recordadoAt && <div style={{ fontSize:12, color:C.t3 }}>Le recordaste {haceDias(job.recordadoAt)}</div>}
                </div>
                {job.clientPhone && <button onClick={()=>recordarRecojo(job)} style={{ display:"flex", alignItems:"center", gap:6, background:C.waBg, color:C.wa, border:"1px solid #6B3A12", borderRadius:C.rSm, padding:"0 12px", minHeight:40, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}><MessageCircle size={16} aria-hidden="true" />Recordar</button>}
              </div>
            )}

            {/* Client + price */}
            {!compact&&!resumida&&(job.clientName||job.price) && (
              <div style={{ background:C.bg3, borderRadius:C.rSm, padding:"11px 14px", marginBottom:12, border:`1px solid ${C.bg5}`, display:"flex", gap:14, flexWrap:"wrap", alignItems:"center" }}>
                {job.clientName && (
                  <div>
                    <div style={{ fontSize:12, color:C.t4, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, marginBottom:2 }}>Cliente</div>
                    <button onClick={()=>abrirCliente(job)} style={{ fontSize:14, color:C.t1, fontWeight:700, background:"none", border:"none", padding:0, minHeight:0, minWidth:0, cursor:"pointer", textAlign:"left", textDecoration:"underline", textDecorationColor:C.bg5, textUnderlineOffset:3 }}>{job.clientName}</button>
                    {job.clientPhone && <div style={{ fontSize:12, color:C.t3 }}>{job.clientPhone}</div>}
                  </div>
                )}
                {job.price&&(()=>{
                  const total=Number(job.price)||0, dep=Number(job.deposit)||0, pend=porCobrarDe(job);
                  return (
                    <div style={{ marginLeft:"auto", textAlign:"right" }}>
                      <div style={{ fontSize:12, color:C.t4, fontWeight:700, textTransform:"uppercase", letterSpacing:.5, marginBottom:3 }}>{qty>1?`×${qty} unidades`:"Total"}</div>
                      <div style={{ fontSize:20, color:C.green, fontWeight:900, letterSpacing:-.5 }}>{fmtMoney(total)}</div>
                      {qty>1&&job.unitPrice && <div style={{ fontSize:12, color:C.t3 }}>{fmtMoney(job.unitPrice)} c/u</div>}
                      {job.status==="shipped"&&job.debe ? <div style={{ fontSize:12, color:C.yellow, fontWeight:800, marginTop:3 }}>Debe: {fmtMoney(pend)}</div>
                        : job.status==="shipped" ? <div style={{ fontSize:12, color:C.green, fontWeight:700, marginTop:3 }}>Cobrado{job.pagoSaldo?` · ${job.pagoSaldo==="qr"?"QR":"efectivo"}`:""}</div>
                        : dep>0 ? <div style={{ marginTop:4 }}>
                            <div style={{ fontSize:12, color:"#F1841B" }}>Adelanto: {fmtMoney(dep)}</div>
                            {pend>0 && <div style={{ fontSize:12, color:C.yellow, fontWeight:800 }}>Cobrar: {fmtMoney(pend)}</div>}
                            {pend<=0 && <div style={{ fontSize:12, color:C.green, fontWeight:700 }}>Pagado completo</div>}
                          </div>
                        : <div style={{ fontSize:12, color:C.yellow, fontWeight:800, marginTop:3 }}>Cobrar: {fmtMoney(total)}</div>}
                    </div>
                  );
                })()}
              </div>
            )}
            {/* Ganancia real: precio − (filamento + luz + desgaste) */}
            {!compact && !resumida && Number(job.price)>0 && !isDesign && (()=>{
              const c = costoDe(job); if (c.sinDatos) return null;
              const total = Number(job.price)||0, gan = total-c.total, margen = total>0 ? gan/total*100 : 0, bajo = margen < (Number(operacion.margenMin)||30);
              return (
                <div style={{ background:bajo?C.redBg:C.bg3, border:`1px solid ${bajo?"#5C1F14":C.bg5}`, borderRadius:C.rSm, padding:"9px 13px", marginBottom:12, fontSize:12, color:C.t2 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:8, flexWrap:"wrap" }}>
                    <span>Costo {fmtMoney(c.total)} <span style={{ color:C.t3 }}>= filamento {c.sinPeso?"—":fmtMoney(c.mat)} · luz {fmtMoney(c.luz)} · desgaste {fmtMoney(c.desgaste)}</span></span>
                    <span style={{ fontWeight:900, color:gan<0?"#FF8A6B":bajo?C.yellow:C.green }}>Ganás {fmtMoney(gan)} · {margen.toFixed(0)}%</span>
                  </div>
                  {c.sinMat && <div style={{ color:C.yellow, marginTop:3 }}>Falta el costo del {job.material||"material"} en Stats › Utilidad: el filamento no se está contando</div>}
                  {c.sinPeso && (
                    <div style={{ marginTop:6 }}>
                      <div style={{ color:C.yellow, fontWeight:800 }}>Falta el peso: el filamento no se está contando</div>
                      <div style={{ display:"flex", gap:6, alignItems:"center", marginTop:6 }}>
                        <input type="number" inputMode="numeric" placeholder={unidades(job)>1?"gramos por unidad":"gramos"} aria-label="Peso en gramos" onKeyDown={e=>{ if(e.key==="Enter"){ const v=Number(e.currentTarget.value); if(v>0) updateDoc(doc(db,"jobs",job.id),{weight:v}); } }} style={{ ...inputSt, flex:1, padding:"8px 10px", fontSize:14 }} />
                        <button onClick={e=>{ const v=Number(e.currentTarget.previousSibling.value); if(v>0){ updateDoc(doc(db,"jobs",job.id),{weight:v}); toast_("Peso guardado"); } }} style={{ minHeight:40, padding:"0 14px", background:C.orange, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:13, fontWeight:900, cursor:"pointer" }}>Guardar</button>
                      </div>
                    </div>
                  )}
                  {bajo && <div style={{ color:"#FF8A6B", fontWeight:800, marginTop:3 }}>Precio bajo: con {Number(operacion.margenMin)||30}% de margen sería {fmtMoney(precioSugerido(job))}</div>}
                  {Number(job.fallas)>0 && <div style={{ color:C.t3, marginTop:3 }}>Falló {job.fallas} {Number(job.fallas)===1?"vez":"veces"}</div>}
                </div>
              );
            })()}
            {(compact||resumida)&&(job.price||job.clientName)&&(()=>{
              const total=Number(job.price)||0,dep=Number(job.deposit)||0,pend=porCobrarDe(job);
              return (
                <div style={{ marginBottom:8, display:"flex", flexWrap:"wrap", alignItems:"baseline", columnGap:8 }}>
                  {resumida && job.clientName && <button onClick={()=>abrirCliente(job)} style={{ fontSize:14, color:C.t1, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"55%", background:"none", border:"none", padding:0, minHeight:0, minWidth:0, cursor:"pointer", textDecoration:"underline", textDecorationColor:C.bg5, textUnderlineOffset:3 }}>{job.clientName}</button>}
                  <span style={{ fontSize:14,color:C.green,fontWeight:800 }}>{fmtMoney(total)}{qty>1?` (×${qty})`:""}</span>
                  {job.status==="shipped"&&job.debe?<span style={{ fontSize:12,color:C.yellow,fontWeight:800,marginLeft:8 }}>Debe: {fmtMoney(pend)}</span>
                    :job.status==="shipped"?<span style={{ fontSize:12,color:C.green,fontWeight:700,marginLeft:8 }}>Cobrado</span>
                    :pend>0?<span style={{ fontSize:12,color:C.yellow,fontWeight:700,marginLeft:8 }}>Cobrar: {fmtMoney(pend)}</span>
                    :total>0&&!dep?<span style={{ fontSize:12,color:C.yellow,fontWeight:700,marginLeft:8 }}>Cobrar: {fmtMoney(total)}</span>:null}
                </div>
              );
            })()}

            {/* Pedido web */}
            {!resumida && job.webPedido && <button onClick={()=>setView("web")} style={{ fontSize:12, fontWeight:800, color:C.orange, background:C.orangeBg, border:`1px solid ${C.orange}44`, borderRadius:C.rPill, padding:"3px 10px", marginBottom:10, cursor:"pointer" }}>Pedido web #{String(job.webPedido).padStart(5,"0")}</button>}
            {/* Notes */}
            {!resumida && job.notes && <div style={{ fontSize:12, color:C.t2, background:C.bg3, borderRadius:C.rSm, padding:"8px 12px", marginBottom:12, borderLeft:`3px solid ${C.orange}`, whiteSpace:"pre-wrap" }}>{job.notes}</div>}

            {/* Delivery date */}
            {job.deliveryAt&&job.status!=="shipped"&&(!resumida||esAtrasado(job)||esParaHoy(job))&&(()=>{
              const diff=job.deliveryAt-Date.now(); const diffH=Math.floor(diff/3600000); const diffD=Math.floor(diff/86400000);
              const isLate=esAtrasado(job); const dDel=new Date(job.deliveryAt); const dNow=new Date();
              const isToday=dDel.toDateString()===dNow.toDateString();
              const dTom=new Date(dNow); dTom.setDate(dTom.getDate()+1);
              const isTomorrow=dDel.toDateString()===dTom.toDateString();
              const dotColor=isLate?"#E53212":isToday?"#FFF0DE":isTomorrow?"#FFF0DE":"#F1841B";
              const bgColor=isLate?C.redBg:isToday?C.yellowBg:isTomorrow?C.purpleBg:C.blueBg;
              const bdColor=isLate?"#4A1A10":isToday?"#4A3F36":isTomorrow?"#6B2812":"#372F2C";
              const pasada=diff<0; // ya pasó la fecha (si está listo, solo falta entregarlo: no es "vencida")
              const title=isLate?"Entrega vencida":pasada?"Listo · fecha acordada":isToday?"Entrega HOY":isTomorrow?"Mañana":"Entrega acordada";
              const atrasoH=Math.floor(-diff/3600000), atrasoD=Math.floor(-diff/86400000);  // horas/días que pasaron (sin redondear negativos)
              const timeLeft=pasada?`hace ${atrasoD>0?`${atrasoD}d`:atrasoH>0?`${atrasoH}h`:`${Math.max(1,Math.floor(-diff/60000))}min`}`:diffH<1?"en menos de 1h":isToday?`en ${diffH}h`:isTomorrow?`en ${diffH}h`:`en ${diffD}d`;
              const fmtDel=new Date(job.deliveryAt).toLocaleDateString("es-ES",{weekday:"short",day:"2-digit",month:"short",hour:"2-digit",minute:"2-digit"});
              return (
                <div style={{ background:bgColor, border:`1px solid ${bdColor}`, borderRadius:C.rSm, padding:"9px 13px", marginBottom:10, display:"flex", alignItems:"center", gap:10 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color:dotColor }}>{title}</div>
                    <div style={{ fontSize:12, color:C.t2, marginTop:1 }}>{fmtDel} · <span style={{ color:dotColor, fontWeight:700 }}>{timeLeft}</span></div>
                  </div>
                </div>
              );
            })()}

            {/* Flow tracker */}
            {!compact && !resumida && (
              <div role="list" aria-label="Etapas del trabajo" style={{ display:"flex", alignItems:"flex-start", marginBottom:14, paddingBottom:2 }}>
                {(isDesign?FLOW_DESIGN:FLOW).map((step,i,arr) => {
                  const isActive=i===flowStep, isDone=i<flowStep;
                  return (
                    <div key={step.key} role="listitem" aria-current={isActive?"step":undefined} title={step.label} style={{ display:"flex", alignItems:"center", flex: i<arr.length-1 ? 1 : "0 0 auto", minWidth:0 }}>
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3, flexShrink:0, position:"relative" }}>
                        <div style={{ width:28, height:28, borderRadius:"50%", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, background:isActive?st.dot:isDone?C.bg4:C.bg3, border:`2px solid ${isActive?st.dot:isDone?C.bg5:C.bg4}`, boxShadow:isActive?`0 0 10px ${st.dot}44`:undefined, opacity:isDone?.4:1 }}>
                          {isDone?<Icono e="✓" size={14} />:<Icono e={step.icon} size={14} />}
                        </div>
                        <div style={ isActive ? { fontSize:12, color:C.t1, fontWeight:800, textAlign:"center", lineHeight:1.2, whiteSpace:"nowrap" } : { position:"absolute", width:1, height:1, overflow:"hidden", clip:"rect(0 0 0 0)" } }>{step.label}</div>
                      </div>
                      {i<arr.length-1 && <div style={{ flex:1, minWidth:8, height:2, background:i<flowStep?C.t4:C.bg4, margin:"13px 4px 0", borderRadius:2 }} />}
                    </div>
                  );
                })}
              </div>
            )}

            {/* PRIMARY ACTION (resumida: con Pausar al lado) */}
            {action && (
              <div style={{ display:"flex", gap:8 }}>
              <button onClick={action.fn} style={{ flex:1, width:"100%", padding:"14px 0", background:action.bg, color:action.color||"#191513", border:"none", borderRadius:C.rSm, fontSize:15, fontWeight:800, cursor:"pointer", marginBottom:8, letterSpacing:.2, boxShadow:action.shadow }}>
                {action.label}
              </button>
              {resumida && isPrinting && <button onClick={()=>pauseJ(job.id)} aria-label="Pausar impresión" title="Pausar" style={{ width:52, marginBottom:8, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, cursor:"pointer" }}><Pause size={20} aria-hidden="true" /></button>}
              </div>
            )}
            {!resumida && isPrinting && (
              <button onClick={()=>pauseJ(job.id)} style={{ width:"100%", padding:"10px 0", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:8 }}>
                Pausar impresión
              </button>
            )}

            {/* SECONDARY ACTIONS */}
            {!compact && (
              <button onClick={()=>alternarTarjeta(job.id)} aria-expanded={!resumida} style={{ width:"100%", display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"8px 0", marginBottom:resumida?0:8, background:"transparent", border:"none", color:C.t3, fontSize:13, fontWeight:700, cursor:"pointer" }}>
                {resumida?"Ver detalle":"Ocultar detalle"}<ChevronDown size={16} aria-hidden="true" style={{ transform:resumida?"none":"rotate(180deg)", transition:"transform .2s" }} />
              </button>
            )}
            {!resumida && <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
              {wa && (
                <button onClick={()=>window.open(wa,"_blank","noopener,noreferrer")} style={{ flex:1, padding:"9px 4px", background:C.waBg, color:C.wa, border:`1px solid #6B3A12`, borderRadius:C.rSm, fontSize:12, fontWeight:800, cursor:"pointer" }}>
                  WhatsApp
                </button>
              )}
              {!isDesign && ["printing","paused","done"].includes(job.status) && <button onClick={()=>abrirFalla(job)} style={{ flex:1, padding:"9px 4px", background:C.redBg, color:"#FF8A6B", border:`1px solid #5C1F14`, borderRadius:C.rSm, fontSize:12, fontWeight:800, cursor:"pointer" }}>Falló</button>}
              {["done","shipping","shipped"].includes(job.status) && Number(job.price)>0 && <button onClick={()=>notaEntrega(job)} style={{ flex:1, padding:"9px 4px", background:C.bg3, color:C.t1, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:12, fontWeight:800, cursor:"pointer" }}>Nota</button>}
              <button onClick={()=>duplicateJ(job)} style={{ flex:1, padding:"9px 4px", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:12, fontWeight:700, cursor:"pointer" }}>Duplicar</button>
              {!compact && <button onClick={()=>openEJ(job)} style={{ flex:1, padding:"9px 4px", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:12, fontWeight:700, cursor:"pointer" }}>Editar</button>}
              {!compact && <button onClick={()=>setConfirmDel(job.id)} style={{ width:38, padding:"9px 0", background:C.redBg, color:C.red, border:`1px solid #4A1A10`, borderRadius:C.rSm, fontSize:14, cursor:"pointer" }}><Icono e="🗑" /></button>}
            </div>}
          </div>
        </div>
        </div>
      </div>
    );
  };

  // ─── PRINTER CARD ─────────────────────────────────────────────────────────
  const PrinterCard = ({ p, showActions=false }) => {
    const active = pActive(p.id);
    const pct = active ? avanceJob(active) : 0;
    return (
      <div style={{ background:C.bg2, borderRadius:C.r, padding:"14px 16px", marginBottom:10, border:`1px solid ${active?STATUS.printing.border:C.bg4}`, display:"flex", alignItems:"center", gap:14 }}>
        <div style={{ width:56, height:56, borderRadius:14, background:p.imgBg||C.bg3, border:`1px solid ${C.bg5}`, display:"flex", alignItems:"center", justifyContent:"center", overflow:"hidden", flexShrink:0 }}>
          {p.img ? <img src={p.img} alt={p.name} style={{ width:50, height:50, objectFit:"contain" }} onError={e=>{e.target.style.display="none"}} /> : <span style={{ color:C.t3 }}><Icono e={p.type==="FDM"?"🖨":"🧪"} size={26} /></span>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
            <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{p.name}</div>
            <div style={{ width:7, height:7, borderRadius:"50%", background:p.connected?C.green:C.bg5, boxShadow:p.connected?`0 0 6px ${C.green}`:undefined }} />
            <span style={{ fontSize:12, color:p.connected?C.green:C.t4, fontWeight:700 }}>{p.connected?"En línea":"Offline"}</span>
          </div>
          <div style={{ fontSize:12, color:C.t3, marginBottom:active?6:0 }}>{p.brand} · {p.type}</div>
          {active ? (
            <>
              <div style={{ fontSize:12, color:C.green, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", marginBottom:4 }}>{active.fileName} — quedan {fmtTime(active.remaining)}</div>
              <div style={{ height:4, background:C.bg4, borderRadius:4 }}><div style={{ height:"100%", width:`${pct}%`, background:`linear-gradient(90deg,${C.green},#F1841B)`, borderRadius:4 }} /></div>
            </>
          ) : (
            <div style={{ fontSize:12, color:C.t4 }}>{pPend(p.id)>0?`${pPend(p.id)} trabajo${pPend(p.id)>1?"s":""} esperando`:"Sin trabajos pendientes"}</div>
          )}
        </div>
        {showActions && (
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            <button onClick={()=>openEP(p)} style={{ padding:"8px 11px", borderRadius:C.rSm, border:`1px solid ${C.bg5}`, background:C.bg3, cursor:"pointer", fontSize:13, color:C.t2 }}><Icono e="✏️" /></button>
            <button onClick={()=>deleteP(p.id)} style={{ padding:"8px 11px", borderRadius:C.rSm, border:`1px solid #4A1A10`, background:C.redBg, cursor:"pointer", fontSize:13, color:C.red }}><Icono e="🗑" /></button>
          </div>
        )}
      </div>
    );
  };

  const Empty = ({ icon, title, sub }) => (
    <div style={{ textAlign:"center", padding:"56px 20px" }}>
      <div style={{ marginBottom:16, color:C.t4 }}><Icono e={icon} size={48} strokeWidth={1.5} /></div>
      <div style={{ fontSize:17, fontWeight:800, color:C.t1, marginBottom:8 }}>{title}</div>
      {sub && <div style={{ fontSize:13, color:C.t3, lineHeight:1.7 }}>{sub}</div>}
    </div>
  );

  // ─── SECTION HEADER ───────────────────────────────────────────────────────
  const SectionLabel = ({ children, color=C.t3, dot }) => (
    <div style={{ fontSize:12, fontWeight:800, color, textTransform:"uppercase", letterSpacing:.9, margin:"20px 0 10px", display:"flex", alignItems:"center", gap:6 }}>
      {dot && <div style={{ width:7, height:7, borderRadius:"50%", background:dot, boxShadow:`0 0 6px ${dot}` }} />}
      {children}
    </div>
  );

  // ─── DASHBOARD ────────────────────────────────────────────────────────────
  const DashboardView = () => {
    // Borradores sin terminar (trabajo nuevo o pedido múltiple), visibles para retomarlos
    const bT = !showForm && leerBorr(BORR.trabajo), bP = !showForm && leerBorr(BORR.pedido);
    const borradores = [
      bT && bT.form && { k:"t", titulo:bT.form.fileName||"Trabajo sin nombre", sub:bT.form.clientName, at:bT.at, seguir:()=>abrirNuevoTrabajo(), borrar:()=>{ borrarBorr(BORR.trabajo); setAhora(Date.now()); toast_("Borrador descartado"); } },
      bP && bP.orderItems && { k:"p", titulo:`Pedido de ${bP.orderItems.filter(i=>i.fileName).length||1} producto${bP.orderItems.filter(i=>i.fileName).length>1?"s":""}`, sub:bP.orderClient?.name, at:bP.at, seguir:openMultiForm, borrar:()=>{ borrarBorr(BORR.pedido); setAhora(Date.now()); toast_("Borrador descartado"); } },
    ].filter(Boolean);
    const statsLeft = (
      <div>
        {borradores.map(d=>(
          <div key={d.k} style={{ display:"flex", alignItems:"center", gap:10, background:C.orangeBg, border:`1px solid ${C.orange}66`, borderRadius:C.r, padding:"12px 12px 12px 16px", marginBottom:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, color:C.orange, fontWeight:900, textTransform:"uppercase", letterSpacing:.7 }}>Borrador sin terminar</div>
              <div style={{ fontSize:15, fontWeight:900, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{d.titulo}{d.sub?` · ${d.sub}`:""}</div>
              <div style={{ fontSize:12, color:C.t3 }}>Guardado a las {new Date(d.at).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}{Date.now()-d.at>DIA?` · ${haceDias(d.at)}`:""}</div>
            </div>
            <button onClick={d.borrar} style={{ minHeight:44, padding:"0 12px", background:"transparent", color:C.t3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}>Descartar</button>
            <button onClick={d.seguir} style={{ minHeight:44, padding:"0 16px", background:C.orange, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:14, fontWeight:900, cursor:"pointer", flexShrink:0 }}>Seguir</button>
          </div>
        ))}
        <div className="stats-row" style={{ marginBottom:8 }}>
          {[
            { status:"printing", Icon:Printer,   label:"Imprimiendo", count:enMarcha.length, sub:enMarcha[0]&&`${enMarcha[0].fileName} · ${enMarcha[0].status==="paused"?"en pausa":`quedan ${fmtTime(enMarcha[0].remaining)}`}`, color:C.green },
            { status:"pending",  Icon:Hourglass, label:"En cola",     count:enCola.length,   sub:enCola[0]&&`Sigue: ${enCola[0].fileName}`, color:C.yellow },
          ].map(({ status, Icon, label, count, sub, color }) => (
            <button key={status} onClick={()=>abrirCola(status)} style={{ textAlign:"left", background:STATUS[status].bg, border:`1px solid ${STATUS[status].border}`, borderRadius:C.r, padding:"16px", cursor:"pointer", color:"inherit", fontFamily:"inherit", minWidth:0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color, fontWeight:800, textTransform:"uppercase", letterSpacing:.7, marginBottom:10 }}><Icon size={16} aria-hidden="true" />{label}<ChevronRight size={16} style={{ marginLeft:"auto", opacity:.7 }} aria-hidden="true" /></div>
              <div style={{ fontSize:36, fontWeight:900, color:C.t1, lineHeight:1 }}>{count}</div>
              {sub && <div style={{ fontSize:13, color, marginTop:8, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{sub}</div>}
            </button>
          ))}
        </div>
        {/* Lo de hoy: lo que pide una acción, no totales históricos */}
        <div className="stats-row-sm" style={{ marginBottom:16 }}>
          {(() => {
            const hoy = jobs.filter(esParaHoy);
            const atrasados = jobs.filter(esAtrasado);
            const listos = done.length + shipping.length;
            return [
              { key:"hoy",   Icon:CalendarClock, n:hoy.length,       label:"Entregar hoy",   color:C.yellow, bg:C.yellowBg, borde:"#4A3F36", ir:()=>abrirCola("hoy") },
              { key:"atr",   Icon:AlertTriangle, n:atrasados.length, label:"Atrasados",      color:atrasados.length?"#E53212":C.t3, bg:atrasados.length?C.redBg:C.bg2, borde:atrasados.length?"#5C1F14":C.bg4, ir:()=>abrirCola("atrasados") },
              { key:"web",   Icon:Globe,         n:webAtencion,      label:"Web por atender",color:webAtencion?C.orange:C.t3, bg:webAtencion?C.orangeBg:C.bg2, borde:webAtencion?`${C.orange}55`:C.bg4, ir:()=>setView("web") },
              { key:"listo", Icon:PackageCheck,  n:listos,           label:"Listos p/ entregar", color:C.purple, bg:C.purpleBg, borde:"#4A3F36", ir:()=>setView("shipping_view") },
            ].map(({ key, Icon, n, label, color, bg, borde, ir }) => (
              <button key={key} onClick={ir} style={{ background:bg, border:`1px solid ${borde}`, borderRadius:C.r, padding:"12px 8px", textAlign:"center", cursor:"pointer", color:"inherit", fontFamily:"inherit", minWidth:0 }}>
                <Icon size={20} color={color} aria-hidden="true" style={{ marginBottom:4 }} />
                <div style={{ fontSize:24, fontWeight:900, color:C.t1, lineHeight:1.1 }}>{n}</div>
                <div style={{ fontSize:12, color, fontWeight:700, marginTop:3, lineHeight:1.2 }}>{label}</div>
              </button>
            ));
          })()}
        </div>
        <div style={{ background:C.bg2, borderRadius:C.r, padding:"18px 20px", marginBottom:16, border:`1px solid ${C.bg4}`, position:"relative" }}>
          {/* Eye toggle */}
          <button onClick={()=>setShowRevenue(v=>!v)} style={{ position:"absolute", top:14, right:14, background:"rgba(255,255,255,.07)", border:"1px solid rgba(255,255,255,.12)", borderRadius:C.rSm, width:32, height:32, display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", zIndex:2 }} aria-label={showRevenue?"Ocultar ingresos":"Mostrar ingresos"} title={showRevenue?"Ocultar":"Mostrar"}>
            {showRevenue
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9CCC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#D9CCC4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="2" x2="22" y2="22"></line><path d="M6.71 6.71A10 10 0 0 0 1 12s4 8 11 8a9.9 9.9 0 0 0 5.29-1.51"/><path d="M17.94 17.94A10 10 0 0 0 23 12s-4-8-11-8a9.9 9.9 0 0 0-5.29 1.51"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
          <div style={{ filter:showRevenue?"none":"blur(10px)", userSelect:showRevenue?"auto":"none", transition:"filter .25s", pointerEvents:showRevenue?"auto":"none" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:7, fontSize:12, color:C.orange, fontWeight:800, textTransform:"uppercase", letterSpacing:.9, marginBottom:7 }}><Wallet size={16} aria-hidden="true" />Cobrado este mes</div>
                <div style={{ fontSize:32, fontWeight:900, color:C.t1, letterSpacing:-1 }}>{fmtMoney(cobradoMes)}</div>
                <div style={{ fontSize:12, color:C.t3, marginTop:2 }}>adelantos + saldos cobrados al entregar</div>
              </div>
              <div style={{ textAlign:"right", paddingRight:40 }}>
                <div style={{ fontSize:12, color:C.t3, marginBottom:4 }}>Cobrado hoy</div>
                <div style={{ fontSize:18, fontWeight:900, color:C.green }}>{fmtMoney(cobradoHoy)}</div>
              </div>
            </div>
            <div style={{ height:1, background:C.bg4, margin:"13px 0" }} />
            <div style={{ display:"flex", gap:20 }}>
              {[["Pedidos este mes",jobs.filter(j=>(j.createdAt||0)>=startOfMonth()).length],["Entregados este mes",jobs.filter(j=>j.status==="shipped"&&(j.shippedAt||0)>=startOfMonth()).length],["Por cobrar",fmtMoney(jobs.reduce((t,j)=>t+porCobrarDe(j),0))]].map(([l,v])=>(
                <div key={l}><div style={{ fontSize:12, color:C.t3, marginBottom:2 }}>{l}</div><div style={{ fontSize:14, fontWeight:900, color:C.t1 }}>{v}</div></div>
              ))}
            </div>
          </div>
        </div>
        {(listosSinRecoger.length>0||deudores.length>0||mantPendiente.length>0) && (<>
          {SectionLabel({color:C.yellow, dot:C.yellow, children:<>Para hacer seguimiento</>})}
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:18 }}>
            {[...listosSinRecoger.map(j=>({j, tipo:"recoger"})), ...deudores.map(j=>({j, tipo:"deuda"}))].slice(0, lim("seguimiento")).map(({j, tipo})=>(
              <div key={tipo+j.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 10px 10px 14px", background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.rSm }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.fileName}</div>
                  <div style={{ fontSize:12, color:C.t3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                    {j.clientName ? <button onClick={()=>abrirCliente(j)} style={{ background:"none", border:"none", padding:0, minHeight:0, minWidth:0, color:C.t2, fontSize:12, fontWeight:700, cursor:"pointer", textDecoration:"underline", textDecorationColor:C.bg5, textUnderlineOffset:3 }}>{j.clientName}</button> : "Sin cliente"}
                    {tipo==="recoger"
                      ? <span style={{ color:C.yellow }}> · listo {haceDias(j.endedAt)}{j.recordadoAt?` · recordado ${haceDias(j.recordadoAt)}`:""}</span>
                      : <span style={{ color:C.yellow }}> · debe {fmtMoney(saldoDe(j))} · entregado {haceDias(j.shippedAt)}</span>}
                  </div>
                </div>
                {tipo==="recoger"
                  ? (j.clientPhone && <button onClick={()=>recordarRecojo(j)} style={{ display:"flex", alignItems:"center", gap:6, background:C.waBg, color:C.wa, border:"1px solid #6B3A12", borderRadius:C.rSm, padding:"0 12px", minHeight:40, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}><MessageCircle size={16} aria-hidden="true" />Recordar</button>)
                  : <button onClick={()=>cobrarDeuda(j)} style={{ display:"flex", alignItems:"center", gap:6, background:C.orange, color:"#191513", border:"none", borderRadius:C.rSm, padding:"0 12px", minHeight:40, fontSize:13, fontWeight:900, cursor:"pointer", flexShrink:0 }}><Banknote size={16} aria-hidden="true" />Cobrar</button>}
              </div>
            ))}
            {mantPendiente.map(({p,t})=>(
              <div key={p.id+t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 10px 10px 14px", background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.rSm }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{t.nombre}</div>
                  <div style={{ fontSize:12, color:C.yellow }}>{p.name} · mantenimiento cada {t.cada} h</div>
                </div>
                <button onClick={()=>mantHecho(p,t.id)} style={{ minHeight:40, padding:"0 12px", background:C.bg3, color:C.t1, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:13, fontWeight:900, cursor:"pointer", flexShrink:0 }}>Hecho</button>
              </div>
            ))}
            {VerMas("seguimiento", listosSinRecoger.length+deudores.length)}
          </div>
        </>)}
        {printing.length>0 && (<>
          {SectionLabel({color:C.green, dot:C.green, children:<>Imprimiendo ahora</>})}
          <div className="cards-grid">{printing.map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>
        </>)}
        {shipping.length>0 && (<>
          {SectionLabel({color:C.purple, dot:C.purple, children:<>Listos para enviar</>})}
          <div className="cards-grid">{shipping.map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>
        </>)}
        {jobs.length===0 && (
          <div style={{ textAlign:"center", padding:"50px 20px" }}>
            <div style={{ fontSize:60, marginBottom:16 }}><Icono e="🖨" size={48} /></div>
            <div style={{ fontSize:18, fontWeight:900, color:C.t1, marginBottom:8 }}>Todo listo para empezar</div>
            <div style={{ fontSize:13, color:C.t3, lineHeight:1.7, marginBottom:24 }}>Agrega tu primer trabajo tocando el botón <strong style={{ color:C.t1 }}>+ Nuevo</strong> arriba</div>
            <button onClick={()=>abrirNuevoTrabajo()} style={{ padding:"14px 32px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.r, fontSize:16, fontWeight:800, cursor:"pointer", boxShadow:`0 6px 24px rgba(241,132,27,.4)` }}>
              + Agregar primer trabajo
            </button>
          </div>
        )}
      </div>
    );
    const statsRight = (
      <div style={{ borderLeft: isDesktop?`1px solid ${C.bg4}`:"none", paddingLeft: isDesktop?28:0, marginTop: isDesktop?0:24 }}>
        {SectionLabel({color:C.t3, children:<>Impresoras</>})}
        {printers.map(p=><Fragment key={p.id}>{PrinterCard({p:p})}</Fragment>)}
        {pending.length>0 && (<>
          {SectionLabel({color:C.yellow, style:{ marginTop:20 }, children:<>Cola de trabajo</>})}
          {pending.slice(0,8).map(j=>(
            <div key={j.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:C.bg2, borderRadius:C.rSm, marginBottom:6, border:`1px solid ${C.bg4}`, cursor:"pointer" }} onClick={()=>setView("queue")}>
              <div style={{ width:7, height:7, borderRadius:"50%", background:C.yellow, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.fileName}</div>
                <div style={{ fontSize:12, color:C.t3 }}>{j.clientName||"Sin cliente"}{j.deliveryAt?` · ${new Date(j.deliveryAt).toLocaleDateString("es-ES",{day:"2-digit",month:"short"})}`:""}</div>
              </div>
              {j.price&&<span style={{ fontSize:12, color:C.green, fontWeight:800, flexShrink:0 }}>Bs.{Number(j.price).toFixed(0)}</span>}
            </div>
          ))}
          {pending.length>8&&<div style={{ fontSize:12, color:C.t4, textAlign:"center", padding:"6px 0", cursor:"pointer" }} onClick={()=>setView("queue")}>+{pending.length-8} más →</div>}
        </>)}
      </div>
    );
    return (
      <div className="view-pad" style={{ maxWidth:isDesktop?1500:isTablet?900:"100%", margin:"0 auto" }}>
        <div className="dash-layout">
          {statsLeft}
          {statsRight}
        </div>
      </div>
    );
  };

  // ─── QUEUE VIEW ───────────────────────────────────────────────────────────
  const QueueView = () => {
    const fPrinter = "all";   // la Cola ya no filtra por máquina (las horas por máquina siguen en Máquinas)
    const fmtWaiting = (createdAt) => {
      if(!createdAt) return "";
      const diff = Date.now()-createdAt;
      const mins = Math.floor(diff/60000);
      const hours = Math.floor(diff/3600000);
      const days = Math.floor(diff/86400000);
      if(days>=1) return `${days}d esperando`;
      if(hours>=1) return `${hours}h esperando`;
      if(mins>=1) return `${mins}min esperando`;
      return "Recién creado";
    };

    const designJobs = jobs.filter(j=>j.jobType==="design");
    const printJobs  = jobs.filter(j=>j.jobType!=="design");
    // Cada chip cuenta exactamente lo que muestra su lista (misma regla en enFiltro)
    const atrasadosQ = jobs.filter(esAtrasado), hoyQ = jobs.filter(esParaHoy);
    // Etapas (pestañas). "listos" junta Listo + Para envío. Las alertas (atrasados / hoy) van aparte.
    const ETAPAS = [
      {key:"all",      label:"Todo",        count:printJobs.filter(j=>j.status!=="shipped").length},
      {key:"printing", label:"Imprimiendo", count:[...printing,...paused].filter(j=>j.jobType!=="design").length},
      {key:"pending",  label:"En cola",     count:pending.filter(j=>j.jobType!=="design").length},
      {key:"done",     label:"Listos",      count:done.filter(j=>j.jobType!=="design").length},
      {key:"shipping", label:"Para entregar", count:shipping.filter(j=>j.jobType!=="design").length},
      {key:"design",   label:"Diseño",      count:designJobs.filter(j=>j.status!=="shipped").length},
      {key:"shipped",  label:"Entregados",  count:null},
    ];
    const etapaActiva = fStatus==="listos" ? "done" : fStatus;
    const [verFiltros, setVerFiltros] = useState(false);
    const SORT_OPTIONS = [
      {key:"priority", label:"Prioridad"},
      {key:"delivery", label:"Entrega"},
      {key:"created",  label:"Creación"},
      {key:"waiting",  label:"Espera"},
    ];

    // Build filtered + sorted list
    const applySort = (list) => {
      if(queueSort==="delivery") return [...list].sort((a,b)=>(a.deliveryAt||Infinity)-(b.deliveryAt||Infinity));
      if(queueSort==="created")  return [...list].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
      if(queueSort==="waiting")  return [...list].sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
      return list; // priority — already sorted
    };

    const enFiltro = (j) =>
      fStatus==="atrasados" ? esAtrasado(j)                                   // incluye diseños: también se atrasan
      : fStatus==="hoy"     ? esParaHoy(j)
      : fStatus==="design"  ? j.jobType==="design" && j.status!=="shipped"    // los entregados están en "Entregados"
      : fStatus==="all"     ? j.jobType!=="design" && j.status!=="shipped"
      : fStatus==="printing"? j.jobType!=="design" && (j.status==="printing"||j.status==="paused")
      : fStatus==="listos"  ? j.jobType!=="design" && (j.status==="done"||j.status==="shipping")
      : j.status===fStatus && j.jobType!=="design";
    const baseFiltered = jobs.filter(j=>
      (fPrinter==="all"||j.printer===fPrinter) &&
      enFiltro(j) &&
      (!queueSearch||j.fileName?.toLowerCase().includes(queueSearch.toLowerCase())||j.clientName?.toLowerCase().includes(queueSearch.toLowerCase()))
    ).sort((a,b)=>a.status==="pending"&&b.status==="pending"?(a.priority??a.createdAt??0)-(b.priority??b.createdAt??0):0);

    const sortedFiltered = applySort(baseFiltered);
    const claveCola = `cola:${fStatus}:${fPrinter}:${queueSearch}:${queueSort}`;

    const designFilter = (j) => fStatus==="design" ? j.jobType==="design" : j.jobType!=="design";
    const searchFilter = (j) => !queueSearch||j.fileName?.toLowerCase().includes(queueSearch.toLowerCase())||j.clientName?.toLowerCase().includes(queueSearch.toLowerCase());
    const printerFilter = (j) => fPrinter==="all"||j.printer===fPrinter;
    const baseJobFilter = (j) => printerFilter(j) && designFilter(j) && searchFilter(j);
    const isDesignMode = fStatus==="design";
    const KANBAN_GROUPS = [
      {key:"pending",  label:isDesignMode?"Pendiente":"Cola",         color:C.yellow,  dot:C.yellow,  jobs:applySort(pending.filter(baseJobFilter))},
      {key:"printing", label:isDesignMode?"En diseño":"Imprimiendo",  color:isDesignMode?"#E9521E":C.green, dot:isDesignMode?"#E9521E":C.green, jobs:applySort([...printing,...paused].filter(baseJobFilter))},
      {key:"done",     label:isDesignMode?"Diseño listo":"Listo",     color:C.t2,      dot:C.t3,      jobs:applySort(done.filter(baseJobFilter))},
      {key:"shipping", label:isDesignMode?"Enviando":"Envío",         color:C.purple,  dot:C.purple,  jobs:applySort(shipping.filter(baseJobFilter))},
      {key:"shipped",  label:isDesignMode?"Entregado":"Entregados",   color:C.teal,    dot:C.teal,    jobs:applySort(shipped.filter(baseJobFilter))},
    ];

    const quickAction = (job) => {
      const isDes = job.jobType==="design";
      if(job.status==="pending")  return {label:"Iniciar",   fn:()=>startJ(job),           bg:C.orange,  color:"#191513"};
      if(job.status==="printing") return {label:isDes?"Terminado":"Listo", fn:()=>completeJ(job.id), bg:"#E9521E", color:"#191513"};
      if(job.status==="paused")   return {label:"Reanudar",  fn:()=>resumeJ(job.id),       bg:C.orange,  color:"#191513"};
      if(job.status==="done")     return {label:"Enviar",    fn:()=>toShipJ(job.id),       bg:"#FFF0DE", color:"#191513"};
      if(job.status==="shipping") return {label:"Entregado", fn:()=>shippedJ(job.id,job),  bg:"#FFF7F3", color:"#191513"};
      return null;
    };


    return (
      <div className="view-pad" style={{ maxWidth:isDesktop?1500:isTablet?900:"100%", margin:"0 auto" }}>

        {/* ── 1. ETAPAS: en qué parte del proceso está cada trabajo ── */}
        <div role="tablist" aria-label="Etapa" style={{ display:"flex", gap:4, background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:4, marginBottom:12, overflowX:"auto" }}>
          {ETAPAS.map(e=>{ const on = etapaActiva===e.key; return (
            <button key={e.key} role="tab" aria-selected={on} onClick={()=>{ setFStatus(e.key); setSortMode(false); }} style={{ flex:"1 0 auto", display:"flex", alignItems:"center", justifyContent:"center", gap:6, minHeight:44, padding:isMobile?"0 10px":"0 12px", borderRadius:C.rMd, border:"none", cursor:"pointer", whiteSpace:"nowrap", fontSize:isMobile?13:14, fontWeight:on?900:700, background:on?C.orange:"transparent", color:on?"#191513":C.t2 }}>
              {e.label}{e.count>0 && <span style={{ fontSize:12, fontWeight:900, minWidth:22, padding:"1px 6px", borderRadius:C.rPill, background:on?"rgba(25,21,19,.18)":C.bg4, color:on?"#191513":C.t2 }}>{e.count}</span>}
            </button>); })}
        </div>

        {/* ── 2. ALERTAS: solo si hay algo urgente ── */}
        {(atrasadosQ.length>0||hoyQ.length>0||fStatus==="atrasados"||fStatus==="hoy") && (
          <div style={{ display:"flex", gap:8, marginBottom:12, flexWrap:"wrap" }}>
            {[["atrasados",AlertTriangle,"atrasado",atrasadosQ.length,"#E53212",C.redBg,"#5C1F14"],["hoy",CalendarClock,"para entregar hoy",hoyQ.length,C.yellow,C.yellowBg,"#4A3F36"]].filter(([k,,,n])=>n>0||fStatus===k).map(([k,Ic,txt,n,col,bg,bd])=>{ const on=fStatus===k; return (
              <button key={k} onClick={()=>{ setFStatus(on?"all":k); setQueueSort(on?"priority":"delivery"); setSortMode(false); }} aria-pressed={on} style={{ display:"flex", alignItems:"center", gap:8, minHeight:40, padding:"0 14px", borderRadius:C.rPill, cursor:"pointer", fontSize:13, fontWeight:800, background:on?col:bg, color:on?"#191513":col, border:`1px solid ${on?col:bd}` }}>
                <Ic size={16} aria-hidden="true" />{n} {txt}{n!==1&&k==="atrasados"?"s":""}{on && <X size={15} aria-label="Quitar filtro" />}
              </button>); })}
          </div>
        )}

        {/* ── 3. BUSCAR + VISTA + FILTROS ── */}
        <div style={{ display:"flex", gap:8, marginBottom:10, flexWrap:isMobile?"wrap":"nowrap" }}>
          <div style={{ flex:"1 1 220px", position:"relative" }}>
            <Search size={17} color={C.t3} aria-hidden="true" style={{ position:"absolute", left:13, top:"50%", transform:"translateY(-50%)" }} />
            <input aria-label="Buscar en la cola" style={{ ...inputSt, paddingLeft:40, background:C.bg3, borderColor:queueSearch?C.orange:C.bg5, fontSize:14 }} placeholder="Buscar producto o cliente" value={queueSearch} onChange={e=>setQueueSearch(e.target.value)} />
            {queueSearch && <button onClick={()=>setQueueSearch("")} aria-label="Borrar búsqueda" style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.t3, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}><X size={17} aria-hidden="true" /></button>}
          </div>
          <div role="radiogroup" aria-label="Cómo ver" style={{ display:"flex", background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, padding:3, gap:2, flex:isMobile?"1 1 auto":"0 0 auto" }}>
            {[["detail","Tarjetas"],["summary","Lista"],["calendar","Semana"]].map(([k,l])=>(
              <button key={k} role="radio" aria-checked={queueViewMode===k} onClick={()=>{ setQueueViewMode(k); setSortMode(false); }} style={{ flex:1, minHeight:38, padding:"0 12px", borderRadius:C.rXs, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, whiteSpace:"nowrap", background:queueViewMode===k?C.bg5:"transparent", color:queueViewMode===k?C.t1:C.t3 }}>{l}</button>
            ))}
          </div>
          <button onClick={()=>setVerFiltros(v=>!v)} aria-expanded={verFiltros} style={{ display:"flex", alignItems:"center", gap:6, minHeight:44, padding:"0 14px", borderRadius:C.rSm, cursor:"pointer", fontSize:13, fontWeight:800, whiteSpace:"nowrap", background:verFiltros||queueSort!=="priority"?C.orangeBg:C.bg3, color:verFiltros||queueSort!=="priority"?C.orange:C.t2, border:`1px solid ${verFiltros||queueSort!=="priority"?C.orange+"66":C.bg5}` }}>
            Ordenar{queueSort!=="priority" && <span style={{ fontSize:12, fontWeight:900, background:C.orange, color:"#191513", borderRadius:C.rPill, padding:"0 6px" }}>1</span>}
            <ChevronDown size={16} aria-hidden="true" style={{ transform:verFiltros?"rotate(180deg)":"none", transition:"transform .2s" }} />
          </button>
        </div>
        {verFiltros && (
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr auto", gap:10, alignItems:"end", background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"12px 14px", marginBottom:10 }}>
            <label style={{ fontSize:12, fontWeight:800, color:C.t3, textTransform:"uppercase", letterSpacing:.6 }}>Ordenar por
              <select value={queueSort} onChange={e=>setQueueSort(e.target.value)} style={{ ...inputSt, marginTop:6, fontSize:14, textTransform:"none", letterSpacing:0 }}>
                <option value="priority">Orden de impresión</option>
                <option value="delivery">Fecha de entrega (la más próxima primero)</option>
                <option value="waiting">Los que más esperan</option>
                <option value="created">Los más nuevos</option>
              </select>
            </label>
            {queueSort!=="priority" && <button onClick={()=>setQueueSort("priority")} style={{ minHeight:46, padding:"0 14px", background:"transparent", color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:13, fontWeight:800, cursor:"pointer" }}>Volver al orden de impresión</button>}
          </div>
        )}
        {!verFiltros && queueSort!=="priority" && (
          <div style={{ fontSize:13, color:C.t3, marginBottom:10 }}>
            {queueSort!=="priority" && <>Ordenado por <b style={{ color:C.t1 }}>{({delivery:"fecha de entrega",waiting:"espera",created:"más nuevos"})[queueSort]}</b></>}
          </div>
        )}
        <div style={{ height:6 }} />

        {/* ── CALENDAR VIEW ── */}
        {queueViewMode==="calendar" && (()=>{
          const DAYS_ES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
          const MONTHS_ES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];

          // Build week starting on Monday
          const now = new Date();
          const dayOfWeek = now.getDay(); // 0=Sun
          const monday = new Date(now);
          monday.setDate(now.getDate() - (dayOfWeek===0?6:dayOfWeek-1) + queueWeekOffset*7);
          monday.setHours(0,0,0,0);

          const weekDays = Array.from({length:7},(_,i)=>{
            const d = new Date(monday);
            d.setDate(monday.getDate()+i);
            return d;
          });

          const weekStart = weekDays[0].getTime();
          const weekEnd   = weekDays[6].getTime()+86399999;

          const isToday = (d) => {
            const t=new Date();
            return d.getDate()===t.getDate()&&d.getMonth()===t.getMonth()&&d.getFullYear()===t.getFullYear();
          };

          // Month range label for header
          const m0 = weekDays[0], m6 = weekDays[6];
          const weekLabel = m0.getMonth()===m6.getMonth()
            ? `${m0.getDate()}–${m6.getDate()} ${MONTHS_ES[m0.getMonth()]} ${m0.getFullYear()}`
            : `${m0.getDate()} ${MONTHS_ES[m0.getMonth()]} – ${m6.getDate()} ${MONTHS_ES[m6.getMonth()]} ${m6.getFullYear()}`;

          // Jobs per day: deliveryAt falls in that day
          const jobsForDay = (d) => {
            const ds = d.getTime(), de = ds+86399999;
            return jobs.filter(j=>j.deliveryAt&&j.deliveryAt>=ds&&j.deliveryAt<=de&&j.status!=="shipped");
          };

          // Jobs with no deliveryAt but created this week
          const unscheduled = jobs.filter(j=>!j.deliveryAt&&j.createdAt>=weekStart&&j.createdAt<=weekEnd&&j.status!=="shipped");

          // Summary counts for the week
          const weekJobs = jobs.filter(j=>j.deliveryAt&&j.deliveryAt>=weekStart&&j.deliveryAt<=weekEnd);
          const weekRevenue = weekJobs.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0);
          const overdueCount = jobs.filter(esAtrasado).length;

          return (
            <div>
              {/* Week navigation header */}
              <div style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, padding:"12px 16px", marginBottom:12 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                  <button onClick={()=>setQueueWeekOffset(v=>v-1)} style={{ width:36, height:36, borderRadius:10, background:C.bg3, border:`1px solid ${C.bg5}`, color:C.t1, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>‹</button>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:14, fontWeight:900, color:C.t1 }}>{weekLabel}</div>
                    {queueWeekOffset===0 && <div style={{ fontSize:12, color:C.orange, fontWeight:800, marginTop:2 }}>SEMANA ACTUAL</div>}
                    {queueWeekOffset!==0 && <button onClick={()=>setQueueWeekOffset(0)} style={{ fontSize:12, color:C.blue, background:"none", border:"none", cursor:"pointer", fontWeight:700, marginTop:2 }}>Volver a hoy</button>}
                  </div>
                  <button onClick={()=>setQueueWeekOffset(v=>v+1)} style={{ width:36, height:36, borderRadius:10, background:C.bg3, border:`1px solid ${C.bg5}`, color:C.t1, fontSize:18, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:900 }}>›</button>
                </div>
                {/* Week stats */}
                <div style={{ display:"flex", gap:12, justifyContent:"center" }}>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:900, color:C.t1 }}>{weekJobs.length}</div>
                    <div style={{ fontSize:12, color:C.t3, fontWeight:700 }}>entregas</div>
                  </div>
                  <div style={{ width:1, background:C.bg5 }} />
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:16, fontWeight:900, color:C.green }}>{weekRevenue>0?`Bs.${weekRevenue.toFixed(0)}`:"-"}</div>
                    <div style={{ fontSize:12, color:C.t3, fontWeight:700 }}>esperado</div>
                  </div>
                  {overdueCount>0 && <>
                    <div style={{ width:1, background:C.bg5 }} />
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:16, fontWeight:900, color:C.red }}>{overdueCount}</div>
                      <div style={{ fontSize:12, color:C.red, fontWeight:700 }}>vencidos</div>
                    </div>
                  </>}
                </div>
              </div>

              {/* Day columns grid */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:4, marginBottom:12 }}>
                {weekDays.map((d,di)=>{
                  const dayJobs = jobsForDay(d);
                  const today = isToday(d);
                  const isPast = d.getTime()<startOfDay()&&!today;
                  return (
                    <div key={di} style={{ background:today?`${C.orange}11`:C.bg2, borderRadius:C.rSm, border:`1.5px solid ${today?C.orange:C.bg4}`, overflow:"hidden", minHeight:80 }}>
                      {/* Day header */}
                      <div style={{ padding:"6px 4px", textAlign:"center", borderBottom:`1px solid ${today?C.orange+"33":C.bg4}`, background:today?`${C.orange}22`:C.bg3 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:today?C.orange:isPast?C.t4:C.t3, textTransform:"uppercase", letterSpacing:.5 }}>{DAYS_ES[d.getDay()]}</div>
                        <div style={{ fontSize:15, fontWeight:900, color:today?C.orange:isPast?C.t4:C.t1, marginTop:1 }}>{d.getDate()}</div>
                        {dayJobs.length>0 && <div style={{ fontSize:12, color:today?C.orange:C.t4, fontWeight:700, marginTop:1 }}>{dayJobs.length} pedido{dayJobs.length!==1?"s":""}</div>}
                      </div>
                      {/* Jobs in day */}
                      <div style={{ padding:"4px 3px", display:"flex", flexDirection:"column", gap:3 }}>
                        {dayJobs.length===0 && <div style={{ height:20 }} />}
                        {dayJobs.slice(0,4).map(job=>{
                          const st=STATUS[job.status]||STATUS.pending;
                          const action=quickAction(job);
                          return (
                            <div key={job.id} onClick={()=>{ setQueueViewMode("detail"); goToJob(job.id); }} style={{ background:st.bg, border:`1px solid ${st.border}`, borderRadius:5, padding:"4px 5px", cursor:"pointer" }}>
                              <div style={{ fontSize:12, fontWeight:800, color:st.color, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.fileName}</div>
                              {job.clientName && <div style={{ fontSize:8, color:C.t4, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.clientName}</div>}
                              {job.price && <div style={{ fontSize:8, color:C.green, fontWeight:800 }}>Bs.{Number(job.price).toFixed(0)}</div>}
                              <div style={{ display:"flex", alignItems:"center", gap:3, marginTop:2 }}>
                                <div style={{ width:5, height:5, borderRadius:"50%", background:st.dot, flexShrink:0 }} />
                                <span style={{ fontSize:7, color:st.color, fontWeight:700 }}>{st.label}</span>
                              </div>
                            </div>
                          );
                        })}
                        {dayJobs.length>4 && <div style={{ fontSize:8, color:C.t4, textAlign:"center", fontWeight:700 }}>+{dayJobs.length-4} más</div>}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Unscheduled this week */}
              {unscheduled.length>0 && (
                <div style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, overflow:"hidden", marginBottom:12 }}>
                  <div style={{ padding:"10px 14px", background:C.bg3, borderBottom:`1px solid ${C.bg4}`, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:C.t3, textTransform:"uppercase", letterSpacing:.7 }}>Sin fecha de entrega esta semana</span>
                    <span style={{ fontSize:12, color:C.t4, fontWeight:700 }}>{unscheduled.length}</span>
                  </div>
                  {unscheduled.slice(0,5).map((job,i)=>{
                    const st=STATUS[job.status]||STATUS.pending;
                    const action=quickAction(job);
                    return (
                      <div key={job.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:i<Math.min(unscheduled.length,5)-1?`1px solid ${C.bg4}`:"none" }}>
                        <div style={{ width:7, height:7, borderRadius:"50%", background:st.dot, flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.fileName}</div>
                          <div style={{ fontSize:12, color:C.t3 }}>{job.clientName||"Sin cliente"} · {st.label}</div>
                        </div>
                        {action && <button onClick={action.fn} style={{ padding:"7px 12px", background:action.bg, color:action.color, border:"none", borderRadius:C.rSm, fontSize:12, fontWeight:900, cursor:"pointer", flexShrink:0 }}>{action.label}</button>}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Overdue */}
              {overdueCount>0 && (
                <div style={{ background:C.redBg, borderRadius:C.r, border:"1px solid #4A1A10", overflow:"hidden", marginBottom:12 }}>
                  <div style={{ padding:"10px 14px", borderBottom:"1px solid #4A1A10", display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:C.red, textTransform:"uppercase", letterSpacing:.7 }}>Entregas vencidas</span>
                    <span style={{ fontSize:12, color:C.red, fontWeight:700 }}>{overdueCount}</span>
                  </div>
                  {jobs.filter(esAtrasado).map((job,i,arr)=>{
                    const diff=Date.now()-job.deliveryAt;
                    const days=Math.floor(diff/86400000);
                    const hours=Math.floor(diff/3600000);
                    const action=quickAction(job);
                    return (
                      <div key={job.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderBottom:i<arr.length-1?"1px solid #4A1A10":"none" }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.fileName}</div>
                          <div style={{ fontSize:12, color:"#E53212" }}>{job.clientName||"Sin cliente"} · hace {days>0?`${days}d`:`${hours}h`}</div>
                        </div>
                        {action && <button onClick={action.fn} style={{ padding:"7px 12px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:12, fontWeight:900, cursor:"pointer", flexShrink:0 }}>{action.label}</button>}
                      </div>
                    );
                  })}
                </div>
              )}

              {weekJobs.length===0&&unscheduled.length===0&&overdueCount===0 && <Empty icon="📅" title="Semana libre" sub="No hay entregas programadas para esta semana" />}
            </div>
          );
        })()}

        {/* ── SUMMARY VIEW (Kanban) ── */}
        {queueViewMode==="summary" && (
          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {KANBAN_GROUPS.filter(g=>fStatus==="design"||fStatus==="all"||g.key===fStatus||(fStatus==="listos"&&(g.key==="done"||g.key==="shipping"))||((g.key==="printing"||g.key==="paused")&&(fStatus==="printing"||fStatus==="paused"))).map(group=>(
              group.jobs.length===0 ? null :
              <div key={group.key} style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, overflow:"hidden" }}>
                {/* Group header */}
                <div style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 16px", borderBottom:`1px solid ${C.bg4}`, background:C.bg3 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:group.dot, flexShrink:0 }} />
                  <span style={{ fontSize:12, fontWeight:900, color:group.color, textTransform:"uppercase", letterSpacing:.7 }}>{group.label}</span>
                  <span style={{ fontSize:12, color:C.t4, fontWeight:700, marginLeft:"auto" }}>{group.jobs.length} trabajo{group.jobs.length!==1?"s":""}</span>
                </div>
                {/* Compact job rows */}
                {group.jobs.slice(0, lim(`grupo:${group.key}:${fStatus}:${fPrinter}:${queueSearch}`)).map((job,i)=>{
                  const printer = printers.find(x=>x.id===job.printer);
                  const qty = Number(job.quantity)||1;
                  const action = quickAction(job);
                  const waitingStr = group.key==="pending" ? fmtWaiting(job.createdAt) : null;
                  const isLateDelivery = esAtrasado(job);
                  return (
                    <div key={job.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 16px", borderBottom:i<group.jobs.length-1?`1px solid ${C.bg4}`:"none" }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:2 }}>
                          {isLateDelivery && <span style={{ fontSize:12, color:C.red }}><Icono e="⚠️" size={14} /></span>}
                          <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.fileName}</div>
                          {qty>1 && <span style={{ fontSize:12, color:C.purple, fontWeight:800, flexShrink:0 }}>×{qty}</span>}
                        </div>
                        <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                          {job.clientName && <span style={{ fontSize:12, color:C.t3 }}>{job.clientName}</span>}
                          {printer && <span style={{ fontSize:12, color:C.t4 }}>· {printer.name.replace("Creality ","")}</span>}
                          {waitingStr && <span style={{ fontSize:12, color:C.yellow, fontWeight:700 }}>· {waitingStr}</span>}
                          {job.price && <span style={{ fontSize:12, color:C.green, fontWeight:800, marginLeft:"auto" }}>Bs.{Number(job.price).toFixed(0)}</span>}
                        </div>
                      </div>
                      {action && (
                        <button onClick={action.fn} style={{ padding:"8px 14px", background:action.bg, color:action.color, border:"none", borderRadius:C.rSm, fontSize:12, fontWeight:900, cursor:"pointer", flexShrink:0, whiteSpace:"nowrap" }}>
                          {action.label}
                        </button>
                      )}
                    </div>
                  );
                })}
                {VerMas(`grupo:${group.key}:${fStatus}:${fPrinter}:${queueSearch}`, group.jobs.length)}
              </div>
            ))}
            {KANBAN_GROUPS.every(g=>g.jobs.length===0) && <Empty icon="🔍" title="Nada aquí" sub="Cambia los filtros o agrega un trabajo nuevo" />}
          </div>
        )}

        {/* ── DETAIL VIEW: separado por secciones ── */}
        {queueViewMode==="detail" && (()=>{
          const pintar = (lista, clave) => { const rendered = new Set(); return (<>
            <div className="cards-grid">{lista.slice(0, lim(clave)).map(j=>{
              if(j.orderId) {
                if(rendered.has(j.orderId)) return null;
                rendered.add(j.orderId);
                return <Fragment key={j.orderId}>{OrderGroup({ orderId:j.orderId, jobs:lista.filter(x=>x.orderId===j.orderId) })}</Fragment>;
              }
              return (
                <div key={j.id}>
                  {j.status==="pending"&&queueSort==="waiting"&&j.createdAt&&<div style={{ fontSize:12, color:C.yellow, fontWeight:700, marginBottom:4, paddingLeft:4 }}>{fmtWaiting(j.createdAt)}</div>}
                  {JobCard({job:j})}
                </div>
              );
            })}</div>{VerMas(clave, lista.length)}</>); };
          const Cabecera = ({ titulo, sub, color, n, extra }) => (
            <div style={{ display:"flex", alignItems:"center", gap:10, margin:"6px 0 12px", flexWrap:"wrap" }}>
              <span style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />
              <h2 style={{ margin:0, fontSize:17, fontWeight:900, color:C.t1 }}>{titulo} <span style={{ color:C.t3, fontWeight:800 }}>· {n}</span></h2>
              {sub && <span style={{ fontSize:13, color:C.t3 }}>{sub}</span>}
              <div style={{ flex:1, height:1, background:C.bg4, minWidth:20 }} />
              {extra}
            </div>
          );
          const pendientesVis = pending.filter(j=>j.jobType!=="design"&&(fPrinter==="all"||j.printer===fPrinter));
          const botonOrden = pendientesVis.length>1 && queueSort==="priority" && !queueSearch && (
            <button onClick={()=>setSortMode(v=>!v)} style={{ minHeight:38, padding:"0 14px", borderRadius:C.rPill, border:`1px solid ${sortMode?C.orange:C.bg5}`, fontSize:13, fontWeight:800, cursor:"pointer", background:sortMode?C.orange:C.bg3, color:sortMode?"#191513":C.t2 }}>{sortMode?"Listo":"Cambiar orden"}</button>
          );
          if (sortMode) return (<>
            <Cabecera titulo="En cola" sub="El #1 es el próximo en imprimirse. Usá ▲▼." color={C.yellow} n={pendientesVis.length} extra={botonOrden} />
            <div className="cards-grid">{pendientesVis.map((j,i)=><div key={j.id}>{JobCard({job:j, showPriority:true, idx:i, total:pendientesVis.length})}</div>)}</div>
          </>);
          if (sortedFiltered.length===0) return <Empty icon="🔍" title={queueSearch?"Sin resultados":"Nada en esta etapa"} sub={queueSearch?`Nada coincide con "${queueSearch}"`:"Elegí otra etapa arriba o agregá un trabajo con +"} />;
          // "Todo" e "Imprimiendo/Diseño": se muestran por secciones. Lo demás, lista simple.
          if (["all","design"].includes(fStatus)) {
            const des = fStatus==="design";
            const secciones = [
              { k:"act", titulo:des?"En diseño":"Imprimiendo ahora", color:C.green, lista:sortedFiltered.filter(j=>["printing","paused"].includes(j.status)) },
              { k:"pen", titulo:des?"Por empezar":"En cola", sub:queueSort==="priority"?"en orden de impresión":null, color:C.yellow, lista:sortedFiltered.filter(j=>j.status==="pending"), extra:des?null:botonOrden },
              { k:"lis", titulo:des?"Diseño listo":"Listos", sub:des?null:"terminados, falta prepararlos para entregar", color:STATUS.done.dot, lista:sortedFiltered.filter(j=>j.status==="done") },
              { k:"env", titulo:"Para entregar", sub:"preparados, esperando que los recojan o se envíen", color:C.purple, lista:sortedFiltered.filter(j=>j.status==="shipping") },
            ].filter(x=>x.lista.length);
            return secciones.map(x=>(
              <section key={x.k} style={{ marginBottom:22 }}>
                <Cabecera titulo={x.titulo} sub={x.sub} color={x.color} n={x.lista.length} extra={x.extra} />
                {pintar(x.lista, `${claveCola}:${x.k}`)}
              </section>
            ));
          }
          return (<>
            {fStatus==="pending" && <Cabecera titulo="En cola" sub={queueSort==="priority"?"en orden de impresión":null} color={C.yellow} n={sortedFiltered.length} extra={botonOrden} />}
            {pintar(sortedFiltered, claveCola)}
          </>);
        })()}
      </div>
    );
  };

  // ─── SHIPPING VIEW ────────────────────────────────────────────────────────
  const ShippingView = () => {
    const [shipFilter, setShipFilter] = useState("pending");
    const [shipSearch, setShipSearch] = useState("");

    const applySearch = (list) => {
      if(!shipSearch.trim()) return list;
      const q = shipSearch.toLowerCase();
      return list.filter(j =>
        j.fileName?.toLowerCase().includes(q) ||
        j.clientName?.toLowerCase().includes(q)
      );
    };

    // Sort both lists by date desc
    // Por entregar = listos en el taller + marcados para envío (lo mismo que cuenta la tarjeta de Inicio)
    const pendingSorted = applySearch([...shipping, ...done].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));
    const deliveredSorted = applySearch([...shipped].sort((a,b)=>(b.shippedAt||b.createdAt||0)-(a.shippedAt||a.createdAt||0)));

    // Group delivered by date
    const groupByDate = (list) => {
      const groups = {};
      list.forEach(j => {
        const d = new Date(j.shippedAt||j.createdAt||0);
        const key = d.toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long",year:"numeric"});
        if(!groups[key]) groups[key] = [];
        groups[key].push(j);
      });
      return Object.entries(groups);
    };

    return (
      <div className="view-pad" style={{ maxWidth:isDesktop?1500:isTablet?900:"100%", margin:"0 auto" }}>

        {/* Stats cards */}
        <div style={{ display:"grid", gridTemplateColumns: isDesktop?"1fr 1fr 1fr":"1fr 1fr", gap:10, marginBottom:14 }}>
          <div onClick={()=>setShipFilter("pending")} style={{ background:STATUS.shipping.bg, border:`2px solid ${shipFilter==="pending"?C.purple:STATUS.shipping.border}`, borderRadius:C.r, padding:"18px", cursor:"pointer", transition:"border-color .15s" }}>
            <div style={{ fontSize:32, fontWeight:900, color:C.t1 }}>{shipping.length+done.length}</div>
            <div style={{ fontSize:12, color:C.purple, fontWeight:800, marginTop:5 }}>Por entregar</div>
            {shipFilter==="pending" && <div style={{ width:28, height:3, background:C.purple, borderRadius:3, marginTop:8 }} />}
          </div>
          <div onClick={()=>setShipFilter("shipped")} style={{ background:STATUS.shipped.bg, border:`2px solid ${shipFilter==="shipped"?C.teal:STATUS.shipped.border}`, borderRadius:C.r, padding:"18px", cursor:"pointer", transition:"border-color .15s" }}>
            <div style={{ fontSize:32, fontWeight:900, color:C.t1 }}>{shipped.length}</div>
            <div style={{ fontSize:12, color:C.teal, fontWeight:800, marginTop:5 }}>Ya entregados</div>
            {shipFilter==="shipped" && <div style={{ width:28, height:3, background:C.teal, borderRadius:3, marginTop:8 }} />}
          </div>
          {deudores.length>0 && (
          <div onClick={()=>setShipFilter("deben")} style={{ background:C.yellowBg, border:`2px solid ${shipFilter==="deben"?C.yellow:"#4A3F36"}`, borderRadius:C.r, padding:"18px", cursor:"pointer", transition:"border-color .15s" }}>
            <div style={{ fontSize:32, fontWeight:900, color:C.t1 }}>{fmtMoney(deudores.reduce((t,j)=>t+saldoDe(j),0))}</div>
            <div style={{ fontSize:12, color:C.yellow, fontWeight:800, marginTop:5 }}>Te deben · {deudores.length} entrega{deudores.length!==1?"s":""}</div>
            {shipFilter==="deben" && <div style={{ width:28, height:3, background:C.yellow, borderRadius:3, marginTop:8 }} />}
          </div>
          )}
        </div>

        {/* Search bar */}
        <div style={{ position:"relative", marginBottom:14 }}>
          <div style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}><Icono e="🔍" size={17} /></div>
          <input
            style={{ width:"100%", background:C.bg2, border:`1.5px solid ${shipSearch?C.orange:C.bg4}`, borderRadius:C.r, padding:"12px 14px 12px 42px", fontSize:14, color:C.t1, outline:"none", boxSizing:"border-box", transition:"border-color .15s" }}
            placeholder="Buscar por producto o cliente..."
            value={shipSearch}
            onChange={e=>setShipSearch(e.target.value)}
          />
          {shipSearch && (
            <button onClick={()=>setShipSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.t3, fontSize:18, cursor:"pointer" }}>✕</button>
          )}
        </div>

        {/* Results count when searching */}
        {shipSearch.trim() && (
          <div style={{ fontSize:12, color:C.t3, marginBottom:10, fontWeight:700 }}>
            {(shipFilter==="pending"?pendingSorted:shipFilter==="deben"?applySearch(deudores):deliveredSorted).length} resultado{(shipFilter==="pending"?pendingSorted:shipFilter==="deben"?applySearch(deudores):deliveredSorted).length!==1?"s":""} para "{shipSearch}"
          </div>
        )}

        {shipFilter==="deben" && (
          applySearch(deudores).length===0
            ? <Empty icon="💰" title="Nadie te debe" sub="Cuando entregues algo sin cobrar el saldo, aparece aquí" />
            : <div className="cards-grid">{applySearch(deudores).map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>
        )}
        {/* Pending list */}
        {shipFilter==="pending" && (
          pendingSorted.length===0
            ? <Empty icon="📦" title={shipSearch?"Sin resultados":"No hay envíos pendientes"} sub={shipSearch?`Ningún pedido coincide con "${shipSearch}"`:"Cuando un trabajo esté listo para enviar, aparecerá aquí"} />
            : <div className="cards-grid">{pendingSorted.map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>
        )}

        {/* Delivered list — grouped by date */}
        {shipFilter==="shipped" && (
          deliveredSorted.length===0
            ? <Empty icon="🚚" title={shipSearch?"Sin resultados":"Sin entregas aún"} sub={shipSearch?`Ningún pedido coincide con "${shipSearch}"`:"Los trabajos marcados como entregados aparecerán aquí"} />
            : shipSearch.trim()
              ? <><div className="cards-grid">{deliveredSorted.slice(0, lim("envios:"+shipSearch)).map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>{VerMas("envios:"+shipSearch, deliveredSorted.length)}</>
              : <>{groupByDate(deliveredSorted.slice(0, lim("envios"))).map(([dateLabel, dayJobs])=>(
                  <div key={dateLabel} style={{ marginBottom:20 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:C.teal, textTransform:"capitalize" }}>{dateLabel}</div>
                      <div style={{ flex:1, height:1, background:C.bg4 }} />
                      <div style={{ fontSize:12, color:C.t4, fontWeight:700 }}>
                        {dayJobs.length} entrega{dayJobs.length!==1?"s":""} · Bs. {dayJobs.reduce((s,j)=>s+Number(j.price||0),0).toFixed(0)}
                      </div>
                    </div>
                    <div className="cards-grid">{dayJobs.map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>
                  </div>
                ))}{VerMas("envios", deliveredSorted.length)}</>
        )}
      </div>
    );
  };

  // ─── CLIENTS VIEW ─────────────────────────────────────────────────────────
  const ClientsView = () => {
    const [clientSearch, setClientSearch] = useState("");
    if (selectedClient) {
      const c = clients.find(x=>x.key===selectedClient);
      if (!c) return null;
      const wa = c.phone ? `https://wa.me/${c.phone.replace(/\D/g,"")}` : null;
      const totalPending = c.jobs.reduce((s,j)=>s+porCobrarDe(j),0);
      const desde = Math.min(...c.jobs.map(j=>j.createdAt||Date.now()));
      const conteo = {}; c.jobs.forEach(j=>{ const n=(j.fileName||"").replace(/\s*\(copia\)$/,"").trim(); if(n) conteo[n]=(conteo[n]||0)+(Number(j.quantity)||1); });
      const favoritos = Object.entries(conteo).sort((a,b)=>b[1]-a[1]).slice(0,3);
      const debeC = c.jobs.filter(j=>j.status==="shipped"&&j.debe&&saldoDe(j)>0);
      const sinRecogerC = c.jobs.filter(sinRecoger);
      const nuevoPedido = () => abrirNuevoTrabajo({ clientName:c.name, clientPhone:c.phone||"" });
      return (
        <div className="view-pad" style={{ maxWidth:isDesktop?1000:isTablet?700:"100%", margin:"0 auto" }}>
          <button onClick={()=>setSelectedClient(null)} style={{ background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, padding:"9px 16px", fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:16 }}>← Volver</button>
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"20px", marginBottom:14, border:`1px solid ${C.bg4}` }}>
            <div style={{ display:"flex", alignItems:"center", gap:14, marginBottom:18 }}>
              <div style={{ width:54, height:54, borderRadius:"50%", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, fontWeight:900, color:"#191513", flexShrink:0 }}>{initials(c.name)}</div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:19, fontWeight:900, color:C.t1 }}>{c.name}</div>
                {c.phone && <div style={{ fontSize:13, color:C.t3, marginTop:2 }}>{c.phone}</div>}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:8, marginBottom:14 }}>
              {[["Pedidos",c.totalJobs],["Gastó en total",fmtMoney(c.totalRevenue)],["Por cobrar",totalPending>0?fmtMoney(totalPending):"Nada",totalPending>0],["Cliente desde",new Date(desde).toLocaleDateString("es-ES",{month:"short",year:"numeric"})]].map(([l,v,alerta])=>(
                <div key={l} style={{ background:alerta?C.yellowBg:C.bg3, borderRadius:C.rSm, padding:"13px 8px", textAlign:"center" }}>
                  <div style={{ fontSize:18, fontWeight:900, color:alerta?C.yellow:C.t1 }}>{v}</div>
                  <div style={{ fontSize:12, color:C.t3, marginTop:3, fontWeight:700 }}>{l}</div>
                </div>
              ))}
            </div>
            {favoritos.length>0 && <div style={{ fontSize:13, color:C.t2, marginBottom:14 }}><b style={{ color:C.t3 }}>Lo que más pide:</b> {favoritos.map(([n,k])=>`${n} ×${k}`).join(" · ")}</div>}
            <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
              <button onClick={nuevoPedido} style={{ flex:1, minWidth:150, display:"flex", alignItems:"center", justifyContent:"center", gap:8, minHeight:46, background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:14, fontWeight:900, cursor:"pointer" }}><Plus size={18} aria-hidden="true" />Nuevo pedido</button>
              {wa && <button onClick={()=>window.open(wa,"_blank","noopener,noreferrer")} style={{ flex:1, minWidth:150, display:"flex", alignItems:"center", justifyContent:"center", gap:8, minHeight:46, background:C.waBg, color:C.wa, border:`1px solid #6B3A12`, borderRadius:C.rSm, fontSize:14, fontWeight:800, cursor:"pointer" }}><MessageCircle size={18} aria-hidden="true" />WhatsApp</button>}
            </div>
          </div>
          {debeC.map(j=>(
            <div key={j.id} style={{ display:"flex", alignItems:"center", gap:10, background:C.yellowBg, border:"1px solid #4A3F36", borderRadius:C.rSm, padding:"10px 10px 10px 14px", marginBottom:8 }}>
              <div style={{ flex:1, minWidth:0, fontSize:13, color:C.t1 }}><b>Debe {fmtMoney(saldoDe(j))}</b> · {j.fileName} <span style={{ color:C.t3 }}>(entregado {haceDias(j.shippedAt)})</span></div>
              <button onClick={()=>cobrarDeuda(j)} style={{ display:"flex", alignItems:"center", gap:6, background:C.orange, color:"#191513", border:"none", borderRadius:C.rSm, padding:"0 12px", minHeight:40, fontSize:13, fontWeight:900, cursor:"pointer", flexShrink:0 }}><Banknote size={16} aria-hidden="true" />Cobrar</button>
            </div>
          ))}
          {sinRecogerC.map(j=>(
            <div key={j.id} style={{ display:"flex", alignItems:"center", gap:10, background:C.yellowBg, border:"1px solid #4A3F36", borderRadius:C.rSm, padding:"10px 10px 10px 14px", marginBottom:8 }}>
              <div style={{ flex:1, minWidth:0, fontSize:13, color:C.t1 }}><b>Sin recoger</b> · {j.fileName} <span style={{ color:C.t3 }}>(listo {haceDias(j.endedAt)})</span></div>
              {j.clientPhone && <button onClick={()=>recordarRecojo(j)} style={{ display:"flex", alignItems:"center", gap:6, background:C.waBg, color:C.wa, border:"1px solid #6B3A12", borderRadius:C.rSm, padding:"0 12px", minHeight:40, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}><MessageCircle size={16} aria-hidden="true" />Recordar</button>}
            </div>
          ))}
          {c.active>0 && <div style={{ background:STATUS.pending.bg, border:`1px solid ${STATUS.pending.border}`, borderRadius:C.rSm, padding:"10px 14px", marginBottom:12, fontSize:12, color:C.yellow, fontWeight:700 }}>{c.active} pedido{c.active>1?"s":""} en proceso</div>}
          {SectionLabel({color:C.t3, children:<>Historial de pedidos</>})}
          {[...c.jobs].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).slice(0, lim("cliente:"+c.key)).map(j=><Fragment key={j.id}>{JobCard({job:j, compact:true})}</Fragment>)}
          {VerMas("cliente:"+c.key, c.jobs.length)}
        </div>
      );
    }
    return (
      <div className="view-pad" style={{ maxWidth:isDesktop?1500:isTablet?900:"100%", margin:"0 auto" }}>
        <div style={{ display:"grid", gridTemplateColumns: isDesktop?"1fr 1fr 1fr":"1fr 1fr", gap:10, marginBottom:16 }}>
          <div style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"18px" }}>
            <div style={{ fontSize:30, fontWeight:900, color:C.t1 }}>{clients.length}</div>
            <div style={{ fontSize:12, color:C.t3, marginTop:5, fontWeight:700, textTransform:"uppercase", letterSpacing:.7 }}>Clientes</div>
          </div>
          <div style={{ background:"linear-gradient(135deg,#221D1B,#221D1B)", border:"1px solid #372F2C", borderRadius:C.r, padding:"18px" }}>
            <div style={{ fontSize:18, fontWeight:900, color:C.t1 }}>{fmtMoney(revenue)}</div>
            <div style={{ fontSize:12, color:"#F1841B", marginTop:5, fontWeight:700, textTransform:"uppercase", letterSpacing:.7 }}>Total vendido</div>
          </div>
        </div>
        {clients.length===0 ? (
          <Empty icon="👥" title="Sin clientes aún" sub="Agrega el nombre del cliente al crear un trabajo y aparecerá aquí automáticamente" />
        ) : <>
          {paraRecontactar.length>0 && (
            <div style={{ background:C.bg2, border:`1px solid ${C.orange}44`, borderRadius:C.r, padding:"14px 16px", marginBottom:14 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:14, fontWeight:900, color:C.orange, marginBottom:4 }}><MessageCircle size={18} aria-hidden="true" />Para recontactar · {paraRecontactar.length}</div>
              <div style={{ fontSize:12, color:C.t3, marginBottom:8 }}>Te compraron y no piden hace más de 2 meses. Primero los que más gastaron.</div>
              {paraRecontactar.slice(0, lim("recontactar")).map(c=>(
                <div key={c.key} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderTop:`1px solid ${C.bg4}` }}>
                  <button onClick={()=>setSelectedClient(c.key)} style={{ flex:1, minWidth:0, textAlign:"left", background:"none", border:"none", padding:0, cursor:"pointer", color:"inherit", fontFamily:"inherit" }}>
                    <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{c.name}</div>
                    <div style={{ fontSize:12, color:C.t3 }}>Último pedido {haceDias(c.lastJob)} · gastó {fmtMoney(c.totalRevenue)}</div>
                  </button>
                  <button onClick={()=>marcarRecontacto(c)} title="Ocultar por 30 días" style={{ minHeight:40, padding:"0 10px", background:"transparent", color:C.t3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:12, fontWeight:700, cursor:"pointer", flexShrink:0 }}>Ahora no</button>
                  <button onClick={()=>recontactar(c)} style={{ display:"flex", alignItems:"center", gap:6, minHeight:40, padding:"0 12px", background:C.waBg, color:C.wa, border:"1px solid #6B3A12", borderRadius:C.rSm, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}><MessageCircle size={16} aria-hidden="true" />Escribir</button>
                </div>
              ))}
              {VerMas("recontactar", paraRecontactar.length)}
            </div>
          )}
          {/* Search bar */}
          <div style={{ position:"relative", marginBottom:12 }}>
            <div style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:16, pointerEvents:"none" }}><Icono e="🔍" size={18} /></div>
            <input
              style={{ ...inputSt, paddingLeft:42, background:C.bg3, borderColor:clientSearch?C.orange:C.bg5 }}
              placeholder="Buscar cliente por nombre o teléfono..."
              value={clientSearch}
              onChange={e=>setClientSearch(e.target.value)}
            />
            {clientSearch && (
              <button onClick={()=>setClientSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.t3, fontSize:18, cursor:"pointer", lineHeight:1 }}>✕</button>
            )}
          </div>
          {(()=>{
            const q = normNombre(clientSearch), qt = clientSearch.replace(/\D/g,"");
            const filtered = clients.filter(c=>normNombre(c.name).includes(q)||(qt.length>=3&&(c.phone||"").replace(/\D/g,"").includes(qt)));
            if(filtered.length===0) return <Empty icon="🔍" title="Sin resultados" sub={`No hay clientes que coincidan con "${clientSearch}"`} />;
            return filtered.map(c => {
              const pend = c.jobs.reduce((s,j)=>s+porCobrarDe(j),0);
              return (
                <div key={c.key} onClick={()=>setSelectedClient(c.key)} style={{ background:C.bg2, borderRadius:C.r, padding:"14px 16px", marginBottom:10, border:`1px solid ${C.bg4}`, cursor:"pointer" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                    <div style={{ width:48, height:48, borderRadius:"50%", background:`linear-gradient(135deg,${C.orange}88,${C.orangeD}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, fontWeight:900, color:"#fff", flexShrink:0 }}>{initials(c.name)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{c.name}</div>
                      <div style={{ fontSize:12, color:C.t3, marginTop:2 }}>{c.phone||"Sin teléfono"} · {c.totalJobs} pedido{c.totalJobs!==1?"s":""}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:900, color:C.green }}>{c.totalRevenue>0?fmtMoney(c.totalRevenue):"—"}</div>
                      {pend>0 ? <div style={{ fontSize:12, color:C.yellow, fontWeight:800, marginTop:2 }}>{fmtMoney(pend)}</div>
                        : c.totalRevenue>0 ? <div style={{ fontSize:12, color:C.green, marginTop:2 }}>Pagado</div>
                        : null}
                      <div style={{ fontSize:12, color:C.t3, marginTop:2 }}>{fmtDateShort(c.lastJob)}</div>
                    </div>
                  </div>
                </div>
              );
            });
          })()}
        </>}
      </div>
    );
  };

  // ─── STATS VIEW ───────────────────────────────────────────────────────────
  const StatsView = () => {
    const [statsTab, setStatsTab] = useState('stats');
    const [showDetail, setShowDetail] = useState(false);
    return (
    <div className="view-pad" style={{ maxWidth:isDesktop?1100:isTablet?800:"100%", margin:"0 auto" }}>
      {/* Tab switcher */}
      <div style={{ display:"flex", gap:0, marginBottom:16, background:C.bg3, borderRadius:C.r, padding:5 }}>
        <button onClick={()=>setStatsTab('stats')} style={{ flex:1, padding:"10px 0", borderRadius:C.rMd, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, background:statsTab==='stats'?C.orange:"transparent", color:statsTab==='stats'?"#191513":C.t3, boxShadow:statsTab==='stats'?"0 3px 12px rgba(241,132,27,.35)":undefined }}>Estadísticas</button>
        <button onClick={()=>setStatsTab('utility')} style={{ flex:1, padding:"10px 0", borderRadius:C.rMd, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, background:statsTab==='utility'?C.orange:"transparent", color:statsTab==='utility'?"#191513":C.t3, boxShadow:statsTab==='utility'?"0 3px 12px rgba(241,132,27,.35)":undefined }}>Utilidad</button>
      </div>
      {statsTab==='stats' && <><div style={{ display:"flex", gap:5, marginBottom:16, background:C.bg3, borderRadius:C.r, padding:5 }}>
        {[["day","Hoy"],["week","Semana"],["month","Mes"],["year","Año"]].map(([k,l])=>(
          <button key={k} onClick={()=>setStatPeriod(k)} style={{ flex:1, padding:"10px 0", borderRadius:C.rMd, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, background:statPeriod===k?C.orange:"transparent", color:statPeriod===k?"#191513":C.t3, transition:"all .15s", boxShadow:statPeriod===k?`0 3px 12px rgba(241,132,27,.35)`:undefined }}>
            {l}
          </button>
        ))}
      </div>
      <div style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"20px", marginBottom:12 }}>
        <div style={{ fontSize:12, color:"#F1841B", fontWeight:800, textTransform:"uppercase", letterSpacing:.9, marginBottom:7 }}>Vendido — {periodLabels[statPeriod]}</div>
        <div style={{ fontSize:38, fontWeight:900, color:C.t1, letterSpacing:-1, lineHeight:1 }}>{fmtMoney(periodRev)}</div>
        <div style={{ fontSize:13, color:C.t3, marginTop:9 }}>{periodJobs.length} pedido{periodJobs.length!==1?"s":""} · <b style={{ color:C.orange }}>Cobrado {fmtMoney(cobradoEntre(periodStart))}</b></div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
        {[["Pedidos",periodJobs.length,"tomados"],["Entregas",shipped.filter(j=>(j.shippedAt||j.createdAt||0)>=periodStart).length,"entregados"]].map(([l,v,s])=>(
          <div key={l} style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"16px" }}>
            <div style={{ fontSize:12, color:C.t3, fontWeight:700, marginBottom:7 }}>{l}</div>
            <div style={{ fontSize:28, fontWeight:900, color:C.t1 }}>{v}</div>
            <div style={{ fontSize:12, color:C.t3, marginTop:4 }}>{s}</div>
          </div>
        ))}
      </div>
      {periodByPrinter.length>0 && showDetail && (
        <>
          {SectionLabel({color:C.t3, children:<>Por impresora — {periodLabels[statPeriod]}</>})}
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"4px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
            {periodByPrinter.map((p,i)=>(
              <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"13px 0", borderBottom:i<periodByPrinter.length-1?`1px solid ${C.bg4}`:"none" }}>
                <div><div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{p.name}</div><div style={{ fontSize:12, color:C.t3 }}>{p.total} trabajo{p.total!==1?"s":""}</div></div>
                <div style={{ fontSize:14, fontWeight:800, color:C.green }}>{p.rev>0?fmtMoney(p.rev):"—"}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {topMaterials.length>0 && showDetail && (
        <>
          {SectionLabel({color:C.t3, children:<>Materiales más usados</>})}
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"4px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
            {topMaterials.map(([mat,count],i)=>{
              const maxC=topMaterials[0][1];
              return (
                <div key={i} style={{ padding:"12px 0", borderBottom:i<topMaterials.length-1?`1px solid ${C.bg4}`:"none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:5 }}>
                    <span style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{mat}</span>
                    <span style={{ fontSize:13, color:C.t3 }}>{count} uso{count!==1?"s":""}</span>
                  </div>
                  <div style={{ height:5, background:C.bg4, borderRadius:5 }}>
                    <div style={{ height:"100%", width:`${(count/maxC)*100}%`, background:`linear-gradient(90deg,${C.orange},${C.yellow})`, borderRadius:5 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {/* Toggle button for detail */}
      <button onClick={()=>setShowDetail(v=>!v)} style={{ width:"100%", padding:"12px", background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.r, color:C.t3, fontSize:13, fontWeight:700, cursor:"pointer", marginBottom:16, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
        {showDetail ? "▲ Ocultar detalles" : "▼ Ver detalles de ingresos"}
      </button>
      {showDetail && <>
      {/* Job-by-job income detail */}
      {SectionLabel({color:C.t3, children:<>Detalle de ingresos — {periodLabels[statPeriod]}</>})}
      {periodJobs.length===0 ? (
        <div style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, padding:"20px", textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:13, color:C.t3 }}>Sin pedidos en este período</div>
        </div>
      ) : (
        <div style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, marginBottom:16, overflow:"hidden" }}>
          {/* Header */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, padding:"9px 14px", background:C.bg3, borderBottom:`1px solid ${C.bg4}` }}>
            <span style={{ fontSize:12, fontWeight:800, color:C.t4, textTransform:"uppercase", letterSpacing:.7 }}>Producto / Cliente</span>
            <span style={{ fontSize:12, fontWeight:800, color:C.t4, textTransform:"uppercase", letterSpacing:.7, textAlign:"right" }}>Cant.</span>
            <span style={{ fontSize:12, fontWeight:800, color:C.t4, textTransform:"uppercase", letterSpacing:.7, textAlign:"right", minWidth:80 }}>Total</span>
          </div>
          {[...periodJobs].sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)).map((job,i)=>{
            const qty = Number(job.quantity)||1;
            const total = Number(job.price)||0;
            const dep = Number(job.deposit)||0;
            const pending = porCobrarDe(job);
            const isDesign = job.jobType==="design";
            return (
              <div key={job.id} onClick={()=>goToJob(job.id)} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:8, padding:"11px 14px", borderBottom:i<periodJobs.length-1?`1px solid ${C.bg4}`:"none", cursor:"pointer", alignItems:"center" }}
                onMouseEnter={e=>e.currentTarget.style.background=C.bg3}
                onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:5, marginBottom:2 }}>
                    {isDesign && <span style={{ fontSize:12, background:"#2E1309", color:"#FFF0DE", border:"1px solid #6B2812", borderRadius:C.rPill, padding:"1px 5px", fontWeight:800, flexShrink:0 }}>Diseño</span>}
                    <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{job.fileName}</div>
                  </div>
                  <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                    <span style={{ fontSize:12, color:C.t3 }}>{job.clientName||"Sin cliente"}</span>
                    <span style={{ fontSize:12, background:STATUS[job.status]?.bg, color:STATUS[job.status]?.color, borderRadius:C.rPill, padding:"1px 6px", fontWeight:700, flexShrink:0 }}>{STATUS[job.status]?.label}</span>
                  </div>
                  {(job.debe || (dep>0 && job.status!=="shipped")) && (
                    <div style={{ fontSize:12, marginTop:2 }}>
                      {dep>0 && <span style={{ color:"#F1841B" }}>adelanto Bs.{dep.toFixed(2)}</span>}
                      {pending>0 && <span style={{ color:C.yellow, marginLeft:6 }}>cobrar Bs.{pending.toFixed(2)}</span>}
                    </div>
                  )}
                </div>
                <div style={{ fontSize:12, color:C.t3, fontWeight:700, textAlign:"right", flexShrink:0 }}>
                  {qty>1?`×${qty}`:"—"}
                </div>
                <div style={{ textAlign:"right", flexShrink:0, minWidth:80 }}>
                  <div style={{ fontSize:14, fontWeight:900, color:job.status==="shipped"?C.green:C.t1 }}>Bs.{total.toFixed(2)}</div>
                  {qty>1&&job.unitPrice&&<div style={{ fontSize:12, color:C.t3 }}>Bs.{Number(job.unitPrice).toFixed(2)} c/u</div>}
                </div>
              </div>
            );
          })}
          {/* Footer total */}
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 14px", background:C.bg3, borderTop:`1px solid ${C.bg4}` }}>
            <span style={{ fontSize:12, fontWeight:700, color:C.t2 }}>{periodJobs.length} pedido{periodJobs.length!==1?"s":""}</span>
            <span style={{ fontSize:16, fontWeight:900, color:C.green }}>Total: Bs.{periodJobs.reduce((s,j)=>s+Number(j.price),0).toFixed(2)}</span>
          </div>
        </div>
      )}
      {SectionLabel({color:C.t3, children:<>Ingresos últimos 6 meses</>})}
      <div style={{ background:C.bg2, borderRadius:C.r, padding:"16px 14px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
        <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:110 }}>
          {last6.map((m,i)=>(
            <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
              <div style={{ fontSize:12, color:C.t3, fontWeight:600 }}>{m.rev>0?m.rev.toFixed(0):""}</div>
              <div style={{ width:"100%", background:`linear-gradient(180deg,${C.orange},${C.orangeD})`, borderRadius:"5px 5px 0 0", height:`${Math.max(4,(m.rev/maxRev)*88)}px`, opacity:i===5?1:0.2+i*.15 }} />
              <div style={{ fontSize:12, color:i===5?C.t1:C.t3, fontWeight:i===5?800:400 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
      </>}
    </>
    }
    {statsTab==='utility' && <UtilityContent />}
    </div>
  );
  };

  // ─── UTILITY CONTENT ────────────────────────────────────────────────────────
  const UtilityContent = () => {
    // Costo real: filamento + máquina (luz + desgaste) de cada trabajo, y aparte lo que se perdió en fallas
    const jobsWithCost = jobs.map(job => { const c = costoDe(job); return {...job, matCost:c.mat, maqCost:c.maq}; });
    const totalRevenue = jobsWithCost.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0);
    const totalFallas = fallas.reduce((s,f)=>s+(Number(f.costo)||0),0);
    const totalMatCost = jobsWithCost.reduce((s,j)=>s+j.matCost+j.maqCost,0)+totalFallas;
    const totalProfit = totalRevenue-totalMatCost;
    const avgMargin = totalRevenue>0?(totalProfit/totalRevenue)*100:0;
    const periodStart2=getPeriodStart(statPeriod);
    const periodJobs2=jobsWithCost.filter(j=>(j.createdAt||0)>=periodStart2);
    const fallasP = fallas.filter(f=>(f.at||0)>=periodStart2);
    const pRevenue=periodJobs2.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0);
    const pMat=periodJobs2.reduce((s,j)=>s+j.matCost,0), pMaq=periodJobs2.reduce((s,j)=>s+j.maqCost,0), pFallas=fallasP.reduce((s,f)=>s+(Number(f.costo)||0),0);
    const pMatCost=pMat+pMaq+pFallas;
    const pProfit=pRevenue-pMatCost;
    const pMargin=pRevenue>0?(pProfit/pRevenue)*100:0;
    const bajos = periodJobs2.filter(j=>Number(j.price)>0 && j.jobType!=="design" && !costoDe(j).sinDatos && (Number(j.price)-j.matCost-j.maqCost)/Number(j.price)*100 < (Number(operacion.margenMin)||30)).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
    const porMotivo = {}; fallasP.forEach(f=>{ porMotivo[f.motivo]=(porMotivo[f.motivo]||0)+1; });
    const porImpresora = {}; fallasP.forEach(f=>{ const n=printers.find(x=>x.id===f.printer)?.name||"Sin máquina"; porImpresora[n]=(porImpresora[n]||0)+1; });
    const guardarOp = (campo, valor) => { const v = Number(valor); if (isNaN(v) || v<0) return; setDoc(doc(db,"config","operacion"), { ...operacion, [campo]:v }); };
    const usedMaterials=[...new Set(jobs.map(j=>j.material).filter(Boolean))];
    const allMaterials=[...new Set([...MATERIALS,...Object.keys(matCosts),...usedMaterials])];
    return (
      <div className="view-pad" style={{ maxWidth:isDesktop?1100:isTablet?800:"100%", margin:"0 auto" }}>
        <div style={{ display:"flex", gap:5, marginBottom:16, background:C.bg3, borderRadius:C.r, padding:5 }}>
          {[["day","Hoy"],["week","Semana"],["month","Mes"],["year","Año"]].map(([k,l])=>(
            <button key={k} onClick={()=>setStatPeriod(k)} style={{ flex:1, padding:"10px 0", borderRadius:C.rMd, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, background:statPeriod===k?C.orange:"transparent", color:statPeriod===k?"#191513":C.t3, boxShadow:statPeriod===k?`0 3px 12px rgba(241,132,27,.35)`:undefined }}>{l}</button>
          ))}
        </div>
        <div style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"20px", marginBottom:12 }}>
          <div style={{ fontSize:12, color:C.green, fontWeight:800, textTransform:"uppercase", letterSpacing:.9, marginBottom:7 }}>Utilidad neta — {periodLabels[statPeriod]}</div>
          <div style={{ fontSize:38, fontWeight:900, color:pProfit>=0?C.green:C.red, letterSpacing:-1, lineHeight:1 }}>{fmtMoney(pProfit)}</div>
          <div style={{ display:"flex", gap:16, marginTop:11, flexWrap:"wrap" }}>
            {[["Vendido",fmtMoney(pRevenue),C.t1],["Filamento",`- ${fmtMoney(pMat)}`,C.red],["Máquina",`- ${fmtMoney(pMaq)}`,C.red],...(pFallas>0?[["Fallas",`- ${fmtMoney(pFallas)}`,C.red]]:[]),["Margen",`${pMargin.toFixed(0)}%`,pMargin>=50?C.green:pMargin>=25?C.yellow:C.red]].map(([l,v,c])=>(
              <div key={l}><div style={{ fontSize:12, color:C.t3, marginBottom:2 }}>{l}</div><div style={{ fontSize:14, fontWeight:800, color:c }}>{v}</div></div>
            ))}
          </div>
        </div>
        {pRevenue>0 && (
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"14px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:C.t3, marginBottom:6 }}>
              <span>Costo ({pRevenue>0?((pMatCost/pRevenue)*100).toFixed(0):0}%)</span>
              <span>Ganancia ({pMargin.toFixed(0)}%)</span>
            </div>
            <div style={{ height:12, background:C.bg4, borderRadius:6, overflow:"hidden", display:"flex" }}>
              <div style={{ height:"100%", width:`${pRevenue>0?(pMatCost/pRevenue)*100:0}%`, background:`linear-gradient(90deg,#E53212,#E53212)` }} />
              <div style={{ height:"100%", flex:1, background:`linear-gradient(90deg,${C.greenD},${C.green})` }} />
            </div>
          </div>
        )}
        {(()=>{ const sp = periodJobs2.filter(j=>Number(j.price)>0 && costoDe(j).sinPeso).length, sm = periodJobs2.filter(j=>Number(j.price)>0 && costoDe(j).sinMat).length;
          return (sp||sm) ? <div style={{ background:C.yellowBg, border:"1px solid #4A3F36", borderRadius:C.rSm, padding:"10px 14px", marginBottom:16, fontSize:13, color:C.yellow, fontWeight:700, lineHeight:1.5 }}>
            {sp>0 && <div>{sp} trabajo{sp>1?"s":""} sin peso: su filamento no se cuenta, la utilidad real es menor.</div>}
            {sm>0 && <div>{sm} trabajo{sm>1?"s":""} de un material sin costo por kg (configuralo abajo).</div>}
          </div> : null; })()}
        {bajos.length>0 && (<>
          {SectionLabel({color:C.yellow, children:<>Con margen bajo ({bajos.length}) · menos de {Number(operacion.margenMin)||30}%</>})}
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"4px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
            {bajos.slice(0, lim("bajos")).map((j,i)=>{ const gan = Number(j.price)-j.matCost-j.maqCost; return (
              <div key={j.id} onClick={()=>goToJob(j.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderTop:i?`1px solid ${C.bg4}`:"none", cursor:"pointer" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:800, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.fileName}{unidades(j)>1?` ×${unidades(j)}`:""}</div>
                  <div style={{ fontSize:12, color:C.t3 }}>Cobraste {fmtMoney(j.price)} · costo {fmtMoney(j.matCost+j.maqCost)} · sugerido {fmtMoney(precioSugerido(j))}</div>
                </div>
                <span style={{ fontSize:13, fontWeight:900, color:gan<0?"#FF8A6B":C.yellow, flexShrink:0 }}>{(gan/Number(j.price)*100).toFixed(0)}%</span>
              </div>); })}
            {VerMas("bajos", bajos.length)}
          </div>
        </>)}
        {fallasP.length>0 && (<>
          {SectionLabel({color:"#FF8A6B", children:<>Fallas · {periodLabels[statPeriod]}</>})}
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"14px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
            <div style={{ display:"flex", gap:20, flexWrap:"wrap", marginBottom:10 }}>
              {[["Fallas",fallasP.length],["Filamento perdido",`${Math.round(fallasP.reduce((s,f)=>s+(Number(f.gramos)||0),0))} g`],["Te costaron",fmtMoney(pFallas)]].map(([l,v])=>(
                <div key={l}><div style={{ fontSize:12, color:C.t3 }}>{l}</div><div style={{ fontSize:18, fontWeight:900, color:C.t1 }}>{v}</div></div>
              ))}
            </div>
            <div style={{ fontSize:13, color:C.t2, lineHeight:1.7 }}>
              <div><b style={{ color:C.t3 }}>Por motivo:</b> {Object.entries(porMotivo).sort((a,b)=>b[1]-a[1]).map(([m,n])=>`${m} (${n})`).join(" · ")}</div>
              <div><b style={{ color:C.t3 }}>Por máquina:</b> {Object.entries(porImpresora).sort((a,b)=>b[1]-a[1]).map(([m,n])=>`${m} (${n})`).join(" · ")}</div>
            </div>
          </div>
        </>)}
        {SectionLabel({color:C.t3, children:<>Costo de máquina y margen</>})}
        <div style={{ background:C.bg2, borderRadius:C.r, padding:"4px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
          {[["luzHora","Luz por hora de impresión","Bs","Con ~Bs 225/mes y 4 máquinas sale ~Bs 0.15 por hora"],["desgasteHora","Desgaste por hora","Bs","Lo que pierde la máquina por hora (precio ÷ horas de vida)"],["margenMin","Margen mínimo","%","Debajo de esto el trabajo se marca como precio bajo"]].map(([k,l,u,ayuda],i)=>(
            <div key={k} style={{ display:"flex", alignItems:"center", gap:10, padding:"11px 0", borderTop:i?`1px solid ${C.bg4}`:"none" }}>
              <div style={{ flex:1 }}><div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{l}</div><div style={{ fontSize:12, color:C.t3 }}>{ayuda}</div></div>
              <input key={k+":"+operacion[k]} type="number" step="0.01" defaultValue={operacion[k]} onBlur={e=>guardarOp(k,e.target.value)} onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); }} aria-label={l} style={{ ...inputSt, width:90, padding:"7px 10px", textAlign:"right" }} />
              <span style={{ fontSize:13, color:C.t3, width:20 }}>{u}</span>
            </div>
          ))}
        </div>
        {SectionLabel({color:C.t3, children:<>Costo por material (Bs. por kg)</>})}
        <div style={{ background:C.bg2, borderRadius:C.r, padding:"4px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
          {allMaterials.map((mat,i)=>(
            <div key={mat} style={{ display:"flex", alignItems:"center", gap:8, padding:"11px 0", borderBottom:i<allMaterials.length-1?`1px solid ${C.bg4}`:"none" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:C.t1 }}>{mat}</div>
                {matCosts[mat] ? <div style={{ fontSize:12, color:C.t3 }}>Bs. {matCosts[mat]} / kg · Bs. {(matCosts[mat]/1000).toFixed(3)} / g</div>
                  : <div style={{ fontSize:12, color:C.yellow }}>Sin configurar</div>}
              </div>
              {editingCost===mat ? (
                <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                  <input style={{ ...inputSt, width:85, padding:"7px 11px", border:`1.5px solid ${C.orange}` }} type="number" placeholder="121" value={costInput} onChange={e=>setCostInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")saveCost(mat,costInput);if(e.key==="Escape"){setEditingCost(null);setCostInput("");}}} autoFocus />
                  <button onClick={()=>saveCost(mat,costInput)} style={{ padding:"7px 13px", background:C.orange, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:12, fontWeight:800, cursor:"pointer" }}>✓</button>
                  <button onClick={()=>{setEditingCost(null);setCostInput("");}} style={{ padding:"7px 11px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.rSm, fontSize:12, cursor:"pointer" }}>✕</button>
                </div>
              ) : (
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={()=>{setEditingCost(mat);setCostInput(matCosts[mat]||"");}} style={{ padding:"7px 13px", background:matCosts[mat]?C.bg3:C.orangeBg, color:matCosts[mat]?C.t2:C.orange, border:`1px solid ${matCosts[mat]?C.bg5:C.orange}`, borderRadius:C.rSm, fontSize:12, fontWeight:700, cursor:"pointer" }}>
                    {matCosts[mat]?`Bs. ${matCosts[mat]}`:"+ Agregar"}
                  </button>
                  {matCosts[mat] && <button onClick={()=>deleteCost(mat)} style={{ padding:"7px 9px", background:C.redBg, color:C.red, border:`1px solid #4A1A10`, borderRadius:C.rSm, fontSize:12, cursor:"pointer" }}>×</button>}
                </div>
              )}
            </div>
          ))}
        </div>
        {SectionLabel({color:C.t3, children:<>Resumen histórico</>})}
        <div style={{ background:C.bg2, borderRadius:C.r, padding:"4px 16px", marginBottom:16, border:`1px solid ${C.bg4}` }}>
          {[["Total vendido",fmtMoney(totalRevenue)],["Costos (filamento, máquina y fallas)",`- ${fmtMoney(totalMatCost)}`],["Utilidad neta",fmtMoney(totalProfit)],["Margen promedio",`${avgMargin.toFixed(1)}%`]].map(([l,v],i,arr)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"12px 0", borderBottom:i<arr.length-1?`1px solid ${C.bg4}`:"none" }}>
              <span style={{ fontSize:13, color:C.t2 }}>{l}</span>
              <span style={{ fontSize:13, fontWeight:800, color:i===2?totalProfit>=0?C.green:C.red:i===3?avgMargin>=50?C.green:avgMargin>=25?C.yellow:C.red:C.t1 }}>{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Mantenimiento de una máquina: horas impresas y cada tarea con cuánto falta
  const [editMant, setEditMant] = useState(null);   // "pid:tid" del intervalo que se está cambiando
  const [editMantVal, setEditMantVal] = useState("");
  const PanelMant = (p) => {
    const tareas = tareasDe(p), horas = horasDe(p.id), fallasP = fallas.filter(f=>f.printer===p.id);
    return (
      <div style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"14px 16px", marginTop:-4, marginBottom:16 }}>
        <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", gap:8, marginBottom:10, flexWrap:"wrap" }}>
          <div style={{ fontSize:13, fontWeight:900, color:C.t2, textTransform:"uppercase", letterSpacing:.7 }}>Mantenimiento</div>
          <div style={{ fontSize:13, color:C.t3 }}><b style={{ color:C.t1 }}>{Math.round(horas)} h</b> impresas{fallasP.length?` · ${fallasP.length} falla${fallasP.length>1?"s":""}`:""}</div>
        </div>
        {tareas.map(t => {
          const k = p.id+":"+t.id, pct = Math.max(0, Math.min(100, t.uso/(Number(t.cada)||1)*100));
          const color = t.vencida ? "#E53212" : t.pronto ? C.yellow : C.green;
          return (
            <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 0", borderTop:`1px solid ${C.bg4}` }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:800, color:C.t1 }}>{t.nombre}</div>
                <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:12, color:C.t3, marginTop:2, flexWrap:"wrap" }}>
                  {editMant===k ? (
                    <span style={{ display:"inline-flex", gap:6, alignItems:"center" }}>cada
                      <input autoFocus type="number" value={editMantVal} onChange={e=>setEditMantVal(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"){ mantCada(p,t.id,editMantVal); setEditMant(null);} if(e.key==="Escape") setEditMant(null); }} style={{ ...inputSt, width:80, padding:"4px 8px", fontSize:13 }} /> h
                      <button onClick={()=>{ mantCada(p,t.id,editMantVal); setEditMant(null); }} style={{ background:C.orange, color:"#191513", border:"none", borderRadius:8, padding:"4px 10px", fontWeight:900, cursor:"pointer", minHeight:32 }}>OK</button>
                    </span>
                  ) : (
                    <button onClick={()=>{ setEditMant(k); setEditMantVal(String(t.cada)); }} title="Cambiar intervalo" style={{ background:"none", border:"none", padding:0, minHeight:0, minWidth:0, color:C.t3, fontSize:12, cursor:"pointer", textDecoration:"underline", textDecorationColor:C.bg5, textUnderlineOffset:3 }}>cada {t.cada} h</button>
                  )}
                  <span style={{ color, fontWeight:800 }}>{t.vencida ? `toca ahora (pasó ${Math.round(-t.faltan)} h)` : `faltan ${Math.round(t.faltan)} h`}</span>
                  {t.hechoAt && <span>· hecho {haceDias(t.hechoAt)}</span>}
                </div>
                <div style={{ height:5, background:C.bg4, borderRadius:4, marginTop:6, overflow:"hidden" }}><div style={{ height:"100%", width:`${pct}%`, background:color }} /></div>
              </div>
              <button onClick={()=>mantHecho(p,t.id)} style={{ minHeight:40, padding:"0 14px", borderRadius:C.rSm, border:`1px solid ${t.vencida?C.orange:C.bg5}`, background:t.vencida?C.orange:C.bg3, color:t.vencida?"#191513":C.t2, fontSize:13, fontWeight:900, cursor:"pointer", flexShrink:0 }}>Hecho</button>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── PRINTERS VIEW ────────────────────────────────────────────────────────
  const PrintersView = () => (
    <div className="view-pad" style={{ maxWidth:isDesktop?900:isTablet?700:"100%", margin:"0 auto" }}>
      {SectionLabel({color:C.t3, children:<>Tus impresoras</>})}
      {printers.map(p=><Fragment key={p.id}>{PrinterCard({p:p, showActions:true})}{PanelMant(p)}</Fragment>)}
      <button onClick={()=>{setEditP(null);setPForm(P0);setShowPForm(true);}} style={{ width:"100%", padding:"16px", background:C.bg2, border:`2px dashed ${C.bg5}`, borderRadius:C.r, color:C.t3, fontSize:14, fontWeight:700, cursor:"pointer", marginTop:4 }}>
        + Agregar nueva impresora
      </button>
    </div>
  );


  // ─── PRODUCTS VIEW ───────────────────────────────────────────────────────
  const ProductsView = () => {
    const stockItems = Object.values(stock).filter(s=>s.qty>0).sort((a,b)=>b.qty-a.qty);
    const totalStock = stockItems.reduce((s,i)=>s+i.qty,0);

    return (
      <div className="view-pad" style={{ maxWidth:isDesktop?1400:isTablet?900:"100%", margin:"0 auto" }}>
        {/* Sub-tab switcher */}
        <div style={{ display:"flex", gap:0, marginBottom:16, background:C.bg3, borderRadius:C.r, padding:5 }}>
          <button onClick={()=>setProdTab("catalogo")} style={{ flex:1, padding:"10px 0", borderRadius:C.rMd, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, background:prodTab==="catalogo"?C.orange:"transparent", color:prodTab==="catalogo"?"#191513":C.t3, boxShadow:prodTab==="catalogo"?"0 3px 12px rgba(241,132,27,.35)":undefined }}>
            Catálogo{products.length>0 && <span style={{ marginLeft:6, fontSize:12, opacity:.85 }}>{products.length}</span>}
          </button>
          <button onClick={()=>setProdTab("stock")} style={{ flex:1, padding:"10px 0", borderRadius:C.rMd, border:"none", cursor:"pointer", fontSize:13, fontWeight:800, background:prodTab==="stock"?C.orange:"transparent", color:prodTab==="stock"?"#191513":C.t3, boxShadow:prodTab==="stock"?"0 3px 12px rgba(241,132,27,.35)":undefined, position:"relative" }}>
            Stock
            {totalStock>0 && <span style={{ marginLeft:6, background:prodTab==="stock"?"rgba(25,21,19,.25)":C.orange, color:"#191513", borderRadius:C.rPill, padding:"1px 7px", fontSize:12, fontWeight:900 }}>{totalStock}</span>}
          </button>
        </div>

        {/* ── CATÁLOGO ── */}
        {prodTab==="catalogo" && <>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:12, color:C.t3 }}>Toca <strong style={{ color:C.orange }}>+ Cola</strong> o <strong style={{ color:C.green }}>+ Stock</strong></div>
            <button onClick={()=>{ setEditProduct(null); setProdForm({ name:"", price:"", duration:"", weight:"", material:"", color:"", notes:"", category:"" }); setShowProductForm(true); }} style={{ background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.rSm, padding:"9px 16px", fontSize:13, fontWeight:900, cursor:"pointer", boxShadow:`0 3px 14px rgba(241,132,27,.4)` }}>+ Nuevo</button>
          </div>
          {/* Search bar */}
          <div style={{ position:"relative", marginBottom:12 }}>
            <div style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", fontSize:15, pointerEvents:"none" }}><Icono e="🔍" size={17} /></div>
            <input style={{ ...inputSt, paddingLeft:42, background:C.bg3, borderColor:prodSearch?C.orange:C.bg5 }} placeholder="Buscar producto..." value={prodSearch} onChange={e=>setProdSearch(e.target.value)} />
            {prodSearch && <button onClick={()=>setProdSearch("")} style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.t3, fontSize:18, cursor:"pointer", lineHeight:1 }}>✕</button>}
          </div>
          {/* Category filter chips */}
          {(()=>{
            const cats = ["all", ...Array.from(new Set(products.map(p=>p.category).filter(Boolean))).sort()];
            if(cats.length<=1) return null;
            return (
              <div style={{ display:"flex", gap:6, overflowX:"auto", paddingBottom:4, marginBottom:12 }}>
                {cats.map(cat=>(
                  <button key={cat} onClick={()=>setProdCatFilter(cat)} style={{ padding:"7px 14px", borderRadius:C.rPill, border:"none", cursor:"pointer", fontSize:12, fontWeight:800, whiteSpace:"nowrap", flexShrink:0, background:prodCatFilter===cat?C.orange:C.bg3, color:prodCatFilter===cat?"#191513":C.t3, boxShadow:prodCatFilter===cat?"0 3px 12px rgba(241,132,27,.35)":undefined }}>
                    {cat==="all"?"Todos":cat}
                    {cat!=="all" && <span style={{ marginLeft:5, fontSize:12, opacity:.8 }}>{products.filter(p=>p.category===cat).length}</span>}
                  </button>
                ))}
              </div>
            );
          })()}
          {products.length===0 ? (
            <Empty icon="📦" title="Sin productos aún" sub="Agrega tus productos más frecuentes para añadirlos a la cola en un toque" />
          ) : products.filter(p=>(prodCatFilter==="all"||p.category===prodCatFilter)&&(!prodSearch||p.name.toLowerCase().includes(prodSearch.toLowerCase()))).length===0 ? (
            <Empty icon="🔍" title="Sin resultados" sub={`Ningún producto coincide con "${prodSearch}"`} />
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {products.filter(p=>(prodCatFilter==="all"||p.category===prodCatFilter)&&(!prodSearch||p.name.toLowerCase().includes(prodSearch.toLowerCase()))).map(prod => {
                const stockQty = stock[prod.id]?.qty||0;
                return (
                  <div key={prod.id} style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, overflow:"hidden" }}>
                    <div style={{ display:"flex", alignItems:"stretch" }}>
                      <div style={{ width:4, background:C.orange, flexShrink:0 }} />
                      <div style={{ flex:1, padding:"13px 13px 13px 15px", minWidth:0 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:8, marginBottom:6 }}>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:15, fontWeight:900, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{prod.name}</div>
                            <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                              {prod.material && <span style={{ fontSize:12, background:C.bg4, color:C.t3, borderRadius:C.rPill, padding:"2px 8px", fontWeight:600 }}>{prod.material}</span>}
                              {prod.color    && <span style={{ fontSize:12, background:C.bg4, color:C.t3, borderRadius:C.rPill, padding:"2px 8px", fontWeight:600 }}>{prod.color}</span>}
                              {prod.duration>0 && <span style={{ fontSize:12, color:C.t4, fontWeight:600 }}><Icono e="⏱" size={14} style={{marginRight:3}} />{Number(prod.duration)>=60?`${Math.floor(Number(prod.duration)/60)}h${Number(prod.duration)%60>0?" "+Number(prod.duration)%60+"m":""}`:prod.duration+"min"}</span>}
                              {prod.weight>0  && <span style={{ fontSize:12, color:C.t4, fontWeight:600 }}><Icono e="⚖" size={14} style={{marginRight:3}} />{prod.weight}g</span>}
                            </div>
                          </div>
                          <div style={{ textAlign:"right", flexShrink:0 }}>
                            {prod.price && <div style={{ fontSize:17, fontWeight:900, color:C.green }}>{Number(prod.price)>0?"Bs. "+Number(prod.price).toFixed(2):""}</div>}
                            {stockQty>0 && <div style={{ fontSize:12, color:C.purple, fontWeight:800, marginTop:2 }}>{stockQty} en stock</div>}
                          </div>
                        </div>
                        {/* Action buttons */}
                        <div style={{ display:"flex", gap:6 }}>
                          <button onClick={()=>quickAddProduct(prod)} style={{ flex:1, padding:"9px 0", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:13, fontWeight:900, cursor:"pointer", boxShadow:`0 3px 10px rgba(241,132,27,.35)` }}>+ Cola</button>
                          <button onClick={()=>addToStock(prod)} style={{ flex:1, padding:"9px 0", background:`linear-gradient(135deg,${C.green},${C.greenD})`, color:"#000", border:"none", borderRadius:C.rSm, fontSize:13, fontWeight:900, cursor:"pointer", boxShadow:`0 3px 10px rgba(241,132,27,.25)` }}>+ Stock</button>
                        </div>
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", borderLeft:`1px solid ${C.bg4}` }}>
                        <button onClick={()=>{ setEditProduct(prod); setProdForm({ name:prod.name, price:prod.price||"", duration:prod.duration||"", weight:prod.weight||"", material:prod.material||"", color:prod.color||"", notes:prod.notes||"", category:prod.category||"" }); setShowProductForm(true); }} style={{ flex:1, padding:"0 12px", background:C.bg3, border:"none", borderBottom:`1px solid ${C.bg4}`, cursor:"pointer", fontSize:13, color:C.t2 }}><Icono e="✏️" /></button>
                        <button onClick={()=>deleteProduct(prod.id)} style={{ flex:1, padding:"0 12px", background:C.redBg, border:"none", cursor:"pointer", fontSize:13, color:C.red }}><Icono e="🗑" /></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>}

        {/* ── STOCK ── */}
        {prodTab==="stock" && <>
          {stockItems.length===0 ? (
            <Empty icon="🗃" title="Sin stock" sub="Ve al Catálogo y toca + Stock para registrar unidades impresas listas para entregar" />
          ) : (
            <>
              <div style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"14px 16px", marginBottom:16, display:"flex", gap:20 }}>
                <div><div style={{ fontSize:12, color:C.t3, fontWeight:700, textTransform:"uppercase", letterSpacing:.7 }}>Productos</div><div style={{ fontSize:22, fontWeight:900, color:C.t1 }}>{stockItems.length}</div></div>
                <div><div style={{ fontSize:12, color:C.t3, fontWeight:700, textTransform:"uppercase", letterSpacing:.7 }}>Unidades</div><div style={{ fontSize:22, fontWeight:900, color:C.purple }}>{totalStock}</div></div>
                <div><div style={{ fontSize:12, color:C.t3, fontWeight:700, textTransform:"uppercase", letterSpacing:.7 }}>Valor aprox.</div><div style={{ fontSize:22, fontWeight:900, color:C.green }}>Bs.{stockItems.reduce((s,i)=>{ const p=products.find(x=>x.id===i.productId); return s+(p?Number(p.price||0)*i.qty:0); },0).toFixed(0)}</div></div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                {stockItems.map(item => {
                  const prod = products.find(p=>p.id===item.productId);
                  return (
                    <div key={item.productId} style={{ background:C.bg2, borderRadius:C.r, border:`1px solid ${C.bg4}`, overflow:"hidden", display:"flex", alignItems:"stretch" }}>
                      <div style={{ width:4, background:C.purple, flexShrink:0 }} />
                      <div style={{ flex:1, padding:"14px 14px 14px 16px", display:"flex", alignItems:"center", gap:12, minWidth:0 }}>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:15, fontWeight:900, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{item.name}</div>
                          <div style={{ display:"flex", gap:5, marginTop:4, flexWrap:"wrap" }}>
                            {item.material && <span style={{ fontSize:12, background:C.bg4, color:C.t3, borderRadius:C.rPill, padding:"2px 8px", fontWeight:600 }}>{item.material}</span>}
                            {item.color    && <span style={{ fontSize:12, background:C.bg4, color:C.t3, borderRadius:C.rPill, padding:"2px 8px", fontWeight:600 }}>{item.color}</span>}
                            {prod?.price && <span style={{ fontSize:12, color:C.green, fontWeight:800 }}>Bs. {Number(prod.price).toFixed(2)}</span>}
                          </div>
                        </div>
                        <div style={{ textAlign:"right", flexShrink:0 }}>
                          {/* Quantity control */}
                          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, justifyContent:"flex-end" }}>
                            <button onClick={()=>removeFromStock(item.productId,item.qty)} style={{ width:28, height:28, borderRadius:8, background:C.bg4, border:`1px solid ${C.bg5}`, color:C.t1, fontSize:16, fontWeight:900, cursor:"pointer", lineHeight:1 }}>−</button>
                            <div style={{ fontSize:22, fontWeight:900, color:C.purple, minWidth:28, textAlign:"center" }}>{item.qty}</div>
                            <button onClick={()=>prod&&addToStock(prod)} style={{ width:28, height:28, borderRadius:8, background:C.bg4, border:`1px solid ${C.bg5}`, color:C.t1, fontSize:16, fontWeight:900, cursor:"pointer", lineHeight:1 }}>+</button>
                          </div>
                          <button onClick={()=>prod&&quickAddFromStock(item.productId)} style={{ padding:"8px 12px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.rSm, fontSize:12, fontWeight:900, cursor:"pointer", boxShadow:`0 3px 10px rgba(241,132,27,.35)`, whiteSpace:"nowrap" }}>→ Cola</button>
                          <button onClick={()=>sellFromStock(item.productId)} style={{ padding:"8px 12px", background:`linear-gradient(135deg,${C.green},${C.greenD})`, color:"#000", border:"none", borderRadius:C.rSm, fontSize:12, fontWeight:900, cursor:"pointer", boxShadow:`0 3px 10px rgba(241,132,27,.25)`, whiteSpace:"nowrap" }}>Vender</button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>}
      </div>
    );
  };


  // ─── ORDER GROUP ─────────────────────────────────────────────────────────
  const OrderGroup = ({ orderId, jobs: groupJobs }) => {
    // Se guarda arriba (no dentro del grupo): así sigue cerrado aunque la pantalla se actualice sola
    const collapsed = gruposCerrados.has(orderId);
    const setCollapsed = () => setGruposCerrados(prev => { const n = new Set(prev); n.has(orderId) ? n.delete(orderId) : n.add(orderId); try { localStorage.setItem("w3d-grupos-cerrados", JSON.stringify([...n])); } catch (e) {} return n; });
    const clientName = groupJobs[0]?.clientName || "";
    const total = groupJobs.filter(j=>j.price).reduce((s,j)=>s+Number(j.price),0);
    const allDone = groupJobs.every(j=>j.status==="shipped");
    const anyActive = groupJobs.some(j=>["printing","paused"].includes(j.status));
    const statusCounts = groupJobs.reduce((acc,j)=>{ acc[j.status]=(acc[j.status]||0)+1; return acc; },{});
    return (
      <div style={{ marginBottom:14 }}>
        {/* Group header */}
        <div onClick={()=>setCollapsed(v=>!v)} style={{ background:C.bg3, borderRadius:`${C.r}px ${C.r}px ${collapsed?C.r:0}px ${collapsed?C.r:0}px`, border:`1px solid ${anyActive?STATUS.printing.border:C.bg5}`, padding:"11px 16px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", borderBottom:collapsed?undefined:`1px solid ${C.bg5}` }}>
          <div style={{ width:7, height:7, borderRadius:"50%", background:anyActive?C.green:allDone?C.teal:C.orange, boxShadow:anyActive?`0 0 6px ${C.green}`:undefined, flexShrink:0 }} />
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:900, color:C.t1 }}>Pedido múltiple{clientName?` · ${clientName}`:""}</div>
            <div style={{ fontSize:12, color:C.t3, marginTop:2, display:"flex", gap:8, flexWrap:"wrap" }}>
              <span>{groupJobs.length} producto{groupJobs.length!==1?"s":""}</span>
              {Object.entries(statusCounts).map(([s,n])=>(
                <span key={s} style={{ color:STATUS[s]?.color }}>{STATUS[s]?.label}: {n}</span>
              ))}
            </div>
          </div>
          {total>0 && <span style={{ fontSize:14, fontWeight:900, color:C.green, flexShrink:0 }}>Bs.{total.toFixed(2)}</span>}
          <span style={{ fontSize:14, color:C.t3, flexShrink:0 }}>{collapsed?"▼":"▲"}</span>
        </div>
        {!collapsed && (
          <div style={{ borderRadius:`0 0 ${C.r}px ${C.r}px`, border:`1px solid ${C.bg5}`, borderTop:"none", overflow:"hidden" }}>
            {groupJobs.map((job,i)=>(
              <div key={job.id} style={{ borderBottom:i<groupJobs.length-1?`1px solid ${C.bg4}`:"none" }}>
                {JobCard({job:job, compact:false})}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ─── KIOSK VIEW ──────────────────────────────────────────────────────────
  // ── Calendario del kiosco: entregas de la semana, una columna por día ──
  const CalendarioKiosco = () => {
    const lunes = new Date(); lunes.setHours(0,0,0,0); lunes.setDate(lunes.getDate() - ((lunes.getDay()+6)%7) + kioskSemana*7);
    const dias = Array.from({length:7}, (_,i) => { const d = new Date(lunes); d.setDate(lunes.getDate()+i); return d; });
    const NOM = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"], MES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
    const hoy0 = startOfDay(), ini = dias[0].getTime(), fin = ini + 7*DIA;
    const delDia = (d) => { const a = d.getTime(), b = a + DIA; return jobs.filter(j => j.deliveryAt && j.deliveryAt >= a && j.deliveryAt < b).sort((x,y) => x.deliveryAt - y.deliveryAt); };
    const deLaSemana = jobs.filter(j => j.deliveryAt && j.deliveryAt >= ini && j.deliveryAt < fin);
    const atrasadosAntes = kioskSemana === 0 ? jobs.filter(j => esAtrasado(j) && j.deliveryAt < ini).sort((x,y)=>x.deliveryAt-y.deliveryAt) : [];
    const sinFecha = jobs.filter(j => ["pending","printing","paused"].includes(j.status) && !j.deliveryAt).length;
    const rango = dias[0].getMonth() === dias[6].getMonth()
      ? `${dias[0].getDate()} – ${dias[6].getDate()} ${MES[dias[6].getMonth()]}`
      : `${dias[0].getDate()} ${MES[dias[0].getMonth()]} – ${dias[6].getDate()} ${MES[dias[6].getMonth()]}`;
    const hora = (ts) => new Date(ts).toLocaleTimeString("es-ES", { hour:"2-digit", minute:"2-digit" });
    const flecha = { width:52, height:52, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rMd, color:C.t1, cursor:"pointer" };
    const Item = (j, chico) => {
      const st = STATUS[j.status] || STATUS.pending, tarde = esAtrasado(j), entregado = j.status === "shipped";
      return (
        <button key={j.id} onClick={()=>setKioskSel(j.id)} style={{ display:"block", width:"100%", textAlign:"left", background:tarde?C.redBg:C.bg3, border:`1px solid ${tarde?"#5C1F14":C.bg5}`, borderLeft:`5px solid ${tarde?"#E53212":st.dot}`, borderRadius:C.rSm, padding:"10px 10px 10px 12px", marginBottom:8, cursor:"pointer", color:"inherit", fontFamily:"inherit", opacity:entregado?.5:1 }}>
          <div style={{ fontSize:chico?14:17, fontWeight:900, color:tarde?"#FF8A6B":C.orange, fontVariantNumeric:"tabular-nums" }}>{chico ? new Date(j.deliveryAt).toLocaleDateString("es-ES",{day:"2-digit",month:"short"}) : hora(j.deliveryAt)}</div>
          <div style={{ fontSize:16, fontWeight:900, color:C.t1, marginTop:4, lineHeight:1.25, display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden", overflowWrap:"anywhere", textDecoration:entregado?"line-through":"none" }}>{j.fileName}{Number(j.quantity)>1 && <span style={{ color:C.purple }}> ×{j.quantity}</span>}</div>
          {j.clientName && <div style={{ fontSize:14, color:C.t2, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.clientName}</div>}
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:6, fontSize:13, fontWeight:800, color:entregado?C.teal:tarde?"#FF8A6B":st.color }}>
            {entregado ? <CheckCircle2 size={15} aria-hidden="true" /> : <span style={{ width:8, height:8, borderRadius:"50%", background:tarde?"#E53212":st.dot, flexShrink:0 }} />}
            <span style={{ lineHeight:1.2 }}>{tarde?"Atrasado":st.label}{j.status==="printing"?` ${avanceJob(j)}%`:""}</span>
          </div>
          {j.status==="printing" && <div style={{ height:6, background:C.bg5, borderRadius:4, marginTop:6, overflow:"hidden" }}><div style={{ height:"100%", width:`${avanceJob(j)}%`, background:C.green }} /></div>}
        </button>
      );
    };
    return (
      <div style={{ padding:"16px" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:14, flexWrap:"wrap" }}>
          <button onClick={()=>setKioskSemana(v=>v-1)} aria-label="Semana anterior" style={flecha}><ChevronLeft size={26} aria-hidden="true" /></button>
          <div style={{ minWidth:180 }}>
            <div style={{ fontSize:24, fontWeight:900, color:C.t1 }}>{rango}</div>
            <div style={{ fontSize:14, color:C.t3, fontWeight:700 }}>{kioskSemana===0?"Esta semana":kioskSemana===1?"Semana que viene":kioskSemana===-1?"Semana pasada":""} · {deLaSemana.filter(j=>j.status!=="shipped").length} por entregar · {deLaSemana.filter(j=>j.status==="shipped").length} entregados</div>
          </div>
          <button onClick={()=>setKioskSemana(v=>v+1)} aria-label="Semana siguiente" style={flecha}><ChevronRight size={26} aria-hidden="true" /></button>
          {kioskSemana!==0 && <button onClick={()=>setKioskSemana(0)} style={{ ...flecha, width:"auto", padding:"0 18px", fontSize:15, fontWeight:900, color:C.orange }}>Hoy</button>}
          {sinFecha>0 && <div style={{ marginLeft:"auto", fontSize:14, color:C.t3, fontWeight:700 }}>{sinFecha} en cola sin fecha de entrega</div>}
        </div>
        {atrasadosAntes.length>0 && (
          <div style={{ background:C.redBg, border:"1px solid #5C1F14", borderRadius:C.r, padding:"12px 14px", marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:15, fontWeight:900, color:"#FF8A6B", marginBottom:10 }}><AlertTriangle size={18} aria-hidden="true" />Atrasados de antes · {atrasadosAntes.length}</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:8 }}>{atrasadosAntes.map(j=>Item(j, true))}</div>
          </div>
        )}
        {w < 1000 ? (
          // Vertical (iPad parado, celu): la semana como agenda, un día por fila
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {dias.map((d,i)=>{
              const t = d.getTime(), esHoy = t === hoy0, pasado = t < hoy0, lista = delDia(d);
              return (
                <section key={i} aria-label={`${NOM[i]} ${d.getDate()}`} style={{ display:"flex", gap:12, background:esHoy?`${C.orange}14`:C.bg2, border:`${esHoy?2:1}px solid ${esHoy?C.orange:C.bg4}`, borderRadius:C.r, padding:12, opacity:pasado&&!lista.some(esAtrasado)?.7:1 }}>
                  <div style={{ width:62, flexShrink:0, textAlign:"center", paddingTop:4 }}>
                    <div style={{ fontSize:14, fontWeight:900, color:esHoy?C.orange:C.t2, textTransform:"uppercase" }}>{NOM[i]}</div>
                    <div style={{ fontSize:32, fontWeight:900, color:esHoy?C.orange:C.t1, lineHeight:1.05 }}>{d.getDate()}</div>
                    {esHoy && <div style={{ fontSize:12, fontWeight:900, color:"#191513", background:C.orange, borderRadius:C.rPill, padding:"1px 6px", marginTop:4 }}>HOY</div>}
                  </div>
                  <div style={{ flex:1, minWidth:0, display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))", gap:8, alignContent:"start" }}>
                    {lista.length ? lista.map(j=>Item(j)) : <div style={{ color:C.t4, fontSize:15, alignSelf:"center", padding:"14px 0" }}>Sin entregas</div>}
                  </div>
                </section>
              );
            })}
          </div>
        ) : (
        <div style={{ overflowX:"auto", paddingBottom:6 }}>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(7,minmax(130px,1fr))", gap:10 }}>
            {dias.map((d,i)=>{
              const t = d.getTime(), esHoy = t === hoy0, pasado = t < hoy0, lista = delDia(d);
              return (
                <section key={i} aria-label={`${NOM[i]} ${d.getDate()}`} style={{ background:esHoy?`${C.orange}14`:C.bg2, border:`${esHoy?2:1}px solid ${esHoy?C.orange:C.bg4}`, borderRadius:C.r, minHeight:"calc(100vh - 230px)", display:"flex", flexDirection:"column", opacity:pasado&&!lista.some(esAtrasado)?.7:1 }}>
                  <div style={{ padding:"12px 12px 10px", borderBottom:`1px solid ${esHoy?C.orange+"55":C.bg4}`, display:"flex", alignItems:"baseline", gap:8 }}>
                    <span style={{ fontSize:15, fontWeight:900, color:esHoy?C.orange:C.t2, textTransform:"uppercase" }}>{NOM[i]}</span>
                    <span style={{ fontSize:28, fontWeight:900, color:esHoy?C.orange:C.t1, lineHeight:1 }}>{d.getDate()}</span>
                    {esHoy && <span style={{ marginLeft:"auto", fontSize:12, fontWeight:900, color:"#191513", background:C.orange, borderRadius:C.rPill, padding:"2px 8px" }}>HOY</span>}
                    {!esHoy && lista.length>0 && <span style={{ marginLeft:"auto", fontSize:13, fontWeight:800, color:C.t3 }}>{lista.length}</span>}
                  </div>
                  <div style={{ padding:10, flex:1 }}>
                    {lista.length ? lista.map(j=>Item(j)) : <div style={{ textAlign:"center", color:C.t4, fontSize:14, paddingTop:20 }}>—</div>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
        )}
      </div>
    );
  };

  // Detalle de un trabajo tocado en el calendario del kiosco, con su acción principal
  const DetalleKiosco = () => {
    const j = kioskSel && jobs.find(x=>x.id===kioskSel);
    if (!j) return null;
    const st = STATUS[j.status] || STATUS.pending, p = printers.find(x=>x.id===j.printer);
    const cerrar = () => setKioskSel(null);
    const hacer = (fn) => () => { cerrar(); fn(); };
    const accion = j.status==="pending" ? { l:j.jobType==="design"?"Empezar diseño":"Iniciar impresión", f:()=>startJ(j), I:Play }
      : j.status==="printing" ? { l:"Terminado", f:()=>completeJ(j.id), I:CheckCircle2 }
      : j.status==="paused" ? { l:"Reanudar", f:()=>resumeJ(j.id), I:Play }
      : j.status==="done" ? { l:"Para envío", f:()=>toShipJ(j.id), I:PackageOpen }
      : j.status==="shipping" ? { l:"Entregado", f:()=>shippedJ(j.id,j), I:Truck }
      : j.debe ? { l:`Cobrar ${fmtMoney(saldoDe(j))}`, f:()=>cobrarDeuda(j), I:Banknote } : null;
    const fila = (l, v) => v ? <div style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"9px 0", borderBottom:`1px solid ${C.bg4}`, fontSize:16 }}><span style={{ color:C.t3 }}>{l}</span><span style={{ color:C.t1, fontWeight:800, textAlign:"right" }}>{v}</span></div> : null;
    return (
      <div onClick={e=>{ if(e.target===e.currentTarget) cerrar(); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div role="dialog" aria-modal="true" aria-labelledby="kiosco-det" style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"22px", width:"100%", maxWidth:480 }}>
          <div style={{ display:"flex", alignItems:"flex-start", gap:12 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <div id="kiosco-det" style={{ fontSize:24, fontWeight:900, color:C.t1, lineHeight:1.2 }}>{j.fileName}{Number(j.quantity)>1 && <span style={{ color:C.purple }}> ×{j.quantity}</span>}</div>
              <div style={{ fontSize:15, fontWeight:800, color:st.color, marginTop:6 }}>{st.label}{esAtrasado(j)?" · atrasado":""}</div>
            </div>
            <button onClick={cerrar} aria-label="Cerrar" style={{ width:48, height:48, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, color:C.t1, cursor:"pointer", flexShrink:0 }}><X size={22} aria-hidden="true" /></button>
          </div>
          {j.status==="printing" && <div style={{ marginTop:14 }}><div style={{ display:"flex", justifyContent:"space-between", fontSize:16, fontWeight:800 }}><span style={{ color:C.green }}>{avanceJob(j)}%</span><span style={{ color:C.t1 }}>quedan {fmtTime(j.remaining)}</span></div><div style={{ height:10, background:C.bg4, borderRadius:8, marginTop:6, overflow:"hidden" }}><div style={{ height:"100%", width:`${avanceJob(j)}%`, background:C.green }} /></div></div>}
          <div style={{ marginTop:12 }}>
            {fila("Entrega", j.deliveryAt && new Date(j.deliveryAt).toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}))}
            {fila("Cliente", j.clientName)}
            {fila("Teléfono", j.clientPhone)}
            {fila("Impresora", j.jobType!=="design" && p?.name)}
            {fila("Material", [j.material, j.color].filter(Boolean).join(" · "))}
            {fila("Por cobrar", porCobrarDe(j)>0 && fmtMoney(porCobrarDe(j)))}
          </div>
          {j.notes && <div style={{ fontSize:14, color:C.t2, background:C.bg3, borderLeft:`3px solid ${C.orange}`, borderRadius:C.rSm, padding:"10px 12px", marginTop:12, whiteSpace:"pre-wrap" }}>{j.notes}</div>}
          {accion && <button onClick={hacer(accion.f)} style={{ width:"100%", marginTop:16, minHeight:64, display:"flex", alignItems:"center", justifyContent:"center", gap:10, background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.rMd, fontSize:20, fontWeight:900, cursor:"pointer" }}><accion.I size={24} aria-hidden="true" />{accion.l}</button>}
        </div>
      </div>
    );
  };

  const KioskView = () => {
    return (
      <div style={{ fontFamily:FUENTE_TEXTO, background:C.bg0, minHeight:"100vh", color:C.t1 }}>
        {/* Kiosk Header */}
        <div style={{ background:C.bg0, borderBottom:`1px solid ${C.bg4}`, padding:"16px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:10 }}>
          <div style={{ display:"flex", alignItems:"center", gap:14 }}>
            <img src={ISOTIPO} alt="" style={{ width:36, height:44, objectFit:"contain" }} />
            <div>
              <div className="w3d-titulo" style={{ fontSize:20, fontWeight:900, color:C.t1, letterSpacing:1 }}>WORLD<span style={{ color:C.orange }}>3D</span></div>
              <div style={{ fontSize:12, color:C.t3, marginTop:1 }}>
                {printing.length>0 && <span style={{ color:C.green, fontWeight:700 }}>{printing.length} imprimiendo · </span>}
                {pending.length>0 && <span style={{ color:C.yellow, fontWeight:700 }}>{pending.length} en cola · </span>}
                {paused.length>0 && <span style={{ color:C.red, fontWeight:700 }}>{paused.length} pausado · </span>}
                {done.length>0 && <span style={{ color:C.t3 }}>{done.length} listos</span>}
              </div>
            </div>
          </div>
          <div role="tablist" aria-label="Vista del kiosco" style={{ display:"flex", background:C.bg2, border:`1px solid ${C.bg5}`, borderRadius:C.rPill, padding:4, gap:4 }}>
            {[["maquinas","Máquinas",Printer],["calendario","Calendario",CalendarDays]].map(([k,l,Ic])=>(
              <button key={k} role="tab" aria-selected={kioskVista===k} onClick={()=>{ setKioskVista(k); setKioskSemana(0); }} style={{ display:"flex", alignItems:"center", gap:8, minHeight:44, padding:"0 18px", borderRadius:C.rPill, border:"none", cursor:"pointer", fontSize:15, fontWeight:900, background:kioskVista===k?C.orange:"transparent", color:kioskVista===k?"#191513":C.t2 }}><Ic size={18} aria-hidden="true" />{l}</button>
            ))}
          </div>
          <button onClick={()=>setShowKioskExit(true)} style={{ background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, padding:"10px 18px", color:C.t3, fontSize:13, fontWeight:700, cursor:"pointer" }}>
            <Lock size={16} aria-hidden="true" style={{ verticalAlign:"-3px", marginRight:6 }} />Salir del kiosco
          </button>
        </div>

        {kioskVista==="calendario" && CalendarioKiosco()}
        {/* Una columna por máquina: lo que imprime ahora en grande, lo que sigue abajo */}
        {kioskVista==="maquinas" && (() => {
          const maquinas = printers.filter(p=>p.connected!==false || jobs.some(j=>j.printer===p.id && ["printing","paused","pending"].includes(j.status)));
          const sinMaquina = jobs.filter(j=>["printing","paused","pending"].includes(j.status) && (j.jobType==="design" || !printers.some(p=>p.id===j.printer)));
          const columnas = [...maquinas.map(p=>({ id:p.id, nombre:p.name, tipo:p.type, jobs:jobs.filter(j=>j.printer===p.id && j.jobType!=="design") })),
                            ...(sinMaquina.length?[{ id:"__diseno", nombre:"Diseño / sin máquina", tipo:"", jobs:sinMaquina }]:[])];
          const listos = [...done, ...shipping];
          const BotonGrande = ({ onClick, children, bg, color="#191513" }) => (
            <button onClick={onClick} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:10, minHeight:64, background:bg, color, border:"none", borderRadius:C.rMd, fontSize:20, fontWeight:900, cursor:"pointer" }}>{children}</button>
          );
          return (<>
          <div style={{ padding:"20px 16px", display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(320px,1fr))", gap:16, alignItems:"start" }}>
            {columnas.map(col => {
              const actual = col.jobs.find(j=>j.status==="printing") || col.jobs.find(j=>j.status==="paused");
              const cola = col.jobs.filter(j=>j.status==="pending").sort((x,y)=>(x.priority??x.createdAt??0)-(y.priority??y.createdAt??0));
              const siguiente = !actual ? cola[0] : null;
              const despues = actual ? cola.slice(0,3) : cola.slice(1,4);
              const imprimiendo = actual?.status==="printing", pausado = actual?.status==="paused";
              const qty = Number(actual?.quantity)||1;
              const pct = actual ? avanceJob(actual) : 0;
              const estado = imprimiendo ? { t:"Imprimiendo", c:C.green } : pausado ? { t:"Pausada", c:"#E53212" } : { t:"Libre", c:C.t3 };
              return (
                <section key={col.id} aria-label={col.nombre} style={{ background:C.bg2, border:`1.5px solid ${imprimiendo?STATUS.printing.border:pausado?STATUS.paused.border:C.bg4}`, borderRadius:C.r, overflow:"hidden" }}>
                  {/* Máquina */}
                  <div style={{ display:"flex", alignItems:"center", gap:10, padding:"14px 18px", borderBottom:`1px solid ${C.bg4}`, background:C.bg1 }}>
                    <Printer size={20} color={C.t2} aria-hidden="true" />
                    <div style={{ flex:1, minWidth:0, fontSize:17, fontWeight:900, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{col.nombre}</div>
                    {mantPendiente.some(m=>m.p.id===col.id) && <span title={mantPendiente.filter(m=>m.p.id===col.id).map(m=>m.t.nombre).join(", ")} style={{ fontSize:12, fontWeight:900, color:"#191513", background:C.yellow, borderRadius:C.rPill, padding:"3px 9px", whiteSpace:"nowrap" }}>Mantenimiento</span>}
                    <span style={{ display:"flex", alignItems:"center", gap:6, fontSize:14, fontWeight:800, color:estado.c }}>
                      <span style={{ width:10, height:10, borderRadius:"50%", background:estado.c, boxShadow:imprimiendo?`0 0 10px ${estado.c}`:undefined }} />{estado.t}
                    </span>
                  </div>

                  <div style={{ padding:"18px" }}>
                    {actual ? (<>
                      <div style={{ fontSize:24, fontWeight:900, color:C.t1, lineHeight:1.2 }}>{actual.fileName}{qty>1 && <span style={{ color:C.purple }}> ×{qty}</span>}</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"4px 14px", fontSize:15, color:C.t2, marginTop:6 }}>
                        {actual.clientName && <span style={{ display:"inline-flex", alignItems:"center", gap:5 }}><User size={15} aria-hidden="true" />{actual.clientName}</span>}
                        {(actual.material||actual.color) && <span>{[actual.material, actual.color].filter(Boolean).join(" · ")}</span>}
                      </div>
                      {/* Avance en grande, legible a un metro */}
                      <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginTop:18 }}>
                        <span style={{ fontSize:56, fontWeight:900, color:imprimiendo?C.green:"#E53212", lineHeight:1, fontVariantNumeric:"tabular-nums" }}>{pct}%</span>
                        <span style={{ display:"inline-flex", alignItems:"center", gap:6, fontSize:22, fontWeight:800, color:C.t1, fontVariantNumeric:"tabular-nums" }}><Clock size={20} aria-hidden="true" />{fmtTime(actual.remaining)}</span>
                      </div>
                      <div role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`Avance de ${actual.fileName}`} style={{ height:14, background:C.bg4, borderRadius:10, marginTop:10, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:`${pct}%`, background:imprimiendo?`linear-gradient(90deg,${C.greenD},${C.green})`:"#E53212", borderRadius:10, transition:"width 1s" }} />
                      </div>
                      <div style={{ display:"flex", gap:10, marginTop:18 }}>
                        {imprimiendo
                          ? <BotonGrande onClick={()=>completeJ(actual.id)} bg={C.blueD}><CheckCircle2 size={24} aria-hidden="true" />Terminado</BotonGrande>
                          : <BotonGrande onClick={()=>resumeJ(actual.id)} bg={C.greenD}><Play size={24} aria-hidden="true" />Reanudar</BotonGrande>}
                        {imprimiendo && <button onClick={()=>pauseJ(actual.id)} aria-label="Pausar" style={{ width:64, minHeight:64, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rMd, cursor:"pointer" }}><Pause size={24} aria-hidden="true" /></button>}
                        {col.id!=="__diseno" && <button onClick={()=>abrirFalla(actual)} style={{ minWidth:80, minHeight:64, padding:"0 12px", background:C.redBg, color:"#FF8A6B", border:"1px solid #5C1F14", borderRadius:C.rMd, fontSize:16, fontWeight:900, cursor:"pointer" }}>Falló</button>}
                      </div>
                    </>) : siguiente ? (<>
                      <div style={{ fontSize:14, fontWeight:800, color:C.yellow, textTransform:"uppercase", letterSpacing:.8 }}>Sigue</div>
                      <div style={{ fontSize:22, fontWeight:900, color:C.t1, lineHeight:1.2, marginTop:4 }}>{siguiente.fileName}{Number(siguiente.quantity)>1 && <span style={{ color:C.purple }}> ×{siguiente.quantity}</span>}</div>
                      <div style={{ fontSize:15, color:C.t2, marginTop:4 }}>{[siguiente.clientName, siguiente.duration>0 && fmtTime(siguiente.duration*(Number(siguiente.quantity)>1?Number(siguiente.quantity):1))].filter(Boolean).join(" · ")}</div>
                      <div style={{ display:"flex", marginTop:18 }}>
                        <BotonGrande onClick={()=>startJ(siguiente)} bg={C.greenD}><Play size={24} aria-hidden="true" />{col.id==="__diseno"?"Empezar":"Iniciar impresión"}</BotonGrande>
                      </div>
                    </>) : (
                      <div style={{ textAlign:"center", padding:"26px 0", color:C.t3, fontSize:16 }}>Sin trabajos en cola</div>
                    )}

                    {despues.length>0 && (
                      <div style={{ marginTop:18, paddingTop:14, borderTop:`1px solid ${C.bg4}` }}>
                        <div style={{ fontSize:13, fontWeight:800, color:C.t3, textTransform:"uppercase", letterSpacing:.8, marginBottom:8 }}>Después{cola.length>despues.length+(siguiente?1:0) ? ` · ${cola.length} en cola` : ""}</div>
                        {despues.map((j,i)=>(
                          <div key={j.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:i<despues.length-1?`1px solid ${C.bg3}`:"none" }}>
                            <span style={{ width:24, height:24, flexShrink:0, borderRadius:12, background:C.bg4, color:C.t2, fontSize:13, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</span>
                            <span style={{ flex:1, minWidth:0, fontSize:15, fontWeight:700, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.fileName}{Number(j.quantity)>1?` ×${j.quantity}`:""}</span>
                            {j.duration>0 && <span style={{ fontSize:14, color:C.t3, flexShrink:0 }}>{fmtTime(j.duration*(Number(j.quantity)>1?Number(j.quantity):1))}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </div>

          {/* Listos para entregar: abajo, en fila */}
          {listos.length>0 && (
            <div style={{ padding:"0 16px 24px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:15, fontWeight:900, color:C.purple, marginBottom:10 }}><PackageOpen size={18} aria-hidden="true" />Listos para entregar · {listos.length}</div>
              <div style={{ display:"flex", gap:12, overflowX:"auto", paddingBottom:6 }}>
                {listos.map(j=>(
                  <div key={j.id} style={{ flex:"0 0 260px", background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.rMd, padding:14 }}>
                    <div style={{ fontSize:16, fontWeight:900, color:C.t1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.fileName}</div>
                    <div style={{ fontSize:14, color:C.t2, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{j.clientName||"Sin cliente"}</div>
                    <button onClick={()=> j.status==="done" ? toShipJ(j.id) : shippedJ(j.id,j)} style={{ width:"100%", marginTop:10, minHeight:48, display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:j.status==="done"?C.purpleBg:C.tealBg, color:j.status==="done"?C.purple:C.teal, border:`1px solid ${j.status==="done"?"#4A3F36":"#372F2C"}`, borderRadius:C.rSm, fontSize:16, fontWeight:900, cursor:"pointer" }}>
                      {j.status==="done" ? <><PackageOpen size={18} aria-hidden="true" />Para envío</> : <><Truck size={18} aria-hidden="true" />Entregado</>}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          </>);
        })()}

        {/* Exit PIN modal */}
        {showKioskExit && (
          <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.9)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
            <div style={{ background:C.bg2, borderRadius:C.r, padding:"32px 28px", width:"100%", maxWidth:320, border:`1px solid ${C.bg4}`, textAlign:"center" }}>
              <div style={{ fontSize:40, marginBottom:16 }}><Icono e="🔒" size={42} /></div>
              <div style={{ fontSize:18, fontWeight:900, color:C.t1, marginBottom:6 }}>Salir del modo kiosco</div>
              <div style={{ fontSize:13, color:C.t3, marginBottom:24 }}>Ingresa el PIN para continuar</div>
              {/* PIN dots */}
              <div style={{ display:"flex", justifyContent:"center", gap:12, marginBottom:24 }}>
                {[0,1,2,3].map(i=>(
                  <div key={i} style={{ width:16, height:16, borderRadius:"50%", background:kioskPinInput.length>i?C.orange:C.bg4, border:`2px solid ${kioskPinInput.length>i?C.orange:C.bg5}`, transition:"background .15s" }} />
                ))}
              </div>
              {/* Numpad */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10, marginBottom:16 }}>
                {[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map((k,i)=>(
                  <button key={i} onClick={()=>{
                    if(k==="⌫") { setKioskPinInput(p=>p.slice(0,-1)); return; }
                    if(k==="") return;
                    const next = kioskPinInput+k;
                    setKioskPinInput(next);
                    if(next.length===4) {
                      if(next===KIOSK_PIN) { setKioskMode(false); setShowKioskExit(false); setKioskPinInput(""); }
                      else { setTimeout(()=>setKioskPinInput(""),400); }
                    }
                  }} style={{ padding:"18px 0", borderRadius:C.rSm, background:k===""?"transparent":C.bg3, border:k===""?"none":`1px solid ${C.bg5}`, color:C.t1, fontSize:20, fontWeight:800, cursor:k===""?"default":"pointer" }}>{k}</button>
                ))}
              </div>
              <button onClick={()=>{setShowKioskExit(false);setKioskPinInput("");}} style={{ width:"100%", padding:"12px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.rSm, fontSize:14, fontWeight:700, cursor:"pointer" }}>Cancelar</button>
            </div>
          </div>
        )}
      </div>
    );
  };


  // Pedidos web que necesitan una mano: confirmar pago o pasar a la cola
  const webAtencion = pedidos.filter(p => p.estado === "enviado" || p.estado === "pago confirmado").length;

  // Navegación: 4 principales + "Más" en el celu (máx. 5 abajo); en iPad/compu la barra lateral muestra todas
  const TABS = [
    { key:"dashboard",     Icon:Home,        label:"Inicio" },
    // Cola: solo lo que espera turno o quedó en pausa (lo que se está imprimiendo no cuenta: ya está en marcha)
    { key:"queue",         Icon:ListOrdered, label:"Cola",      badge:pending.filter(j=>j.jobType!=="design").length+paused.length||null },
    { key:"web",           Icon:Globe,       label:"Web",       badge:webAtencion||null, urgente:true },
    { key:"shipping_view", Icon:Truck,       label:"Envíos",    badge:shipping.length||null },
    { key:"clients",       Icon:Users,       label:"Clientes",  extra:true },
    { key:"stats",         Icon:BarChart3,   label:"Stats",     extra:true },
    { key:"products",      Icon:Package,     label:"Productos", extra:true },
    { key:"printers",      Icon:Printer,     label:"Máquinas",  extra:true },
  ];
  const irA = (key) => { setView(key); setShowMas(false); if(key!=="clients")setSelectedClient(null); if(key!=="queue")setSortMode(false); };
  const Insignia = ({ n, urgente }) => !n ? null : (
    <span aria-hidden="true" style={{ position:"absolute", top:-6, right:-10, background:urgente?C.red:C.orange, color:urgente?"#fff":"#191513", fontSize:12, fontWeight:900, borderRadius:10, padding:"0 5px", minWidth:18, height:18, lineHeight:"18px", textAlign:"center", boxShadow:`0 0 0 2px ${C.bg0}` }}>{n}</span>
  );

  const views = {
    web: <WebView pedidos={pedidos} cargando={pedidosCargando} error={pedidosError} recargar={recargarPedidos} jobs={jobs} printers={printers}
                  pasarACola={pasarACola} cambiarEstado={cambiarEstadoWeb} goToJob={goToJob} sesion={sesion} salir={salir} />,
    dashboard:     DashboardView(),
    queue:         QueueView(),
    shipping_view: ShippingView(),
    clients:       ClientsView(),
    stats:         StatsView(),
    products:      ProductsView(),
    printers:      PrintersView(),
  };

  const overlayStyle = { position:"fixed", inset:0, background:"rgba(0,0,0,.88)", zIndex:50, display:"flex", alignItems: isMobile?"flex-end":"center", justifyContent:"center" };
  const sheetStyle   = { background:C.bg2, width:"100%", maxWidth: isMobile?430:isDesktop?720:580, margin:"0 auto", borderRadius: isMobile?"24px 24px 0 0":C.r, padding:"24px 18px 32px", maxHeight:"94vh", overflowY:"auto", border:`1px solid ${C.bg4}`, ...(isMobile?{borderBottom:"none"}:{}) };
  const handleStyle  = { width:40, height:4, background:C.bg5, borderRadius:4, margin:"0 auto 20px" };

  if (sesion === undefined) return <LoginView revisando />;
  if (!sesion) return <LoginView />;
  if (admin === null) return <LoginView sesion={sesion} revisando />;
  if (!admin) return <LoginView sesion={sesion} sinPermiso />;
  if (fbUser === undefined) return <LoginView sesion={sesion} revisando />;
  if (!fbUser) return <LoginView sesion={sesion} reconectar={entrarConGoogle} error={fbError} />;

  const CartelPedido = () => !avisoNuevo ? null : (
    <div style={{ position:"fixed", top:"calc(env(safe-area-inset-top) + 12px)", left:12, right:12, zIndex:90, display:"flex", justifyContent:"center", pointerEvents:"none" }}>
      <div style={{ pointerEvents:"auto", width:"100%", maxWidth:560, background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", borderRadius:C.r, padding:"16px 18px", boxShadow:"0 12px 40px rgba(0,0,0,.55)", display:"flex", alignItems:"center", gap:14, animation:"w3dEntra .35s ease-out" }}>
        <div style={{ fontSize:34 }}><Icono e="🛎" size={36} /></div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:800, opacity:.9, textTransform:"uppercase", letterSpacing:.8 }}>
            {avisoNuevo.estado==="pago confirmado" ? "Pedido pagado" : avisoNuevo.tipo==="cotizacion" ? "Nueva cotización" : "Pedido nuevo en la web"}
          </div>
          <div style={{ fontSize:17, fontWeight:900, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
            {numPedido(avisoNuevo)} · {avisoNuevo.cliente_nombre || "Sin nombre"}{Number(avisoNuevo.total)>0 ? ` · Bs. ${Number(avisoNuevo.total).toFixed(2)}` : ""}
          </div>
          {avisoNuevo.otros>0 && <div style={{ fontSize:12, fontWeight:700, opacity:.9 }}>y {avisoNuevo.otros} más</div>}
        </div>
        <button onClick={()=>{ setAvisoNuevo(null); setKioskMode(false); setView("web"); }} style={{ background:"#191513", color:C.orange, border:"none", borderRadius:C.rSm, padding:"10px 14px", fontSize:14, fontWeight:900, cursor:"pointer", whiteSpace:"nowrap" }}>Ver</button>
        <button onClick={()=>setAvisoNuevo(null)} aria-label="Cerrar" style={{ background:"transparent", color:"#191513", border:"none", fontSize:22, cursor:"pointer", padding:"0 4px" }}>×</button>
      </div>
      <style>{`@keyframes w3dEntra{from{transform:translateY(-30px);opacity:0}to{transform:none;opacity:1}}`}</style>
    </div>
  );

  // ── Cobrar al entregar (o una deuda después) ──
  const ModalCobro = () => {
    if (!cobro) return null;
    const { job, modo } = cobro, monto = saldoDe(job);
    const btn = { flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:6, minHeight:76, borderRadius:C.rSm, fontSize:15, fontWeight:900, cursor:"pointer" };
    return (
      <div onClick={e=>{ if(e.target===e.currentTarget) setCobro(null); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:70, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div role="dialog" aria-modal="true" aria-labelledby="cobro-titulo" style={{ background:C.bg2, borderRadius:C.r, padding:"22px 20px", width:"100%", maxWidth:400, border:`1px solid ${C.bg4}` }}>
          <div style={{ fontSize:12, color:C.t3, fontWeight:800, textTransform:"uppercase", letterSpacing:.7, marginBottom:4 }}>{modo==="entrega"?"Entregar":"Cobrar saldo"}</div>
          <div id="cobro-titulo" style={{ fontSize:18, fontWeight:900, color:C.t1 }}>{job.fileName}</div>
          {job.clientName && <div style={{ fontSize:13, color:C.t3, marginTop:2 }}>{job.clientName}</div>}
          <div style={{ background:C.yellowBg, border:"1px solid #4A3F36", borderRadius:C.rSm, padding:"14px", margin:"16px 0", textAlign:"center" }}>
            <div style={{ fontSize:14, color:C.t2, fontWeight:700 }}>{modo==="entrega"?"¿Cobraste lo que faltaba?":"¿Cómo te pagó?"}</div>
            <div style={{ fontSize:32, fontWeight:900, color:C.yellow, letterSpacing:-.5 }}>{fmtMoney(monto)}</div>
            {Number(job.deposit)>0 && <div style={{ fontSize:12, color:C.t3 }}>Total {fmtMoney(job.price)} · adelanto {fmtMoney(job.deposit)}</div>}
          </div>
          <div style={{ display:"flex", gap:10, marginBottom:10 }}>
            <button onClick={()=>resolverCobro("efectivo")} style={{ ...btn, background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none" }}><Banknote size={24} aria-hidden="true" />Efectivo</button>
            <button onClick={()=>resolverCobro("qr")} style={{ ...btn, background:"#FFF0DE", color:"#191513", border:"none" }}><QrCode size={24} aria-hidden="true" />QR / transferencia</button>
          </div>
          {modo==="entrega" && <button onClick={()=>resolverCobro(null)} style={{ width:"100%", minHeight:48, background:C.bg3, color:C.t1, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:6 }}>Todavía no pagó · queda debiendo</button>}
          <button onClick={()=>setCobro(null)} style={{ width:"100%", minHeight:44, background:"transparent", color:C.t3, border:"none", fontSize:14, fontWeight:700, cursor:"pointer" }}>Cancelar</button>
        </div>
      </div>
    );
  };

  // ── Anotar una falla ──
  const ModalFalla = () => {
    if (!falla) return null;
    const { job } = falla, kg = matCosts[job.material]||0;
    const costo = (Number(falla.gramos)||0)/1000*kg + falla.minutos/60*porHoraMaq;
    return (
      <div onClick={e=>{ if(e.target===e.currentTarget) setFalla(null); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:70, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
        <div role="dialog" aria-modal="true" aria-labelledby="falla-titulo" style={{ background:C.bg2, borderRadius:C.r, padding:"22px 20px", width:"100%", maxWidth:440, border:`1px solid ${C.bg4}`, maxHeight:"92vh", overflowY:"auto" }}>
          <div style={{ fontSize:12, color:"#FF8A6B", fontWeight:800, textTransform:"uppercase", letterSpacing:.7, marginBottom:4 }}>Anotar falla</div>
          <div id="falla-titulo" style={{ fontSize:18, fontWeight:900, color:C.t1 }}>{job.fileName}</div>
          <div style={{ fontSize:13, color:C.t3, marginTop:2 }}>{printers.find(x=>x.id===job.printer)?.name||""}</div>
          <div style={{ fontSize:14, color:C.t2, fontWeight:800, margin:"16px 0 8px" }}>¿Qué pasó?</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {MOTIVOS_FALLA.map(m=>(
              <button key={m} onClick={()=>setFalla(f=>({...f, motivo:m}))} aria-pressed={falla.motivo===m} style={{ minHeight:52, padding:"8px 10px", borderRadius:C.rSm, fontSize:14, fontWeight:800, cursor:"pointer", background:falla.motivo===m?C.orange:C.bg3, color:falla.motivo===m?"#191513":C.t1, border:`1px solid ${falla.motivo===m?C.orange:C.bg5}` }}>{m}</button>
            ))}
          </div>
          <div style={{ fontSize:14, color:C.t2, fontWeight:800, margin:"16px 0 8px" }}>Filamento perdido (gramos)</div>
          <input type="number" inputMode="numeric" value={falla.gramos} onChange={e=>setFalla(f=>({...f, gramos:e.target.value}))} style={{ ...inputSt, fontSize:18 }} />
          <div style={{ fontSize:13, color:C.t3, marginTop:6 }}>Calculado según lo que llevaba impreso ({fmtTime(falla.minutos)}). Pérdida: <b style={{ color:"#FF8A6B" }}>{fmtMoney(costo)}</b></div>
          <button onClick={registrarFalla} disabled={!falla.motivo} style={{ width:"100%", marginTop:18, minHeight:54, background:falla.motivo?`linear-gradient(135deg,${C.orange},${C.orangeD})`:C.bg4, color:falla.motivo?"#191513":C.t3, border:"none", borderRadius:C.rSm, fontSize:16, fontWeight:900, cursor:falla.motivo?"pointer":"not-allowed" }}>Anotar y volver a la cola</button>
          <button onClick={()=>setFalla(null)} style={{ width:"100%", minHeight:44, background:"transparent", color:C.t3, border:"none", fontSize:14, fontWeight:700, cursor:"pointer", marginTop:4 }}>Cancelar</button>
        </div>
      </div>
    );
  };

  // ── Buscador rápido: clientes, trabajos y pedidos web ──
  const BuscadorRapido = () => {
    if (!showBuscar) return null;
    const q = normNombre(buscarQ), qt = buscarQ.replace(/\D/g,"");
    const hay = q.length >= 2 || qt.length >= 3;
    const telOk = (t) => qt.length >= 3 && (t||"").replace(/\D/g,"").includes(qt);
    const clientesR = !hay ? [] : clients.filter(c=>normNombre(c.name).includes(q)||telOk(c.phone)).slice(0,6);
    const activo = (j) => ["printing","paused","pending","done","shipping"].includes(j.status) || j.debe ? 0 : 1;
    const trabajosR = !hay ? [] : jobs.filter(j=>normNombre(j.fileName).includes(q)||normNombre(j.clientName).includes(q)||normNombre(j.notes).includes(q)||telOk(j.clientPhone)||(qt&&j.webPedido&&String(j.webPedido)===qt.replace(/^0+/,"")))
      .sort((a,b)=>activo(a)-activo(b)||(b.createdAt||0)-(a.createdAt||0));
    const webR = !hay ? [] : pedidos.filter(p=>normNombre(p.cliente_nombre).includes(q)||telOk(p.cliente_telefono)||(qt&&String(p.id)===qt.replace(/^0+/,""))).slice(0,5);
    const fila = { display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 14px", background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.rSm, marginBottom:6, cursor:"pointer", textAlign:"left", color:"inherit", fontFamily:"inherit" };
    return (
      <div role="dialog" aria-modal="true" aria-label="Buscar" style={{ position:"fixed", inset:0, background:C.bg1, zIndex:65, overflowY:"auto" }}>
        <div style={{ position:"sticky", top:0, background:C.bg0, borderBottom:`1px solid ${C.bg4}`, padding:"calc(env(safe-area-inset-top) + 12px) 14px 12px", zIndex:2 }}>
          <div style={{ display:"flex", gap:10, alignItems:"center", maxWidth:900, margin:"0 auto" }}>
            <div style={{ position:"relative", flex:1 }}>
              <Search size={20} color={C.t3} aria-hidden="true" style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)" }} />
              <input autoFocus value={buscarQ} onChange={e=>setBuscarQ(e.target.value)} placeholder="Cliente, teléfono, producto o n.º de pedido" aria-label="Buscar"
                style={{ ...inputSt, paddingLeft:44, fontSize:16, background:C.bg3, borderColor:C.orange }} />
            </div>
            <button onClick={()=>setShowBuscar(false)} aria-label="Cerrar búsqueda" style={{ width:46, height:46, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, color:C.t1, cursor:"pointer", flexShrink:0 }}><X size={22} aria-hidden="true" /></button>
          </div>
        </div>
        <div style={{ maxWidth:900, margin:"0 auto", padding:"16px 14px 60px" }}>
          {!hay && <div style={{ textAlign:"center", color:C.t3, fontSize:14, padding:"40px 10px", lineHeight:1.6 }}>Escribí al menos 2 letras o 3 números.<br/>Busca en clientes, teléfonos, productos, notas y pedidos de la web.</div>}
          {hay && !clientesR.length && !trabajosR.length && !webR.length && <Empty icon="🔍" title="Sin resultados" sub={`Nada coincide con "${buscarQ}"`} />}
          {clientesR.length>0 && <>{SectionLabel({color:C.t3, children:<>Clientes</>})}
            {clientesR.map(c=>{ const deb=c.jobs.reduce((t,j)=>t+porCobrarDe(j),0); return (
              <button key={c.key} onClick={()=>{ setSelectedClient(c.key); setShowBuscar(false); setView("clients"); }} style={fila}>
                <div style={{ width:40, height:40, borderRadius:"50%", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:900, color:"#191513", flexShrink:0 }}>{initials(c.name)}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:C.t1 }}>{c.name}</div>
                  <div style={{ fontSize:12, color:C.t3 }}>{c.phone||"Sin teléfono"} · {c.totalJobs} pedido{c.totalJobs!==1?"s":""}{c.active?` · ${c.active} en proceso`:""}</div>
                </div>
                {deb>0 && <span style={{ fontSize:12, color:C.yellow, fontWeight:800, flexShrink:0 }}>Por cobrar {fmtMoney(deb)}</span>}
                <ChevronRight size={18} color={C.t3} aria-hidden="true" />
              </button>); })}
          </>}
          {webR.length>0 && <>{SectionLabel({color:C.t3, children:<>Pedidos de la web</>})}
            {webR.map(p=>(
              <button key={p.id} onClick={()=>{ setShowBuscar(false); setView("web"); }} style={fila}>
                <Globe size={20} color={C.orange} aria-hidden="true" />
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:800, color:C.t1 }}>{numPedido(p)} · {p.cliente_nombre||"Sin nombre"}</div>
                  <div style={{ fontSize:12, color:C.t3 }}>{p.estado}{Number(p.total)>0?` · ${fmtMoney(p.total)}`:""}</div>
                </div>
                <ChevronRight size={18} color={C.t3} aria-hidden="true" />
              </button>))}
          </>}
          {trabajosR.length>0 && <>{SectionLabel({color:C.t3, children:<>Trabajos ({trabajosR.length})</>})}
            <div className="cards-grid">{trabajosR.slice(0, lim("buscar:"+q)).map(j=><Fragment key={j.id}>{JobCard({job:j})}</Fragment>)}</div>
            {VerMas("buscar:"+q, trabajosR.length)}
          </>}
        </div>
      </div>
    );
  };

  return (
    kioskMode ? <>{KioskView()}{DetalleKiosco()}{CartelPedido()}{ModalCobro()}{ModalFalla()}</> :
    <div style={{ fontFamily:FUENTE_TEXTO, background:C.bg1, minHeight:"100vh", color:C.t1, display:"flex", flexDirection:"column" }}>
      {/* ── HEADER ── */}
      <div ref={cabRef} style={{ background:C.bg0, padding:"14px 18px 12px", position:"sticky", top:0, zIndex:10, borderBottom:`1px solid ${C.bg4}` }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", maxWidth: isDesktop?"100%":isTablet?"100%":430, margin:"0 auto", padding: isDesktop?"0 12px":isTablet?"0 8px":"0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:11 }}>
            <div style={{ width:40, height:40, borderRadius:12, overflow:"hidden", border:`1px solid ${C.orange}44`, flexShrink:0 }}>
              <img src={ISOTIPO} alt="W3D" style={{ width:"100%", height:"100%", objectFit:"contain" }} />
            </div>
            <div>
              <div className="w3d-titulo" style={{ fontSize:17, fontWeight:900, color:C.t1, letterSpacing:1.5, display:"flex", alignItems:"center", gap:8 }}>
                <span>WORLD<span style={{ color:C.orange }}>3D</span></span>
                {needs_attention>0 && <div style={{ width:8, height:8, borderRadius:"50%", background:C.green, boxShadow:`0 0 8px ${C.green}` }} />}
              </div>
              <div style={{ fontSize:12, color:C.t3, marginTop:1 }}>{jobs.length} trabajos · {clients.length} clientes · {shipping.length+done.length} por entregar</div>
            </div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={()=>{ setBuscarQ(""); setShowBuscar(true); }} aria-label="Buscar" title="Buscar ( / )" style={{ width:42, height:38, display:"flex", alignItems:"center", justifyContent:"center", background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, color:C.t1, cursor:"pointer" }}><Search size={20} aria-hidden="true" /></button>
            <div style={{ display:"flex", borderRadius:C.rSm, overflow:"hidden", boxShadow:`0 3px 16px rgba(241,132,27,.4)` }}>
              <button onClick={()=>abrirNuevoTrabajo()} aria-label={leerBorr(BORR.trabajo)?"Nuevo trabajo (tenés un borrador)":"Nuevo trabajo"} style={{ position:"relative", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", padding:"0 16px", height:38, fontSize:22, fontWeight:900, cursor:"pointer", lineHeight:1 }}>+{!showForm && leerBorr(BORR.trabajo) && <span aria-hidden="true" style={{ position:"absolute", top:5, right:5, width:9, height:9, borderRadius:"50%", background:"#191513", boxShadow:"0 0 0 2px #FFF7F3" }} />}</button>
              <div style={{ width:1, background:"rgba(0,0,0,.3)" }} />
              <button onClick={openMultiForm} title="Pedido con múltiples productos" style={{ position:"relative", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", padding:"0 13px", height:38, fontSize:16, fontWeight:800, cursor:"pointer", lineHeight:1 }}>⊞{!showForm && leerBorr(BORR.pedido) && <span aria-hidden="true" style={{ position:"absolute", top:5, right:5, width:9, height:9, borderRadius:"50%", background:"#191513", boxShadow:"0 0 0 2px #FFF7F3" }} />}</button>
            </div>
          </div>
        </div>
      </div>

      {!enLinea && (
        <div role="status" style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8, background:C.redBg, borderBottom:`1px solid #5C1F14`, color:C.t1, fontSize:13, fontWeight:700, padding:"8px 14px", textAlign:"center" }}>
          <WifiOff size={16} color={C.red} aria-hidden="true" />
          Sin conexión · lo que hagas se guarda en este dispositivo y se sube solo cuando vuelva la señal
        </div>
      )}
      {/* ── BODY (sidebar + content) ── */}
      <div style={{ display:"flex", flex:1 }}>

        {/* ── SIDEBAR NAV (tablet/desktop) ── */}
        {!isMobile && (
          <div style={{ width: isDesktop?220:72, background:C.bg0, borderRight:`1px solid ${C.bg4}`, display:"flex", flexDirection:"column", position:"sticky", top:"var(--w3d-cab, 68px)", height:"calc(100vh - var(--w3d-cab, 68px))", alignSelf:"flex-start", overflowY:"auto", flexShrink:0, zIndex:9 }}>
            <div style={{ padding: isDesktop?"12px 10px":"12px 6px", display:"flex", flexDirection:"column", gap:4, flex:1 }}>
              {TABS.map(({ key, Icon, label, badge, urgente }) => {
                const isActive = view===key;
                return (
                  <button key={key} onClick={()=>irA(key)} aria-current={isActive?"page":undefined} aria-label={badge?`${label}, ${badge} pendientes`:label}
                    style={{ position:"relative", display:"flex", flexDirection:isDesktop?"row":"column", alignItems:"center", gap:isDesktop?12:4, justifyContent:isDesktop?"flex-start":"center", padding: isDesktop?"11px 14px":"10px 0 8px", borderRadius:C.rMd, border:"none", background:isActive?`${C.orange}1F`:"transparent", cursor:"pointer", width:"100%", transition:"background .15s" }}
                    onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background=C.bg3}}
                    onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background="transparent"}}>
                    <span style={{ position:"relative", display:"inline-flex" }}>
                      <Icon size={22} strokeWidth={isActive?2.4:1.8} color={isActive?C.orange:C.t2} aria-hidden="true" />
                      <Insignia n={badge} urgente={urgente} />
                    </span>
                    <span style={{ fontSize:isDesktop?14:12, fontWeight:isActive?800:600, color:isActive?C.orange:C.t2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:"100%" }}>{label}</span>
                    {isActive && <span style={{ position:"absolute", left:0, top:"20%", bottom:"20%", width:3, background:C.orange, borderRadius:"0 3px 3px 0" }} />}
                  </button>
                );
              })}
            </div>
            {/* Kiosk + export in sidebar */}
            <div style={{ padding: isDesktop?"10px":"8px 6px", borderTop:`1px solid ${C.bg4}`, display:"flex", flexDirection:"column", gap:6 }}>
              <button onClick={()=>exportExcel(jobs,printers)} style={{ display:"flex", flexDirection:isDesktop?"row":"column", alignItems:"center", gap:isDesktop?10:0, justifyContent:isDesktop?"flex-start":"center", padding: isDesktop?"10px 14px":"10px 0", borderRadius:C.rMd, background:"none", border:"none", color:C.green, cursor:"pointer", fontSize:isDesktop?13:18, fontWeight:700, width:"100%" }}>
                <FileSpreadsheet size={20} color={C.green} aria-hidden="true" />{isDesktop?" Exportar":<span style={{ fontSize:12 }}>Excel</span>}
              </button>
              <button onClick={()=>setKioskMode(true)} style={{ display:"flex", flexDirection:isDesktop?"row":"column", alignItems:"center", gap:isDesktop?10:0, justifyContent:isDesktop?"flex-start":"center", padding: isDesktop?"10px 14px":"10px 0", borderRadius:C.rMd, background:"none", border:"none", color:C.t3, cursor:"pointer", fontSize:isDesktop?13:18, fontWeight:700, width:"100%" }}>
                <MonitorSmartphone size={20} color={C.t2} aria-hidden="true" />{isDesktop?" Modo kiosco":<span style={{ fontSize:12 }}>Kiosco</span>}
              </button>
            </div>
          </div>
        )}

        {/* ── MAIN CONTENT ── */}
        <div style={{ flex:1, overflowY:"auto", paddingBottom: isMobile?90:0 }}>
          {/* ── CONTENT ── */}
          {loading ? (
            <div style={{ textAlign:"center", padding:"80px 20px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:12, justifyContent:"center", marginBottom:20 }}>
                <img src={ISOTIPO} alt="" style={{ width:44, height:52, objectFit:"contain" }} />
                <div className="w3d-titulo" style={{ fontSize:26, fontWeight:900, color:C.t1, letterSpacing:1 }}>WORLD<span style={{ color:C.orange }}>3D</span></div>
              </div>
              <div style={{ fontSize:15, color:C.t2, fontWeight:700 }}>Cargando la cola…</div>
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginTop:16 }}>
                {[0,150,300].map(d=>(
                  <div key={d} style={{ width:8, height:8, borderRadius:"50%", background:C.orange, animation:`pulse .9s ease-in-out ${d}ms infinite alternate` }} />
                ))}
              </div>
              <style>{`@keyframes pulse{0%{opacity:.2;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}`}</style>
            </div>
          ) : (
            <div style={{ width:"100%" }}>
              {views[view]}
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM NAV (celu): 4 principales + Más ── */}
      {isMobile && (
      <nav aria-label="Secciones" style={{ position:"fixed", bottom:0, left:0, right:0, background:C.bg0, borderTop:`1px solid ${C.bg4}`, zIndex:10, display:"flex", padding:"6px 6px calc(env(safe-area-inset-bottom) + 8px)" }}>
        {[...TABS.filter(t=>!t.extra), { key:"__mas", Icon:MoreHorizontal, label:"Más" }].map(({ key, Icon, label, badge, urgente }) => {
          const enMas = TABS.some(t=>t.extra && t.key===view);
          const isActive = key==="__mas" ? (showMas || enMas) : view===key;
          return (
            <button key={key} aria-label={badge?`${label}, ${badge} pendientes`:label} onClick={()=> key==="__mas" ? setShowMas(v=>!v) : irA(key)} aria-current={isActive&&key!=="__mas"?"page":undefined} aria-expanded={key==="__mas"?showMas:undefined}
              style={{ flex:1, position:"relative", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, minHeight:52, border:"none", background:"transparent", cursor:"pointer" }}>
              <span style={{ position:"relative", display:"inline-flex", alignItems:"center", justifyContent:"center", width:52, height:30, borderRadius:15, background:isActive?`${C.orange}26`:"transparent", transition:"background .2s" }}>
                <Icon size={22} strokeWidth={isActive?2.4:1.8} color={isActive?C.orange:C.t2} aria-hidden="true" />
                <Insignia n={badge} urgente={urgente} />
              </span>
              <span style={{ fontSize:12, fontWeight:isActive?800:600, color:isActive?C.orange:C.t2 }}>{label}</span>
            </button>
          );
        })}
      </nav>
      )}
      {isMobile && showMas && (
        <div onClick={e=>{ if(e.target===e.currentTarget) setShowMas(false); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:9 }}>
          <div role="menu" aria-label="Más secciones" style={{ position:"absolute", left:10, right:10, bottom:"calc(env(safe-area-inset-bottom) + 80px)", background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:10, boxShadow:"0 -8px 30px rgba(0,0,0,.5)", animation:"w3dSube .2s ease-out" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {TABS.filter(t=>t.extra).map(({ key, Icon, label }) => (
                <button key={key} role="menuitem" onClick={()=>irA(key)} style={{ display:"flex", alignItems:"center", gap:10, padding:"14px", minHeight:52, borderRadius:C.rMd, border:`1px solid ${view===key?C.orange:C.bg4}`, background:view===key?`${C.orange}1F`:C.bg3, color:view===key?C.orange:C.t1, fontSize:15, fontWeight:700, cursor:"pointer" }}>
                  <Icon size={20} aria-hidden="true" />{label}
                </button>
              ))}
              <button role="menuitem" onClick={()=>{ setShowMas(false); exportExcel(jobs,printers); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"14px", minHeight:52, borderRadius:C.rMd, border:`1px solid ${C.bg4}`, background:C.bg3, color:C.green, fontSize:15, fontWeight:700, cursor:"pointer" }}>
                <FileSpreadsheet size={20} aria-hidden="true" />Exportar Excel
              </button>
              <button role="menuitem" onClick={()=>{ setShowMas(false); setKioskMode(true); }} style={{ display:"flex", alignItems:"center", gap:10, padding:"14px", minHeight:52, borderRadius:C.rMd, border:`1px solid ${C.bg4}`, background:C.bg3, color:C.t1, fontSize:15, fontWeight:700, cursor:"pointer" }}>
                <MonitorSmartphone size={20} aria-hidden="true" />Modo kiosco
              </button>
            </div>
            <button onClick={()=>setShowMas(false)} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, width:"100%", marginTop:8, minHeight:44, border:"none", background:"transparent", color:C.t3, fontSize:14, fontWeight:700, cursor:"pointer" }}><X size={16} aria-hidden="true" />Cerrar</button>
          </div>
          <style>{`@keyframes w3dSube{from{transform:translateY(16px);opacity:0}to{transform:none;opacity:1}}`}</style>
        </div>
      )}

      {/* ── FORM: NUEVO TRABAJO ── */}
      {showForm && !multiMode && (
        <div style={overlayStyle} onClick={e=>{if(e.target===e.currentTarget) cerrarForm(false);}}>
          <div style={sheetStyle}>
            <div style={handleStyle} />
            <div style={{ fontSize:19, fontWeight:900, color:C.t1, marginBottom:4 }}>{editJob?"Editar trabajo":"➕ Nuevo trabajo"}</div>
            <div style={{ fontSize:13, color:C.t3, marginBottom:16 }}>{editJob?"Modifica los datos del trabajo":"Completa los datos para agregar a la cola"}</div>
            {borradorAviso && (
              <div role="status" style={{ display:"flex", alignItems:"center", gap:10, background:C.orangeBg, border:`1px solid ${C.orange}55`, borderRadius:C.rSm, padding:"10px 10px 10px 14px", marginBottom:16 }}>
                <div style={{ flex:1, fontSize:13, color:C.t1, fontWeight:700 }}>Seguís con tu borrador <span style={{ color:C.t3, fontWeight:600 }}>({new Date(borradorAviso).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}{Date.now()-borradorAviso>DIA?`, ${haceDias(borradorAviso)}`:""})</span></div>
                <button onClick={empezarDeCero} style={{ minHeight:38, padding:"0 12px", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}>{editJob?"Descartar cambios":"Empezar de cero"}</button>
              </div>
            )}

            {/* Job type selector */}
            <div style={{ display:"flex", gap:8, marginBottom:20 }}>
              <button onClick={()=>setForm(f=>({...f,jobType:"print"}))} style={{ flex:1, padding:"14px 0", borderRadius:C.rMd, border:`2px solid ${form.jobType==="print"?C.orange:C.bg5}`, background:form.jobType==="print"?C.orangeBg:C.bg3, cursor:"pointer", textAlign:"center" }}>
                <div style={{ fontSize:22 }}><Icono e="🖨" size={24} /></div>
                <div style={{ fontSize:13, fontWeight:900, color:form.jobType==="print"?C.orange:C.t2, marginTop:4 }}>Impresión 3D</div>
              </button>
              <button onClick={()=>setForm(f=>({...f,jobType:"design"}))} style={{ flex:1, padding:"14px 0", borderRadius:C.rMd, border:`2px solid ${form.jobType==="design"?"#E9521E":C.bg5}`, background:form.jobType==="design"?"#2E1309":C.bg3, cursor:"pointer", textAlign:"center" }}>
                <div style={{ fontSize:22 }}><Icono e="🎨" size={24} /></div>
                <div style={{ fontSize:13, fontWeight:900, color:form.jobType==="design"?"#FFF0DE":C.t2, marginTop:4 }}>Diseño 3D</div>
              </button>
            </div>

            <FormDivider label="Detalles del archivo" />
            <FormField label="Nombre del archivo *">
              <div style={{ position:"relative" }}>
                <input style={inputSt} placeholder="ej: soporte_mesa_v2.stl" value={form.fileName} autoComplete="off"
                  onChange={e=>{ setForm(f=>({...f,fileName:e.target.value})); setProdSugOpen(true); }}
                  onFocus={()=>setProdSugOpen(true)}
                  onBlur={()=>setTimeout(()=>setProdSugOpen(false),150)}
                />
                {prodSugOpen&&form.fileName.trim().length>=1&&(()=>{
                  const q=form.fileName.toLowerCase();
                  const matches=products.filter(p=>p.name.toLowerCase().includes(q));
                  if(matches.length===0) return null;
                  return (
                    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:C.bg3, border:`1.5px solid ${C.orange}55`, borderRadius:C.rMd, zIndex:99, marginTop:4, overflow:"hidden", boxShadow:"0 12px 36px rgba(0,0,0,.7)" }}>
                      <div style={{ fontSize:12, color:C.t3, fontWeight:800, textTransform:"uppercase", letterSpacing:.8, padding:"8px 14px 4px" }}>Productos guardados</div>
                      {matches.slice(0,5).map(prod=>(
                        <div key={prod.id} onMouseDown={()=>{
                          setForm(f=>({
                            ...f,
                            fileName: prod.name,
                            material: prod.material||f.material,
                            color:    prod.color||f.color,
                            weight:   prod.weight||f.weight,
                            duration: prod.duration||f.duration,
                            price:    prod.price||f.price,
                            unitPrice:prod.price||f.unitPrice,
                            notes:    prod.notes||f.notes,
                          }));
                          setProdSugOpen(false);
                        }} style={{ padding:"11px 14px", cursor:"pointer", borderTop:`1px solid ${C.bg5}`, display:"flex", alignItems:"center", gap:11 }}
                          onMouseEnter={e=>e.currentTarget.style.background=C.bg4}
                          onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{ width:36, height:36, borderRadius:10, background:C.orangeBg, border:`1px solid ${C.orange}44`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}><Icono e="📦" size={20} /></div>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{prod.name}</div>
                            <div style={{ fontSize:12, color:C.t3, marginTop:1 }}>
                              {prod.material&&<span>{prod.material} </span>}
                              {prod.color&&<span>· {prod.color} </span>}
                              {prod.duration>0&&<span>· {fmtTime(Number(prod.duration))} </span>}
                              {prod.weight>0&&<span>· {prod.weight}g</span>}
                            </div>
                          </div>
                          {prod.price&&<div style={{ fontSize:14, fontWeight:900, color:C.green, flexShrink:0 }}>Bs. {Number(prod.price).toFixed(2)}</div>}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </FormField>
            {form.jobType!=="design" && <FormField label="Impresora">
              <select style={inputSt} value={form.printer} onChange={e=>setForm(f=>({...f,printer:e.target.value}))}>
                {printers.map(p => {
                  const info=getPrinterQueueInfo(p.id);
                  const waitStr=info.totalWait>0?` — cola: ${Math.floor(info.totalWait/60)>0?Math.floor(info.totalWait/60)+"h ":""}${info.totalWait%60>0?(info.totalWait%60)+"min":""}`:" — libre";
                  return <option key={p.id} value={p.id}>{p.name} ({p.type}){waitStr}</option>;
                })}
              </select>
            </FormField>}
            {form.jobType!=="design" && <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormField label="Material">
                <select style={inputSt} value={form.material} onChange={e=>setForm(f=>({...f,material:e.target.value}))}>
                  <option value="">Seleccionar...</option>
                  {MATERIALS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Color">
                <select style={inputSt} value={form.color} onChange={e=>elegirColor(e.target.value, v=>setForm(f=>({...f,color:v})))}>
                  <option value="">Seleccionar...</option>
                  {opcionesColor(form.color)}
                </select>
              </FormField>
            </div>}
            <div style={{ display:"grid", gridTemplateColumns:form.jobType==="design"?"1fr":"1fr 1fr", gap:10 }}>
              <FormField label={form.jobType==="design"?"Tiempo estimado (min)":"Duración (min)"}>
                <input style={inputSt} type="number" placeholder={form.jobType==="design"?"60":"240"} value={form.duration} onChange={e=>setForm(f=>({...f,duration:e.target.value}))} />
              </FormField>
              {form.jobType!=="design" && <FormField label="Peso (g)">
                <input style={inputSt} type="number" placeholder="85" value={form.weight} onChange={e=>setForm(f=>({...f,weight:e.target.value}))} />
              </FormField>}
            </div>

            {form.duration&&Number(form.duration)>0&&form.printer&&(()=>{
              const selP=printers.find(p=>p.id===form.printer);
              const selInfo=getPrinterQueueInfo(form.printer);
              const readyAt=getEstimatedReady(form.printer,form.duration);
              const bestFDM=suggestBestPrinter(selP?.type||"FDM");
              const isBest=bestFDM?.id===form.printer;
              const bestReady=bestFDM?getEstimatedReady(bestFDM.id,form.duration):null;
              return (
                <div style={{ marginBottom:16 }}>
                  <div style={{ background:"linear-gradient(135deg,#221D1B,#221D1B)", border:"1px solid #372F2C", borderRadius:C.rMd, padding:"14px 16px", marginBottom:8 }}>
                    <div style={{ fontSize:12, color:"#F1841B", fontWeight:800, textTransform:"uppercase", letterSpacing:.7, marginBottom:6 }}>Estimado listo — {selP?.name}</div>
                    <div style={{ fontSize:20, fontWeight:900, color:C.t1, marginBottom:6 }}>{fmtReadyDate(readyAt)}</div>
                    <div style={{ display:"flex", gap:10, fontSize:12, color:C.t3, flexWrap:"wrap" }}>
                      {selInfo.activeJob&&<span>Imprimiendo: {fmtTime(selInfo.activeMins)}</span>}
                      {selInfo.queueCount>0&&<span>Cola: {selInfo.queueCount} trabajo{selInfo.queueCount>1?"s":""} ({fmtTime(selInfo.queuedMins)})</span>}
                      {selInfo.totalWait===0&&<span style={{ color:C.green }}>Libre — empieza de inmediato</span>}
                    </div>
                  </div>
                  {!isBest&&bestFDM&&bestReady&&(
                    <div style={{ background:C.greenBg, border:`1px solid ${C.greenD}33`, borderRadius:C.rSm, padding:"10px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <span style={{ fontSize:15 }}><Icono e="💡" size={17} /></span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:800, color:C.green }}>Más rápida: {bestFDM.name}</div>
                        <div style={{ fontSize:12, color:C.t3 }}>Lista {fmtReadyDate(bestReady)}</div>
                      </div>
                      <button onClick={()=>setForm(f=>({...f,printer:bestFDM.id}))} style={{ padding:"7px 13px", background:C.green, color:"#000", border:"none", borderRadius:C.rXs, fontSize:12, fontWeight:900, cursor:"pointer" }}>Usar</button>
                    </div>
                  )}
                </div>
              );
            })()}

            <FormField label="Estado inicial">
              <select style={inputSt} value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                <option value="pending">Pendiente — en cola</option>
                <option value="printing">Imprimiendo ahora</option>
                <option value="paused">Pausado</option>
                <option value="done">Listo para entregar</option>
                <option value="shipping">Listo para envío</option>
                <option value="shipped">Ya entregado</option>
              </select>
            </FormField>

            <FormDivider label="Cliente" />
            <FormField label="Nombre del cliente">
              <div style={{ position:"relative" }}>
                <input style={inputSt} placeholder="ej: Juan Pérez" value={form.clientName} autoComplete="off" onChange={e=>{setForm(f=>({...f,clientName:e.target.value}));setClientSugOpen(true);}} onFocus={()=>setClientSugOpen(true)} onBlur={()=>setTimeout(()=>setClientSugOpen(false),150)} />
                {clientSugOpen&&form.clientName.trim().length>=1&&(()=>{
                  const q=form.clientName.toLowerCase();
                  const matches=clients.filter(c=>c.name.toLowerCase().includes(q));
                  if(matches.length===0) return null;
                  return (
                    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:C.bg3, border:`1.5px solid ${C.orange}55`, borderRadius:C.rMd, zIndex:99, marginTop:4, overflow:"hidden", boxShadow:"0 12px 36px rgba(0,0,0,.7)" }}>
                      <div style={{ fontSize:12, color:C.t3, fontWeight:800, textTransform:"uppercase", letterSpacing:.8, padding:"8px 14px 4px" }}>Clientes anteriores</div>
                      {matches.slice(0,5).map(c=>(
                        <div key={c.name} onMouseDown={()=>{setForm(f=>({...f,clientName:c.name,clientPhone:c.phone||f.clientPhone}));setClientSugOpen(false);}} style={{ padding:"11px 14px", cursor:"pointer", borderTop:`1px solid ${C.bg5}`, display:"flex", alignItems:"center", gap:11 }} onMouseEnter={e=>e.currentTarget.style.background=C.bg4} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{ width:34, height:34, borderRadius:"50%", background:`linear-gradient(135deg,${C.orange}88,${C.orangeD}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:900, color:"#fff", flexShrink:0 }}>{c.name.split(" ").slice(0,2).map(w=>w[0]?.toUpperCase()||"").join("")}</div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{c.name}</div>
                            <div style={{ fontSize:12, color:C.t3 }}>{c.phone||"Sin tel."} · {c.totalJobs} pedido{c.totalJobs!==1?"s":""}</div>
                          </div>
                          <div style={{ marginLeft:"auto", fontSize:12, color:C.orange, fontWeight:700 }}>Seleccionar</div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </FormField>
            <FormField label="Teléfono (para WhatsApp)">
              <input style={inputSt} placeholder="+591 77123456" value={form.clientPhone} onChange={e=>setForm(f=>({...f,clientPhone:e.target.value}))} />
            </FormField>

            <FormDivider label="Fecha y hora de entrega" />
            <FormField label="¿Cuándo se lo entregas?" hint="Opcional. Ponela solo si acordaste un día con el cliente: así Inicio te avisa lo que vence hoy y lo atrasado.">
              {form.deliveryAt
                ? <DateTimePicker value={form.deliveryAt} onChange={v=>setForm(f=>({...f,deliveryAt:v}))} />
                : <BotonPonerFecha onClick={()=>setForm(f=>({...f,deliveryAt:fechaPropuesta()}))} />}
              {form.deliveryAt && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
                  <div style={{ fontSize:12, color:"#F1841B", fontWeight:700 }}>{new Date(form.deliveryAt).toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit"})}</div>
                  <button onClick={()=>setForm(f=>({...f,deliveryAt:null}))} style={{ fontSize:12, color:C.t4, background:"none", border:"none", cursor:"pointer", padding:"2px 6px" }}>✕ Quitar</button>
                </div>
              )}
            </FormField>

            <FormDivider label="Precio" />
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormField label="Cantidad de piezas">
                <input style={inputSt} type="number" min="1" placeholder="1" value={form.quantity} onChange={e=>{const q=e.target.value;setForm(f=>({...f,quantity:q,price:q&&f.unitPrice?(Number(q)*Number(f.unitPrice)).toFixed(2):f.price}));}} />
              </FormField>
              <FormField label="Precio por unidad (Bs.)">
                <input style={inputSt} type="number" placeholder="0.00" value={form.unitPrice} onChange={e=>{const u=e.target.value;setForm(f=>({...f,unitPrice:u,price:u&&f.quantity?(Number(f.quantity)*Number(u)).toFixed(2):f.price}));}} />
              </FormField>
            </div>
            {Number(form.quantity)>1&&form.unitPrice&&(
              <div style={{ background:C.greenBg, border:`1px solid ${C.greenD}33`, borderRadius:C.rSm, padding:"11px 14px", marginBottom:16, fontSize:14, color:C.green, fontWeight:800, textAlign:"center" }}>
                {form.quantity} × Bs.{Number(form.unitPrice).toFixed(2)} = Bs.{(Number(form.quantity)*Number(form.unitPrice)).toFixed(2)}
              </div>
            )}
            <FormField label="Precio total (Bs.)" hint="Calculado automáticamente, o ajústalo manualmente">
              <input style={inputSt} type="number" placeholder="0.00" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))} />
            </FormField>
            <FormField label="Adelanto recibido (Bs.)" hint="¿El cliente ya pagó algo? Déjalo en 0 si no hay adelanto">
              <input style={inputSt} type="number" placeholder="0.00" value={form.deposit} onChange={e=>setForm(f=>({...f,deposit:e.target.value}))} />
            </FormField>
            {form.deposit&&Number(form.deposit)>0&&form.price&&Number(form.price)>0&&(()=>{
              const pend=Number(form.price)-Number(form.deposit);
              return (
                <div style={{ background:pend>0?C.yellowBg:C.greenBg, border:`1px solid ${pend>0?"#4A3F36":C.greenD+"33"}`, borderRadius:C.rSm, padding:"11px 14px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div><div style={{ fontSize:12, color:C.t3, marginBottom:2 }}>Adelanto</div><div style={{ fontSize:15, fontWeight:800, color:"#F1841B" }}>{fmtMoney(Number(form.deposit))}</div></div>
                  <div style={{ fontSize:18, color:C.t4 }}>→</div>
                  <div style={{ textAlign:"right" }}><div style={{ fontSize:12, color:C.t3, marginBottom:2 }}>{pend>0?"Por cobrar":"Pagado"}</div><div style={{ fontSize:15, fontWeight:800, color:pend>0?C.yellow:C.green }}>{pend>0?fmtMoney(pend):"Bs. 0.00"}</div></div>
                </div>
              );
            })()}
            <FormField label="Notas">
              <input style={inputSt} placeholder="Instrucciones especiales..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))} />
            </FormField>

            <button onClick={submitJob} disabled={guardando} aria-busy={guardando||undefined} style={{ opacity:guardando?.6:1, cursor:guardando?"wait":"pointer", width:"100%", padding:"16px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.r, fontSize:16, fontWeight:900, cursor:"pointer", marginTop:4, boxShadow:`0 6px 24px rgba(241,132,27,.4)` }}>
              {editJob?"Guardar cambios":"Agregar a la cola"}
            </button>
            <button onClick={()=>cerrarForm(true)} style={{ width:"100%", padding:"14px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.r, fontSize:14, fontWeight:700, cursor:"pointer", marginTop:8 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── FORM: PEDIDO MÚLTIPLE ── */}
      {showForm && multiMode && (
        <div style={overlayStyle} onClick={e=>{if(e.target===e.currentTarget) cerrarForm(false);}}>
          <div style={sheetStyle}>
            <div style={handleStyle} />
            <div style={{ fontSize:19, fontWeight:900, color:C.t1, marginBottom:4 }}>Pedido con múltiples productos</div>
            <div style={{ fontSize:13, color:C.t3, marginBottom:20 }}>Agrupa varios productos en un solo pedido para un cliente</div>
            {borradorAviso && (
              <div role="status" style={{ display:"flex", alignItems:"center", gap:10, background:C.orangeBg, border:`1px solid ${C.orange}55`, borderRadius:C.rSm, padding:"10px 10px 10px 14px", marginBottom:16 }}>
                <div style={{ flex:1, fontSize:13, color:C.t1, fontWeight:700 }}>Seguís con tu borrador <span style={{ color:C.t3, fontWeight:600 }}>({new Date(borradorAviso).toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"})}{Date.now()-borradorAviso>DIA?`, ${haceDias(borradorAviso)}`:""})</span></div>
                <button onClick={empezarDeCero} style={{ minHeight:38, padding:"0 12px", background:C.bg3, color:C.t2, border:`1px solid ${C.bg5}`, borderRadius:C.rSm, fontSize:13, fontWeight:800, cursor:"pointer", flexShrink:0 }}>{editJob?"Descartar cambios":"Empezar de cero"}</button>
              </div>
            )}

            {/* Client section */}
            <FormDivider label="Cliente del pedido" />
            <FormField label="Nombre del cliente">
              <div style={{ position:"relative" }}>
                <input style={inputSt} placeholder="ej: Juan Pérez" value={orderClient.name} autoComplete="off"
                  onChange={e=>{setOrderClient(c=>({...c,name:e.target.value}));setOrderClientSugOpen(true);}}
                  onFocus={()=>setOrderClientSugOpen(true)} onBlur={()=>setTimeout(()=>setOrderClientSugOpen(false),150)} />
                {orderClientSugOpen&&orderClient.name.trim().length>=1&&(()=>{
                  const q=orderClient.name.toLowerCase();
                  const matches=clients.filter(c=>c.name.toLowerCase().includes(q));
                  if(!matches.length) return null;
                  return (
                    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:C.bg3, border:`1.5px solid ${C.orange}55`, borderRadius:C.rMd, zIndex:99, marginTop:4, overflow:"hidden", boxShadow:"0 12px 36px rgba(0,0,0,.7)" }}>
                      {matches.slice(0,4).map(c=>(
                        <div key={c.name} onMouseDown={()=>{setOrderClient(oc=>({...oc,name:c.name,phone:c.phone||oc.phone}));setOrderClientSugOpen(false);}} style={{ padding:"10px 14px", cursor:"pointer", borderBottom:`1px solid ${C.bg5}`, display:"flex", alignItems:"center", gap:10 }} onMouseEnter={e=>e.currentTarget.style.background=C.bg4} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,${C.orange}88,${C.orangeD}88)`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, color:"#fff" }}>{initials(c.name)}</div>
                          <div><div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{c.name}</div><div style={{ fontSize:12, color:C.t3 }}>{c.phone||"Sin tel."}</div></div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </FormField>
            <FormField label="Teléfono">
              <input style={inputSt} placeholder="+591 77123456" value={orderClient.phone} onChange={e=>setOrderClient(c=>({...c,phone:e.target.value}))} />
            </FormField>

            <FormDivider label="Fecha de entrega" />
            <FormField label="¿Cuándo se lo entregas?" hint="Se aplica a todos los productos del pedido">
              {orderClient.deliveryAt
                ? <DateTimePicker value={orderClient.deliveryAt} onChange={v=>setOrderClient(c=>({...c,deliveryAt:v}))} />
                : <BotonPonerFecha onClick={()=>setOrderClient(c=>({...c,deliveryAt:fechaPropuesta()}))} />}
              {orderClient.deliveryAt && (
                <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:8 }}>
                  <div style={{ fontSize:12, color:"#F1841B", fontWeight:700 }}>{new Date(orderClient.deliveryAt).toLocaleDateString("es-ES",{weekday:"long",day:"2-digit",month:"long",hour:"2-digit",minute:"2-digit"})}</div>
                  <button onClick={()=>setOrderClient(c=>({...c,deliveryAt:null}))} style={{ fontSize:12, color:C.t4, background:"none", border:"none", cursor:"pointer" }}>✕ Quitar</button>
                </div>
              )}
            </FormField>

            {/* Items section */}
            <FormDivider label="Productos del pedido" />
            <div style={{ display:"flex", flexDirection:"column", gap:10, marginBottom:14 }}>
              {orderItems.map((item,idx)=>(
                <div key={item.id} style={{ background:C.bg3, borderRadius:C.rMd, border:`1px solid ${C.bg5}`, overflow:"hidden" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderBottom:`1px solid ${C.bg5}`, background:C.bg4 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:C.orange }}>Producto {idx+1}</span>
                    {orderItems.length>1 && <button onClick={()=>removeOrderItem(item.id)} style={{ fontSize:13, color:C.red, background:"none", border:"none", cursor:"pointer", fontWeight:800 }}>✕ Quitar</button>}
                  </div>
                  <div style={{ padding:"12px 14px", display:"flex", flexDirection:"column", gap:10 }}>
                    {/* Name with product autocomplete */}
                    <div style={{ position:"relative" }}>
                      <input style={{ ...inputSt, fontSize:14, fontWeight:700 }} placeholder="Nombre del producto *" value={item.fileName}
                        onChange={e=>updateOrderItem(item.id,"fileName",e.target.value)}
                        onFocus={()=>updateOrderItem(item.id,"_sug",true)} onBlur={()=>setTimeout(()=>updateOrderItem(item.id,"_sug",false),150)} />
                      {item._sug&&item.fileName.trim().length>=1&&(()=>{
                        const q=item.fileName.toLowerCase();
                        const matches=products.filter(p=>p.name.toLowerCase().includes(q));
                        if(!matches.length) return null;
                        return (
                          <div style={{ position:"absolute", top:"100%", left:0, right:0, background:C.bg3, border:`1.5px solid ${C.orange}55`, borderRadius:C.rMd, zIndex:99, marginTop:4, overflow:"hidden", boxShadow:"0 12px 36px rgba(0,0,0,.7)" }}>
                            {matches.slice(0,4).map(prod=>(
                              <div key={prod.id} onMouseDown={()=>{ updateOrderItem(item.id,"fileName",prod.name); updateOrderItem(item.id,"material",prod.material||""); updateOrderItem(item.id,"color",prod.color||""); updateOrderItem(item.id,"weight",prod.weight||""); updateOrderItem(item.id,"duration",prod.duration||""); updateOrderItem(item.id,"unitPrice",prod.price||""); }} style={{ padding:"9px 12px", cursor:"pointer", borderBottom:`1px solid ${C.bg5}`, display:"flex", alignItems:"center", gap:8 }} onMouseEnter={e=>e.currentTarget.style.background=C.bg4} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                                <span style={{ fontSize:16 }}><Icono e="📦" size={18} /></span>
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:13, fontWeight:800, color:C.t1 }}>{prod.name}</div>
                                  <div style={{ fontSize:12, color:C.t3 }}>{prod.material} {prod.color} {prod.duration>0?`· ${fmtTime(Number(prod.duration))}`:""}{prod.weight>0?` · ${prod.weight}g`:""}</div>
                                </div>
                                {prod.price&&<span style={{ fontSize:13, color:C.green, fontWeight:900 }}>Bs.{Number(prod.price).toFixed(2)}</span>}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                      <div>
                        <label style={{ fontSize:12, fontWeight:700, color:C.t4, textTransform:"uppercase", letterSpacing:.6, display:"block", marginBottom:5 }}>Material</label>
                        <select style={inputSt} value={item.material} onChange={e=>updateOrderItem(item.id,"material",e.target.value)}>
                          <option value="">—</option>{MATERIALS.map(m=><option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize:12, fontWeight:700, color:C.t4, textTransform:"uppercase", letterSpacing:.6, display:"block", marginBottom:5 }}>Color</label>
                        <select style={inputSt} value={item.color} onChange={e=>elegirColor(e.target.value, v=>updateOrderItem(item.id,"color",v))}>
                          <option value="">—</option>{opcionesColor(item.color)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8 }}>
                      <div>
                        <label style={{ fontSize:12, fontWeight:700, color:C.t4, textTransform:"uppercase", letterSpacing:.6, display:"block", marginBottom:5 }}>Cant.</label>
                        <input style={inputSt} type="number" min="1" placeholder="1" value={item.quantity} onChange={e=>updateOrderItem(item.id,"quantity",e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize:12, fontWeight:700, color:C.t4, textTransform:"uppercase", letterSpacing:.6, display:"block", marginBottom:5 }}>Precio u.</label>
                        <input style={inputSt} type="number" placeholder="0.00" value={item.unitPrice} onChange={e=>updateOrderItem(item.id,"unitPrice",e.target.value)} />
                      </div>
                      <div>
                        <label style={{ fontSize:12, fontWeight:700, color:C.t4, textTransform:"uppercase", letterSpacing:.6, display:"block", marginBottom:5 }}>min</label>
                        <input style={inputSt} type="number" placeholder="120" value={item.duration} onChange={e=>updateOrderItem(item.id,"duration",e.target.value)} />
                      </div>
                    </div>
                    {item.unitPrice&&Number(item.unitPrice)>0&&Number(item.quantity)>1&&(
                      <div style={{ fontSize:12, color:C.green, fontWeight:800, textAlign:"right" }}>
                        Subtotal: Bs. {(Number(item.unitPrice)*Number(item.quantity)).toFixed(2)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Add item button */}
            <button onClick={()=>addOrderItem({printer:printers[0]?.id??""})} style={{ width:"100%", padding:"12px", background:"transparent", border:`2px dashed ${C.orange}66`, borderRadius:C.rMd, color:C.orange, fontSize:14, fontWeight:800, cursor:"pointer", marginBottom:16 }}>
              + Agregar otro producto
            </button>

            {/* Order total */}
            {(()=>{
              const total = orderItems.reduce((s,x)=>s+(Number(x.unitPrice||0)*( Number(x.quantity)||1)),0);
              if(total<=0) return null;
              return (
                <div style={{ background:C.greenBg, border:`1px solid ${C.greenD}44`, borderRadius:C.rMd, padding:"14px 16px", marginBottom:16, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:12, color:C.t3, fontWeight:700, textTransform:"uppercase", letterSpacing:.6 }}>Total del pedido</div>
                    <div style={{ fontSize:12, color:C.t4, marginTop:2 }}>{orderItems.filter(x=>x.fileName).length} producto{orderItems.filter(x=>x.fileName).length!==1?"s":""}</div>
                  </div>
                  <div style={{ fontSize:24, fontWeight:900, color:C.green }}>Bs. {total.toFixed(2)}</div>
                </div>
              );
            })()}

            <FormField label="Notas del pedido">
              <input style={inputSt} placeholder="Instrucciones generales del pedido..." value={orderClient.notes} onChange={e=>setOrderClient(c=>({...c,notes:e.target.value}))} />
            </FormField>

            <button onClick={submitOrder} disabled={guardando} aria-busy={guardando||undefined} style={{ opacity:guardando?.6:1, cursor:guardando?"wait":"pointer", width:"100%", padding:"16px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.r, fontSize:16, fontWeight:900, cursor:"pointer", marginTop:4, boxShadow:`0 6px 24px rgba(241,132,27,.4)` }}>
              Crear pedido ({orderItems.filter(x=>x.fileName.trim()).length} producto{orderItems.filter(x=>x.fileName.trim()).length!==1?"s":""})
            </button>
            <button onClick={()=>cerrarForm(true)} style={{ width:"100%", padding:"14px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.r, fontSize:14, fontWeight:700, cursor:"pointer", marginTop:8 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── FORM: IMPRESORA ── */}
      {showPForm && (
        <div style={overlayStyle} onClick={e=>{if(e.target===e.currentTarget){setShowPForm(false);setEditP(null);}}}>
          <div style={sheetStyle}>
            <div style={handleStyle} />
            <div style={{ fontSize:19, fontWeight:900, color:C.t1, marginBottom:22 }}>{editP?"Editar impresora":"➕ Nueva impresora"}</div>
            <FormField label="Nombre de la impresora"><input style={inputSt} placeholder="ej: Creality K1 Max" value={pForm.name} onChange={e=>setPForm(f=>({...f,name:e.target.value}))} /></FormField>
            <FormField label="Marca"><input style={inputSt} placeholder="ej: Creality, Bambu Lab..." value={pForm.brand} onChange={e=>setPForm(f=>({...f,brand:e.target.value}))} /></FormField>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormField label="Tipo">
                <select style={inputSt} value={pForm.type} onChange={e=>setPForm(f=>({...f,type:e.target.value}))}>
                  <option value="FDM">FDM</option><option value="Resina">Resina</option><option value="SLA">SLA</option><option value="DLP">DLP</option>
                </select>
              </FormField>
              <FormField label="Estado">
                <select style={inputSt} value={pForm.connected?"1":"0"} onChange={e=>setPForm(f=>({...f,connected:e.target.value==="1"}))}>
                  <option value="1">En línea</option><option value="0">⚫ Offline</option>
                </select>
              </FormField>
            </div>
            <FormField label="URL de imagen (opcional)"><input style={inputSt} placeholder="https://..." value={pForm.img} onChange={e=>setPForm(f=>({...f,img:e.target.value}))} /></FormField>
            <FormField label="Color de fondo">
              <div style={{ display:"flex", gap:10 }}>
                {["#1e1e1e","#000000","#ffffff","#221D1B"].map(col=>(
                  <div key={col} onClick={()=>setPForm(f=>({...f,imgBg:col}))} style={{ width:38, height:38, borderRadius:11, background:col, cursor:"pointer", border:`2.5px solid ${pForm.imgBg===col?C.orange:C.bg5}` }} />
                ))}
              </div>
            </FormField>
            <button onClick={submitP} disabled={guardando} aria-busy={guardando||undefined} style={{ opacity:guardando?.6:1, cursor:guardando?"wait":"pointer", width:"100%", padding:"16px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.r, fontSize:16, fontWeight:900, cursor:"pointer", marginTop:6, boxShadow:`0 6px 24px rgba(241,132,27,.4)` }}>
              {editP?"Guardar cambios":"Agregar impresora"}
            </button>
            <button onClick={()=>{setShowPForm(false);setEditP(null);}} style={{ width:"100%", padding:"14px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.r, fontSize:14, fontWeight:700, cursor:"pointer", marginTop:8 }}>Cancelar</button>
          </div>
        </div>
      )}


      {/* ── FORM: PRODUCTO ── */}
      {showProductForm && (
        <div style={overlayStyle} onClick={e=>{if(e.target===e.currentTarget){setShowProductForm(false);setEditProduct(null);}}}>
          <div style={sheetStyle}>
            <div style={handleStyle} />
            <div style={{ fontSize:19, fontWeight:900, color:C.t1, marginBottom:4 }}>{editProduct?"Editar producto":"Nuevo producto"}</div>
            <div style={{ fontSize:13, color:C.t3, marginBottom:22 }}>Guarda un producto frecuente para añadirlo rápido a la cola</div>
            <FormField label="Nombre del producto *">
              <input style={inputSt} placeholder="ej: Mango DJI Mini" value={prodForm.name} onChange={e=>setProdForm(f=>({...f,name:e.target.value}))} />
            </FormField>
            <FormField label="Precio (Bs.)">
              <input style={inputSt} type="number" placeholder="0.00" value={prodForm.price} onChange={e=>setProdForm(f=>({...f,price:e.target.value}))} />
            </FormField>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormField label="Duración (min)">
                <input style={inputSt} type="number" placeholder="120" value={prodForm.duration} onChange={e=>setProdForm(f=>({...f,duration:e.target.value}))} />
              </FormField>
              <FormField label="Peso (g)">
                <input style={inputSt} type="number" placeholder="40" value={prodForm.weight} onChange={e=>setProdForm(f=>({...f,weight:e.target.value}))} />
              </FormField>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <FormField label="Material">
                <select style={inputSt} value={prodForm.material} onChange={e=>setProdForm(f=>({...f,material:e.target.value}))}>
                  <option value="">Seleccionar...</option>
                  {MATERIALS.map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </FormField>
              <FormField label="Color">
                <select style={inputSt} value={prodForm.color} onChange={e=>elegirColor(e.target.value, v=>setProdForm(f=>({...f,color:v})))}>
                  <option value="">Seleccionar...</option>
                  {opcionesColor(prodForm.color)}
                </select>
              </FormField>
            </div>
            <FormField label="Notas">
              <input style={inputSt} placeholder="Instrucciones especiales..." value={prodForm.notes} onChange={e=>setProdForm(f=>({...f,notes:e.target.value}))} />
            </FormField>
            <FormField label="Categoría" hint="Ej: Cafetería, Llaveros, Porta mandos, Gaming...">
              {(()=>{
                const existingCats = Array.from(new Set(products.map(p=>p.category).filter(Boolean))).sort();
                return (
                  <div>
                    <input style={inputSt} placeholder="ej: Cafetería" value={prodForm.category} onChange={e=>setProdForm(f=>({...f,category:e.target.value}))} list="cat-suggestions" />
                    <datalist id="cat-suggestions">
                      {existingCats.map(c=><option key={c} value={c} />)}
                    </datalist>
                    {existingCats.length>0 && (
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap", marginTop:8 }}>
                        {existingCats.map(c=>(
                          <button key={c} type="button" onClick={()=>setProdForm(f=>({...f,category:c}))} style={{ padding:"5px 12px", borderRadius:C.rPill, border:`1.5px solid ${prodForm.category===c?C.orange:C.bg5}`, background:prodForm.category===c?C.orangeBg:C.bg3, color:prodForm.category===c?C.orange:C.t3, fontSize:12, fontWeight:700, cursor:"pointer" }}>{c}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </FormField>
            <button onClick={submitProduct} disabled={guardando} aria-busy={guardando||undefined} style={{ opacity:guardando?.6:1, cursor:guardando?"wait":"pointer", width:"100%", padding:"16px", background:`linear-gradient(135deg,${C.orange},${C.orangeD})`, color:"#191513", border:"none", borderRadius:C.r, fontSize:16, fontWeight:900, cursor:"pointer", marginTop:4, boxShadow:`0 6px 24px rgba(241,132,27,.4)` }}>
              {editProduct?"Guardar cambios":"Guardar producto"}
            </button>
            <button onClick={()=>{setShowProductForm(false);setEditProduct(null);}} style={{ width:"100%", padding:"14px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.r, fontSize:14, fontWeight:700, cursor:"pointer", marginTop:8 }}>Cancelar</button>
          </div>
        </div>
      )}

      {/* ── CONFIRM DELETE ── */}
      {confirmDel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.88)", zIndex:60, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div style={{ background:C.bg2, borderRadius:C.r, padding:"26px 22px", width:"100%", maxWidth:320, border:`1px solid ${C.bg4}`, textAlign:"center" }}>
            <div style={{ fontSize:42, marginBottom:12 }}><Icono e="🗑️" size={44} /></div>
            <div style={{ fontSize:17, fontWeight:900, color:C.t1, marginBottom:7 }}>¿Eliminar este trabajo?</div>
            <div style={{ fontSize:13, color:C.t3, marginBottom:24 }}>Esta acción no se puede deshacer</div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setConfirmDel(null)} style={{ flex:1, padding:"14px", background:C.bg4, color:C.t2, border:"none", borderRadius:C.rSm, fontSize:14, fontWeight:700, cursor:"pointer" }}>Cancelar</button>
              <button onClick={()=>deleteJ(confirmDel)} style={{ flex:1, padding:"14px", background:C.redBg, color:C.red, border:`1px solid #4A1A10`, borderRadius:C.rSm, fontSize:14, fontWeight:800, cursor:"pointer" }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}

      {BuscadorRapido()}
      {ModalCobro()}
      {ModalFalla()}
      {nuevoColor && (
        <div onClick={e=>{ if(e.target===e.currentTarget) setNuevoColor(null); }} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.85)", zIndex:80, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
          <div role="dialog" aria-modal="true" aria-labelledby="color-titulo" style={{ background:C.bg2, border:`1px solid ${C.bg4}`, borderRadius:C.r, padding:"22px 20px", width:"100%", maxWidth:380 }}>
            <div id="color-titulo" style={{ fontSize:18, fontWeight:900, color:C.t1, marginBottom:14 }}>Agregar color</div>
            <FormField label="Nombre del color">
              <input autoFocus style={inputSt} placeholder="Ej: Plateado seda" value={nuevoColor.nombre} onChange={e=>setNuevoColor(n=>({...n, nombre:e.target.value}))} onKeyDown={e=>{ if(e.key==="Enter") guardarColorNuevo(); }} />
            </FormField>
            <FormField label="Recargo (Bs)" hint="Opcional: si este color cuesta más. Déjalo vacío si no.">
              <input style={inputSt} type="number" inputMode="numeric" placeholder="0" value={nuevoColor.recargo} onChange={e=>setNuevoColor(n=>({...n, recargo:e.target.value}))} />
            </FormField>
            {coloresExtra.length>0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:12, color:C.t3, fontWeight:700, marginBottom:6 }}>Colores que agregaste</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {coloresExtra.map(c=>(
                    <span key={c.nombre} style={{ display:"inline-flex", alignItems:"center", gap:4, background:C.bg3, border:`1px solid ${C.bg5}`, borderRadius:C.rPill, padding:"2px 4px 2px 10px", fontSize:13, color:C.t1 }}>
                      {etiquetaCol(c.nombre)}
                      <button onClick={()=>borrarColorExtra(c.nombre)} aria-label={`Quitar ${c.nombre}`} style={{ background:"none", border:"none", color:C.t3, cursor:"pointer", minHeight:28, minWidth:28, fontSize:16 }}>×</button>
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={()=>setNuevoColor(null)} style={{ flex:1, minHeight:48, background:C.bg4, color:C.t2, border:"none", borderRadius:C.rSm, fontSize:14, fontWeight:700, cursor:"pointer" }}>Cancelar</button>
              <button onClick={guardarColorNuevo} disabled={!nuevoColor.nombre.trim()} style={{ flex:1, minHeight:48, background:nuevoColor.nombre.trim()?C.orange:C.bg4, color:nuevoColor.nombre.trim()?"#191513":C.t3, border:"none", borderRadius:C.rSm, fontSize:14, fontWeight:900, cursor:"pointer" }}>Agregar</button>
            </div>
          </div>
        </div>
      )}
      {/* ── TOAST ── */}
      {CartelPedido()}
      {toast && (
        <div role="status" aria-live="polite" key={toast.id} style={{ position:"fixed", bottom: isMobile?"calc(env(safe-area-inset-bottom) + 84px)":24, left:"50%", transform:"translateX(-50%)", width:"max-content", maxWidth:"calc(100vw - 24px)", display:"flex", alignItems:"center", gap:14, background:toast.type==="err"?"#3A1510":"#2E1A0B", border:`1px solid ${toast.type==="err"?"#6B2A1F":"#6B3A12"}`, color:C.t1, padding: toast.deshacer?"8px 8px 8px 20px":"13px 22px", borderRadius:C.rPill, fontSize:15, fontWeight:700, zIndex:100, boxShadow:"0 10px 30px rgba(0,0,0,.5)", animation:"w3dSubeT .2s ease-out" }}>
          <span>{toast.msg}</span>
          {toast.deshacer && <button onClick={()=>{ const f=toast.deshacer; setToast(null); clearTimeout(toastTimer.current); f(); }} style={{ background:C.orange, color:"#191513", border:"none", borderRadius:C.rPill, padding:"0 16px", minHeight:40, fontSize:14, fontWeight:900, cursor:"pointer" }}>Deshacer</button>}
          <style>{`@keyframes w3dSubeT{from{transform:translate(-50%,12px);opacity:0}to{transform:translate(-50%,0);opacity:1}}`}</style>
        </div>
      )}
    </div>
  );
}
