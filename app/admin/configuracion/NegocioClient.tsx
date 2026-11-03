'use client'
import { useEffect, useState } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { isSuperAdmin } from '../../../src/lib/roles'

/** Pestaña Negocio: condiciones de pago, alertas y moneda, más conteos. */
export default function NegocioClient() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [authorized, setAuthorized] = useState(false)
  const [negocio, setNegocio] = useState({ dias_credito_default: 30, dias_alerta_vencido: 7, moneda: 'MXN' })
  const [counts, setCounts] = useState({ usuarios: 0, clientes: 0, pedidos: 0, pagos: 0 })
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

      const [config, usrRes, cliRes, pedRes, pagRes] = await Promise.all([
        fetch('/api/admin/config').then(r => r.json()),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).not('role', 'eq', 'comprador'),
        supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'comprador'),
        supabase.from('pedidos').select('id', { count: 'exact', head: true }),
        supabase.from('pagos').select('id', { count: 'exact', head: true }),
      ])

      if (config.negocio) setNegocio(n => ({ ...n, ...config.negocio }))
      setCounts({ usuarios: usrRes.count || 0, clientes: cliRes.count || 0, pedidos: pedRes.count || 0, pagos: pagRes.count || 0 })
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
      body: JSON.stringify({ key: 'negocio', value: negocio }),
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
  if (!authorized) return <p style={{ color: '#6b7280', fontSize: 14 }}>Solo super administradores pueden editar los ajustes de negocio.</p>

  const inputStyle = { width: '100%', padding: '10px 13px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'system-ui' }
  const labelStyle = { color: '#6b7280', fontSize: 12, display: 'block' as const, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.06em' }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={labelStyle}>Días de crédito default</label>
            <select value={negocio.dias_credito_default} onChange={e => setNegocio({ ...negocio, dias_credito_default: parseInt(e.target.value) })} style={inputStyle}>
              <option value={0}>Contado (0)</option>
              <option value={15}>15 días</option>
              <option value={30}>30 días</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Días para alerta de vencido</label>
            <input type="number" min={1} max={90} value={negocio.dias_alerta_vencido} onChange={e => setNegocio({ ...negocio, dias_alerta_vencido: parseInt(e.target.value) || 7 })} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Moneda</label>
            <select value={negocio.moneda} onChange={e => setNegocio({ ...negocio, moneda: e.target.value })} style={inputStyle}>
              <option value="MXN">MXN — Peso mexicano</option>
              <option value="USD">USD — Dólar</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={save} disabled={saving} style={{ padding: '10px 24px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar negocio'}
          </button>
          {error && <span style={{ color: '#dc2626', fontSize: 12 }}>{error}</span>}
          {saved && <span style={{ color: '#10b981', fontSize: 13 }}>Guardado</span>}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
        <p style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 16px' }}>Sistema</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }}>
          {[
            { label: 'Usuarios internos', value: counts.usuarios },
            { label: 'Clientes', value: counts.clientes },
            { label: 'Pedidos', value: counts.pedidos },
            { label: 'Pagos', value: counts.pagos },
          ].map(s => (
            <div key={s.label} style={{ background: '#f9fafb', borderRadius: 8, padding: '14px 16px' }}>
              <p style={{ margin: 0, color: '#9ca3af', fontSize: 12 }}>{s.label}</p>
              <p style={{ margin: '4px 0 0', color: '#1a1a1a', fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
