'use client'
import { useState } from 'react'
import { createClient } from '../../src/lib/supabase'
import { useRouter } from 'next/navigation'

export default function PortalLogin() {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [emailConfirm, setEmailConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [nombre, setNombre] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [resetSent, setResetSent] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    if (!email || !password) { setError('Completa todos los campos'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Email o contraseña incorrectos'); setLoading(false); return }
    router.push('/portal/catalogo')
    router.refresh()
  }

  const handleRegister = async () => {
    if (!nombre || !email || !emailConfirm || !password) { setError('Completa todos los campos'); return }
    if (email !== emailConfirm) { setError('Los emails no coinciden'); return }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: nombre, role: 'comprador' } }
    })
    if (error) { setError(error.message); setLoading(false); return }
    setEmailSent(true)
    setLoading(false)
  }

  const handleForgot = async () => {
    if (!email) { setError('Ingresa tu email'); return }
    setLoading(true); setError('')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: 'https://tarabana-next.vercel.app/portal/reset-password'
    })
    if (error) { setError(error.message); setLoading(false); return }
    setResetSent(true)
    setLoading(false)
  }

  const inp = (value: string, onChange: (v: string) => void, placeholder: string, type = 'text') => (
    <input
      type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      onKeyDown={e => e.key === 'Enter' && (mode === 'login' ? handleLogin() : mode === 'register' ? handleRegister() : handleForgot())}
      style={{
        width: '100%', padding: '12px 14px', background: '#f7f7f7',
        border: '1px solid #e8e8e8', borderRadius: 9, color: '#111',
        fontSize: 14, boxSizing: 'border-box' as const, outline: 'none',
        fontFamily: 'system-ui, sans-serif', transition: 'border 0.15s'
      }}
    />
  )

  const container = {
    minHeight: '100vh', background: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'system-ui, sans-serif', padding: '20px'
  }

  const card = {
    background: '#fff', border: '1px solid #ebebeb',
    borderRadius: 18, padding: '44px 40px', width: '100%', maxWidth: 420,
    boxShadow: '0 8px 40px rgba(0,0,0,0.07)'
  }

  // Email enviado
  if (emailSent) return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#fff5f2',
          border: '2px solid #E8531D', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#E8531D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
            <polyline points="22,6 12,13 2,6"/>
          </svg>
        </div>
        <img src="/tarabana_logo_negro.jpg" alt="Tarabaña" style={{ height: 40, objectFit: 'contain', display: 'block', margin: '0 auto 20px' }} />
        <h2 style={{ color: '#111', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Revisa tu correo</h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
          Enviamos un link de confirmación a<br/>
          <strong style={{ color: '#111' }}>{email}</strong>
        </p>
        <div style={{ background: '#f8f5f2', borderRadius: 10, padding: '14px 16px', marginBottom: 24 }}>
          <p style={{ margin: 0, color: '#888', fontSize: 13, lineHeight: 1.6 }}>
            Haz clic en el link del email para activar tu cuenta. Si no lo ves, revisa tu carpeta de spam.
          </p>
        </div>
        <button onClick={() => { setEmailSent(false); setMode('login') }} style={{
          width: '100%', padding: '12px', background: '#0a0a0a',
          border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>Ya confirmé, iniciar sesión</button>
        <button onClick={() => setEmailSent(false)} style={{
          width: '100%', marginTop: 8, padding: '11px', background: 'transparent',
          border: '1px solid #ebebeb', borderRadius: 9, color: '#888', fontSize: 14, cursor: 'pointer'
        }}>Volver</button>
      </div>
    </div>
  )

  // Reset enviado
  if (resetSent) return (
    <div style={container}>
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4',
          border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 20px'
        }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style={{ color: '#111', fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Link enviado</h2>
        <p style={{ color: '#888', fontSize: 14, lineHeight: 1.7, marginBottom: 20 }}>
          Revisa tu correo <strong style={{ color: '#111' }}>{email}</strong> para restablecer tu contraseña.
        </p>
        <button onClick={() => { setResetSent(false); setMode('login') }} style={{
          width: '100%', padding: '12px', background: '#0a0a0a',
          border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer'
        }}>Volver al inicio de sesión</button>
      </div>
    </div>
  )

  return (
    <div style={container}>
      <div style={card}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <a href="/">
            <img src="/tarabana_logo_negro.jpg" alt="Tarabaña" style={{ height: 52, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
          </a>
          {mode !== 'forgot' && (
            <div style={{ display: 'flex', background: '#f5f5f5', borderRadius: 10, padding: 3 }}>
              {(['login', 'register'] as const).map(m => (
                <button key={m} onClick={() => { setMode(m); setError('') }} style={{
                  flex: 1, padding: '9px', border: 'none', borderRadius: 8, cursor: 'pointer',
                  background: mode === m ? '#fff' : 'transparent',
                  color: mode === m ? '#111' : '#888',
                  fontWeight: mode === m ? 700 : 400,
                  fontSize: 14, transition: 'all 0.15s',
                  boxShadow: mode === m ? '0 1px 4px rgba(0,0,0,0.08)' : 'none'
                }}>
                  {m === 'login' ? 'Iniciar sesión' : 'Registrarse'}
                </button>
              ))}
            </div>
          )}
          {mode === 'forgot' && (
            <div>
              <h2 style={{ color: '#111', fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>Olvidé mi contraseña</h2>
              <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>Te enviamos un link para restablecerla</p>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mode === 'register' && (
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Nombre completo</label>
              {inp(nombre, setNombre, 'Juan Pérez')}
            </div>
          )}

          <div>
            <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Email</label>
            {inp(email, setEmail, 'correo@ejemplo.com', 'email')}
          </div>

          {mode === 'register' && (
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Confirmar email</label>
              {inp(emailConfirm, setEmailConfirm, 'correo@ejemplo.com', 'email')}
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Contraseña</label>
              <div style={{ position: 'relative' }}>
                {inp(password, setPassword, mode === 'register' ? 'Mínimo 8 caracteres' : '••••••••', showPassword ? 'text' : 'password')}
                <button onClick={() => setShowPassword(!showPassword)} style={{
                  position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', padding: 0
                }}>
                  {showPassword
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22"/></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginTop: 14 }}>
            <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}

        <button
          onClick={mode === 'login' ? handleLogin : mode === 'register' ? handleRegister : handleForgot}
          disabled={loading}
          style={{
            width: '100%', marginTop: 18, padding: '13px', background: '#E8531D',
            border: 'none', borderRadius: 9, color: '#fff', fontSize: 15, fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1, transition: 'all 0.15s'
          }}
        >
          {loading ? 'Cargando...' : mode === 'login' ? 'Entrar' : mode === 'register' ? 'Crear cuenta' : 'Enviar link'}
        </button>

        {mode === 'login' && (
          <button onClick={() => { setMode('forgot'); setError('') }} style={{
            width: '100%', marginTop: 10, padding: '10px', background: 'transparent',
            border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer'
          }}>¿Olvidaste tu contraseña?</button>
        )}

        {mode === 'forgot' && (
          <button onClick={() => { setMode('login'); setError('') }} style={{
            width: '100%', marginTop: 10, padding: '10px', background: 'transparent',
            border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer'
          }}>← Volver al inicio de sesión</button>
        )}

        <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid #f0f0f0', textAlign: 'center' }}>
          <p style={{ color: '#ccc', fontSize: 12, marginBottom: 8 }}>¿Eres del equipo interno?</p>
          <a href="/login" style={{ color: '#bbb', fontSize: 13, textDecoration: 'none', borderBottom: '1px solid #e8e8e8' }}>
            Acceso administración →
          </a>
        </div>
      </div>
    </div>
  )
}
