'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../../src/lib/supabase'

/**
 * Invitar usuario interno.
 *
 * Las tarjetas de rol eran oscuras (#111) con la descripcion en gris #6b7280,
 * ilegible, y el boton quedaba casi negro al estar incompleto, lo que se leia
 * como roto. Todo pasa a claro, con el acento del panel para la seleccion.
 *
 * Los colores de los iconos son los mismos tonos oscuros que los chips de rol
 * de la lista de Equipo, que se oscurecieron para cumplir AA.
 */

const ACENTO = '#D95F2E'

type Rol = { value: string; label: string; desc: string; color: string; icon: string }

// El orden es el pedido: Admin, Ventas, Vendedor, Produccion, Contabilidad.
const roles: Rol[] = [
  { value: 'admin', label: 'Admin', desc: 'Modifica todo menos gestión de usuarios', color: '#1D4ED8', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { value: 'ventas', label: 'Ventas', desc: 'Confirma pagos y gestiona pedidos', color: '#065F46', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { value: 'vendedor', label: 'Vendedor', desc: 'Solo sus pedidos y sus clientes — sin precios ni descuentos', color: '#075985', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  { value: 'produccion', label: 'Jefe de Producción', desc: 'Agrega y modifica inventario y stock', color: '#92400E', icon: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z' },
  { value: 'contabilidad', label: 'Lector / Contabilidad', desc: 'Solo lectura — ventas y reportes', color: '#5B21B6', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
]

const TIPOS_FICHA = [
  { value: 'externo', label: 'Externo' },
  { value: 'interno', label: 'Interno' },
  { value: 'distribuidor', label: 'Distribuidor' },
]

type Ficha = { id: string; nombre: string; tipo: string }

// Mismo estilo de input que el resto del admin.
const inputStyle = {
  width: '100%', padding: '11px 14px', background: '#f3f4f6',
  border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a',
  fontSize: 14, boxSizing: 'border-box' as const, outline: 'none',
  fontFamily: 'inherit',
}
const labelStyle = {
  color: '#6b7280', fontSize: 12, display: 'block' as const, marginBottom: 6,
  textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600,
}

export default function NuevoUsuarioInternoPage() {
  const router = useRouter()
  const supabase = createClient()
  const [form, setForm] = useState({ nombre: '', email: '', cel: '', rol: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [emailError, setEmailError] = useState('')
  const [success, setSuccess] = useState(false)

  // Ficha de vendedor. Solo se usa cuando el rol es vendedor.
  const [fichas, setFichas] = useState<Ficha[]>([])
  const [fichaId, setFichaId] = useState('')
  const [fichaNueva, setFichaNueva] = useState({ nombre: '', tipo: 'externo' })

  const set = (k: string, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    if (k === 'email') setEmailError('')
  }

  // Fichas libres: una ficha es de una sola persona, asi que solo se ofrecen
  // las que no tienen login. El setState vive dentro de la promesa, no en el
  // cuerpo del efecto.
  useEffect(() => {
    let vigente = true
    supabase
      .from('vendedores')
      .select('id, nombre, tipo')
      .is('profile_id', null)
      .eq('activo', true)
      .order('nombre')
      .then(({ data }) => {
        if (vigente) setFichas(data || [])
      })
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const esVendedor = form.rol === 'vendedor'
  const creandoFicha = fichaId === '__nueva'
  const fichaLista = !esVendedor || (creandoFicha ? fichaNueva.nombre.trim().length > 1 : !!fichaId)
  const baseLista = !!(form.nombre && form.email && form.rol)
  const completo = baseLista && fichaLista

  const faltante = !form.nombre || !form.email || !form.rol
    ? 'Completa nombre, email y rol'
    : creandoFicha
      ? 'Escribe el nombre de la ficha'
      : 'Elige o crea una ficha de vendedor'

  const handleSubmit = async () => {
    if (!completo) return
    setLoading(true); setError(''); setEmailError('')
    const res = await fetch('/api/admin/usuarios/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: form.nombre, email: form.email, cel: form.cel, rol: form.rol,
        ...(esVendedor
          ? creandoFicha
            ? { vendedor_nuevo: { nombre: fichaNueva.nombre.trim(), tipo: fichaNueva.tipo } }
            : { vendedor_id: fichaId }
          : {}),
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      if (res.status === 409) setEmailError(data.error || 'Ese correo ya existe')
      else setError(data.error || 'Error al crear usuario')
      setLoading(false)
      return
    }
    setSuccess(true)
    setTimeout(() => { router.push('/admin/equipo'); router.refresh() }, 2000)
  }

  if (success) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#d1fae5', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M20 6L9 17l-5-5" /></svg>
        </div>
        <p style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Invitación enviada</p>
        <p style={{ color: '#6b7280', fontSize: 14 }}>
          {esVendedor
            ? 'Al activar su cuenta se le ligará la ficha de vendedor automáticamente.'
            : 'El usuario recibirá un email para activar su cuenta.'}
        </p>
      </div>
    </div>
  )

  return (
    <div style={{ maxWidth: 720 }}>
      <style>{`
        .rol-card:hover { border-color: #9ca3af; }
        .rol-card[aria-pressed="true"]:hover { border-color: ${ACENTO}; }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <a href="/admin/equipo" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7" /></svg>
          Equipo
        </a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <h1 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>Invitar usuario interno</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div>
          <label style={labelStyle}>Nombre completo *</label>
          <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Ana García" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Email *</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="ana@tarabana.mx" style={inputStyle} />
          {emailError && <p style={{ color: '#dc2626', fontSize: 12, margin: '6px 0 0', lineHeight: 1.4 }}>{emailError}</p>}
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={labelStyle}>Celular (opcional)</label>
        <div style={{ display: 'flex' }}>
          <div style={{ background: '#fff', border: '1px solid #d1d5db', borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '11px 14px', color: '#6b7280', fontSize: 14, whiteSpace: 'nowrap' }}>
            🇲🇽 +52
          </div>
          <input type="tel" value={form.cel} onChange={e => set('cel', e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="55 1234 5678"
            style={{ ...inputStyle, borderRadius: '0 8px 8px 0' }} />
        </div>
      </div>

      <div style={{ marginBottom: esVendedor ? 18 : 28 }}>
        <label style={labelStyle}>Rol *</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {roles.map(r => {
            const sel = form.rol === r.value
            return (
              <button
                key={r.value}
                type="button"
                className="rol-card"
                aria-pressed={sel}
                onClick={() => set('rol', r.value)}
                style={{
                  position: 'relative',
                  display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px',
                  background: sel ? '#FFF7F4' : '#fff',
                  border: sel ? `2px solid ${ACENTO}` : '1px solid #e5e7eb',
                  // compensa el borde extra para que las tarjetas no salten
                  margin: sel ? 0 : 1,
                  borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color 120ms ease, background 120ms ease',
                  fontFamily: 'inherit',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: r.color + '14', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={r.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={r.icon} />
                  </svg>
                </div>
                <div style={{ flex: 1, minWidth: 0, paddingRight: sel ? 20 : 0 }}>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 13.5, color: '#1a1a1a' }}>{r.label}</p>
                  <p style={{ margin: '3px 0 0', fontSize: 12.5, color: '#6b7280', lineHeight: 1.45 }}>{r.desc}</p>
                </div>
                {sel && (
                  <span aria-hidden style={{
                    position: 'absolute', top: 10, right: 10,
                    width: 18, height: 18, borderRadius: '50%', background: ACENTO,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5" /></svg>
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Ficha de vendedor: sin ella el rol no sirve, asi que se pide aqui */}
      {esVendedor && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 18, marginBottom: 28 }}>
          <label style={labelStyle}>Ficha de vendedor *</label>
          <select value={fichaId} onChange={e => setFichaId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            <option value="">— Selecciona una ficha —</option>
            {fichas.map(f => (
              <option key={f.id} value={f.id}>{f.nombre} ({f.tipo})</option>
            ))}
            <option value="__nueva">+ Crear nueva ficha</option>
          </select>

          {creandoFicha && (
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginTop: 12 }}>
              <div>
                <label style={labelStyle}>Nombre de la ficha *</label>
                <input value={fichaNueva.nombre} onChange={e => setFichaNueva(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="Ana García" style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Tipo</label>
                <select value={fichaNueva.tipo} onChange={e => setFichaNueva(f => ({ ...f, tipo: e.target.value }))}
                  style={{ ...inputStyle, cursor: 'pointer' }}>
                  {TIPOS_FICHA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
          )}

          <p style={{ margin: '10px 0 0', color: '#9ca3af', fontSize: 11.5, lineHeight: 1.5 }}>
            {fichas.length === 0 && !creandoFicha
              ? 'No hay fichas libres: todas están ligadas a un login. Crea una nueva.'
              : 'La ficha se liga automáticamente cuando la persona active su cuenta. Sin ficha, un vendedor entra al panel y no puede crear nada.'}
          </p>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ color: '#b91c1c', fontSize: 13, margin: 0 }}>{error}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <a href="/admin/equipo" style={{ padding: '12px 20px', background: '#f3f4f6', border: '1px solid #e5e7eb', color: '#374151', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          Cancelar
        </a>
        <button
          onClick={handleSubmit}
          disabled={loading || !completo}
          style={{
            flex: 1, padding: '12px',
            background: completo ? ACENTO : '#f3f4f6',
            border: completo ? 'none' : '1px solid #e5e7eb',
            borderRadius: 8,
            color: completo ? '#fff' : '#6b7280',
            fontSize: 14, fontWeight: 600,
            cursor: completo ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'background 120ms ease',
            fontFamily: 'inherit',
          }}
        >
          {loading ? 'Enviando…' : completo ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 2L11 13 M22 2L15 22l-4-9-9-4 20-7z" /></svg>
              Enviar invitación
            </>
          ) : faltante}
        </button>
      </div>
    </div>
  )
}
