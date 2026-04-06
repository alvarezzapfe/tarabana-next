"use client";
import { useEffect, useRef, useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

declare global {
  interface Window {
    PreloadEmbedMenu: (containerId: string, id1: number, id2: number) => void;
  }
}

export default function TapList() {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!mountRef.current) return;

    let container = document.getElementById("menu-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "menu-container";
      mountRef.current.appendChild(container);
    }

    const run = () => {
      if (window.PreloadEmbedMenu) {
        window.PreloadEmbedMenu("menu-container", 49211, 174935);
        setReady(true);
      }
    };

    const existing = document.querySelector('script[data-untappd="embed"]');
    if (!existing) {
      const s = document.createElement("script");
      s.src = "https://embed-menu-preloader.untappdapi.com/embed-menu-preloader.min.js";
      s.async = true;
      s.dataset.untappd = "embed";
      s.onload = run;
      document.body.appendChild(s);
    } else {
      run();
    }
  }, []);

  return (
    <div style={{ background: "#1A1108", minHeight: "100vh", color: "#F5F0E8" }}>
      <Navbar />

      <main style={{ paddingTop: 100 }}>
        {/* Header */}
        <div style={{
          padding: "60px 80px 40px",
          borderBottom: "1px solid rgba(245,240,232,0.07)",
        }}>
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 24,
          }}>
            <div>
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "#C8720A",
                display: "flex",
                alignItems: "center",
                gap: 12,
                marginBottom: 16,
              }}>
                <span style={{ display: "block", width: 28, height: 1, background: "#C8720A" }} />
                Menú en vivo
              </div>
              <h1 style={{
                fontFamily: "var(--font-serif)",
                fontSize: "clamp(40px, 5vw, 72px)",
                fontWeight: 900,
                lineHeight: 1.0,
                letterSpacing: "-2px",
                color: "#F5F0E8",
              }}>
                Tap List
              </h1>
              <p style={{
                fontFamily: "var(--font-sans)",
                fontSize: 14,
                color: "rgba(245,240,232,0.4)",
                fontWeight: 300,
                marginTop: 12,
              }}>
                El Caracol · Tamaulipas 224, Hipódromo · Actualizado en tiempo real
              </p>
            </div>

            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              color: "rgba(245,240,232,0.4)",
              border: "1px solid rgba(245,240,232,0.1)",
              padding: "12px 20px",
            }}>
              <div className="animate-pulse-dot" style={{
                width: 7, height: 7,
                background: "#4CAF50",
                borderRadius: "50%",
                flexShrink: 0,
              }} />
              Untappd Live
            </div>
          </div>
        </div>

        {/* Embed */}
        <div style={{ padding: "40px 80px 80px" }}>
          {!ready && (
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "40px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              color: "rgba(245,240,232,0.3)",
              letterSpacing: "0.08em",
            }}>
              <div style={{
                width: 20, height: 20,
                border: "2px solid rgba(200,114,10,0.3)",
                borderTop: "2px solid #C8720A",
                borderRadius: "50%",
                animation: "spin-slow 1s linear infinite",
                flexShrink: 0,
              }} />
              Cargando menú desde Untappd…
            </div>
          )}
          <div ref={mountRef} style={{ minHeight: ready ? "auto" : 0 }} />
        </div>
      </main>

      <Footer />
    </div>
  );
}
