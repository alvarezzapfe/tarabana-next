"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import Image from "next/image";

type Beer = {
  name: string;
  style: string;
  abv: string;
  tagline: string;
  img: string;
  accent: string;
};

export default function BeerCarousel({ beers }: { beers: Beer[] }) {
  const [active, setActive] = useState(0);
  const [modal, setModal] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const n = beers.length;
  const prev = () => setActive((i) => (i - 1 + n) % n);
  const next = () => setActive((i) => (i + 1) % n);

  const onKey = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
      if (e.key === "ArrowRight") { next(); e.preventDefault(); }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n]
  );

  /* ── Swipe ────────────────────────────────────── */
  const onTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      dx < 0 ? next() : prev();
    }
    touchStart.current = null;
  };

  return (
    <>
      {/* ── CAROUSEL ───────────────────────────────── */}
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Cervezas Tarabaña"
        tabIndex={0}
        onKeyDown={onKey}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ position: "relative", outline: "none", userSelect: "none" }}
      >
        {/* Track */}
        <div
          ref={trackRef}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "clamp(8px, 2vw, 24px)",
            minHeight: "clamp(340px, 50vw, 520px)",
            position: "relative",
          }}
        >
          {beers.map((b, i) => {
            const offset = ((i - active + n) % n);
            // Map to -3..0..3 range so items wrap around center
            const rel = offset > Math.floor(n / 2) ? offset - n : offset;
            const isCenter = rel === 0;
            const isAdjacent = Math.abs(rel) === 1;
            const isVisible = Math.abs(rel) <= 2;

            return (
              <div
                key={b.name}
                role="group"
                aria-roledescription="slide"
                aria-label={`${i + 1} de ${n}: ${b.name}`}
                aria-hidden={!isVisible}
                onClick={() => isCenter && setModal(i)}
                className="beer-slide"
                style={{
                  position: "absolute",
                  transform: `translateX(${rel * (isCenter ? 0 : isAdjacent ? 100 : 185)}%) scale(${isCenter ? 1 : isAdjacent ? 0.7 : 0.45})`,
                  opacity: !isVisible ? 0 : isCenter ? 1 : isAdjacent ? 0.55 : 0.2,
                  zIndex: isCenter ? 10 : isAdjacent ? 5 : 1,
                  cursor: isCenter ? "zoom-in" : "default",
                  pointerEvents: isVisible ? "auto" : "none",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 16,
                  filter: isCenter ? "none" : "brightness(0.6)",
                  width: "clamp(160px, 40vw, 260px)",
                }}
              >
                <Image
                  src={b.img}
                  alt={`Lata de ${b.name}`}
                  width={260}
                  height={400}
                  style={{
                    objectFit: "contain",
                    width: "100%",
                    height: "auto",
                    maxHeight: "clamp(220px, 36vw, 400px)",
                    filter: "drop-shadow(0 12px 32px rgba(0,0,0,0.6))",
                  }}
                  priority={isCenter}
                  draggable={false}
                />
                {/* Info — only on center slide */}
                {isCenter && (
                  <div style={{ textAlign: "center" }} className="beer-slide-info">
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.12em",
                      textTransform: "uppercase", color: b.accent, marginBottom: 6,
                    }}>
                      {b.style}
                    </div>
                    <h3 style={{
                      fontFamily: "var(--font-serif)", fontSize: "clamp(24px, 3.5vw, 36px)",
                      fontWeight: 700, fontStyle: "italic", color: "var(--cream)",
                      lineHeight: 1.1, margin: "0 0 8px",
                    }}>
                      {b.name}
                    </h3>
                    <div style={{
                      fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(var(--cream-rgb),0.6)",
                      fontStyle: "italic", fontWeight: 300, marginBottom: 10,
                    }}>
                      {b.tagline}
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 10px",
                        border: "1px solid rgba(var(--cream-rgb),0.15)", color: "rgba(var(--cream-rgb),0.6)",
                      }}>
                        {b.abv} ABV
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 10, padding: "3px 10px",
                        border: "1px solid rgba(var(--cream-rgb),0.15)", color: "rgba(var(--cream-rgb),0.6)",
                      }}>
                        355 ml
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Arrows */}
        <button
          onClick={prev}
          aria-label="Cerveza anterior"
          className="carousel-arrow"
          style={{
            position: "absolute", left: "clamp(8px, 3vw, 32px)", top: "50%",
            transform: "translateY(-70%)",
            background: "rgba(var(--ink-rgb),0.7)", border: "1px solid rgba(var(--amber-rgb),0.3)",
            color: "var(--amber-light)", width: 44, height: 44, borderRadius: "50%",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, zIndex: 20, backdropFilter: "blur(8px)",
          }}
        >
          &#8249;
        </button>
        <button
          onClick={next}
          aria-label="Siguiente cerveza"
          className="carousel-arrow"
          style={{
            position: "absolute", right: "clamp(8px, 3vw, 32px)", top: "50%",
            transform: "translateY(-70%)",
            background: "rgba(var(--ink-rgb),0.7)", border: "1px solid rgba(var(--amber-rgb),0.3)",
            color: "var(--amber-light)", width: 44, height: 44, borderRadius: "50%",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, zIndex: 20, backdropFilter: "blur(8px)",
          }}
        >
          &#8250;
        </button>

        {/* Dots */}
        <div
          role="tablist"
          aria-label="Seleccionar cerveza"
          style={{
            display: "flex", gap: 10, justifyContent: "center",
            marginTop: 8, paddingBottom: 8,
          }}
        >
          {beers.map((b, i) => (
            <button
              key={b.name}
              role="tab"
              aria-selected={i === active}
              aria-label={b.name}
              onClick={() => setActive(i)}
              style={{
                width: i === active ? 24 : 8, height: 8,
                borderRadius: 4, border: "none", cursor: "pointer",
                background: i === active ? b.accent : "rgba(var(--cream-rgb),0.2)",
              }}
              className="carousel-dot"
            />
          ))}
        </div>
      </div>

      {/* ── MODAL / LIGHTBOX ───────────────────────── */}
      {modal !== null && (
        <BeerModal beer={beers[modal]} onClose={() => setModal(null)} />
      )}
    </>
  );
}

/* ──────────────────────────────────────────────────── */
function BeerModal({ beer, onClose }: { beer: Beer; onClose: () => void }) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLDivElement>(null);

  /* Close on Escape */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  /* Wheel zoom */
  const onWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.002)));
  };

  /* Pointer pan */
  const onPointerDown = (e: React.PointerEvent) => {
    if (zoom <= 1) return;
    dragging.current = true;
    lastPos.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPan((p) => ({
      x: p.x + e.clientX - lastPos.current.x,
      y: p.y + e.clientY - lastPos.current.y,
    }));
    lastPos.current = { x: e.clientX, y: e.clientY };
  };
  const onPointerUp = () => { dragging.current = false; };

  /* Pinch zoom (touch) */
  const pinchDist = useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist.current = Math.hypot(dx, dy);
    }
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchDist.current !== null) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const scale = dist / pinchDist.current;
      setZoom((z) => Math.min(4, Math.max(1, z * scale)));
      pinchDist.current = dist;
    }
  };
  const onTouchEnd = () => { pinchDist.current = null; };

  /* Reset zoom on double-click */
  const onDoubleClick = () => {
    if (zoom > 1) { setZoom(1); setPan({ x: 0, y: 0 }); }
    else { setZoom(2.5); }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Detalle de ${beer.name}`}
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.88)", backdropFilter: "blur(12px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "clamp(16px, 4vw, 48px)",
      }}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        aria-label="Cerrar"
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 10,
          background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
          color: "#fff", width: 40, height: 40, borderRadius: "50%",
          cursor: "pointer", fontSize: 20, display: "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >
        &#10005;
      </button>

      {/* Content wrapper — stop click propagation */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", alignItems: "center", gap: "clamp(24px, 4vw, 64px)",
          maxWidth: 900, width: "100%",
          flexDirection: "row",
        }}
        className="modal-inner"
      >
        {/* Image */}
        <div
          ref={imgRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onDoubleClick={onDoubleClick}
          style={{
            flex: "1 1 55%", display: "flex", alignItems: "center",
            justifyContent: "center", overflow: "hidden",
            cursor: zoom > 1 ? "grab" : "zoom-in",
            touchAction: "none", maxHeight: "80vh",
          }}
        >
          <Image
            src={beer.img}
            alt={`${beer.name} — ${beer.style}`}
            width={500}
            height={770}
            draggable={false}
            style={{
              objectFit: "contain", maxHeight: "75vh", width: "auto",
              transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
              filter: "drop-shadow(0 16px 48px rgba(0,0,0,0.5))",
            }}
            className="modal-img"
          />
        </div>

        {/* Info */}
        <div style={{ flex: "1 1 40%", minWidth: 180 }} className="modal-info">
          <div style={{
            fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.14em",
            textTransform: "uppercase", color: beer.accent, marginBottom: 10,
          }}>
            {beer.style}
          </div>
          <h2 style={{
            fontFamily: "var(--font-serif)", fontSize: "clamp(32px, 5vw, 52px)",
            fontWeight: 900, fontStyle: "italic", color: "var(--cream)",
            lineHeight: 1.05, margin: "0 0 16px",
          }}>
            {beer.name}
          </h2>
          <p style={{
            fontFamily: "var(--font-sans)", fontSize: 15, color: "rgba(var(--cream-rgb),0.6)",
            fontStyle: "italic", fontWeight: 300, lineHeight: 1.6, marginBottom: 20,
          }}>
            {beer.tagline}
          </p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 14px",
              border: "1px solid rgba(var(--cream-rgb),0.15)", color: "rgba(var(--cream-rgb),0.6)",
            }}>
              {beer.abv} ABV
            </span>
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 11, padding: "5px 14px",
              border: "1px solid rgba(var(--cream-rgb),0.15)", color: "rgba(var(--cream-rgb),0.6)",
            }}>
              355 ml
            </span>
          </div>
          <p style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "rgba(var(--cream-rgb),0.3)",
            marginTop: 24, letterSpacing: "0.08em",
          }}>
            Scroll o pinch para zoom &middot; doble clic para resetear
          </p>
        </div>
      </div>
    </div>
  );
}
