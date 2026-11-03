'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { isSuperAdmin } from '../../../src/lib/roles'
import { ADMIN_CHROME_BG, CONTRASTE_MINIMO, contraste, contrastaConChrome, esHex6 } from '../../../src/lib/contraste'

/**
 * Pestaña Marca. Solo queda el acento: el resto del chrome del admin está
 * fijo en código para garantizar el contraste (ver app/admin/Sidebar.tsx).
 */
export default function MarcaClient() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [branding, setBranding] = useState({ color_primary: '#E8531D' })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      if (!isSuperAdmin(prof?.role)) { setLoading(false); return }
      setAuthorized(true)
      const config = await fetch('/api/admin/config').then(r => r.json())
      // Solo color_primary: sidebar_bg y sidebar_text se retiraron y pueden
      // seguir presentes en app_config de antes.
      if (config.branding?.color_primary) setBranding({ color_primary: config.branding.color_primary })
      setLoading(false)
    }
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = async () => {
    setSaving(true)
    setError('')
    const res = await fetch('/api/admin/config', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'branding', value: branding }),
    })
    setSaving(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      setError(body.error || 'No se pudo guardar.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <p style={{ color: '#9ca3af', fontSize: 14 }}>Cargando…</p>
  if (!authorized) return <p style={{ color: '#6b7280', fontSize: 14 }}>Solo super administradores pueden editar la marca.</p>

  const inputStyle = { width: '100%', padding: '10px 13px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'system-ui' }
  const labelStyle = { color: '#6b7280', fontSize: 12, display: 'block' as const, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }
  const ok = esHex6(branding.color_primary) && contrastaConChrome(branding.color_primary)

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, maxWidth: 820 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 28 }}>
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
            Se usa como acento sobre el chrome oscuro del panel. El resto de los
            colores del sidebar están fijos para garantizar el contraste.
          </p>
        </div>

        {/* Preview sobre el chrome real del admin, que está fijo en código */}
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
              Botón primario
            </button>
          </div>
          <p className="font-mono" style={{ margin: '12px 0 0', fontSize: 11, color: ok ? '#4ade80' : '#f87171' }}>
            {esHex6(branding.color_primary)
              ? `contraste ${contraste(branding.color_primary, ADMIN_CHROME_BG).toFixed(2)}:1 ${ok ? 'OK' : `— mínimo ${CONTRASTE_MINIMO}:1`}`
              : 'hex inválido'}
          </p>
        </div>
      </div>

      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={{ padding: '10px 24px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Guardando…' : 'Guardar marca'}
        </button>
        {error && <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span>}
        {saved && <span style={{ color: '#10b981', fontSize: 13 }}>Guardado. Recarga la página para ver los cambios.</span>}
      </div>
    </div>
  )
}
