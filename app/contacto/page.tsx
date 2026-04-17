"use client";
import { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

export default function ContactoPage() {
  const [form, setForm] = useState({ nombre: "", email: "", mensaje: "" });
  const [status, setStatus] = useState<"idle"|"sending"|"sent"|"error">("idle");
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSend = async () => {
    if (!form.nombre || !form.mensaje) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/contacto", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setStatus("sent");
        // También abre WhatsApp
        const msg = encodeURIComponent(`Hola, soy ${form.nombre}.\n\n${form.mensaje}`);
        window.open(`https://wa.me/5215579636294?text=${msg}`, "_blank");
      } else setStatus("error");
    } catch { setStatus("error"); }
  };

  const inputStyle = { width: "100%", padding: "14px 16px", background: "rgba(245,240,232,0.04)", border: "1px solid rgba(245,240,232,0.1)", color: "#F5F0E8", fontSize: 14, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box" as const };

  return (
    <main style={{ background: "#1A1108", color: "#F5F0E8", minHeight: "100vh" }}>
      <Navbar />
      <section style={{ padding: "140px 80px 80px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, maxWidth: 1100, margin: "0 auto" }}>

        {/* Left */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C8720A", marginBottom: 24, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
            Escríbenos
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(40px, 5vw, 68px)", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-2.5px", marginBottom: 24 }}>
            Hablemos<br /><em style={{ color: "#F0A030", fontStyle: "italic" }}>de cerveza.</em>
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 300, color: "rgba(245,240,232,0.45)", lineHeight: 1.7, marginBottom: 48 }}>
            Distribución, eventos, taprooms, preguntas. Respondemos rápido.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {[
              { icon: "📍", title: "Taproom El Caracol", detail: "Tamaulipas 224, Hipódromo Condesa, CDMX" },
              { icon: "🏭", title: "Fábrica", detail: "Lerma, Estado de México" },
              { icon: "📧", title: "Email", detail: "hola@tarabana.mx" },
              { icon: "📱", title: "WhatsApp", detail: "+52 55 7963 6294" },
              { icon: "🕐", title: "Taproom", detail: "Mar–Sáb · 13:00–23:00h" },
            ].map((item) => (
              <div key={item.title} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <span style={{ fontSize: 20, flexShrink: 0, marginTop: 2 }}>{item.icon}</span>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", marginBottom: 3 }}>{item.title}</div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "rgba(245,240,232,0.65)", fontWeight: 300 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 40 }}>
            {[
              { href: "https://instagram.com/tarabana.mx", label: "Instagram" },
              { href: "https://untappd.com/brewery/tarabana", label: "Untappd" },
              { href: "https://wa.me/5215579636294", label: "WhatsApp" },
            ].map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "10px 20px", border: "1px solid rgba(245,240,232,0.15)", color: "rgba(245,240,232,0.45)", textDecoration: "none" }}>
                {s.label}
              </a>
            ))}
          </div>
        </div>

        {/* Right — Form */}
        <div style={{ paddingTop: 120 }}>
          {status === "sent" ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🍺</div>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, fontStyle: "italic", color: "#F0A030", marginBottom: 8 }}>¡Salud!</h3>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "rgba(245,240,232,0.45)", fontWeight: 300, marginBottom: 8 }}>Tu mensaje llegó a nuestro correo.</p>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "rgba(245,240,232,0.3)", fontWeight: 300 }}>También te abrimos WhatsApp para seguir la conversación.</p>
              <button onClick={() => { setStatus("idle"); setForm({ nombre: "", email: "", mensaje: "" }); }} style={{ marginTop: 24, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "12px 28px", background: "transparent", color: "#C8720A", border: "1px solid #C8720A", cursor: "pointer" }}>
                Enviar otro mensaje
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", display: "block", marginBottom: 8 }}>Nombre *</label>
                <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Tu nombre" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", display: "block", marginBottom: 8 }}>Email</label>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="tu@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", display: "block", marginBottom: 8 }}>Mensaje *</label>
                <textarea value={form.mensaje} onChange={e => set("mensaje", e.target.value)} rows={5} placeholder="Cuéntanos..." style={{ ...inputStyle, resize: "none" }} />
              </div>
              {status === "error" && (
                <p style={{ color: "#ef4444", fontSize: 13, fontFamily: "var(--font-mono)" }}>Error al enviar — intenta de nuevo o escríbenos directo al WhatsApp.</p>
              )}
              <button onClick={handleSend} disabled={!form.nombre || !form.mensaje || status === "sending"} style={{ padding: "16px", background: form.nombre && form.mensaje ? "#C8720A" : "rgba(245,240,232,0.05)", border: "none", color: form.nombre && form.mensaje ? "#1A1108" : "rgba(245,240,232,0.2)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: form.nombre && form.mensaje ? "pointer" : "not-allowed", fontWeight: 600, opacity: status === "sending" ? 0.7 : 1 }}>
                {status === "sending" ? "Enviando..." : "Enviar mensaje →"}
              </button>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(245,240,232,0.2)", textAlign: "center", letterSpacing: "0.06em" }}>
                Enviamos a hola@tarabana.mx + te abrimos WhatsApp
              </p>
            </div>
          )}
        </div>
      </section>
      <Footer />
    </main>
  );
}
