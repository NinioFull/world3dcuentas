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

export const C = {
  bg0: "#100E0D",
  bg1: "#191513",
  bg2: "#221D1B",
  bg3: "#2B2523",
  bg4: "#372F2C",
  bg5: "#473D39",
  t1: "#FFF7F3",
  t2: "#D9CCC4",
  t3: "#B3A59C",   // texto secundario: 6.3:1 sobre las tarjetas
  t4: "#9C8E85",   // texto apagado: 4.7:1 sobre las tarjetas (antes 3:1)
  orange: "#F1841B",
  orangeD: "#E9521E",
  orangeBg: "#2B1607",
  orangeLight: "#FFA64D",
  green: "#22C55E",
  greenD: "#16A34A",
  greenBg: "#0D2416",
  red: "#E53212",
  redBg: "#2B0E09",
  blue: "#5B9DF5",
  blueD: "#2F6FD6",
  blueBg: "#0F1A2E",
  purple: "#C084FC",
  purpleBg: "#1E1230",
  yellow: "#FFC83D",
  yellowBg: "#2B2008",
  teal: "#2DD4BF",
  tealBg: "#0B2622",
  wa: "#25D366",
  waBg: "#0B2418",
  r: 20,
  rMd: 14,
  rSm: 10,
  rXs: 6,
  rPill: 50,
};
export const STATUS = {
  printing: { label: "Imprimiendo", color: "#22C55E", bg: "#0D2416", border: "#1A4D2B", dot: "#22C55E" },
  pending:  { label: "En cola",     color: "#FFC83D", bg: "#2B2008", border: "#5C4610", dot: "#FFC83D" },
  done:     { label: "Listo",       color: "#D9CCC4", bg: "#221D1B", border: "#372F2C", dot: "#9A8B82" },
  paused:   { label: "Pausado",     color: "#FF6A4D", bg: "#2B0E09", border: "#5C1F14", dot: "#E53212" },
  shipping: { label: "Para envío",  color: "#C084FC", bg: "#1E1230", border: "#3B2560", dot: "#C084FC" },
  shipped:  { label: "Entregado",   color: "#2DD4BF", bg: "#0B2622", border: "#154D44", dot: "#2DD4BF" },
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
