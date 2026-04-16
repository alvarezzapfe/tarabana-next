import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer style={{ background: "var(--ink-footer)", borderTop: `1px solid rgba(var(--amber-rgb),0.12)`, fontFamily: "system-ui, sans-serif" }}>

      {/* Top bar — newsletter/CTA */}
      <div style={{ borderBottom: `1px solid rgba(var(--cream-rgb),0.05)`, padding: "clamp(24px,4vh,40px) clamp(20px,5vw,80px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--amber)", marginBottom: 6 }}>Una cerveza para todos</div>
          <div style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 900, fontStyle: "italic", color: "var(--cream)", letterSpacing: "-0.5px" }}>Tarabaña.</div>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <a href="https://wa.me/5215579636294" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 28px", background: "var(--amber)", color: "var(--ink)", textDecoration: "none", fontWeight: 500 }}>
            WhatsApp →
          </a>
          <a href="https://instagram.com/tarabana.mx" target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 28px", background: "transparent", color: `rgba(var(--cream-rgb),0.6)`, textDecoration: "none", border: `1px solid rgba(var(--cream-rgb),0.12)` }}>
            Instagram
          </a>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid gap-10 grid-cols-1 sm:grid-cols-2 lg:[grid-template-columns:2fr_1fr_1fr_1fr]" style={{ padding: "clamp(32px,5vh,56px) clamp(20px,5vw,80px) clamp(28px,4vh,48px)" }}>

        {/* Brand col */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <Image src="/tarabana_caracol_4K.png" alt="Tarabaña" width={44} height={44} style={{ objectFit: "contain", filter: "brightness(0.9)" }} />
            <div>
              <div style={{ fontFamily: "var(--font-serif)", fontSize: 18, fontWeight: 900, fontStyle: "italic", color: "var(--cream)", lineHeight: 1 }}>Tarabaña</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: `rgba(var(--cream-rgb),0.6)`, marginTop: 2 }}>Cía. Cervecera Tierra Mojada</div>
            </div>
          </div>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: `rgba(var(--cream-rgb),0.6)`, fontWeight: 300, lineHeight: 1.7, maxWidth: 220, marginBottom: 24 }}>
            Cervecería artesanal independiente. Cinco estilos lupulados hechos con obsesión en Lerma, servidos frescos en Condesa.
          </p>
          {/* Stats mini */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, maxWidth: 240 }}>
            {[{ n: "5", l: "Estilos" }, { n: "2022", l: "Fundación" }, { n: "Best IPA", l: "Copa Pacífico 24" }, { n: "Lerma", l: "→ Condesa" }].map(s => (
              <div key={s.l} style={{ padding: "10px 12px", border: `1px solid rgba(var(--cream-rgb),0.06)`, background: `rgba(var(--cream-rgb),0.02)` }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--amber)" }}>{s.n}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: `rgba(var(--cream-rgb),0.6)`, marginTop: 2 }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Links cols */}
        {[
          { title: "Explorar", links: [{ href: "/#cervezas", label: "Cervezas" }, { href: "/taplist", label: "Tap List" }, { href: "/#medallero", label: "Medallero" }, { href: "/fabrica", label: "Fábrica" }] },
          { title: "Visítanos", links: [{ href: "/taproom", label: "Taproom El Caracol" }, { href: "/contacto", label: "Contacto" }, { href: "/contacto", label: "Eventos" }, { href: "https://instagram.com/tarabana.mx", label: "Instagram" }] },
          { title: "Info", links: [{ href: "mailto:hola@tarabana.mx", label: "hola@tarabana.mx" }, { href: "/taproom", label: "Tamaulipas 224, CDMX" }, { href: "/taproom", label: "Mar–Sáb 13–23h" }, { href: "/portal", label: "Portal clientes" }] },
        ].map((col) => (
          <div key={col.title}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: `rgba(var(--cream-rgb),0.6)`, marginBottom: 20, paddingBottom: 10, borderBottom: `1px solid rgba(var(--cream-rgb),0.04)` }}>{col.title}</div>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 10, padding: 0, margin: 0 }}>
              {col.links.map((l) => (
                <li key={l.label}>
                  <Link href={l.href} style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: `rgba(var(--cream-rgb),0.6)`, textDecoration: "none", fontWeight: 300, display: "flex", alignItems: "center", gap: 6, transition: "color 0.2s" }}>
                    <span style={{ display: "block", width: 4, height: 4, borderRadius: "50%", background: `rgba(var(--amber-rgb),0.4)`, flexShrink: 0 }} />
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Bottom bar */}
      <div style={{ padding: "16px clamp(20px,5vw,80px)", borderTop: `1px solid rgba(var(--cream-rgb),0.04)`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: `rgba(var(--cream-rgb),0.6)`, margin: 0 }}>
          © {year} Compañía Cervecera Tierra Mojada S.A.P.I. de C.V. · RFC TCO0908073X4
        </p>
        <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
          {[{ href: "https://instagram.com/tarabana.mx", label: "IG" }, { href: "https://untappd.com", label: "UT" }, { href: "https://wa.me/5215579636294", label: "WA" }].map(s => (
            <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: `rgba(var(--cream-rgb),0.6)`, textDecoration: "none" }}>{s.label}</a>
          ))}
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: `rgba(var(--cream-rgb),0.6)` }}>CDMX · Next.js</span>
        </div>
      </div>
    </footer>
  );
}
