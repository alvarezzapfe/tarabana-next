import Image from "next/image";
import Link from "next/link";
import Navbar from "./components/Navbar";
import Footer from "./components/Footer";
import { createServerSupabaseClient } from "../src/lib/supabase-server";

const lineup = [
  { name: "Brisa", style: "Session IPA", abv: "4.5%", ibu: 32, notes: "Ligera · fresca · aromática", img: "/brisalata.png", accent: "#78A040" },
  { name: "Chula Vista", style: "West Coast IPA", abv: "6.8%", ibu: 62, notes: "Pino · grapefruit · seca", img: "/chulavistalata.png", accent: "#D4882A" },
  { name: "Caliza", style: "Hazy IPA", abv: "6.3%", ibu: 38, notes: "Tropical · juicy · suave", img: "/calizalata.png", accent: "#E8C060" },
  { name: "Sílice", style: "Czech Pils", abv: "5.0%", ibu: 36, notes: "Crisp · noble hops · precisa", img: "/silicelata.png", accent: "#88B8D0" },
  { name: "Magma", style: "Doble IPA", abv: "8.5%", ibu: 75, notes: "Intensa · lupulada · peligrosa", img: "/magmalata.png", accent: "#C05030" },
];

const marqueeText = "Una cerveza para todos · Condesa CDMX · Lerma Edo. Méx · Best IPA Copa Pacífico 2024 · Tap List en vivo · Session · West Coast · Hazy · Czech Pils · Doble IPA · ";

const competenciaLogos: Record<string, string> = {
  "Copa Cervecera del Pacífico": "/cocepa_2025.png",
  "Copa Cerveza MX": "/copa_cerveza.png",
  "Aro Rojo": "/aro_rojo.webp",
};

const medallaConfig: Record<string, { color: string; label: string; glow: string }> = {
  oro:    { color: "#F0A030", label: "ORO",    glow: "rgba(240,160,48,0.4)" },
  plata:  { color: "#C0C8D0", label: "PLATA",  glow: "rgba(192,200,208,0.4)" },
  bronce: { color: "#C87040", label: "BRONCE", glow: "rgba(200,112,64,0.4)" },
};

export default async function Home() {
  const supabase = await createServerSupabaseClient();
  const { data: medallero } = await supabase
    .from("medallero")
    .select("*")
    .order("año", { ascending: false });

  const { data: productos } = await supabase
    .from("productos")
    .select("id, nombre, estilo, abv, imagen_url, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero")
    .eq("activo", true)
    .order("nombre");

  return (
    <main style={{ background: "#1A1108", color: "#F5F0E8" }}>
      <style>{`
        @keyframes caracol-float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes caracol-wobble {
          0%   { transform: rotate(0deg) scale(1); }
          15%  { transform: rotate(-5deg) scale(1.04); }
          30%  { transform: rotate(5deg) scale(1.04); }
          45%  { transform: rotate(-3deg) scale(1.02); }
          60%  { transform: rotate(3deg) scale(1.02); }
          75%  { transform: rotate(-1deg) scale(1.01); }
          100% { transform: rotate(0deg) scale(1); }
        }
        .caracol-img { animation: caracol-float 4s ease-in-out infinite; }
        .caracol-img:hover { animation: caracol-wobble 0.7s ease-in-out forwards; }
        @keyframes spin-slow {
          from { transform: translate(-50%,-50%) rotate(0deg); }
          to   { transform: translate(-50%,-50%) rotate(360deg); }
        }
        .ring-spin {
          position:absolute; top:50%; left:50%;
          width:440px; height:440px; border-radius:50%;
          border:1px dashed rgba(200,114,10,0.15);
          animation: spin-slow 30s linear infinite;
          pointer-events:none; z-index:1;
        }
        @keyframes marquee {
          from { transform: translateX(0); }
          to   { transform: translateX(-50%); }
        }
        .animate-marquee { animation: marquee 28s linear infinite; }
        @keyframes pulse-dot { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .pulse-dot { animation: pulse-dot 2s ease-in-out infinite; }
        @keyframes scroll-carousel {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .carousel-track { animation: scroll-carousel 20s linear infinite; }
        .carousel-track:hover { animation-play-state: paused; }
        .medalla-card {
          transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        .medalla-card:hover {
          transform: translateY(-6px) scale(1.02);
        }
        .comp-logo-box {
          transition: transform 0.3s ease, filter 0.3s ease;
          filter: grayscale(0.2);
        }
        .comp-logo-box:hover {
          transform: scale(1.05);
          filter: grayscale(0);
        }
      `}</style>

      <Navbar />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", textAlign: "center",
        position: "relative", overflow: "hidden", padding: "120px 48px 140px",
        background: "radial-gradient(ellipse 70% 50% at 50% 35%, rgba(200,114,10,0.12) 0%, transparent 70%), #1A1108",
      }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C8720A", marginBottom: 48, display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
          Cervecería artesanal · Condesa CDMX
          <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
        </div>

        <div style={{ position: "relative", marginBottom: 52, width: 340, height: 340 }}>
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,114,10,0.18) 0%, transparent 70%)", zIndex: 0 }} />
          <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 370, height: 370, borderRadius: "50%", border: "1px solid rgba(200,114,10,0.18)", zIndex: 1, pointerEvents: "none" }} />
          <div className="ring-spin" />
          <div style={{ position: "relative", zIndex: 2, width: 340, height: 340, display: "flex", alignItems: "center", justifyContent: "center",  }}>
            <Image src="/nueva_concha.png" alt="Tarabaña" width={300} height={300} priority className="caracol-img"
              style={{ objectFit: "contain", filter: "drop-shadow(0 4px 20px rgba(0,0,0,0.3))" }} />
          </div>
        </div>

        <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(48px, 6vw, 80px)", fontWeight: 900, lineHeight: 1.05, letterSpacing: "-2px", color: "#F5F0E8", marginBottom: 20 }}>
          Una cerveza para <em style={{ fontStyle: "italic", color: "#F0A030" }}>todos.</em>
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

      {/* ── MARQUEE ───────────────────────────────────────── */}
      <div style={{ background: "#C8720A", padding: "12px 0", overflow: "hidden", whiteSpace: "nowrap" }}>
        <div className="animate-marquee" style={{ display: "inline-flex" }}>
          {[marqueeText, marqueeText].map((t, i) => (
            <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#1A1108", padding: "0 40px" }}>{t}</span>
          ))}
        </div>
      </div>

      {/* ── CERVEZAS ──────────────────────────────────────── */}
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

      {/* ── INVENTARIO CARRUSEL ───────────────────────────── */}
      {productos && productos.length > 0 && (
        <section style={{ background: "#120D06", padding: "72px 0", overflow: "hidden", borderTop: "1px solid rgba(200,114,10,0.1)", borderBottom: "1px solid rgba(200,114,10,0.1)" }}>
          <div style={{ padding: "0 64px", marginBottom: 32, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
                <div className="pulse-dot" style={{ width: 6, height: 6, borderRadius: "50%", background: "#4CAF50" }} />
                Stock en tiempo real
              </div>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(24px, 3vw, 36px)", fontWeight: 900, color: "#F5F0E8", margin: 0, lineHeight: 1 }}>Disponible ahora</h3>
            </div>
            <Link href="/portal" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 28px", background: "#C8720A", color: "#1A1108", textDecoration: "none", fontWeight: 500 }}>Pedir →</Link>
          </div>
          <div style={{ overflow: "hidden" }}>
            <div className="carousel-track" style={{ display: "flex", gap: 16, width: "max-content", padding: "8px 32px" }}>
              {[...productos, ...productos].map((p, i) => {
                const totalStock = (p.stock_caja12 || 0) + (p.stock_caja24 || 0) + (p.stock_barril_pet || 0) + (p.stock_barril_acero || 0);
                const hasStock = totalStock > 0;
                return (
                  <div key={i} style={{ width: 200, flexShrink: 0, background: "#1A1108", border: `1px solid ${hasStock ? "rgba(200,114,10,0.25)" : "rgba(255,255,255,0.05)"}`, borderRadius: 12, padding: "20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                    <div style={{ display: "flex", justifyContent: "center", height: 100, alignItems: "center" }}>
                      {p.imagen_url
                        ? <img src={p.imagen_url} alt={p.nombre} style={{ height: 90, objectFit: "contain", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }} />
                        : <div style={{ width: 60, height: 90, background: "#2a2a2a", borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 24 }}>🍺</span>
                          </div>
                      }
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-serif)", fontSize: 16, fontWeight: 700, fontStyle: "italic", color: "#F5F0E8", lineHeight: 1.2 }}>{p.nombre}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(245,240,232,0.3)", marginTop: 3 }}>{p.estilo}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {(p.stock_caja12 || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10 }}><span style={{ color: "rgba(245,240,232,0.4)" }}>Caja 12</span><span style={{ color: "#4CAF50" }}>{p.stock_caja12} uds</span></div>}
                      {(p.stock_caja24 || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10 }}><span style={{ color: "rgba(245,240,232,0.4)" }}>Caja 24</span><span style={{ color: "#4CAF50" }}>{p.stock_caja24} uds</span></div>}
                      {(p.stock_barril_pet || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10 }}><span style={{ color: "rgba(245,240,232,0.4)" }}>Barril PET</span><span style={{ color: "#4CAF50" }}>{p.stock_barril_pet} uds</span></div>}
                      {(p.stock_barril_acero || 0) > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10 }}><span style={{ color: "rgba(245,240,232,0.4)" }}>Barril Acero</span><span style={{ color: "#4CAF50" }}>{p.stock_barril_acero} uds</span></div>}
                      {!hasStock && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#ef4444", textAlign: "center" }}>Sin stock</div>}
                    </div>
                    {p.abv && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#C8720A", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>{p.abv}% ABV</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ── TAPROOM CTA ───────────────────────────────────── */}
      <div style={{ background: "#C8720A", color: "#1A1108", padding: "72px 80px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", opacity: 0.55, marginBottom: 12 }}>El Caracol · Taproom</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 4vw, 48px)", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-1.5px" }}>Cae por una pinta.</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, marginTop: 12, opacity: 0.65, fontWeight: 300 }}>Tamaulipas 224, Hipódromo · Mar–Sáb 13:00–23:00</div>
        </div>
        <Link href="/taproom" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "18px 40px", background: "#1A1108", color: "#F0A030", textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}>Ver Taproom →</Link>
      </div>

      {/* ── MEDALLERO ─────────────────────────────────────── */}
      <section id="medallero" style={{ background: "#0E0A05", padding: "100px 64px", position: "relative", overflow: "hidden" }}>
        {/* Fondo decorativo */}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(circle, rgba(200,114,10,0.05) 0%, transparent 70%)", pointerEvents: "none" }} />

        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#C8720A", display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />Reconocimientos
          </div>
          <h2 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 4vw, 56px)", fontWeight: 900, lineHeight: 1.0, letterSpacing: "-1.5px", color: "#F5F0E8", marginBottom: 16 }}>
            Medallero.
          </h2>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "rgba(245,240,232,0.4)", maxWidth: 480, marginBottom: 72, fontWeight: 300, lineHeight: 1.6 }}>
            Reconocimientos obtenidos en las principales competencias de cerveza artesanal de México.
          </p>

          {/* Logos de competencias */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 2, marginBottom: 64 }}>
            {Object.entries(competenciaLogos).map(([nombre, logo]) => (
              <div key={nombre} className="comp-logo-box" style={{ background: "#1A1108", border: "1px solid rgba(200,114,10,0.15)", padding: "32px 24px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16, cursor: "default" }}>
                <div style={{ width: 140, height: 140, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <Image src={logo} alt={nombre} width={130} height={130} style={{ objectFit: "contain", maxWidth: "100%", maxHeight: "100%" }} />
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.4)", textAlign: "center" }}>{nombre}</div>
              </div>
            ))}
          </div>

          {/* Medallas */}
          {(!medallero || medallero.length === 0) ? (
            <div style={{ textAlign: "center", padding: "60px 0", fontFamily: "var(--font-mono)", fontSize: 12, color: "rgba(245,240,232,0.2)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Próximamente — medallas en camino 🏆
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
              {medallero.map((m: any) => {
                const mc = medallaConfig[m.medalla] || medallaConfig.bronce;
                return (
                  <div key={m.id} className="medalla-card" style={{ background: "#1A1108", border: `1px solid ${mc.color}30`, borderRadius: 12, padding: "24px 20px", position: "relative", overflow: "hidden", boxShadow: `0 0 30px ${mc.glow}` }}>
                    {/* Acento top */}
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: mc.color }} />
                    {/* Badge medalla */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 12px", background: `${mc.color}20`, color: mc.color, border: `1px solid ${mc.color}50` }}>
                        🏅 {mc.label}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(245,240,232,0.3)" }}>{m.año}</span>
                    </div>
                    {/* Cerveza */}
                    <div style={{ fontFamily: "var(--font-serif)", fontSize: 24, fontWeight: 700, fontStyle: "italic", color: "#F5F0E8", lineHeight: 1.1, marginBottom: 6 }}>{m.cerveza}</div>
                    {m.estilo && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(245,240,232,0.35)", marginBottom: 12 }}>{m.estilo}</div>}
                    {/* Stats */}
                    <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                      {m.abv && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", border: "1px solid rgba(245,240,232,0.12)", color: "rgba(245,240,232,0.4)" }}>{m.abv}% ABV</span>}
                      {m.ibu && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 8px", border: "1px solid rgba(245,240,232,0.12)", color: "rgba(245,240,232,0.4)" }}>{m.ibu} IBU</span>}
                    </div>
                    {/* Competencia */}
                    <div style={{ borderTop: "1px solid rgba(245,240,232,0.06)", paddingTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      {competenciaLogos[m.competencia] && (
                        <Image src={competenciaLogos[m.competencia]} alt={m.competencia} width={28} height={28} style={{ objectFit: "contain", opacity: 0.7 }} />
                      )}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.07em", textTransform: "uppercase", color: "rgba(245,240,232,0.35)" }}>{m.competencia}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <Footer />
    </main>
  );
}
