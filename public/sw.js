// WORLD3D Manager · guarda la app en el dispositivo para que abra al instante.
// - Página: primero internet (siempre la versión nueva); si no hay señal, la guardada.
// - Archivos de la app (/static, con nombre único por versión) y fuentes: los guardados.
// - Datos (Firebase, Supabase): no se tocan; van siempre directo a internet.
const CACHE = "w3d-app-v1";
const FUENTES = "w3d-fuentes-v1";

self.addEventListener("install", (e) => { self.skipWaiting(); e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/manifest.json", "/favicon.png", "/apple-touch-icon.png"]).catch(() => {}))); });
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== FUENTES).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

const conTiempo = (p, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(new Error("lento")), ms); p.then((r) => { clearTimeout(t); ok(r); }, (e) => { clearTimeout(t); no(e); }); });

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // Página: internet primero (con 4 s de espera), si no la guardada
  if (req.mode === "navigate" && url.origin === self.location.origin) {
    e.respondWith(conTiempo(fetch(req), 4000).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put("/", copia)); return r; })
      .catch(() => caches.match("/").then((r) => r || fetch(req))));
    return;
  }
  // Archivos de la app con nombre único: guardados primero
  if (url.origin === self.location.origin && url.pathname.startsWith("/static/")) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { if (res.ok) { const copia = res.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); } return res; })));
    return;
  }
  // Fuentes de Google: guardadas primero, se actualizan por detrás
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.open(FUENTES).then((c) => c.match(req).then((r) => {
      const red = fetch(req).then((res) => { if (res.ok || res.type === "opaque") c.put(req, res.clone()); return res; }).catch(() => r);
      return r || red;
    })));
  }
});
