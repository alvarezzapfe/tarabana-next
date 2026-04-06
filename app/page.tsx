import Image from "next/image";
import Link from "next/link";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";

const lineup = [
  { name: "Brisa", style: "Session IPA", abv: "4.5%", ibu: 32, notes: "Ligera · fresca · aromática", img: "/brisalata.png", accent: "#78A040" },
  { name: "Chula Vista", style: "West Coast IPA", abv: "6.8%", ibu: 62, notes: "Pino · grapefruit · seca", img: "/chulavistalata.png", accent: "#D4882A" },
  { name: "Caliza", style: "Hazy IPA", abv: "6.3%", ibu: 38, notes: "Tropical · juicy · suave", img: "/calizalata.png", accent: "#E8C060" },
  { name: "Sílice", style: "Czech Pils", abv: "5.0%", ibu: 36, notes: "Crisp · noble hops · precisa", img: "/silicelata.png", accent: "#88B8D0" },
  { name: "Magma", style: "Doble IPA", abv: "8.5%", ibu: 75, notes: "Intensa · lupulada · peligrosa", img: "/magmalata.png", accent: "#C05030" },
];

const marqueeText = "Cerveza artesanal · Condesa CDMX · Lerma Edo. Méx · Best IPA Copa Pacífico 2024 · Tap List en vivo · Session · West Coast · Hazy · Czech Pils · Doble IPA · ";

export default function Home() {
  return (
    <main style={{ background: "#1A1108", color: "#F5F0E8" }}>
      <Navbar />

      <section style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
        padding: "120px 48px 140px",
        background: "radial-gradient(ellipse 70% 50% at 50% 35%, rgba(200,114,10,0.12) 0%, transparent 70%), #1A1108",
      }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C8720A", marginBottom: 48, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
          Cervecería artesanal · Condesa CDMX
          <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
        </div>

        <div style={{ position: "relative", marginBottom: 48 }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,114,10,0.2) 0%, transparent 70%)", zIndex: 0 }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: 370, height: 370, borderRadius: "50%", border: "1px solid rgba(200,114,10,0.2)", zIndex: 1, pointerEvents: "none" }} />
          <div className="animate-spin-slow" style={{ position: "absolute", top: "50%", left: "50%", width: 415, height: 415, borderRadius: "50%", border: "1px dashed rgba(200,114,10,0.12)", zIndex: 1, pointerEvents: "none" }} />
          <Image src="/tarabana_logo_negro.jpg" alt="Fábrica de Cervezas Tarabaña" width={340} height={340} priority style={{ borderRadius: "50%", filter: "invert(1) brightness(0.88) sepia(0.2) saturate(1.5) hue-rotate(12deg)", opacity: 0.95, position: "relative", zIndex: 2, display: "block" }} />
        </div>

        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(48px, 6vw, 80px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-2px", color: "#F5F0E8", marginBottom: 20 }}>
          Craft para <em style={{ fontStyle: "italic", color: "#F0A030" }}>todos.</em>
        </h1>

        <p style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 300, color: "rgba(245,240,232,0.5)", lineHeight: 1.7, maxWidth: 480, marginBottom: 40 }}>
          Lupulada, balanceada y sin pretensiones. Cinco estilos hechos con obsesión en Lerma, servidos frescos en Condesa.
        </p>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center", marginBottom: 64 }}>
          <Link href="/taplist" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "16px 40px", background: "#C8720A", color: "#1A1108", textDecoration: "none", fontWeight: 500, border: "2px solid #C8720A" }}>Ver Tap List →</Link>
          <Link href="#cervezas" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "16px 40px", background: "transparent", color: "#F5F0E8", textDecoration: "none", border: "1px solid rgba(245,240,232,0.2)" }}>Nuestras cervezas</Link>
        </div>

        <div style={{ display: "flex", gap: 60, paddingTop: 40, borderTop: "1px solid rgba(245,240,232,0.08)", flexWrap: "wrap", justifyContent: "center" }}>
          {[{ num: "5", lab: "Estilos" }, { num: "Best IPA", lab: "Copa Pacífico 2024" }, { num: "10k L", lab: "Cap. mensual" }].map((s) => (
            <div key={s.lab} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, color: "#F0A030", lineHeight: 1 }}>{s.num}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.35)", marginTop: 6 }}>{s.lab}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ background: "#C8720A", padding: "12px 0", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div className="animate-marquee" style={{ display: "inline-flex" }}>
          {[marqueeText, marqueeText].map((t, i) => (
            <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#1A1108", padding: "0 40px" }}>{t}</span>
          ))}
        </div>
      </div>

      <section id="cervezas" style={{ background: "#FAF6EE", color: "#1A1108", padding: "100px 64px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />Lineup de línea
        </div>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-1.5px", marginBottom: 56 }}>
          Cinco cervezas.<br /><em style={{ fontStyle: "italic", color: "#C8720A" }}>Una obsesión.</em>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 2 }}>
          {lineup.map((b) => (
            <article key={b.name} style={{ background: "#1A1108", color: "#F5F0E8", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 14, position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: b.accent }} />
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8, marginTop: 8 }}>
                <Image src={b.img} alt={b.name} width={90} height={140} style={{ objectFit: "contain", filter: "drop-shadow(0 8px 24px rgba(0,0,0,0.4))" }} />
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.35)" }}>{b.style}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 26, fontWeight: 700, fontStyle: "italic", color: "#F5F0E8", lineHeight: 1.1 }}>{b.name}</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "rgba(245,240,232,0.45)", lineHeight: 1.5, fontWeight: 300 }}>{b.notes}</div>
              <div style={{ height: 2, background: "rgba(245,240,232,0.08)", position: "relative" }}>
                <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${Math.min(100, (b.ibu / 80) * 100)}%`, background: b.accent }} />
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: "auto", paddingTop: 14, borderTop: "1px solid rgba(245,240,232,0.07)" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", border: "1px solid rgba(245,240,232,0.15)", color: "rgba(245,240,232,0.5)" }}>{b.abv} ABV</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", border: "1px solid rgba(245,240,232,0.15)", color: "rgba(245,240,232,0.5)" }}>{b.ibu} IBU</span>
              </div>
            </article>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 64 }}>
          <Image src="/todaslatas.png" alt="Todas las latas Tarabaña" width={900} height={320} style={{ maxWidth: "100%", height: "auto", objectFit: "contain" }} />
        </div>
      </section>

      <div style={{ background: "#C8720A", color: "#1A1108", padding: "72px 80px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.55, marginBottom: 12 }}>El Caracol · Taproom</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-1.5px" }}>Cae por una pinta.</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, marginTop: 12, opacity: 0.65, fontWeight: 300 }}>Tamaulipas 224, Hipódromo · Mar–Sáb 13:00–23:00</div>
        </div>
        <Link href="/taproom" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "18px 40px", background: "#1A1108", color: "#F0A030", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>Ver Taproom →</Link>
      </div>

      <section style={{ background: "#1A1108", padding: "100px 80px" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 48, flexWrap: "wrap", gap: 24 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />Menú en vivo
            </div>
            <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-1.5px", color: "#F5F0E8" }}>Tap List</h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.4)" }}>
            <div className="animate-pulse-dot" style={{ width: 7, height: 7, background: "#4CAF50", borderRadius: "50%" }} />
            Untappd Live
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["No.", "Cerveza", "ABV", "Estado"].map((h, i) => (
                <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", textAlign: i === 2 ? "right" : "left", paddingBottom: 16, paddingRight: i === 2 ? 24 : 0, borderBottom: "1px solid rgba(245,240,232,0.07)", width: i === 0 ? 36 : "auto" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lineup.map((b, i) => (
              <tr key={b.name}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(245,240,232,0.2)", padding: "20px 0", borderBottom: "1px solid rgba(245,240,232,0.05)" }}>0{i + 1}</td>
                <td style={{ padding: "20px 0", borderBottom: "1px solid rgba(245,240,232,0.05)" }}>
                  <div style={{ fontFamily: "var(--font-serif)", fontSize: 20, fontWeight: 700, fontStyle: "italic", color: "#F5F0E8" }}>{b.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(245,240,232,0.3)", marginTop: 3 }}>{b.style} · {b.ibu} IBU</div>
                </td>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "#C8720A", textAlign: "right", paddingRight: 24, borderBottom: "1px solid rgba(245,240,232,0.05)" }}>{b.abv}</td>
                <td style={{ padding: "20px 0", borderBottom: "1px solid rgba(245,240,232,0.05)" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", padding: "4px 12px", background: "rgba(76,175,80,0.12)", color: "#5CC865" }}>En tap</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ textAlign: "center", marginTop: 48 }}>
          <Link href="/taplist" style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "16px 40px", background: "#C8720A", color: "#1A1108", textDecoration: "none", fontWeight: 500 }}>Ver menú completo →</Link>
        </div>
      </section>

      <Footer />
    </main>
  );
}
