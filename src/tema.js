// ─── MARCA WORLD3D ─────────────────────────────────────────────────────────────
// Paleta del brand board: Red Sunset #E53212 · Trendy Orange #F1841B · Heliconia #E9521E
// Sauvignon #FFF7F3 · Charming Black #191513 · Winter Cream #FFF0DE
// Tema oscuro: fondos cálidos sobre Charming Black, acentos naranja/rojo de la marca.

export const MARCA = {
  rojo: "#E53212",
  naranja: "#F1841B",
  helic: "#E9521E",
  crema: "#FFF7F3",
  crema2: "#FFF0DE",
  negro: "#191513",
};

// Solo colores del brand board. Los fondos y grises son tonos cálidos sacados de Charming Black y Winter Cream.
// Los nombres viejos (green, blue, purple...) se mantienen para no tocar todo el código, pero ahora apuntan a la marca:
//   en marcha / dinero  → Trendy Orange      listo / terminar → Heliconia
//   pausa / alerta      → Red Sunset         espera / neutro  → Winter Cream / Sauvignon
export const C = {
  bg0: "#100E0D",
  bg1: "#191513",   // Charming Black
  bg2: "#221D1B",
  bg3: "#2B2523",
  bg4: "#372F2C",
  bg5: "#473D39",
  t1: "#FFF7F3",    // Sauvignon
  t2: "#D9CCC4",
  t3: "#B3A59C",    // texto secundario: 6.3:1 sobre las tarjetas
  t4: "#9C8E85",    // texto apagado: 4.7:1 sobre las tarjetas
  orange: "#F1841B",      // Trendy Orange
  orangeD: "#E9521E",     // Heliconia
  orangeBg: "#2E1A0B",
  orangeLight: "#F1841B",
  green: "#F1841B",       // en marcha, cobrado → Trendy Orange
  greenD: "#E9521E",
  greenBg: "#2E1A0B",
  red: "#E53212",         // Red Sunset
  redBg: "#2E0F09",
  blue: "#E9521E",        // listo / terminar → Heliconia
  blueD: "#E9521E",
  blueBg: "#2E1309",
  purple: "#FFF0DE",      // envíos, cantidades → Winter Cream
  purpleBg: "#2A2420",
  yellow: "#FFF0DE",      // en espera, entregas → Winter Cream
  yellowBg: "#2A2420",
  teal: "#D9CCC4",        // entregado (cerrado) → crema apagado
  tealBg: "#241F1C",
  wa: "#FFF0DE",          // WhatsApp: crema, con su ícono
  waBg: "#2A2420",
  r: 20,
  rMd: 14,
  rSm: 10,
  rXs: 6,
  rPill: 50,
};
export const STATUS = {
  printing: { label: "Imprimiendo", color: "#F1841B", bg: "#2E1A0B", border: "#6B3A12", dot: "#F1841B" },
  pending:  { label: "En cola",     color: "#FFF0DE", bg: "#2A2420", border: "#4A3F36", dot: "#FFF0DE" },
  done:     { label: "Listo",       color: "#E9521E", bg: "#2E1309", border: "#6B2812", dot: "#E9521E" },
  paused:   { label: "Pausado",     color: "#E53212", bg: "#2E0F09", border: "#6B1F12", dot: "#E53212" },
  shipping: { label: "Para envío",  color: "#FFF7F3", bg: "#2B2523", border: "#5C4F47", dot: "#FFF7F3" },
  shipped:  { label: "Entregado",   color: "#B3A59C", bg: "#221D1B", border: "#372F2C", dot: "#9C8E85" },
};

// Isotipo oficial (hexágono rojo con la W en crema), el mismo que usa el sitio
export const ISOTIPO = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjkiIGhlaWdodD0iMTYxIiB2aWV3Qm94PSIxNDAuODk1IDY0Ljg3OSAxMjkuMzg3IDE2MC44MiI+PHBhdGggZmlsbD0iI0U1MzIxMiIgZD0iTSAyNzAuMjgxMjUgMTEzLjEyNSBMIDI3MC4yODEyNSAxODcuNDQxNDA2IEwgMjAwLjg1MTU2MiAyMjUuNjk5MjE5IEwgMTc2LjUyNzM0NCAyMTEuOTI1NzgxIEwgMTc2LjUyNzM0NCAxOTQuNjA1NDY5IEwgMTQwLjg5NDUzMSAxNzYuNDU3MDMxIEwgMTQwLjg5NDUzMSAxMDMuMDgyMDMxIEwgMjEwLjE3MTg3NSA2NC44Nzg5MDYgTCAyMzQuNDI1NzgxIDc3LjM3NSBMIDIzNC40MjU3ODEgOTQuNTExNzE5IFogTSAyNzAuMjgxMjUgMTEzLjEyNSAiLz48cGF0aCBmaWxsPSIjRkVGMERFIiBkPSJNIDI2MS42Njc5NjkgMTE4LjQxMDE1NiBMIDI2MS42Njc5NjkgMTgyLjQwMjM0NCBMIDIwMC45MDIzNDQgMjE1Ljg4NjcxOSBMIDE4NS4xNDA2MjUgMjA2Ljk1MzEyNSBMIDE4NS4xNDA2MjUgMTkyLjQ3NjU2MiBMIDE5NC41NTg1OTQgMTk3LjI4NTE1NiBMIDE5NC41NTg1OTQgMjAxLjUzMTI1IEwgMjAwLjc1NzgxMiAyMDQuNzEwOTM4IEwgMjUyLjI2OTUzMSAxNzYuNjUyMzQ0IEwgMjUyLjI2OTUzMSAxMjMuNzE4NzUgTCAyMjYuNDYwOTM4IDEwOS45MTc5NjkgTCAxOTkuNDY4NzUgMTI0Ljg5MDYyNSBMIDIyNC4xMjUgMTM5LjkzNzUgTCAyMjQuMTI1IDE2OC4zMDA3ODEgTCAxODUuMTQwNjI1IDE4OS4zODI4MTIgTCAxNDkuNTA3ODEyIDE3MS4yMzA0NjkgTCAxNDkuNTA3ODEyIDEwOC4yMjI2NTYgTCAyMTAuMzEyNSA3NC42OTE0MDYgTCAyMjUuODA4NTk0IDgyLjY3NTc4MSBMIDIyNS44MDg1OTQgOTYuNjQ0NTMxIEwgMjE2LjQ2MDkzOCA5Mi45MDYyNSBMIDIxNi40NjA5MzggODguMzA0Njg4IEwgMjEwLjI2MTcxOSA4NS4xNTYyNSBMIDE1OC45Mjk2ODggMTEzLjkwMjM0NCBMIDE1OC45Mjk2ODggMTY2LjYxNzE4OCBMIDE4NS4xNDA2MjUgMTc5LjUzOTA2MiBMIDE4NS44MjQyMTkgMTc5Ljg3ODkwNiBMIDIxMi4wMTU2MjUgMTY0LjgyMDMxMiBMIDIxNC42NTIzNDQgMTYzLjMwNDY4OCBMIDIxNC42NTIzNDQgMTQ1LjQ4NDM3NSBMIDE4NS4xNDA2MjUgMTI3LjA4MjAzMSBMIDE4NS4xNDA2MjUgMTIyLjAyMzQzOCBMIDIyNS44MDg1OTQgOTkuODAwNzgxIFogTSAyNjEuNjY3OTY5IDExOC40MTAxNTYgIi8+PHBhdGggZmlsbD0iI0U5NTIxRSIgZD0iTSAyMTQuNjUyMzQ0IDE0NS40ODQzNzUgTCAyMTQuNjUyMzQ0IDE2My4zMDQ2ODggTCAyMTIuMDE1NjI1IDE2NC44MjQyMTkgTCAxODUuMTQwNjI1IDE0OC41MjczNDQgTCAxODUuMTQwNjI1IDEyNy4wODIwMzEgWiBNIDIxNC42NTIzNDQgMTQ1LjQ4NDM3NSAiLz48cGF0aCBmaWxsPSIjRjA4NDFCIiBkPSJNIDIxMi4wMTU2MjUgMTY0LjgyMDMxMiBMIDE4NS44MjQyMTkgMTc5Ljg3ODkwNiBMIDE4NS4xNDA2MjUgMTc5LjUzOTA2MiBMIDE4NS4xNDA2MjUgMTQ4LjUyNzM0NCBaIE0gMjEyLjAxNTYyNSAxNjQuODIwMzEyICIvPjwvc3ZnPg==";

// Fuentes: las mismas que el sitio (Rubik para títulos, Outfit para texto)
export const FUENTES_URL = "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700&family=Rubik:wght@700;800;900&display=swap";
export const FUENTE_TEXTO = "'Outfit', system-ui, sans-serif";
export const FUENTE_TITULO = "'Rubik', 'Outfit', system-ui, sans-serif";

// Colores de filamento reales del catálogo (los mismos que elige el cliente en la web), con su recargo en Bs
export const COLORES = [
  ["Blanco", 0], ["Negro", 0], ["Rojo", 0], ["Plomo", 0], ["Café", 0], ["Amarillo", 0],
  ["Celeste pastel", 0], ["Púrpura", 0], ["Verde oscuro", 0], ["Verde claro", 0], ["Beige", 0], ["Rosado claro", 0],
  ["Rosado oscuro", 10], ["Plomo oscuro", 10],
  ["Dorado impreso en 3D", 15], ["Dorado pintado con spray", 15], ["Dorado bronce pintado con spray", 15],
];
export const COLORS = COLORES.map(c => c[0]);
export const recargoColor = (nombre) => (COLORES.find(c => c[0] === nombre) || [null, 0])[1];
export const etiquetaColor = (nombre) => { const r = recargoColor(nombre); return r ? `${nombre} (+${r} Bs)` : nombre; };
