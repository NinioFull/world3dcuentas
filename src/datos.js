// Acceso a la base de la cola.
// Normal: Firebase Firestore. Modo demo (REACT_APP_DEMO=1): una base de ejemplo en memoria,
// para probar el diseño sin tocar ni poder romper la cola real.
import * as fs from "firebase/firestore";

const DEMO = process.env.REACT_APP_DEMO === "1";

// ── Base de ejemplo ──
const ahora = Date.now(), h = 3600000;
const memoria = {
  printers: {
    p1: { name: "Creality K1 Max", type: "FDM", brand: "Creality", connected: true, img: "", imgBg: "#1e1e1e" },
    p2: { name: "Creality Hi 1", type: "FDM", brand: "Creality", connected: true, img: "", imgBg: "#1e1e1e" },
    p3: { name: "Elegoo Centauri Carbon 2", type: "FDM", brand: "Elegoo", connected: true, img: "", imgBg: "#1e1e1e" },
    p4: { name: "Creality LD-002R", type: "Resina", brand: "Creality", connected: false, img: "", imgBg: "#000" },
  },
  jobs: {
    j1: { fileName: "PortaMochilas", printer: "p3", material: "PETG", color: "Blanco", weight: 25, duration: 180, remaining: 180, runStart: ahora - 70 * 60000, status: "printing", quantity: 12, price: 288, unitPrice: 24, deposit: 100, clientName: "José Luis Moya", clientPhone: "+591 79060710", createdAt: ahora - 5 * h, startedAt: ahora - 70 * 60000, priority: 1, deliveryAt: ahora + 3 * h },
    j2: { fileName: "Soporte de mando de Pikachu", printer: "p1", material: "PLA", color: "Amarillo", weight: 60, duration: 140, remaining: 140, runStart: ahora - 20 * 60000, status: "printing", quantity: 2, price: 160, unitPrice: 80, deposit: 160, clientName: "Jorge Mamani", clientPhone: "77788899", createdAt: ahora - 3 * h, startedAt: ahora - 20 * 60000, priority: 2 },
    j3: { fileName: "Trofeo de pádel", printer: "p1", material: "PLA", color: "Dorado impreso en 3D", weight: 90, duration: 210, remaining: 210, status: "pending", quantity: 4, price: 420, unitPrice: 105, deposit: 200, clientName: "Club Pádel Norte", clientPhone: "70123456", createdAt: ahora - 2 * h, priority: 3, deliveryAt: ahora - 2 * h },
    j4: { fileName: "Llavero personalizado LEO", printer: "p2", material: "PLA", color: "Negro", weight: 8, duration: 35, remaining: 35, status: "pending", quantity: 1, price: 45, unitPrice: 45, deposit: 45, clientName: "Ana Rojas", clientPhone: "68855443", createdAt: ahora - h, priority: 4, deliveryAt: ahora + 20 * h, webPedido: 116, notes: "Pedido web #00116 · Envío a Cochabamba (por pagar)" },
    j5: { fileName: "Figura de capibara 12cm", printer: "p2", material: "PLA", color: "Café", weight: 70, duration: 0, remaining: 0, status: "done", quantity: 2, price: 120, unitPrice: 60, deposit: 60, clientName: "María Pérez", clientPhone: "76543210", createdAt: ahora - 30 * h, endedAt: ahora - 4 * h, priority: 5, deliveryAt: ahora + 2 * h },
    j6: { fileName: "Organizador de cafetería", printer: "p1", material: "PETG", color: "Rojo", weight: 140, duration: 0, remaining: 0, status: "shipping", quantity: 1, price: 95, unitPrice: 95, deposit: 95, clientName: "Carla Suárez", clientPhone: "70011223", createdAt: ahora - 150 * h, endedAt: ahora - 100 * h, priority: 6 },
    j10: { fileName: "Maceta geométrica", printer: "p3", material: "PLA", color: "Blanco", weight: 60, duration: 0, remaining: 0, status: "shipped", debe: true, quantity: 1, price: 80, unitPrice: 80, deposit: 30, clientName: "Carla Suárez", clientPhone: "70011223", createdAt: ahora - 120 * h, endedAt: ahora - 100 * h, shippedAt: ahora - 48 * h, priority: 10 },
    j7: { fileName: "Busto de Vecna pintado", printer: "", jobType: "design", material: "", color: "", weight: 0, duration: 240, remaining: 240, status: "pending", quantity: 1, price: 350, unitPrice: 350, deposit: 150, clientName: "Luis Vaca", clientPhone: "71234567", createdAt: ahora - 8 * h, priority: 7 },
    j9: { fileName: "Llaveros con logo", printer: "p2", material: "PLA", color: "Negro", weight: 8, duration: 20, remaining: 0, status: "shipped", quantity: 10, price: 150, unitPrice: 15, deposit: 50, clientName: "Jose Luis Moya", clientPhone: "79060710", createdAt: ahora - 200 * h, shippedAt: ahora - 2 * h, priority: 9 },
    j8: { fileName: "Cortagalletas hombre de jengibre", printer: "p2", material: "PLA", color: "Blanco", weight: 15, duration: 0, remaining: 0, status: "shipped", quantity: 6, price: 90, unitPrice: 15, deposit: 90, clientName: "Repostería Dulce", clientPhone: "77001122", createdAt: ahora - 100 * h, endedAt: ahora - 90 * h, shippedAt: ahora - 80 * h, priority: 8 },
  },
  products: {
    pr1: { name: "Organizador de cafetería", price: "95", duration: "300", weight: "140", material: "PETG", color: "Rojo", category: "Hogar" },
    pr2: { name: "Soporte de mando de Pikachu", price: "80", duration: "70", weight: "30", material: "PLA", color: "Amarillo", category: "Gamer" },
  },
  stock: {},
  config: { matCosts: { PLA: 160, PETG: 180 } },
};
// Historial grande como el real (unos 380 entregados) para probar que las listas largas no traben
for (let i = 0; i < 380; i++) {
  const t = ahora - (i + 3) * 20 * h;
  memoria.jobs["h" + i] = { fileName: ["Trofeo", "Llavero", "Soporte de mando", "Organizador", "Figura"][i % 5] + " #" + i, printer: ["p1", "p2", "p3"][i % 3], material: "PLA", color: "Negro", weight: 20, duration: 60, remaining: 0, status: "shipped", quantity: 1 + (i % 4), price: 50 + (i % 7) * 10, unitPrice: 50, deposit: 50, clientName: "Cliente " + (i % 60), clientPhone: "7" + String(1000000 + (i % 60)), createdAt: t, endedAt: t + h, shippedAt: t + 2 * h, priority: 100 + i };
}
let sec = 100;
const oyentes = [];
const avisar = (col) => oyentes.filter(o => o.col === col).forEach(o => o.cb(foto(col)));
const foto = (col) => ({ docs: Object.entries(memoria[col] || {}).map(([id, d]) => ({ id, data: () => ({ ...d }) })) });

// Sin conexión: la cola se guarda en el dispositivo (IndexedDB). Si se corta el wifi del taller se sigue viendo
// y lo que tocás se guarda al instante; se sube solo cuando vuelve la señal. Funciona aunque haya varias pestañas abiertas.
export const getFirestore = DEMO ? () => ({ demo: true }) : (app) => {
  try {
    return fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
  } catch (e) {
    return fs.getFirestore(app);   // ya estaba iniciada (recarga en caliente) o el navegador no permite guardar
  }
};
// Firestore aplica el cambio en el dispositivo al instante, pero la promesa espera al servidor.
// Sin conexión eso es "para siempre": damos por guardado a los 1,5 s y el envío sigue en segundo plano.
const sinEsperarRed = (p) => Promise.race([p, new Promise(r => setTimeout(r, 1500))]).catch(e => { console.error("No se pudo guardar:", e); throw e; });
export const collection = DEMO ? (_db, col) => ({ col }) : fs.collection;
export const doc = DEMO ? (_db, col, id) => ({ col, id }) : fs.doc;
export const onSnapshot = DEMO
  ? (ref, cb) => { const o = { col: ref.col, cb }; oyentes.push(o); setTimeout(() => cb(foto(ref.col)), 50); return () => oyentes.splice(oyentes.indexOf(o), 1); }
  : fs.onSnapshot;
export const addDoc = DEMO
  ? async (ref, data) => { const id = "d" + (++sec); (memoria[ref.col] = memoria[ref.col] || {})[id] = data; avisar(ref.col); return { id }; }
  : (ref, data) => { const r = fs.doc(ref); return sinEsperarRed(fs.setDoc(r, data)).then(() => r); };  // id generado en el dispositivo
export const setDoc = DEMO
  ? async (ref, data) => { (memoria[ref.col] = memoria[ref.col] || {})[ref.id] = data; avisar(ref.col); }
  : (...a) => sinEsperarRed(fs.setDoc(...a));
export const updateDoc = DEMO
  ? async (ref, data) => { const c = memoria[ref.col] || {}; c[ref.id] = { ...(c[ref.id] || {}), ...data }; avisar(ref.col); }
  : (...a) => sinEsperarRed(fs.updateDoc(...a));
export const deleteDoc = DEMO
  ? async (ref) => { delete (memoria[ref.col] || {})[ref.id]; avisar(ref.col); }
  : (...a) => sinEsperarRed(fs.deleteDoc(...a));
