import { createServerSupabaseClient } from '../../../src/lib/supabase-server'

export default async function ProduccionPage() {
  const supabase = await createServerSupabaseClient()
  const { data: lotes } = await supabase
    .from('lotes')
    .select('*, productos(nombre)')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>Producción</h1>
        <a href="/admin/produccion/nuevo" style={{
          background: '#E8531D', color: '#fff', padding: '10px 20px',
          borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
        }}>+ Nuevo lote</a>
      </div>
      {!lotes?.length ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 60 }}>No hay lotes registrados</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
              {['Lote', 'Producto', 'Volumen', 'Latas', 'Barriles', 'Fecha'].map(h => (
                <th key={h} style={{ color: '#555', fontSize: 12, textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lotes.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #111' }}>
                <td style={{ color: '#ccc', padding: '12px', fontSize: 14 }}>{l.nombre_lote}</td>
                <td style={{ color: '#ccc', padding: '12px', fontSize: 14 }}>{(l.productos as any)?.nombre || '—'}</td>
                <td style={{ color: '#ccc', padding: '12px', fontSize: 14 }}>{l.volumen_litros}L</td>
                <td style={{ color: '#ccc', padding: '12px', fontSize: 14 }}>{l.latas_producidas}</td>
                <td style={{ color: '#ccc', padding: '12px', fontSize: 14 }}>{l.barriles_producidos}</td>
                <td style={{ color: '#555', padding: '12px', fontSize: 13 }}>{l.fecha_produccion}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
