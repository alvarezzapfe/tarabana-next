"use client";
import { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const MapPin = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
const Factory = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 20h20M5 20V8l5 4V8l5 4V4h5v16"/></svg>
const Mail = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M22 7l-10 7L2 7"/></svg>
const Phone = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
const Clock = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
const CheckCircle = () => <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#F0A030" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>

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
        const msg = encodeURIComponent(`Hola, soy ${form.nombre}.\n\n${form.mensaje}`);
        window.open(`https://wa.me/5215579636294?text=${msg}`, "_blank");
      } else setStatus("error");
    } catch { setStatus("error"); }
  };

  const inputStyle = { width: "100%", padding: "14px 16px", background: "rgba(245,240,232,0.04)", border: "1px solid rgba(245,240,232,0.08)", color: "#F5F0E8", fontSize: 15, fontFamily: "var(--font-sans)", outline: "none", boxSizing: "border-box" as const, borderRadius: 0, transition: "border-color 0.2s" };

  const contactItems = [
    { Icon: MapPin, title: "Taproom El Caracol", detail: "Tamaulipas 224, Hipódromo Condesa, CDMX" },
    { Icon: Factory, title: "Fabrica", detail: "Lerma, Estado de Mexico" },
    { Icon: Mail, title: "Email", detail: "hola@tarabana.mx" },
    { Icon: Phone, title: "WhatsApp", detail: "+52 55 7963 6294" },
    { Icon: Clock, title: "Taproom", detail: "Mar-Sab 13:00-23:00h" },
  ];

  return (
    <main style={{ background: "#1A1108", color: "#F5F0E8", minHeight: "100vh" }}>
      <Navbar />
      <section style={{ padding: "clamp(120px, 16vh, 180px) clamp(24px, 6vw, 80px) clamp(60px, 10vh, 100px)", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(40px, 6vw, 100px)", maxWidth: 1100, margin: "0 auto" }}>

        {/* Left */}
        <div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#C8720A", marginBottom: 28, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ display: "block", width: 40, height: 1, background: "#C8720A", opacity: 0.6 }} />
            Contacto
          </div>
          <h1 style={{ fontFamily: "var(--font-serif)", fontSize: "clamp(40px, 5vw, 68px)", fontWeight: 900, lineHeight: 0.95, letterSpacing: "-2.5px", marginBottom: 24 }}>
            Hablemos<br /><em style={{ color: "#F0A030", fontStyle: "italic" }}>de cerveza.</em>
          </h1>
          <p style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 300, color: "rgba(245,240,232,0.4)", lineHeight: 1.7, marginBottom: 56 }}>
            Distribucion, eventos, taprooms, preguntas. Respondemos rapido.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
            {contactItems.map((item) => (
              <div key={item.title} style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
                <div style={{ flexShrink: 0, marginTop: 1, color: "#C8720A", opacity: 0.7 }}>
                  <item.Icon />
                </div>
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,240,232,0.25)", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "rgba(245,240,232,0.6)", fontWeight: 300 }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 48 }}>
            {[
              { href: "https://instagram.com/tarabana.mx", label: "Instagram" },
              { href: "https://untappd.com/brewery/tarabana", label: "Untappd" },
              { href: "https://wa.me/5215579636294", label: "WhatsApp" },
            ].map(s => (
              <a key={s.label} href={s.href} target="_blank" rel="noopener noreferrer" style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "11px 22px", border: "1px solid rgba(245,240,232,0.12)", color: "rgba(245,240,232,0.4)", textDecoration: "none", transition: "all 0.2s" }}
                className="contact-social"
              >
                {s.label}
              </a>
            ))}
          </div>
        </div>

        {/* Right — Form */}
        <div style={{ paddingTop: "clamp(40px, 8vh, 120px)" }}>
          {status === "sent" ? (
            <div style={{ textAlign: "center", padding: "60px 0" }}>
              <div style={{ marginBottom: 20, display: "flex", justifyContent: "center" }}><CheckCircle /></div>
              <h3 style={{ fontFamily: "var(--font-serif)", fontSize: 28, fontWeight: 700, fontStyle: "italic", color: "#F0A030", marginBottom: 8 }}>Mensaje enviado</h3>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 15, color: "rgba(245,240,232,0.4)", fontWeight: 300, marginBottom: 8 }}>Tu mensaje llego a nuestro correo.</p>
              <p style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "rgba(245,240,232,0.25)", fontWeight: 300 }}>Tambien te abrimos WhatsApp para seguir la conversacion.</p>
              <button onClick={() => { setStatus("idle"); setForm({ nombre: "", email: "", mensaje: "" }); }} style={{ marginTop: 28, fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", padding: "13px 32px", background: "transparent", color: "#C8720A", border: "1px solid #C8720A", cursor: "pointer" }}>
                Enviar otro mensaje
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.2)", display: "block", marginBottom: 10 }}>Nombre *</label>
                <input value={form.nombre} onChange={e => set("nombre", e.target.value)} placeholder="Tu nombre" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.2)", display: "block", marginBottom: 10 }}>Email</label>
                <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="tu@email.com" style={inputStyle} />
              </div>
              <div>
                <label style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,240,232,0.2)", display: "block", marginBottom: 10 }}>Mensaje *</label>
                <textarea value={form.mensaje} onChange={e => set("mensaje", e.target.value)} rows={5} placeholder="Cuentanos..." style={{ ...inputStyle, resize: "none" }} />
              </div>
              {status === "error" && (
                <p style={{ color: "#ef4444", fontSize: 14, fontFamily: "var(--font-mono)" }}>Error al enviar. Intenta de nuevo o escribenos directo al WhatsApp.</p>
              )}
              <button onClick={handleSend} disabled={!form.nombre || !form.mensaje || status === "sending"} style={{ padding: "16px", background: form.nombre && form.mensaje ? "#C8720A" : "rgba(245,240,232,0.04)", border: "1px solid rgba(245,240,232,0.06)", color: form.nombre && form.mensaje ? "#1A1108" : "rgba(245,240,232,0.15)", fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", cursor: form.nombre && form.mensaje ? "pointer" : "not-allowed", fontWeight: 600, opacity: status === "sending" ? 0.7 : 1, transition: "all 0.2s" }}>
                {status === "sending" ? "Enviando..." : "Enviar mensaje"}
              </button>
              <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "rgba(245,240,232,0.15)", textAlign: "center", letterSpacing: "0.06em" }}>
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
