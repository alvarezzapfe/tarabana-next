"use client";
import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  const links = [
    { href: "/#cervezas", label: "Cervezas" },
    { href: "/taplist", label: "Tap List" },
    { href: "/#medallero", label: "Medallero" },
    { href: "/taproom", label: "Taproom" },
    { href: "/fabrica", label: "Fábrica" },
    { href: "/contacto", label: "Contacto" },
  ];

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "12px 48px",
      background: scrolled ? "rgba(253,248,240,0.97)" : "rgba(253,248,240,0.92)",
      backdropFilter: "blur(12px)",
      borderBottom: scrolled ? "1px solid rgba(28,16,7,0.08)" : "1px solid transparent",
      transition: "all 0.3s",
    }}>
      <Link href="/" onClick={() => setMenuOpen(false)}>
        <Image src="/tarabana_logo_negro.jpg" alt="Tarabaña" width={64} height={64}
          style={{ borderRadius: "50%", border: "2px solid rgba(212,120,10,0.2)", display: "block" }} />
      </Link>

      <ul style={{ display: "flex", gap: 32, listStyle: "none", margin: 0, padding: 0 }} className="hidden md:flex">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(28,16,7,0.5)", textDecoration: "none" }}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden md:flex" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Link href="/login" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 20px", background: "transparent", color: "rgba(28,16,7,0.55)", textDecoration: "none", border: "1px solid rgba(28,16,7,0.15)", borderRadius: 4 }}>
          Iniciar sesión
        </Link>
        <Link href="/portal" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 24px", background: "var(--amber)", color: "white", textDecoration: "none", fontWeight: 500 }}>
          Comprar →
        </Link>
      </div>

      <button className="md:hidden" onClick={() => setMenuOpen(!menuOpen)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }} aria-label="Menú">
        <div style={{ width: 24, height: 2, background: "var(--ink)", marginBottom: 5, transition: "0.3s", transform: menuOpen ? "rotate(45deg) translate(5px,5px)" : "none" }} />
        <div style={{ width: 24, height: 2, background: "var(--ink)", marginBottom: 5, opacity: menuOpen ? 0 : 1, transition: "0.3s" }} />
        <div style={{ width: 24, height: 2, background: "var(--ink)", transition: "0.3s", transform: menuOpen ? "rotate(-45deg) translate(5px,-5px)" : "none" }} />
      </button>

      {menuOpen && (
        <div style={{ position: "fixed", inset: 0, top: 90, background: "var(--cream)", zIndex: 99, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 40 }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} onClick={() => setMenuOpen(false)} style={{ fontFamily: "var(--font-serif)", fontSize: 36, fontWeight: 700, fontStyle: "italic", color: "var(--ink)", textDecoration: "none" }}>
              {l.label}
            </Link>
          ))}
          <Link href="/portal" onClick={() => setMenuOpen(false)} style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", padding: "14px 40px", background: "var(--amber)", color: "white", textDecoration: "none", marginTop: 16 }}>
            Comprar →
          </Link>
        </div>
      )}
    </nav>
  );
}
