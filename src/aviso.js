// Aviso de pedido nuevo en el iPad: campanita, vibración y numerito en el ícono de la app.
// iOS no deja sonar audio hasta que tocás la pantalla una vez: el primer toque "desbloquea" el sonido.
let ctx = null;
export const desbloquearSonido = () => {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
  } catch (e) {}
};
export const sonarCampana = () => {
  try {
    if (!ctx) desbloquearSonido();
    if (!ctx) return;
    const t0 = ctx.currentTime;
    [[880, 0], [1320, 0.18], [880, 0.5], [1320, 0.68]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + d);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + d + 0.35);
      o.connect(g); g.connect(ctx.destination); o.start(t0 + d); o.stop(t0 + d + 0.4);
    });
  } catch (e) {}
  try { if (navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (e) {}
};
export const ponerNumerito = (n) => {
  try { if (navigator.setAppBadge) n > 0 ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) {}
  try { document.title = (n > 0 ? `(${n}) ` : "") + "WORLD3D Manager"; } catch (e) {}
};
// Pedidos ya avisados, guardados en este dispositivo para no volver a sonar al recargar
const CLAVE = "w3d-avisados";
export const leerAvisados = () => { try { return new Set(JSON.parse(localStorage.getItem(CLAVE) || "[]")); } catch (e) { return null; } };
export const guardarAvisados = (set) => { try { localStorage.setItem(CLAVE, JSON.stringify([...set].slice(-300))); } catch (e) {} };
