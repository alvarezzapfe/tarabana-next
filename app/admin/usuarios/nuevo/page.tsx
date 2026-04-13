'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'

const roles = [
  { value: 'admin', label: 'Admin', desc: 'Modifica todo menos gestión de usuarios', color: '#3b82f6', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { value: 'produccion', label: 'Jefe de Producción', desc: 'Agrega y modifica inventario y stock', color: '#f59e0b', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { value: 'ventas', label: 'Ventas', desc: 'Confirma pagos y gestiona pedidos', color: '#10b981', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { value: 'contabilidad', label: 'Lector / Contabilidad', desc: 'Solo lectura — ventas y reportes', color: '#8b5cf6', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
]

export default function NuevoUsuarioInternoPage() {
  const router = useRouter()
  const [form, setForm] = useState({ nombre: '', email: '', cel: '', rol: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const handleSubmit = async () => {
    if (!form.nombre || !form.email || !form.rol) { setError('Nombre, email y rol son requeridos'); return }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/usuarios/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre: form.nombre, email: form.email, cel: form.cel, rol: form.rol })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error al crear usuario'); setLoading(false); return }
    setSuccess(true)
    setTimeout(() => { router.push('/admin/usuarios'); router.refresh() }, 2000)
  }

  const inp = (label: string, key: string, type = 'text', placeholder = '') => (
    <div>
      <label style={{ color: '#555', fontSize: 11.5, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <input type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '11px 14px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' }} />
    </div>
  )

  if (success) return (
    <div style={{ padding: '36px 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#10b98118', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <p style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Invitación enviada</p>
        <p style={{ color: '#555', fontSize: 14 }}>El usuario recibirá un email para activar su cuenta.</p>
      </div>
    </div>
  )

  return (
    <div style={{ padding: '36px 40px', maxWidth: 680 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <a href="/admin/usuarios" style={{ color: '#444', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Usuarios
        </a>
        <span style={{ color: '#2a2a2a' }}>/</span>
        <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Invitar usuario interno</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {inp('Nombre completo *', 'nombre', 'text', 'Ana García')}
        {inp('Email *', 'email', 'email', 'ana@tarabana.mx')}
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={{ color: '#555', fontSize: 11.5, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Celular (opcional)</label>
        <div style={{ display: 'flex', gap: 0 }}>
          <div style={{ background: '#141414', border: '1px solid #252525', borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '11px 14px', color: '#555', fontSize: 14, whiteSpace: 'nowrap' }}>
            🇲🇽 +52
          </div>
          <input type="tel" value={form.cel} onChange={e => set('cel', e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="55 1234 5678"
            style={{ flex: 1, padding: '11px 14px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: '0 8px 8px 0', color: '#fff', fontSize: 14, outline: 'none' }} />
        </div>
      </div>

      <div style={{ marginBottom: 28 }}>
        <label style={{ color: '#555', fontSize: 11.5, display: 'block', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Rol *</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {roles.map(r => (
            <button key={r.value} onClick={() => set('rol', r.value)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              background: form.rol === r.value ? '#1a1a1a' : '#111',
              border: `1.5px solid ${form.rol === r.value ? r.color : '#1e1e1e'}`,
              borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'all 0.15s'
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: r.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d={r.icon} />
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13, color: '#ddd' }}>{r.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#555', lineHeight: 1.4 }}>{r.desc}</p>
              </div>
              {form.rol === r.value && (
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div style={{ background: '#2a1010', border: '1px solid #ef444440', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <a href="/admin/usuarios" style={{ padding: '12px 20px', background: '#1a1a1a', color: '#555', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Cancelar</a>
        <button onClick={handleSubmit} disabled={loading || !form.nombre || !form.email || !form.rol} style={{
          flex: 1, padding: '12px', background: form.nombre && form.email && form.rol ? '#E8531D' : '#1a1a1a',
          border: 'none', borderRadius: 8, color: form.nombre && form.email && form.rol ? '#fff' : '#444',
          fontSize: 14, fontWeight: 600, cursor: form.nombre && form.email && form.rol ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}>
          {loading ? 'Enviando...' : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13 M22 2L15 22l-4-9-9-4 20-7z"/></svg>
              Enviar invitación
            </>
          )}
        </button>
      </div>
    </div>
  )
}
