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
    { href: "/taproom", label: "Taproom" },
    { href: "/fabrica", label: "Fábrica" },
    { href: "/contacto", label: "Contacto" },
  ];

  return (
    <nav
      style={{
        position: "fixed",
        top: 0, left: 0, right: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "16px 48px",
        background: scrolled ? "rgba(26,17,8,0.97)" : "rgba(26,17,8,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(200,114,10,0.15)",
        transition: "background 0.3s",
      }}
    >
      <Link href="/" onClick={() => setMenuOpen(false)}>
        <Image
          src="/tarabana_logo_negro.jpg"
          alt="Tarabaña"
          width={48}
          height={48}
          style={{
            borderRadius: "50%",
            filter: "invert(1) brightness(0.85) sepia(0.3) saturate(2) hue-rotate(15deg)",
            opacity: 0.9,
          }}
        />
      </Link>

      {/* Desktop links */}
      <ul style={{ display: "flex", gap: 36, listStyle: "none", margin: 0, padding: 0 }}
          className="hidden md:flex">
        {links.map((l) => (
          <li key={l.href}>
            <Link href={l.href} style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(245,240,232,0.55)",
              textDecoration: "none",
            }}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>

      <Link href="/shop" className="hidden md:inline-block" style={{
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        padding: "10px 24px",
        background: "#C8720A",
        color: "#1A1108",
        textDecoration: "none",
        fontWeight: 500,
      }}>
        Comprar →
      </Link>

      {/* Mobile burger */}
      <button
        className="md:hidden"
        onClick={() => setMenuOpen(!menuOpen)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 8 }}
        aria-label="Menú"
      >
        <div style={{ width: 24, height: 2, background: "#F5F0E8", marginBottom: 5, transition: "0.3s",
          transform: menuOpen ? "rotate(45deg) translate(5px,5px)" : "none" }} />
        <div style={{ width: 24, height: 2, background: "#F5F0E8", marginBottom: 5,
          opacity: menuOpen ? 0 : 1, transition: "0.3s" }} />
        <div style={{ width: 24, height: 2, background: "#F5F0E8", transition: "0.3s",
          transform: menuOpen ? "rotate(-45deg) translate(5px,-5px)" : "none" }} />
      </button>

      {/* Mobile menu */}
      {menuOpen && (
        <div style={{
          position: "fixed",
          inset: 0,
          top: 80,
          background: "#1A1108",
          zIndex: 99,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
        }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontFamily: "var(--font-serif)",
                fontSize: 36,
                fontWeight: 700,
                fontStyle: "italic",
                color: "#F5F0E8",
                textDecoration: "none",
              }}>
              {l.label}
            </Link>
          ))}
          <Link href="/shop" onClick={() => setMenuOpen(false)} style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            padding: "14px 40px",
            background: "#C8720A",
            color: "#1A1108",
            textDecoration: "none",
            fontWeight: 500,
            marginTop: 16,
          }}>
            Comprar →
          </Link>
        </div>
      )}
    </nav>
  );
}
