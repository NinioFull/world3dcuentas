// Pantalla de entrada: solo con Google, con la cuenta admin de WORLD3D (la misma del panel del sitio).
import { C, ISOTIPO, FUENTE_TITULO } from "./tema";
import { entrarConGoogle, salir } from "./web";

export default function LoginView({ sesion, revisando, sinPermiso, reconectar, error }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg1, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 380, textAlign: "center" }}>
        <img src={ISOTIPO} alt="WORLD3D" style={{ width: 72, height: 90, objectFit: "contain", marginBottom: 18 }} />
        <div style={{ fontFamily: FUENTE_TITULO, fontSize: 30, fontWeight: 900, color: C.t1, letterSpacing: 1, textTransform: "uppercase" }}>
          WORLD<span style={{ color: C.orange }}>3D</span>
        </div>
        <div style={{ fontSize: 14, color: C.t3, marginTop: 4, marginBottom: 30 }}>Manager · cola, pedidos web y máquinas</div>

        {revisando ? (
          <div style={{ fontSize: 14, color: C.t2, fontWeight: 700 }}>Revisando tu cuenta…</div>
        ) : reconectar ? (
          <div>
            <div style={{ background: C.bg2, border: `1px solid ${C.bg4}`, borderRadius: C.rMd, padding: 16, fontSize: 14, color: C.t2, lineHeight: 1.5, marginBottom: 14 }}>
              Falta conectar la cola de impresión con tu cuenta. Es una sola vez por dispositivo.
              {error && <div style={{ fontSize: 12, color: C.red, marginTop: 8 }}>Error: {error}</div>}
            </div>
            <button onClick={reconectar} style={{ background: "#fff", border: "none", color: "#191513", borderRadius: C.rMd, padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%" }}>
              Conectar con Google
            </button>
            <button onClick={salir} style={{ background: "transparent", border: "none", color: C.t3, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 12 }}>Salir</button>
          </div>
        ) : sinPermiso ? (
          <div>
            <div style={{ background: C.redBg, border: `1px solid ${C.red}66`, borderRadius: C.rMd, padding: 16, fontSize: 14, color: C.t2, lineHeight: 1.5, marginBottom: 14 }}>
              <b style={{ color: C.red }}>{sesion?.user?.email}</b> no es admin de WORLD3D. Entrá con la cuenta del negocio.
            </div>
            <button onClick={salir} style={{ background: C.bg3, border: `1px solid ${C.bg5}`, color: C.t1, borderRadius: C.rMd, padding: "13px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%" }}>
              Cambiar de cuenta
            </button>
          </div>
        ) : (
          <button onClick={entrarConGoogle} style={{ background: "#fff", border: "none", color: "#191513", borderRadius: C.rMd, padding: "14px 20px", fontSize: 15, fontWeight: 800, cursor: "pointer", width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, boxShadow: `0 6px 24px rgba(241,132,27,.25)` }}>
            <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.5 13.3l7.8 6.1C12.2 13.6 17.6 9.5 24 9.5z"/>
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8C43.8 38 46.5 31.8 46.5 24.5z"/>
              <path fill="#FBBC05" d="M10.3 28.6A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.1.8-4.6l-7.8-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.5 10.7l7.8-6.1z"/>
              <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.4 0-11.8-4.1-13.7-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z"/>
            </svg>
            Entrar con Google
          </button>
        )}
        <div style={{ fontSize: 12, color: C.t4, marginTop: 22, lineHeight: 1.5 }}>
          Los pedidos de la web se leen de la misma base que el sitio. Solo entra la cuenta admin.
        </div>
      </div>
    </div>
  );
}
