import Image from "next/image";
import Link from "next/link";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const stats = [
  { num: "2×20", unit: "BBL", label: "Fermentadores" },
  { num: "10k", unit: "L", label: "Cap. mensual" },
  { num: "2022", unit: "", label: "Fundación" },
  { num: "5", unit: "", label: "Estilos de línea" },
];

const proceso = [
  { n: "01", title: "Molienda", desc: "Malta base y especialidades pesadas en molino de rodillos. Control de finura para extracción óptima." },
  { n: "02", title: "Maceración", desc: "65–68°C por 60–75 min. Single infusion para IPAs, step mash para lagers. Agua de Lerma ajustada." },
  { n: "03", title: "Cocción & Lupulado", desc: "90 min. Lúpulos en primera wort, 60, 15 min y flameout. Whirlpool a 80°C para aromáticos." },
  { n: "04", title: "Fermentación", desc: "Levaduras seleccionadas por estilo. Ales 18–22°C, lagers 10–12°C. Control de temperatura por jacketed tanks." },
  { n: "05", title: "Maduración", desc: "Mínimo 2 semanas. Dry hopping en frío para IPAs. Filtración fina opciona o serving turbo." },
  { n: "06", title: "Envasado", desc: "Llenado en cans 355ml o barriles 20L PET/Acero. Purga con CO₂. Análisis de O₂ antes de sellar." },
];

export default function FabricaPage() {
  return (
    <main style={{ background: "#1A1108", color: "#F5F0E8" }}>
      <Navbar />

      {/* HERO */}
      <section style={{ minHeight: "80vh", display: "flex", flexDirection: "column", justifyContent: "flex-end", position: "relative", overflow: "hidden" }}>
        <Image src="/planta1.jpg" alt="Fábrica Tarabaña Lerma" fill style={{ objectFit: "cover", objectPosition: "center" }} priority />
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to bottom, rgba(26,17,8,0.7) 0%, rgba(26,17,8,0.5) 50%, rgba(26,17,8,0.9) 100%)", zIndex: 1 }} />
        <div style={{ position: "relative", zIndex: 2, padding: "120px 80px 80px" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C8720A", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
            Lerma, Estado de México
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(52px, 7vw, 96px)", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-3px", marginBottom: 28 }}>
            Donde nace<br /><em style={{ color: "#F0A030", fontStyle: "italic" }}>la cerveza.</em>
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 300, color: "rgba(245,240,232,0.45)", lineHeight: 1.7, maxWidth: 500, marginBottom: 64 }}>
            Fábrica independiente en Lerma. Dos fermentadores de 20 BBL, recetas propias, obsesión por la consistencia.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderTop: "1px solid rgba(245,240,232,0.08)", paddingTop: 40 }}>
            {stats.map((s, i) => (
              <div key={i} style={{ paddingRight: 40, borderRight: i < 3 ? "1px solid rgba(245,240,232,0.06)" : "none", paddingLeft: i > 0 ? 40 : 0 }}>
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 900, color: "#F0A030", lineHeight: 1 }}>
                  {s.num}<span style={{ fontSize: 18, color: "#C8720A", marginLeft: 4 }}>{s.unit}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", marginTop: 6 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MARQUEE */}
      <div style={{ background: "#C8720A", padding: "10px 0", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div style={{ display: "inline-flex", animation: "marquee 20s linear infinite" }}>
          {["Maceración · Cocción · Fermentación · Maduración · Envasado · Lerma Edo. Méx · Craft independiente · "].concat(["Maceración · Cocción · Fermentación · Maduración · Envasado · Lerma Edo. Méx · Craft independiente · "]).map((t, i) => (
            <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#1A1108", padding: "0 40px" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* PROCESO */}
      <section style={{ background: "#FAF6EE", color: "#1A1108", padding: "100px 80px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />El proceso
        </div>
        <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 4vw, 52px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-1.5px", marginBottom: 64 }}>
          De grano<br /><em style={{ fontStyle: "italic", color: "#C8720A" }}>a lata.</em>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2 }}>
          {proceso.map((p) => (
            <div key={p.n} style={{ background: "#1A1108", color: "#F5F0E8", padding: "32px 28px", position: "relative" }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 48, fontWeight: 700, color: "rgba(245,240,232,0.04)", position: "absolute", top: 16, right: 20, lineHeight: 1 }}>{p.n}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "#C8720A", marginBottom: 12 }}>{p.n}</div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, fontWeight: 700, fontStyle: "italic", marginBottom: 12 }}>{p.title}</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(245,240,232,0.45)", lineHeight: 1.6, fontWeight: 300 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <div style={{ background: "#C8720A", color: "#1A1108", padding: "72px 80px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(28px, 3vw, 42px)", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-1px" }}>¿Quieres nuestras cervezas?</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, marginTop: 8, opacity: 0.65, fontWeight: 300 }}>Distribución para bares, restaurantes y tiendas.</div>
        </div>
        <Link href="/contacto" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "18px 40px", background: "#1A1108", color: "#F0A030", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>
          Contáctanos →
        </Link>
      </div>

      <Footer />
    </main>
  );
}
