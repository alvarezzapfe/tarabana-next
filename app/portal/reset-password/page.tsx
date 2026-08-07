'use client'
import { Suspense, useState, useEffect } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}>
        <p style={{ color: '#888', fontSize: 14 }}>Cargando...</p>
      </div>
    }>
      <ResetPasswordInner />
    </Suspense>
  )
}

function ResetPasswordInner() {
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(true)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const isNuevo = searchParams.get('nuevo') === '1'

  useEffect(() => {
    // Diagnostic log — remove after confirming flow works
    console.log('[reset-password] URL:', window.location.href)

    const establish = async () => {
      // Check for ?error= passed by /auth/confirm or Supabase directly
      const urlError = searchParams.get('error')
      if (urlError) {
        setError(urlError)
        setLoading(false)
        return
      }

      // Primary path: session already in cookie (set by /auth/confirm route handler)
      const { data: { session } } = await supabase.auth.getSession()
      if (session) { setReady(true); setLoading(false); return }

      // Fallback 1: PKCE ?code= (old links that point directly here)
      const code = searchParams.get('code')
      if (code) {
        const { error: codeError } = await supabase.auth.exchangeCodeForSession(code)
        if (!codeError) { setReady(true); setLoading(false); return }
        console.error('[reset-password] exchangeCodeForSession failed:', codeError.message)
        setError(codeError.message)
        setLoading(false)
        return
      }

      // Fallback 2: ?token_hash=&type=recovery (old links)
      const tokenHash = searchParams.get('token_hash')
      const type = searchParams.get('type')
      if (tokenHash && type === 'recovery') {
        const { error: otpError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (!otpError) { setReady(true); setLoading(false); return }
        console.error('[reset-password] verifyOtp failed:', otpError.message)
        setError(otpError.message)
        setLoading(false)
        return
      }

      // Fallback 3: implicit flow #access_token=
      if (window.location.hash.includes('access_token')) {
        await new Promise(r => setTimeout(r, 500))
        const { data: { session: s2 } } = await supabase.auth.getSession()
        if (s2) { setReady(true); setLoading(false); return }
      }

      // Nothing worked
      setLoading(false)
    }

    establish()
  }, [])

  const handleSubmit = async () => {
    setError('')
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return }

    setSaving(true)

    // Diagnostic — remove after confirming flow works
    const { data: { session: diagSession } } = await supabase.auth.getSession()
    console.log('[reset-password] session before update:', diagSession ? 'exists' : 'null')

    const res = await fetch('/api/auth/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
    const data = await res.json()

    if (!res.ok) {
      console.error('[reset-password] update failed:', data.error, res.status)
      setError(data.error || 'No se pudo actualizar la contraseña.')
      setSaving(false)
      return
    }

    // Server already signed out — clear client-side session too
    await supabase.auth.signOut()
    setDone(true)
    setSaving(false)
  }

  const loginOverlayAlpha = 0.55

  const container: React.CSSProperties = {
    minHeight: '100vh',
    backgroundImage: 'url(/pattern-brya.webp)',
    backgroundRepeat: 'repeat',
    backgroundSize: '300px',
    backgroundPosition: 'center top',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif', padding: '20px',
    position: 'relative',
  }

  const overlay: React.CSSProperties = {
    position: 'absolute', inset: 0,
    background: `rgba(245, 240, 232, ${loginOverlayAlpha})`,
    pointerEvents: 'none',
  }

  const card: React.CSSProperties = {
    background: '#fff', border: '1px solid #e0dcd6',
    borderRadius: 18, padding: '44px 40px', width: '100%', maxWidth: 420,
    boxShadow: '0 12px 48px rgba(0,0,0,0.13), 0 2px 8px rgba(0,0,0,0.06)',
    position: 'relative', zIndex: 1,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', background: '#f7f7f7',
    border: '1px solid #e8e8e8', borderRadius: 9, color: '#111',
    fontSize: 14, boxSizing: 'border-box', outline: 'none',
    fontFamily: 'system-ui, sans-serif',
  }

  // Loading
  if (loading) return (
    <div style={container}>
      <div style={overlay} />
      <div style={{ ...card, textAlign: 'center' }}>
        <p style={{ color: '#888', fontSize: 14 }}>Verificando link...</p>
      </div>
    </div>
  )

  // Link expired / invalid / error
  if (!ready && !done) return (
    <div style={container}>
      <div style={overlay} />
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#fff5f2',
          border: '2px solid #E8531D', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E8531D" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
          </svg>
        </div>
        <h2 style={{ color: '#111', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Link expirado</h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, marginBottom: error ? 12 : 24 }}>
          El link expiró o ya fue usado. Solicita uno nuevo desde el login.
        </p>
        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 24, textAlign: 'left' }}>
            <p style={{ color: '#ef4444', fontSize: 12, margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>{error}</p>
          </div>
        )}
        <button onClick={() => router.push('/portal')} style={{
          width: '100%', padding: '12px', background: '#0a0a0a',
          border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>Ir al login</button>
      </div>
    </div>
  )

  // Success
  if (done) return (
    <div style={container}>
      <div style={overlay} />
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4',
          border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style={{ color: '#111', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>
          {isNuevo ? 'Contraseña creada' : 'Contraseña actualizada'}
        </h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, marginBottom: 24 }}>
          {isNuevo ? 'Inicia sesion con tu correo y la contraseña que acabas de crear.' : 'Ya puedes iniciar sesion.'}
        </p>
        <button onClick={() => router.push('/portal')} style={{
          width: '100%', padding: '12px', background: '#E8531D',
          border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>{isNuevo ? 'Iniciar sesion' : 'Iniciar sesion'}</button>
      </div>
    </div>
  )

  // Form
  return (
    <div style={container}>
      <div style={overlay} />
      <div style={card}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <a href="/">
            <img src="/tarabana_logo_negro.jpg" alt="Tarabaña" style={{ height: 52, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
          </a>
          <h2 style={{ color: '#111', fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>
            {isNuevo ? 'Crea tu contraseña' : 'Nueva contraseña'}
          </h2>
          <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>
            {isNuevo ? 'Elige una contraseña para acceder a tu portal' : 'Ingresa tu nueva contraseña'}
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Nueva contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres" style={inputStyle}
            />
          </div>
          <div>
            <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Confirmar contraseña</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repite tu contraseña"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={inputStyle}
            />
          </div>
        </div>

        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 14 }}>
            <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{
            width: '100%', marginTop: 18, padding: '13px', background: '#E8531D',
            border: 'none', borderRadius: 9, color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1,
          }}
        >
          {saving ? 'Guardando...' : 'Actualizar contraseña'}
        </button>

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
          <a href="/portal" style={{ color: '#bbb', fontSize: 13, textDecoration: 'none' }}>
            ← Volver al login
          </a>
        </div>
      </div>
    </div>
  )
}
