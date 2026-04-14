'use client'
import { useState } from 'react'
import { createClient } from '../../src/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogin = async () => {
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('Credenciales incorrectas'); setLoading(false); return }
    router.push('/admin')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', fontFamily: 'system-ui, sans-serif', position: 'relative', overflow: 'hidden' }}>
      
      {/* Botón Home */}
      <a href="/" style={{ position: 'fixed', top: 20, left: 24, zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'system-ui', fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', background: 'rgba(0,0,0,0.3)', padding: '8px 14px', borderRadius: 8, backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Inicio
      </a>

      {/* Fondo CDMX estilo cuadro */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 0,
        backgroundImage: 'url(/cdmx.jpg)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        filter: 'sepia(0.4) contrast(1.1) brightness(0.5) saturate(1.2)',
      }} />
      
      {/* Overlay gradiente con color Tarabaña */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        background: 'linear-gradient(135deg, rgba(15,10,5,0.85) 0%, rgba(232,83,29,0.15) 50%, rgba(15,10,5,0.92) 100%)',
      }} />

      {/* Grain texture overlay */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 2, opacity: 0.04,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")',
      }} />

      {/* Lado izquierdo — branding */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 80,
        padding: '60px', position: 'relative', zIndex: 10
      }}>
        <div>
          
          <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12 }}>
            Cervecería Artesanal · Lerma & Condesa
          </p>
          <h1 style={{ color: '#fff', fontSize: 42, fontWeight: 800, lineHeight: 1.1, margin: 0, maxWidth: 420 }}>
            Panel de<br />
            <span style={{ color: '#E8531D' }}>gestión</span> interno
          </h1>
        </div>
      </div>

      {/* Lado derecho — form */}
      <div style={{
        width: 440, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px', position: 'relative', zIndex: 10,
        background: 'rgba(10,10,10,0.7)',
        backdropFilter: 'blur(24px)',
        borderLeft: '1px solid rgba(255,255,255,0.06)'
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 110, objectFit: 'contain', marginBottom: 28, display: 'block' }} /><h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Acceder</h2>
          <p style={{ color: '#555', fontSize: 14, marginBottom: 32 }}>Solo equipo Tarabaña</p>

          <div style={{ marginBottom: 14 }}>
            <label style={{ color: '#666', fontSize: 12, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff',
                fontSize: 14, boxSizing: 'border-box', outline: 'none'
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{ color: '#666', fontSize: 12, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contraseña</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              style={{
                width: '100%', padding: '12px 14px', background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: '#fff',
                fontSize: 14, boxSizing: 'border-box', outline: 'none'
              }}
            />
          </div>

          {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 16 }}>{error}</p>}

          <button
            onClick={handleLogin} disabled={loading}
            style={{
              width: '100%', padding: '13px', background: '#E8531D',
              border: 'none', borderRadius: 8, color: '#fff',
              fontSize: 15, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1, transition: 'all 0.15s'
            }}
          >
            {loading ? 'Entrando...' : 'Entrar →'}
          </button>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <a href="/portal" style={{ color: '#444', fontSize: 13, textDecoration: 'none' }}>
              ← Portal de clientes
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
