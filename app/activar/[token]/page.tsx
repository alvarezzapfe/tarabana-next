'use client'
import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '../../../src/lib/supabase'

export default function ActivarPage() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string
  const supabase = createClient()

  const [inv, setInv] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/invitaciones/${token}`)
      if (!res.ok) { setLoading(false); return }
      const data = await res.json()
      setInv(data)
      setLoading(false)
    }
    load()
  }, [token])

  const handleActivar = async () => {
    if (password.length < 8) { setError('Mínimo 8 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }
    setSaving(true); setError('')

    const res = await fetch('/api/invitaciones/activar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error); setSaving(false); return }

    const { error: loginError } = await supabase.auth.signInWithPassword({ email: inv.email, password })
    if (loginError) { router.push('/login'); return }
    router.push('/admin')
  }

  const roleLabel: Record<string, string> = {
    admin: 'Administrador', produccion: 'Jefe de Producción',
    ventas: 'Ventas', contabilidad: 'Lector / Contabilidad',
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <p style={{ color: '#555', fontFamily: 'system-ui' }}>Verificando invitación...</p>
    </div>
  )

  if (!inv) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 40, marginBottom: 16 }}>❌</p>
        <h2 style={{ color: '#fff', marginBottom: 8 }}>Invitación inválida o expirada</h2>
        <p style={{ color: '#555' }}>Pide al administrador que te envíe una nueva.</p>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 16, padding: '48px 40px', width: '100%', maxWidth: 420 }}>
        <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 52, display: 'block', marginBottom: 32, filter: 'brightness(0) invert(1)' }} />
        
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 6 }}>Activa tu cuenta</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 8 }}>Bienvenido, <strong style={{ color: '#ddd' }}>{inv.full_name}</strong></p>
        <div style={{ display: 'inline-block', background: '#E8531D18', color: '#E8531D', padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 600, marginBottom: 28 }}>
          {roleLabel[inv.role] || inv.role}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Email</label>
            <input value={inv.email} disabled style={{ width: '100%', padding: '11px 14px', background: '#0f0f0f', border: '1px solid #1e1e1e', borderRadius: 8, color: '#444', fontSize: 14, boxSizing: 'border-box' as const }} />
          </div>
          <div>
            <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Nueva contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres"
              style={{ width: '100%', padding: '11px 14px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const }} />
          </div>
          <div>
            <label style={{ color: '#666', fontSize: 11.5, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Confirmar contraseña</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder="Repite tu contraseña"
              onKeyDown={e => e.key === 'Enter' && handleActivar()}
              style={{ width: '100%', padding: '11px 14px', background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const }} />
          </div>
        </div>

        {error && <p style={{ color: '#ef4444', fontSize: 13, marginTop: 12 }}>{error}</p>}

        <button onClick={handleActivar} disabled={saving} style={{
          width: '100%', marginTop: 20, padding: '13px', background: '#E8531D',
          border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600,
          cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1
        }}>{saving ? 'Activando...' : 'Activar cuenta →'}</button>
      </div>
    </div>
  )
}
