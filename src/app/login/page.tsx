'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
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
    if (error) {
      setError('Credenciales incorrectas')
      setLoading(false)
      return
    }
    router.push('/admin')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0a',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        background: '#141414',
        border: '1px solid #2a2a2a',
        borderRadius: 16,
        padding: '48px 40px',
        width: '100%',
        maxWidth: 400
      }}>
        <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 48, marginBottom: 32 }} />
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Acceder</h1>
        <p style={{ color: '#666', fontSize: 14, marginBottom: 32 }}>Panel de gestión Tarabaña</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ color: '#999', fontSize: 13, display: 'block', marginBottom: 6 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              width: '100%', padding: '12px 14px', background: '#1e1e1e',
              border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff',
              fontSize: 14, boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ color: '#999', fontSize: 13, display: 'block', marginBottom: 6 }}>Contraseña</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%', padding: '12px 14px', background: '#1e1e1e',
              border: '1px solid #2a2a2a', borderRadius: 8, color: '#fff',
              fontSize: 14, boxSizing: 'border-box'
            }}
          />
        </div>

        {error && <p style={{ color: '#ff4444', fontSize: 13, marginBottom: 16 }}>{error}</p>}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: '100%', padding: '13px', background: '#E8531D',
            border: 'none', borderRadius: 8, color: '#fff',
            fontSize: 15, fontWeight: 600, cursor: 'pointer',
            opacity: loading ? 0.7 : 1
          }}
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </div>
    </div>
  )
}
