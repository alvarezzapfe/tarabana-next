import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer style={{ background: "#1C1007", borderTop: "1px solid rgba(212,120,10,0.1)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40, padding: "64px 80px 48px" }}>
        <div>
          <Image src="/tarabana_logo_negro.jpg" alt="Tarabaña" width={64} height={64}
            style={{ borderRadius: "50%", filter: "invert(1) brightness(0.8)", marginBottom: 16, display: "block" }} />
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(253,248,240,0.3)", fontWeight: 300, lineHeight: 1.7, maxWidth: 200 }}>
            Cervecería independiente.<br />Craft para todos.<br />Lerma → Condesa.
          </p>
          <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
            {[{ href: "https://instagram.com/tarabana.mx", label: "IG" }, { href: "https://facebook.com/tarabana.mx", label: "FB" }, { href: "https://untappd.com", label: "UT" }].map((s) => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", color: "rgba(253,248,240,0.35)", textDecoration: "none", border: "1px solid rgba(253,248,240,0.12)", padding: "6px 12px" }}>{s.label}</a>
            ))}
          </div>
        </div>
        {[
          { title: "Explorar", links: [{ href: "/#cervezas", label: "Cervezas" }, { href: "/taplist", label: "Tap List" }, { href: "/taproom", label: "Taproom" }, { href: "/fabrica", label: "Fábrica" }] },
          { title: "Visítanos", links: [{ href: "/contacto", label: "Contacto" }, { href: "/contacto", label: "Eventos" }, { href: "https://instagram.com/tarabana.mx", label: "Instagram" }, { href: "https://untappd.com", label: "Untappd" }] },
          { title: "Contacto", links: [{ href: "mailto:hola@tarabana.mx", label: "hola@tarabana.mx" }, { href: "/taproom", label: "Tamaulipas 224, CDMX" }, { href: "/taproom", label: "Mar–Sáb 13–23h" }] },
        ].map((col) => (
          <div key={col.title}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(253,248,240,0.25)", marginBottom: 20 }}>{col.title}</div>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {col.links.map((l) => (
                <li key={l.label}><Link href={l.href} style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(253,248,240,0.45)", textDecoration: "none", fontWeight: 300 }}>{l.label}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div style={{ padding: "20px 80px", borderTop: "1px solid rgba(253,248,240,0.05)", display: "flex", justifyContent: "space-between" }}>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "rgba(253,248,240,0.18)" }}>© {year} Compañía Cervecera Tierra Mojada S.A.P.I. de C.V.</p>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.06em", color: "rgba(253,248,240,0.18)" }}>Hecho en CDMX con Next.js</p>
      </div>
    </footer>
  );
}
