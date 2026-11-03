'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { isSuperAdmin } from '../../../src/lib/roles'
import { ADMIN_CHROME_BG, CONTRASTE_MINIMO, contraste, contrastaConChrome, esHex6 } from '../../../src/lib/contraste'

export default function ConfiguracionPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [branding, setBranding] = useState({ color_primary: '#E8531D' })
  const [brandingError, setBrandingError] = useState('')
  const [negocio, setNegocio] = useState({ dias_credito_default: 30, dias_alerta_vencido: 7, moneda: 'MXN' })
  const [counts, setCounts] = useState({ usuarios: 0, clientes: 0, pedidos: 0, pagos: 0 })
  const [savingBranding, setSavingBranding] = useState(false)
  const [savingNegocio, setSavingNegocio] = useState(false)
  const [savedBranding, setSavedBranding] = useState(false)
  const [savedNegocio, setSavedNegocio] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!isSuperAdmin(prof?.role)) { setLoading(false); return }
      setAuthorized(true)

      const [configRes, usrRes, cliRes, pedRes, pagRes] = await Promise.all([
        fetch('/api/admin/config').then(r => r.json()),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).not('role', 'eq', 'comprador'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'comprador'),
        supabase.from('pedidos').select('id', { count: 'exact', head: true }),
        supabase.from('pagos').select('id', { count: 'exact', head: true }),
      ])

      // Solo color_primary: sidebar_bg y sidebar_text se retiraron y pueden
      // seguir presentes en app_config de antes.
      if (configRes.branding?.color_primary) setBranding({ color_primary: configRes.branding.color_primary })
      if (configRes.negocio) setNegocio({ ...negocio, ...configRes.negocio })
      setCounts({ usuarios: usrRes.count || 0, clientes: cliRes.count || 0, pedidos: pedRes.count || 0, pagos: pagRes.count || 0 })
      setLoading(false)
    }
    load()
  }, [])

  const saveBranding = async () => {
    setSavingBranding(true)
    setBrandingError('')
    const res = await fetch('/api/admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'branding', value: branding }) })
    setSavingBranding(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setBrandingError(body.error || 'No se pudo guardar.')
      return
    }
    setSavedBranding(true)
    setTimeout(() => setSavedBranding(false), 2000)
  }

  const saveNegocio = async () => {
    setSavingNegocio(true)
    await fetch('/api/admin/config', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: 'negocio', value: negocio }) })
    setSavingNegocio(false); setSavedNegocio(true)
    setTimeout(() => setSavedNegocio(false), 2000)
  }

  if (loading) return <div style={{ padding: '36px 40px' }}><p style={{ color: '#9ca3af', fontSize: 14 }}>Cargando...</p></div>
  if (!authorized) return <div style={{ padding: '36px 40px' }}><h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700 }}>Acceso restringido</h1><p style={{ color: '#6b7280' }}>Solo super admin.</p></div>

  const inputStyle = { width: '100%', padding: '10px 13px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'system-ui' }
  const labelStyle = { color: '#6b7280', fontSize: 12, display: 'block' as const, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif', maxWidth: 900 }}>
      <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Configuracion</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 36 }}>Ajustes globales de marca y negocio</p>

      {/* ── MARCA ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Marca</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div>
                <label style={labelStyle}>Color de acento</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="color"
                    value={branding.color_primary}
                    onChange={e => setBranding({ color_primary: e.target.value })}
                    style={{ width: 40, height: 36, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', padding: 2 }}
                  />
                  <input
                    value={branding.color_primary}
                    onChange={e => setBranding({ color_primary: e.target.value })}
                    style={{ ...inputStyle, width: 120, fontFamily: 'monospace', fontSize: 13 }}
                  />
                </div>
                <p style={{ margin: '8px 0 0', color: '#9ca3af', fontSize: 11, maxWidth: 300, lineHeight: 1.5 }}>
                  Se usa como acento sobre el chrome oscuro del panel. El resto
                  de los colores del sidebar estan fijos para garantizar el
                  contraste.
                </p>
              </div>
            </div>
          </div>
          {/* Preview sobre el chrome real del admin, que esta fijo en codigo */}
          <div style={{ background: ADMIN_CHROME_BG, borderRadius: 10, padding: '20px 16px', border: '1px solid #1C2128' }}>
            <p style={{ color: '#8B93A1', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Preview</p>
            {['Inicio', 'Pedidos', 'Clientes'].map((item, i) => (
              <div key={item} style={{
                position: 'relative', padding: '8px 10px', borderRadius: 6, fontSize: 13, marginBottom: 2,
                color: i === 1 ? '#fff' : '#8B93A1', background: i === 1 ? '#1A1F27' : 'transparent',
              }}>
                {i === 1 && <span style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: branding.color_primary, borderRadius: 1 }} />}
                {item}
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <button style={{ width: '100%', padding: '8px', background: branding.color_primary, border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600 }}>
                Boton primario
              </button>
            </div>
            <p style={{ margin: '12px 0 0', fontFamily: 'monospace', fontSize: 11, color: contrastaConChrome(branding.color_primary) ? '#4ade80' : '#f87171' }}>
              {esHex6(branding.color_primary)
                ? `contraste ${contraste(branding.color_primary, ADMIN_CHROME_BG).toFixed(2)}:1 ${contrastaConChrome(branding.color_primary) ? 'OK' : `— minimo ${CONTRASTE_MINIMO}:1`}`
                : 'hex invalido'}
            </p>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={saveBranding} disabled={savingBranding} style={{ padding: '10px 24px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: savingBranding ? 0.6 : 1 }}>
            {savingBranding ? 'Guardando...' : 'Guardar marca'}
          </button>
          {brandingError && <span style={{ color: '#dc2626', fontSize: 12 }}>{brandingError}</span>}
          {savedBranding && <span style={{ color: '#10b981', fontSize: 13 }}>Guardado. Recarga la pagina para ver los cambios.</span>}
        </div>
      </div>

      {/* ── NEGOCIO ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Negocio</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Dias de credito default</label>
            <select value={negocio.dias_credito_default} onChange={e => setNegocio({ ...negocio, dias_credito_default: parseInt(e.target.value) })} style={inputStyle}>
              <option value={0}>Contado (0)</option>
              <option value={15}>15 dias</option>
              <option value={30}>30 dias</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Dias para alerta de vencido</label>
            <input type="number" min={1} max={90} value={negocio.dias_alerta_vencido} onChange={e => setNegocio({ ...negocio, dias_alerta_vencido: parseInt(e.target.value) || 7 })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <select value={negocio.moneda} onChange={e => setNegocio({ ...negocio, moneda: e.target.value })} style={inputStyle}>
              <option value="MXN">MXN - Peso mexicano</option>
              <option value="USD">USD - Dolar</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={saveNegocio} disabled={savingNegocio} style={{ padding: '10px 24px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: savingNegocio ? 0.6 : 1 }}>
            {savingNegocio ? 'Guardando...' : 'Guardar negocio'}
          </button>
          {savedNegocio && <span style={{ color: '#10b981', fontSize: 13 }}>Guardado</span>}
        </div>
      </div>

      {/* ── SISTEMA ── */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
        <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Sistema</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {[
            { label: 'Usuarios internos', value: counts.usuarios },
            { label: 'Clientes', value: counts.clientes },
            { label: 'Pedidos', value: counts.pedidos },
            { label: 'Pagos', value: counts.pagos },
          ].map(s => (
            <div key={s.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ margin: 0, color: '#9ca3af', fontSize: 12 }}>{s.label}</p>
              <p style={{ margin: '4px 0 0', color: '#1a1a1a', fontSize: 22, fontWeight: 700 }}>{s.value}</p>
            </div>
          ))}
        </div>
        <a href="/admin/actividad" style={{ color: '#3b82f6', fontSize: 13, textDecoration: 'none', fontWeight: 500 }}>
          Ver bitacora de actividad →
        </a>
      </div>
    </div>
  )
}
