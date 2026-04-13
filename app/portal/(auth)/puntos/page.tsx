import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'

export default async function PuntosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('puntos, full_name').eq('id', user!.id).single()
  const puntos = profile?.puntos || 0

  const niveles = [
    { nombre: 'Principiante', min: 0, max: 499, color: '#888', emoji: '🌱' },
    { nombre: 'Aficionado', min: 500, max: 1499, color: '#f59e0b', emoji: '🍺' },
    { nombre: 'Cervezero', min: 1500, max: 3999, color: '#E8531D', emoji: '🏆' },
    { nombre: 'Master Brewer', min: 4000, max: 99999, color: '#7c3aed', emoji: '👑' },
  ]
  const nivelActual = niveles.find(n => puntos >= n.min && puntos <= n.max) || niveles[0]
  const nivelSig = niveles[niveles.indexOf(nivelActual) + 1]
  const progreso = nivelSig ? ((puntos - nivelActual.min) / (nivelSig.min - nivelActual.min)) * 100 : 100

  return (
    <div style={{ padding: '40px 48px' }}>
      <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0a0a0a', marginBottom: 6 }}>Mis puntos</h1>
      <p style={{ color: '#888', fontSize: 14, marginBottom: 32 }}>Programa de lealtad Tarabaña</p>

      {/* Card principal */}
      <div style={{ background: '#0a0a0a', borderRadius: 16, padding: '32px 36px', marginBottom: 24, color: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: '0 0 4px', color: '#555', fontSize: 13 }}>Puntos acumulados</p>
            <p style={{ margin: 0, fontSize: 52, fontWeight: 800, color: '#E8531D', lineHeight: 1 }}>{puntos.toLocaleString()}</p>
            <p style={{ margin: '8px 0 0', color: '#666', fontSize: 13 }}>pts</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, fontSize: 32 }}>{nivelActual.emoji}</p>
            <p style={{ margin: '4px 0 0', color: nivelActual.color, fontWeight: 700, fontSize: 14 }}>{nivelActual.nombre}</p>
          </div>
        </div>
        {nivelSig && (
          <div style={{ marginTop: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <p style={{ margin: 0, color: '#555', fontSize: 12 }}>Progreso a {nivelSig.nombre}</p>
              <p style={{ margin: 0, color: '#555', fontSize: 12 }}>{nivelSig.min - puntos} pts para subir</p>
            </div>
            <div style={{ background: '#1a1a1a', borderRadius: 99, height: 8 }}>
              <div style={{ background: '#E8531D', borderRadius: 99, height: 8, width: `${progreso}%`, transition: 'width 0.5s' }} />
            </div>
          </div>
        )}
      </div>

      {/* Niveles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 32 }}>
        {niveles.map(n => (
          <div key={n.nombre} style={{
            background: puntos >= n.min ? '#fff' : '#f8f8f8',
            border: `1px solid ${puntos >= n.min ? n.color + '40' : '#ebebeb'}`,
            borderRadius: 12, padding: '16px', opacity: puntos >= n.min ? 1 : 0.5
          }}>
            <p style={{ margin: '0 0 4px', fontSize: 24 }}>{n.emoji}</p>
            <p style={{ margin: '0 0 2px', fontWeight: 700, fontSize: 13, color: '#111' }}>{n.nombre}</p>
            <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>{n.min.toLocaleString()}+ pts</p>
          </div>
        ))}
      </div>

      {/* Cómo ganar */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #ebebeb', padding: '24px' }}>
        <p style={{ margin: '0 0 16px', fontWeight: 700, fontSize: 15, color: '#111' }}>¿Cómo ganar puntos?</p>
        {[
          { accion: 'Cada compra', pts: '1 pt por cada $10 MXN' },
          { accion: 'Primer pedido', pts: '+50 pts de bienvenida' },
          { accion: 'Referir un amigo', pts: '+100 pts (próximamente)' },
          { accion: 'Cumpleaños', pts: '+200 pts (próximamente)' },
        ].map(r => (
          <div key={r.accion} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
            <p style={{ margin: 0, fontSize: 14, color: '#444' }}>{r.accion}</p>
            <p style={{ margin: 0, fontSize: 13, color: '#E8531D', fontWeight: 600 }}>{r.pts}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
