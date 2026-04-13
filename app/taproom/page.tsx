import Image from "next/image";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { createServerSupabaseClient } from "../../src/lib/supabase-server";

export default async function TaproomPage() {
  const supabase = await createServerSupabaseClient();
  const { data: config } = await supabase.from("taproom_config").select("*").single();
  const horarios: any[] = config?.horarios || [];
  const mensajeEspecial: string | null = config?.mensaje_especial || null;

  const hoy = new Date().toLocaleDateString("es-MX", { weekday: "long", timeZone: "America/Mexico_City" });
  const hoyCapitalized = hoy.charAt(0).toUpperCase() + hoy.slice(1);
  const horarioHoy = horarios.find((h: any) => h.dia === hoyCapitalized);

  const diasDefault = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map(dia => ({
    dia, abierto: !["Lunes","Domingo"].includes(dia), apertura: "13:00", cierre: "23:00"
  }));
  const horariosDisplay = horarios.length > 0 ? horarios : diasDefault;

  return (
    <main style={{ background: "#1A1108", color: "#F5F0E8" }}>
      <Navbar />

      {/* HERO */}
      <section style={{ minHeight: "100vh", display: "grid", gridTemplateColumns: "1fr 1fr", position: "relative" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "140px 64px 80px", background: "radial-gradient(ellipse 80% 60% at 20% 60%, rgba(200,114,10,0.12) 0%, transparent 60%), #1A1108", position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C8720A", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
            El Caracol · Taproom
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(48px, 5vw, 80px)", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-2.5px", color: "#F5F0E8", marginBottom: 24 }}>
            Tu cantina<br /><em style={{ color: "#F0A030", fontStyle: "italic" }}>de barrio.</em>
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 300, color: "rgba(245,240,232,0.45)", lineHeight: 1.7, maxWidth: 400, marginBottom: 36 }}>
            Ocho taps frescos, buen ambiente y sin pretensiones. Tamaulipas 224 en el Hipódromo Condesa.
          </p>
          {horarioHoy && (
            <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "12px 20px", background: horarioHoy.abierto ? "rgba(76,175,80,0.1)" : "rgba(239,68,68,0.1)", border: `1px solid ${horarioHoy.abierto ? "rgba(76,175,80,0.3)" : "rgba(239,68,68,0.3)"}`, marginBottom: 32, alignSelf: "flex-start" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: horarioHoy.abierto ? "#4CAF50" : "#ef4444" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: horarioHoy.abierto ? "#4CAF50" : "#ef4444" }}>
                {horarioHoy.abierto ? `Abierto hoy · ${horarioHoy.apertura}–${horarioHoy.cierre}` : "Cerrado hoy"}
              </span>
            </div>
          )}
          {mensajeEspecial && (
            <div style={{ padding: "14px 18px", background: "rgba(200,114,10,0.1)", border: "1px solid rgba(200,114,10,0.25)", marginBottom: 32, fontFamily: "var(--font-sans)", fontSize: 13, color: "#F0A030", fontStyle: "italic" }}>
              ⚡ {mensajeEspecial}
            </div>
          )}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="https://maps.google.com/?q=Tamaulipas+224+Hipodromo+Condesa+CDMX" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "16px 32px", background: "#C8720A", color: "#1A1108", textDecoration: "none", fontWeight: 500 }}>
              Cómo llegar →
            </a>
            <a href="https://wa.me/5215579636294" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "16px 32px", background: "transparent", color: "#F5F0E8", textDecoration: "none", border: "1px solid rgba(245,240,232,0.2)" }}>
              WhatsApp
            </a>
          </div>
        </div>
        <div style={{ position: "relative", overflow: "hidden" }}>
          <Image src="/tap.png" alt="El Caracol Taproom" fill style={{ objectFit: "cover", objectPosition: "center" }} priority />
          <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to right, rgba(26,17,8,0.4) 0%, transparent 40%)" }} />
        </div>
      </section>

      {/* UNTAPPD LIVE TAP LIST */}
      <section style={{ background: "#120D06", padding: "80px 80px", borderTop: "1px solid rgba(200,114,10,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 40, flexWrap: "wrap", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4CAF50" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,240,232,0.3)" }}>Untappd Live</span>
            </div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 900, letterSpacing: "-1.5px", color: "#F5F0E8", margin: 0 }}>
              8 taps en vivo.
            </h2>
          </div>
          <a href="https://untappd.com/v/el-caracol-tarabana/174935" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 24px", border: "1px solid rgba(245,240,232,0.15)", color: "rgba(245,240,232,0.4)", textDecoration: "none" }}>
            Ver en Untappd →
          </a>
        </div>
        {/* Untappd embed */}
        <div style={{ background: "#1A1108", border: "1px solid rgba(200,114,10,0.12)", padding: 24 }}>
          <iframe
            src="https://untappd.com/venue/174935/embedded"
            style={{ width: "100%", minHeight: 600, border: "none", display: "block" }}
            title="Tap List en vivo — El Caracol Tarabaña"
            allowFullScreen
          />
        </div>
      </section>

      {/* HORARIOS + MAPA */}
      <section style={{ background: "#FAF6EE", color: "#1A1108", padding: "80px 80px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "start" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />Horarios
            </div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 900, letterSpacing: "-1.5px", marginBottom: 40 }}>
              ¿Cuándo<br /><em style={{ color: "#C8720A", fontStyle: "italic" }}>caemos?</em>
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {horariosDisplay.map((h: any, i: number) => {
                const esHoy = h.dia === hoyCapitalized;
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 0", borderBottom: "1px solid rgba(26,17,8,0.06)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {esHoy && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#C8720A", flexShrink: 0 }} />}
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: esHoy ? 600 : 300, color: esHoy ? "#1A1108" : "rgba(26,17,8,0.55)", marginLeft: esHoy ? 0 : 16 }}>{h.dia}</span>
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: h.abierto ? (esHoy ? "#C8720A" : "rgba(26,17,8,0.55)") : "rgba(26,17,8,0.25)", letterSpacing: "0.06em" }}>
                      {h.abierto ? `${h.apertura} – ${h.cierre}` : "Cerrado"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />Ubicación
            </div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(28px, 3vw, 44px)", fontWeight: 900, letterSpacing: "-1.5px", marginBottom: 24 }}>
              Tamaulipas 224,<br /><em style={{ color: "#C8720A", fontStyle: "italic" }}>Condesa.</em>
            </h2>
            <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 300, color: "rgba(26,17,8,0.5)", lineHeight: 1.6, marginBottom: 24 }}>
              Hipódromo Condesa, Cuauhtémoc, CDMX. A dos cuadras del Parque México, metro Patriotismo.
            </p>
            <div style={{ overflow: "hidden", border: "1px solid rgba(26,17,8,0.1)", marginBottom: 16 }}>
              <iframe
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d940.8!2d-99.17360!3d19.41130!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x85d1ff35c8b2c5b7%3A0x0!2sTamaulipas+224%2C+Hip%C3%B3dromo%2C+06100+CDMX!5e0!3m2!1ses!2smx!4v1"
                width="100%" height="280" style={{ border: 0, display: "block" }} allowFullScreen loading="lazy"
              />
            </div>
            <a href="https://maps.google.com/?q=Tamaulipas+224+Hipodromo+Condesa+CDMX" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 24px", background: "#1A1108", color: "#F0A030", textDecoration: "none", display: "inline-block" }}>
              Abrir en Maps →
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
