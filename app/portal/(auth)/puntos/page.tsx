import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'

const levelIcons: Record<string, string> = {
  Principiante: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  Aficionado: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z',
  Cervezero: 'M6 9l6-6 6 6M6 9v10a2 2 0 002 2h8a2 2 0 002-2V9',
  'Master Brewer': 'M12 2L2 7l10 5 10-5-10-5M2 17l10 5 10-5M2 12l10 5 10-5',
}

export default async function PuntosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('puntos, full_name').eq('id', user!.id).single()
  const puntos = profile?.puntos || 0

  const niveles = [
    { nombre: 'Principiante', min: 0, max: 499, color: '#888' },
    { nombre: 'Aficionado', min: 500, max: 1499, color: '#f59e0b' },
    { nombre: 'Cervezero', min: 1500, max: 3999, color: '#E8531D' },
    { nombre: 'Master Brewer', min: 4000, max: 99999, color: '#7c3aed' },
  ]
  const nivelActual = niveles.find(n => puntos >= n.min && puntos <= n.max) || niveles[0]
  const nivelSig = niveles[niveles.indexOf(nivelActual) + 1]
  const progreso = nivelSig ? ((puntos - nivelActual.min) / (nivelSig.min - nivelActual.min)) * 100 : 100

  return (
    <div className="portal-page" style={{ padding: '40px 48px', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 34, fontWeight: 800, color: '#111', marginBottom: 6, lineHeight: 1.15 }}>Mis puntos</h1>
      <p style={{ color: '#6b7280', fontSize: 15, marginBottom: 48 }}>Programa de lealtad Tarabaña</p>

      {/* Card principal */}
      <div style={{ background: '#0a0a0a', borderRadius: 16, padding: '36px 40px', marginBottom: 48, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: '0 0 4px', color: '#555', fontSize: 14 }}>Puntos acumulados</p>
            <p style={{ margin: 0, fontSize: 52, fontWeight: 800, color: '#E8531D', lineHeight: 1 }}>{puntos.toLocaleString()}</p>
            <p style={{ margin: '8px 0 0', color: '#666', fontSize: 14 }}>pts</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={nivelActual.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d={levelIcons[nivelActual.nombre]} />
            </svg>
            <p style={{ margin: '6px 0 0', color: nivelActual.color, fontWeight: 700, fontSize: 15 }}>{nivelActual.nombre}</p>
          </div>
        </div>
        {nivelSig && (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ margin: 0, color: '#555', fontSize: 13 }}>Progreso a {nivelSig.nombre}</p>
              <p style={{ margin: 0, color: '#555', fontSize: 13 }}>{nivelSig.min - puntos} pts para subir</p>
            </div>
            <div style={{ background: '#1a1a1a', borderRadius: 99, height: 8 }}>
              <div style={{ background: '#E8531D', borderRadius: 99, height: 8, width: `${progreso}%`, transition: 'width 0.5s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Niveles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 48 }}>
        {niveles.map(n => (
          <div key={n.nombre} style={{
            background: puntos >= n.min ? '#fff' : '#f8f8f8',
            border: `1px solid ${puntos >= n.min ? n.color + '40' : '#e5e7eb'}`,
            borderRadius: 12, padding: '20px', opacity: puntos >= n.min ? 1 : 0.5
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={n.color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 8 }}>
              <path d={levelIcons[n.nombre]} />
            </svg>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 15, color: '#111' }}>{n.nombre}</p>
            <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>{n.min.toLocaleString()}+ pts</p>
          </div>
        ))}
      </div>

      {/* Cómo ganar */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #e5e7eb', padding: '28px' }}>
        <p style={{ margin: '0 0 20px', fontWeight: 700, fontSize: 18, color: '#111' }}>Como ganar puntos</p>
        {[
          { accion: 'Cada compra', pts: '1 pt por cada $10 MXN' },
          { accion: 'Primer pedido', pts: '+50 pts de bienvenida' },
          { accion: 'Referir un amigo', pts: '+100 pts (próximamente)' },
          { accion: 'Cumpleaños', pts: '+200 pts (próximamente)' },
        ].map(r => (
          <div key={r.accion} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
            <p style={{ margin: 0, fontSize: 15, color: '#374151' }}>{r.accion}</p>
            <p style={{ margin: 0, fontSize: 14, color: '#E8531D', fontWeight: 600 }}>{r.pts}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
