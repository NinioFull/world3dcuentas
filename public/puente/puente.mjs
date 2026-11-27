// WORLD3D · Puente de impresoras
// Mira las impresoras del wifi del taller y le cuenta al Manager qué están haciendo de verdad
// (imprimiendo, pausada, terminada...). Corre en la PC (principal) y en un celular Android (respaldo):
// el celular solo trabaja cuando la PC está apagada.
//
// Impresoras: Creality con Creality OS (K1, K1 Max, Hi, Ender 3 V3, K2) por el puerto 9999,
// y Elegoo Centauri Carbon 2 por MQTT (puerto 1883). Sin dependencias: necesita Node 22 o más nuevo.
//
// Uso: node puente.mjs            (lee puente.json de esta misma carpeta)
//      node puente.mjs --probar   (solo busca impresoras y muestra lo que ven, sin mandar nada)

import net from "node:net";
import dgram from "node:dgram";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.0.0";
const CARPETA = path.dirname(fileURLToPath(import.meta.url));
const ARCH_CONFIG = process.env.PUENTE_CONFIG || path.join(CARPETA, "puente.json");
const ARCH_LOG = path.join(CARPETA, "puente.log");
const PROBAR = process.argv.includes("--probar");

const ESTADOS_OCUPADA = new Set(["preparando", "imprimiendo", "pausada"]);
const MODELOS = {
  "CR-K1 Max": "K1 Max", "CR-K1": "K1", "K1": "K1", "K1C": "K1C", "K1 SE": "K1 SE",
  F018: "Creality Hi", F005: "Ender-3 V3 KE", F001: "Ender-3 V3", F002: "Ender-3 V3 Plus",
  F021: "K2", F012: "K2 Pro", F008: "K2 Plus",
};

// ─── Config y registro ────────────────────────────────────────────────────────
function leerConfig() {
  try { return JSON.parse(fs.readFileSync(ARCH_CONFIG, "utf8")); } catch { return {}; }
}
function guardarConfig(c) {
  try { fs.writeFileSync(ARCH_CONFIG, JSON.stringify(c, null, 2)); } catch (e) { log("No pude guardar la config:", e.message); }
}
const config = leerConfig();
config.servidor ||= "https://world3dcuentas.vercel.app/api/puente";
config.fuente ||= os.platform() === "android" ? "celu" : "pc";

function log(...a) {
  const linea = new Date().toLocaleString("es-BO", { hour12: false }) + "  " + a.join(" ");
  console.log(linea);
  if (PROBAR) return;
  try {
    if (fs.existsSync(ARCH_LOG) && fs.statSync(ARCH_LOG).size > 1_000_000) fs.renameSync(ARCH_LOG, ARCH_LOG + ".1");
    fs.appendFileSync(ARCH_LOG, linea + "\n");
  } catch {}
}

if (typeof WebSocket === "undefined") {
  console.error("Este Node es muy viejo (" + process.version + "). Hace falta Node 22 o más nuevo.");
  process.exit(1);
}
if (!PROBAR && !config.clave) {
  console.error("Falta la clave del Manager en " + ARCH_CONFIG + ". Volvé a correr el instalador.");
  process.exit(1);
}

// ─── Red local ────────────────────────────────────────────────────────────────
// IP de este aparato en el wifi. En Android no siempre se pueden leer las interfaces, así que primero
// se pregunta al sistema por qué IP saldría hacia internet (no se manda nada).
function miIP() {
  return new Promise((res) => {
    const s = dgram.createSocket("udp4");
    const fin = (ip) => { try { s.close(); } catch {} res(ip); };
    s.on("error", () => fin(ipDeInterfaces()));
    try {
      s.connect(53, "8.8.8.8", () => { try { fin(s.address().address); } catch { fin(ipDeInterfaces()); } });
    } catch { fin(ipDeInterfaces()); }
  });
}
function ipDeInterfaces() {
  try {
    for (const lista of Object.values(os.networkInterfaces())) for (const i of lista || [])
      if (i.family === "IPv4" && !i.internal && /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))/.test(i.address)) return i.address;
  } catch {}
  return null;
}
function puertoAbierto(ip, puerto, ms = 700) {
  return new Promise((res) => {
    const s = net.connect({ host: ip, port: puerto });
    const fin = (ok) => { s.destroy(); res(ok); };
    s.setTimeout(ms, () => fin(false));
    s.once("connect", () => fin(true));
    s.once("error", () => fin(false));
  });
}
async function escanear(base, puerto) {
  const ips = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}`), hallados = [];
  for (let i = 0; i < ips.length; i += 64) {
    const lote = ips.slice(i, i + 64);
    const r = await Promise.all(lote.map((ip) => puertoAbierto(ip, puerto)));
    lote.forEach((ip, k) => r[k] && hallados.push(ip));
  }
  return hallados;
}
// Elegoo Centauri Carbon 2: responde a un aviso por UDP (puerto 52700) con su número de serie
function buscarElegoo(base, extras = []) {
  return new Promise((res) => {
    const s = dgram.createSocket({ type: "udp4", reuseAddr: true }), hallados = new Map();
    const msj = Buffer.from(JSON.stringify({ id: 0, method: 7000 }));
    s.on("message", (buf, info) => {
      try {
        const r = JSON.parse(buf.toString()).result;
        if (r && r.sn) hallados.set(r.sn, { ip: info.address, sn: r.sn, nombre: r.host_name || r.machine_model, modelo: r.machine_model, conClave: r.token_status === 1 });
      } catch {}
    });
    s.on("error", () => { try { s.close(); } catch {} res([...hallados.values()]); });
    s.bind(0, () => {
      try { s.setBroadcast(true); } catch {}
      const destinos = new Set(["255.255.255.255", base + ".255", ...extras]);
      for (let k = 0; k < 2; k++) setTimeout(() => destinos.forEach((d) => s.send(msj, 52700, d, () => {})), k * 800);
      setTimeout(() => { try { s.close(); } catch {} res([...hallados.values()]); }, 3000);
    });
  });
}

// ─── Creality (puerto 9999) ───────────────────────────────────────────────────
class Creality {
  constructor(ip, alCambiar) {
    this.ip = ip; this.alCambiar = alCambiar; this.d = {}; this.vivo = false; this.ultimo = 0;
    this.preparandoDesde = 0; this.errorBase = undefined; this.errorNuevo = false; this.cerrada = false;
    this.conectar();
    this.reloj = setInterval(() => this.vigilar(), 10000);
  }
  get id() {
    const h = String(this.d.hostname || "").replace(/[^\w-]/g, "");
    return h ? (/^creality/i.test(h) ? h.toLowerCase() : "creality-" + h) : "creality-" + this.ip.replace(/\./g, "-");
  }
  conectar() {
    if (this.cerrada) return;
    let ws;
    try { ws = new WebSocket(`ws://${this.ip}:9999`); } catch { return this.reintentar(); }
    this.ws = ws;
    ws.onopen = () => { this.pedir(); };
    ws.onmessage = (ev) => {
      const t = typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString();
      if (t === "ok") return;
      let m; try { m = JSON.parse(t); } catch { return; }
      if (!m || typeof m !== "object") return;
      if (m.ModeCode === "heart_beat") { try { ws.send("ok"); } catch {} this.ultimo = Date.now(); return; }
      if (m.retGcodeFileInfo || m.retGcodeFileInfo2) return;   // listado de archivos: no hace falta
      Object.assign(this.d, m);
      this.ultimo = Date.now();
      if (!this.vivo) { this.vivo = true; log(`Conectada ${this.nombre()} (${this.ip})`); }
      this.avisar();
    };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; this.reintentar(); } };
    ws.onerror = () => {};
  }
  pedir() { try { this.ws?.readyState === 1 && this.ws.send(JSON.stringify({ method: "get", params: { ReqPrinterPara: 1 } })); } catch {} }
  reintentar() { if (!this.cerrada) setTimeout(() => this.conectar(), 15000); }
  vigilar() {
    this.pedir();
    const callada = Date.now() - this.ultimo;
    if (this.ws && this.ultimo && callada > 35000) { try { this.ws.close(); } catch {} this.ws = null; this.reintentar(); }
    if (this.vivo && callada > 45000) { this.vivo = false; log(`Sin respuesta de ${this.nombre()} (${this.ip})`); this.avisar(); }
  }
  nombre() { return MODELOS[this.d.model] || this.d.model || "Creality"; }
  estado() {
    if (!this.vivo) return "apagada";
    const d = this.d, archivo = d.printFileName || "";
    const prog = Number(d.printProgress ?? d.dProgress ?? -1), st = Number(d.state), falta = Number(d.printLeftTime);
    const autotest = Number(d.withSelfTest);
    let e = "libre";
    if (autotest >= 1 && autotest <= 99) e = "preparando";
    else if (archivo) {
      if (prog >= 100 && !((st === 1 || st === 5) && falta > 0)) e = "terminada";
      else if (st === 5) e = "pausada";
      else if (st === 4) e = "cancelada";
      else if (st === 1) e = "imprimiendo";
      else if (st === 0 || st === 7 || st === 9) e = "preparando";
    }
    // Algunas (Hi) al cancelar dejan el archivo con 0%: sin moverse 3 min y en reposo es "libre"
    if (e === "preparando" && st === 0) {
      if (!this.preparandoDesde) this.preparandoDesde = Date.now();
      else if (Date.now() - this.preparandoDesde > 180000) e = "libre";
    } else this.preparandoDesde = 0;
    return e;
  }
  error() {
    const err = this.d.err, cod = Number(err && typeof err === "object" ? err.errcode : err) || 0;
    if (this.errorBase === undefined && this.vivo) this.errorBase = cod;   // un código viejo que nunca se borra no cuenta
    if (cod && cod !== this.errorBase) this.errorNuevo = true;
    if (!cod) { this.errorNuevo = false; this.errorBase = 0; }
    return this.errorNuevo ? cod : 0;
  }
  datos() {
    const d = this.d, archivo = String(d.printFileName || "").split("/").pop().replace(/\.gcode$/i, "");
    const inicio = Number(d.printStartTime) > 1e9 ? Number(d.printStartTime) * 1000 : null;
    return {
      id: this.id, marca: "Creality", modelo: this.nombre(), nombre: d.hostname || this.nombre(), ip: this.ip,
      estado: this.estado(), archivo: archivo || null,
      progreso: Number.isFinite(Number(d.printProgress)) ? Math.max(0, Math.min(100, Math.round(Number(d.printProgress)))) : null,
      faltaSeg: Number.isFinite(Number(d.printLeftTime)) ? Math.max(0, Math.round(Number(d.printLeftTime))) : null,
      inicio, capa: Number(d.layer) || null, capas: Number(d.TotalLayer) || null, error: this.error(),
    };
  }
  avisar() { if (this.d.model || !this.vivo) this.alCambiar(this); }
  cerrar() { this.cerrada = true; clearInterval(this.reloj); try { this.ws?.close(); } catch {} }
}

// ─── MQTT mínimo (3.1.1, QoS 0) para la Elegoo ───────────────────────────────
function largoMQTT(n) { const b = []; do { let x = n % 128; n = Math.floor(n / 128); if (n > 0) x |= 128; b.push(x); } while (n > 0); return Buffer.from(b); }
const cadena = (s) => { const b = Buffer.from(s); return Buffer.concat([Buffer.from([b.length >> 8, b.length & 255]), b]); };
const paquete = (tipo, cuerpo) => Buffer.concat([Buffer.from([tipo]), largoMQTT(cuerpo.length), cuerpo]);

class MQTT {
  constructor({ host, port = 1883, clientId, usuario, clave }, eventos) {
    this.e = eventos; this.buf = Buffer.alloc(0); this.id = 1;
    this.s = net.connect({ host, port });
    this.s.setTimeout(20000, () => this.s.destroy(new Error("sin respuesta")));
    this.s.on("connect", () => {
      const flags = 0x80 | 0x40 | 0x02;
      this.s.write(paquete(0x10, Buffer.concat([cadena("MQTT"), Buffer.from([4, flags, 0, 60]), cadena(clientId), cadena(usuario), cadena(clave)])));
      this.ping = setInterval(() => { try { this.s.write(Buffer.from([0xc0, 0])); } catch {} }, 30000);
    });
    this.s.on("data", (d) => this.leer(d));
    this.s.on("close", () => { clearInterval(this.ping); this.e.cerrado?.(); });
    this.s.on("error", () => {});
  }
  leer(d) {
    this.buf = Buffer.concat([this.buf, d]);
    while (this.buf.length >= 2) {
      let mult = 1, largo = 0, i = 1, b;
      do { if (i >= this.buf.length) return; b = this.buf[i++]; largo += (b & 127) * mult; mult *= 128; } while (b & 128);
      if (this.buf.length < i + largo) return;
      const tipo = this.buf[0], cuerpo = this.buf.subarray(i, i + largo);
      this.buf = this.buf.subarray(i + largo);
      if ((tipo >> 4) === 2) this.e.conectado?.(cuerpo[1]);   // CONNACK: 0 = ok
      else if ((tipo >> 4) === 3) {
        const lt = cuerpo.readUInt16BE(0), tema = cuerpo.subarray(2, 2 + lt).toString();
        const qos = (tipo >> 1) & 3, desde = 2 + lt + (qos ? 2 : 0);
        this.e.mensaje?.(tema, cuerpo.subarray(desde).toString());
      }
    }
  }
  suscribir(temas) {
    const id = this.id++;
    this.s.write(paquete(0x82, Buffer.concat([Buffer.from([id >> 8, id & 255]), ...temas.map((t) => Buffer.concat([cadena(t), Buffer.from([0])]))])));
  }
  publicar(tema, texto) { try { this.s.write(paquete(0x30, Buffer.concat([cadena(tema), Buffer.from(texto)]))); } catch {} }
  cerrar() { clearInterval(this.ping); try { this.s.write(Buffer.from([0xe0, 0])); } catch {} this.s.destroy(); }
}

// ─── Elegoo Centauri Carbon 2 ─────────────────────────────────────────────────
const fusionar = (a, b) => { for (const k in b) { if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k])) a[k] = fusionar(a[k] && typeof a[k] === "object" ? a[k] : {}, b[k]); else a[k] = b[k]; } return a; };

class Elegoo {
  constructor(info, alCambiar) {
    Object.assign(this, { ip: info.ip, sn: info.sn, nombreImp: info.nombre, modeloImp: info.modelo || "Centauri Carbon 2", alCambiar });
    this.d = {}; this.vivo = false; this.ultimo = 0; this.terminoArchivo = null; this.inicioCalc = null; this.cerrada = false;
    this.claves = [config.elegooClave, "123456", ""].filter((x, i, a) => x !== undefined && x !== null && a.indexOf(x) === i);
    this.intento = 0; this.errorBase = undefined;
    this.conectar();
    this.reloj = setInterval(() => this.vigilar(), 10000);
  }
  get id() { return "elegoo-" + this.sn; }
  conectar() {
    if (this.cerrada) return;
    const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    this.clientId = ("0cli" + Date.now().toString(16) + hex(6)).slice(0, 10);
    this.requestId = hex(16) + Date.now().toString(16);
    const clave = this.claves[this.intento % this.claves.length];
    const base = `elegoo/${this.sn}`;
    this.m = new MQTT({ host: this.ip, clientId: this.clientId, usuario: "elegoo", clave }, {
      conectado: (rc) => {
        if (rc !== 0) { log(`La Elegoo rechazó la clave (código ${rc})${this.claves.length > 1 ? ", pruebo otra" : ". Poné la clave de acceso en puente.json (elegooClave)"}`); this.intento++; this.m.cerrar(); return; }
        this.m.suscribir([`${base}/${this.clientId}/api_response`, `${base}/api_status`, `${base}/${this.requestId}/register_response`]);
        this.m.publicar(`${base}/api_register`, JSON.stringify({ client_id: this.clientId, request_id: this.requestId }));
      },
      mensaje: (tema, texto) => {
        let m; try { m = JSON.parse(texto); } catch { return; }
        this.ultimo = Date.now();
        if (tema.endsWith("/register_response")) {
          if (m.error && m.error !== "ok") { log(`La Elegoo no aceptó la conexión: ${m.error}`); return; }
          this.pedirEstado();
        } else if (m.type === "PONG") return;
        else if ((m.method === 6000 || m.method === 1002) && m.result) {
          if (m.method === 1002) this.d = {};
          fusionar(this.d, m.result);
          if (!this.vivo) { this.vivo = true; log(`Conectada ${this.nombreImp} (${this.ip})`); }
          this.avisar();
        }
      },
      cerrado: () => { if (!this.cerrada) setTimeout(() => this.conectar(), 15000); },
    });
  }
  pedirEstado() { this.m.publicar(`elegoo/${this.sn}/${this.clientId}/api_request`, JSON.stringify({ id: Date.now() % 100000, method: 1002, params: {} })); }
  vigilar() {
    if (this.m) this.m.publicar(`elegoo/${this.sn}/${this.clientId}/api_request`, JSON.stringify({ type: "PING" }));
    if (this.vivo && Date.now() - this.ultimo > 70000) { this.vivo = false; log(`Sin respuesta de ${this.nombreImp} (${this.ip})`); this.avisar(); try { this.m.cerrar(); } catch {} }
  }
  estado() {
    if (!this.vivo) return "apagada";
    const ms = this.d.machine_status || {}, ps = this.d.print_status || {};
    const st = Number(ms.status), sub = Number(ms.sub_status), prog = Number(ps.progress ?? ms.progress ?? 0), archivo = ps.filename || "";
    let e;
    if (st === 2) {
      if (sub === 2077) e = "terminada";
      else if ([2501, 2502, 2505].includes(sub)) e = "pausada";
      else if ([2503, 2504].includes(sub)) e = "cancelada";
      else if ([1045, 1096, 1405, 1906, 2801, 2802, 2901, 2902].includes(sub)) e = "preparando";
      else e = "imprimiendo";
    } else if (st === 15) e = "pausada";
    else e = "libre";
    // Al volver a reposo, si llegó al final queda "terminada" hasta que arranque otra cosa
    if (ESTADOS_OCUPADA.has(this.ultimoEstado) && e === "libre" && prog >= 98) this.terminoArchivo = archivo || "?";
    if (e === "terminada") this.terminoArchivo = archivo || "?";
    if (ESTADOS_OCUPADA.has(e)) this.terminoArchivo = null;
    if (e === "libre" && this.terminoArchivo) e = "terminada";
    this.ultimoEstado = e;
    return e;
  }
  error() {
    const ex = (this.d.machine_status || {}).exception_status;
    const cod = Number(Array.isArray(ex) && ex.length ? ex[0] : 0) || (Number(this.d.machine_status?.status) === 14 ? 14 : 0);
    if (this.errorBase === undefined && this.vivo) this.errorBase = cod;
    if (!cod) this.errorBase = 0;
    return cod && cod !== this.errorBase ? cod : 0;
  }
  datos() {
    const ps = this.d.print_status || {}, ms = this.d.machine_status || {};
    const estado = this.estado(), archivo = String(ps.filename || "").split("/").pop().replace(/\.gcode$/i, "");
    if (archivo !== this.archivoInicio) { this.archivoInicio = archivo; this.inicioCalc = Number(ps.print_duration) >= 0 && archivo ? Date.now() - Number(ps.print_duration || 0) * 1000 : null; }
    const prog = ps.progress ?? ms.progress;
    return {
      id: this.id, marca: "Elegoo", modelo: this.modeloImp, nombre: this.nombreImp, ip: this.ip,
      estado, archivo: archivo || null,
      progreso: Number.isFinite(Number(prog)) ? Math.max(0, Math.min(100, Math.round(Number(prog)))) : null,
      faltaSeg: Number.isFinite(Number(ps.remaining_time_sec)) ? Math.max(0, Math.round(Number(ps.remaining_time_sec))) : null,
      inicio: this.inicioCalc, capa: Number(ps.current_layer) || null, capas: Number(ps.total_layer) || null, error: this.error(),
    };
  }
  avisar() { this.alCambiar(this); }
  cerrar() { this.cerrada = true; clearInterval(this.reloj); try { this.m?.cerrar(); } catch {} }
}

// ─── Coordinación ─────────────────────────────────────────────────────────────
const impresoras = new Map();          // clave: ip (Creality) o sn (Elegoo)
const enviado = new Map();             // id -> último registro mandado
let enEspera = false, ultimoLatido = 0, urgente = null, buscando = false;

function alCambiar() {
  if (PROBAR) return;
  const hayUrgente = [...impresoras.values()].some((p) => {
    const r = p.datos(), a = enviado.get(r.id);
    return !a || a.estado !== r.estado || a.archivo !== r.archivo || a.error !== r.error;
  });
  if (hayUrgente && !urgente) urgente = setTimeout(() => { urgente = null; enviar(false); }, 1500);
}

async function buscar() {
  if (buscando || enEspera) return;
  buscando = true;
  try {
    const ip = await miIP();
    if (!ip) { log("No encuentro la red wifi de este aparato."); return; }
    const base = ip.split(".").slice(0, 3).join(".");
    const conocidas = (config.conocidas || []).filter((x) => x.startsWith(base + "."));
    const [creality, mqtt] = await Promise.all([escanear(base, 9999), escanear(base, 1883)]);
    const elegoo = await buscarElegoo(base, [...new Set([...conocidas, ...mqtt])]);
    for (const c of creality) if (!impresoras.has(c)) { impresoras.set(c, new Creality(c, alCambiar)); log(`Encontré una Creality en ${c}`); }
    for (const e of elegoo) if (!impresoras.has(e.sn)) { impresoras.set(e.sn, new Elegoo(e, alCambiar)); log(`Encontré una ${e.nombre || "Elegoo"} en ${e.ip}`); }
    // Si una impresora cambió de IP (el router le dio otra), la vieja se descarta
    for (const [k, p] of impresoras) if (p instanceof Creality && !creality.includes(k) && !p.vivo) { p.cerrar(); impresoras.delete(k); }
    const ips = [...impresoras.values()].map((p) => p.ip);
    if (JSON.stringify(ips) !== JSON.stringify(config.conocidas)) { config.conocidas = ips; if (!PROBAR) guardarConfig(config); }
    if (!impresoras.size) log(`No encontré impresoras en ${base}.x (¿están prendidas y en el mismo wifi?)`);
  } finally { buscando = false; }
}

async function enviar(latido) {
  if (enEspera && !latido) return;
  const maquinas = [];
  if (!enEspera) for (const p of impresoras.values()) {
    if (!p.vivo && !enviado.has(p.id) && !p.d.model && !p.sn) continue;   // nunca respondió
    const r = p.datos(), a = enviado.get(r.id);
    const cambio = !a || a.estado !== r.estado || a.archivo !== r.archivo || a.error !== r.error || a.ip !== r.ip
      || a.progreso !== r.progreso || Math.abs((a.faltaSeg ?? 0) - (r.faltaSeg ?? 0)) >= 120;
    if (cambio) maquinas.push({ ...r, antes: a ? a.estado : null });
  }
  if (!maquinas.length && !latido) return;
  try {
    const resp = await fetch(config.servidor, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ clave: config.clave, fuente: config.fuente, version: VERSION, latido: !!latido, maquinas }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await resp.json().catch(() => ({}));
    if (resp.status === 401) { log("El Manager no reconoce la clave. Copiala de nuevo desde Impresoras → Conexión."); return; }
    if (!resp.ok) { log("El Manager respondió " + resp.status + (j.error ? ": " + j.error : "")); return; }
    for (const r of maquinas) { const { antes, ...resto } = r; enviado.set(r.id, resto); }
    if (latido) ultimoLatido = Date.now();
    if (j.espera && !enEspera) {
      enEspera = true; log("La PC está prendida: este aparato queda de respaldo, sin conectarse a las impresoras.");
      for (const p of impresoras.values()) p.cerrar();
      impresoras.clear(); enviado.clear();
    } else if (!j.espera && enEspera) {
      enEspera = false; log("La PC no responde: este aparato toma el control de las impresoras.");
      buscar();
    }
  } catch (e) {
    log("No pude hablar con el Manager (" + (e.cause?.code || e.name || e.message) + "). Reintento en un rato.");
  }
}

// ─── Arranque ─────────────────────────────────────────────────────────────────
if (PROBAR) {
  log("Buscando impresoras en el wifi...");
  await buscar();
  setTimeout(() => {
    for (const p of impresoras.values()) console.log(JSON.stringify(p.datos()));
    for (const p of impresoras.values()) p.cerrar();
    process.exit(0);
  }, 12000);
} else {
  log(`Puente WORLD3D ${VERSION} (${config.fuente === "celu" ? "celular, respaldo" : "PC, principal"}) · Node ${process.version}`);
  if (config.fuente === "celu") await enviar(true);   // primero pregunta si la PC está activa
  if (!enEspera) await buscar();
  setTimeout(() => enviar(true), 8000);
  setInterval(() => enviar(Date.now() - ultimoLatido > (enEspera ? 55000 : 110000)), 30000);
  setInterval(() => buscar(), 5 * 60000);
  process.on("SIGINT", () => process.exit(0));
  // Un error raro no apaga el puente: se anota y sigue
  process.on("uncaughtException", (e) => log("Error:", e?.stack || e));
  process.on("unhandledRejection", (e) => log("Error:", e?.stack || e));
}
