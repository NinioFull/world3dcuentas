// Verifica que un pedido venga de verdad de Alexa (Amazon), como exige su documentación para endpoints HTTPS:
// URL del certificado, cadena de certificados hasta una raíz confiable, nombre echo-api.amazon.com,
// firma del cuerpo (SHA-256) y hora del pedido (máx. 150 s). Sin dependencias: solo crypto de Node.
import { X509Certificate, createVerify } from "node:crypto";
import tls from "node:tls";

export const RAICES = tls.rootCertificates.map((pem) => new X509Certificate(pem));
const cache = new Map(); // url → { certs, hasta }

export function urlValida(u) {
  let url;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol.toLowerCase() !== "https:") return false;
  if (url.hostname.toLowerCase() !== "s3.amazonaws.com") return false;
  if (url.port && url.port !== "443") return false;
  // La ruta ya viene normalizada por URL (resuelve /../); tiene que empezar con /echo.api/ (sensible a mayúsculas)
  return url.pathname.startsWith("/echo.api/");
}

const partirPem = (texto) => (texto.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) || []).map((p) => new X509Certificate(p));

const vigente = (c, ahora) => new Date(c.validFrom).getTime() <= ahora && ahora <= new Date(c.validTo).getTime();

// Cadena: cada certificado firmado por el siguiente, y el último por una raíz confiable (o es una raíz confiable)
export function cadenaValida(certs, ahora = Date.now(), raices = RAICES) {
  if (!certs.length) return false;
  if (!certs.every((c) => vigente(c, ahora))) return false;
  if (!certs[0].checkHost("echo-api.amazon.com")) return false;
  for (let i = 0; i < certs.length - 1; i++) {
    if (!certs[i].checkIssued(certs[i + 1]) || !certs[i].verify(certs[i + 1].publicKey)) return false;
  }
  const ultimo = certs[certs.length - 1];
  return raices.some((r) =>
    r.fingerprint256 === ultimo.fingerprint256 ||
    (vigente(r, ahora) && ultimo.checkIssued(r) && ultimo.verify(r.publicKey))
  );
}

export function firmaValida(cert, firmaB64, cuerpo, algoritmo = "RSA-SHA256") {
  try {
    const v = createVerify(algoritmo);
    v.update(cuerpo);
    return v.verify(cert.publicKey, Buffer.from(firmaB64, "base64"));
  } catch { return false; }
}

async function bajarCadena(u) {
  const c = cache.get(u);
  if (c && c.hasta > Date.now()) return c.certs;
  const r = await fetch(u);
  if (!r.ok) throw new Error("certificado " + r.status);
  const certs = partirPem(await r.text());
  cache.set(u, { certs, hasta: Date.now() + 3600000 });
  return certs;
}

// headers: objeto Headers del Request. cuerpo: texto crudo. pedido: JSON ya leído.
export async function verificarAlexa(headers, cuerpo, pedido, ahora = Date.now()) {
  const u = headers.get("signaturecertchainurl");
  const f256 = headers.get("signature-256");
  const f1 = headers.get("signature");
  if (!u || !(f256 || f1)) return "faltan cabeceras de firma";
  if (!urlValida(u)) return "URL de certificado no válida";
  const ts = Date.parse(pedido?.request?.timestamp || "");
  if (!ts || Math.abs(ahora - ts) > 150000) return "pedido vencido";
  let certs;
  try { certs = await bajarCadena(u); } catch (e) { return "no se pudo bajar el certificado"; }
  if (!cadenaValida(certs, ahora)) return "certificado no válido";
  const ok = f256 ? firmaValida(certs[0], f256, cuerpo, "RSA-SHA256") : firmaValida(certs[0], f1, cuerpo, "RSA-SHA1");
  return ok ? null : "firma no válida";
}
