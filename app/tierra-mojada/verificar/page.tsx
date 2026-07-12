'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { useRouter } from 'next/navigation'

export default function VerificarMFAPage() {
  const [mode, setMode] = useState<'loading' | 'enroll' | 'verify'>('loading')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [factorId, setFactorId] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    checkMFAStatus()
  }, [])

  const checkMFAStatus = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/tierra-mojada'); return }

    const { data: factors } = await supabase.auth.mfa.listFactors()

    if (factors?.totp && factors.totp.length > 0) {
      // Has verified TOTP factor — verify mode (just ask for code)
      setFactorId(factors.totp[0].id)
      setMode('verify')
    } else {
      // Check for unverified factors and clean them up before enrolling
      const unverified = factors?.all?.filter(
        (f) => f.factor_type === 'totp' && f.status === 'unverified'
      ) || []
      for (const f of unverified) {
        await supabase.auth.mfa.unenroll({ factorId: f.id })
      }
      await enrollTOTP()
    }
  }

  const enrollTOTP = async () => {
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Tarabaña TOTP',
      issuer: 'Tarabaña',
    })
    if (error) {
      setError('Error al configurar 2FA: ' + error.message)
      setMode('enroll')
      return
    }
    setFactorId(data.id)
    setQrCode(data.totp.qr_code)
    setSecret(data.totp.secret)
    setMode('enroll')
  }

  const handleVerify = async () => {
    if (code.length !== 6) { setError('Ingresa los 6 dígitos'); return }
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code,
    })

    if (error) {
      setError('Código incorrecto. Intenta de nuevo.')
      setLoading(false)
      return
    }

    router.push('/admin')
    router.refresh()
  }

  const inputStyle = {
    width: '100%', padding: '14px 16px', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, color: '#fff',
    fontSize: 20, boxSizing: 'border-box' as const, outline: 'none',
    textAlign: 'center' as const, letterSpacing: '0.3em', fontFamily: 'monospace',
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#0a0a0a', fontFamily: 'system-ui, sans-serif', padding: 24,
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 48, objectFit: 'contain', marginBottom: 20 }} />
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>
            {mode === 'enroll' ? 'Configurar 2FA' : 'Verificación 2FA'}
          </h1>
          <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
            {mode === 'enroll'
              ? 'Escanea el código QR con Google Authenticator'
              : 'Ingresa el código de tu autenticador'}
          </p>
        </div>

        {mode === 'loading' && (
          <div style={{ textAlign: 'center', color: '#666', fontSize: 14 }}>Cargando...</div>
        )}

        {/* Enroll: show QR */}
        {mode === 'enroll' && qrCode && (
          <div style={{ marginBottom: 32 }}>
            <div style={{
              background: '#fff', borderRadius: 12, padding: 16,
              display: 'flex', justifyContent: 'center', marginBottom: 16,
            }}>
              <img src={qrCode} alt="Código QR para autenticador" style={{ width: 200, height: 200 }} />
            </div>
            <details style={{ marginBottom: 16 }}>
              <summary style={{ color: '#666', fontSize: 12, cursor: 'pointer', marginBottom: 8 }}>
                No puedes escanear? Usa este código manual
              </summary>
              <code style={{
                display: 'block', background: 'rgba(255,255,255,0.05)', padding: '10px 14px',
                borderRadius: 6, color: '#E8531D', fontSize: 12, wordBreak: 'break-all',
                border: '1px solid rgba(255,255,255,0.08)',
              }}>
                {secret}
              </code>
            </details>
          </div>
        )}

        {/* Code input */}
        {mode !== 'loading' && (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ color: '#666', fontSize: 11, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Código de 6 dígitos
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && handleVerify()}
                placeholder="000000"
                autoFocus
                style={inputStyle}
              />
            </div>

            {error && <p style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>{error}</p>}

            <button
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              style={{
                width: '100%', padding: '13px', background: '#E8531D',
                border: 'none', borderRadius: 8, color: '#fff',
                fontSize: 15, fontWeight: 600,
                cursor: loading || code.length !== 6 ? 'not-allowed' : 'pointer',
                opacity: loading || code.length !== 6 ? 0.5 : 1,
                transition: 'all 0.15s',
              }}
            >
              {loading ? 'Verificando...' : 'Verificar →'}
            </button>
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/" style={{ color: '#444', fontSize: 12, textDecoration: 'none' }}>← Volver al inicio</a>
        </div>
      </div>
    </div>
  )
}
