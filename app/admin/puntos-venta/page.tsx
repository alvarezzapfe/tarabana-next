import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { TIPO_LABELS, TIPO_COLORS } from '../../../src/lib/types/puntoVenta'
import type { PuntoVenta } from '../../../src/lib/types/puntoVenta'
import ToggleActivo from './ToggleActivo'

export default async function PuntosVentaPage() {
  const supabase = await createServerSupabaseClient()
  const { data: puntos } = await supabase
    .from('puntos_venta')
    .select('*')
    .order('orden', { ascending: true })
    .order('created_at', { ascending: false })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>Puntos de venta</h1>
        <a href="/admin/puntos-venta/nuevo" style={{
          background: '#E8531D', color: '#fff', padding: '10px 20px',
          borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
        }}>+ Nuevo punto de venta</a>
      </div>

      {!puntos?.length ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 60 }}>No hay puntos de venta aún</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {(puntos as PuntoVenta[]).map(p => (
            <div key={p.id} style={{
              background: '#141414', border: '1px solid #1e1e1e',
              borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {p.imagen_url ? (
                  <img src={p.imagen_url} alt={p.nombre} style={{
                    width: 60, height: 60, borderRadius: 8, objectFit: 'cover',
                    border: '1px solid #1e1e1e', flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 60, height: 60, borderRadius: 8, background: '#1e1e1e',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                  }}>📍</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ color: '#fff', fontWeight: 600, marginBottom: 4, fontSize: 15 }}>{p.nombre}</p>
                  <span style={{
                    display: 'inline-block', fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                    letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4,
                    background: `${TIPO_COLORS[p.tipo]}20`, color: TIPO_COLORS[p.tipo],
                    border: `1px solid ${TIPO_COLORS[p.tipo]}40`,
                  }}>{TIPO_LABELS[p.tipo]}</span>
                </div>
              </div>

              <p style={{ color: '#666', fontSize: 13, margin: 0 }}>
                {p.ciudad}{p.zona ? ` · ${p.zona}` : ''}
              </p>
              {p.horario && (
                <p style={{ color: '#555', fontSize: 12, margin: 0 }}>{p.horario}</p>
              )}

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #1e1e1e' }}>
                <ToggleActivo id={p.id} activo={p.activo} />
                <a href={`/admin/puntos-venta/${p.id}`} style={{
                  color: '#E8531D', fontSize: 13, textDecoration: 'none', fontWeight: 500,
                }}>Editar →</a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
