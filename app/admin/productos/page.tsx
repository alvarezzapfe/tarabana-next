import { createServerSupabaseClient } from '../../../src/lib/supabase-server'

export default async function ProductosPage() {
  const supabase = await createServerSupabaseClient()
  const { data: productos } = await supabase
    .from('productos')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700 }}>Productos</h1>
        <a href="/admin/productos/nuevo" style={{
          background: '#E8531D', color: '#fff', padding: '10px 20px',
          borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
        }}>+ Nuevo producto</a>
      </div>
      {!productos?.length ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 60 }}>No hay productos aún</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {productos.map(p => (
            <div key={p.id} style={{
              background: '#141414', border: '1px solid #1e1e1e',
              borderRadius: 12, padding: 20
            }}>
              <p style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>{p.nombre}</p>
              <p style={{ color: '#666', fontSize: 13, marginBottom: 12 }}>{p.estilo}</p>
              <p style={{ color: '#E8531D', fontSize: 18, fontWeight: 700 }}>${p.precio_publico}</p>
              <p style={{ color: '#555', fontSize: 12 }}>Taproom: ${p.precio_taproom}</p>
              <p style={{ color: '#555', fontSize: 12, marginTop: 8 }}>Stock: {p.stock_latas} latas · {p.stock_barriles} bbl</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
