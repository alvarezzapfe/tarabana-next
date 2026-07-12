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
        <h1 style={{ color: '#1a1a1a', fontSize: 24, fontWeight: 700 }}>Productos</h1>
        <a href="/admin/productos/nuevo" style={{
          background: '#E8531D', color: '#1a1a1a', padding: '10px 20px',
          borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 600
        }}>+ Nuevo producto</a>
      </div>
      {!productos?.length ? (
        <div style={{ color: '#6b7280', textAlign: 'center', padding: 60 }}>No hay productos aún</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
          {productos.map(p => (
            <div key={p.id} style={{
              background: '#fff', border: '1px solid #e5e7eb',
              borderRadius: 12, padding: 20
            }}>
              <p style={{ color: '#1a1a1a', fontWeight: 600, marginBottom: 4 }}>{p.nombre}</p>
              <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>{p.estilo}</p>
              <p style={{ color: '#E8531D', fontSize: 18, fontWeight: 700 }}>${p.precio_publico}</p>
              <p style={{ color: '#6b7280', fontSize: 12 }}>Taproom: ${p.precio_taproom}</p>
              <p style={{ color: '#6b7280', fontSize: 13, marginTop: 8 }}>Stock: {p.stock_latas} latas · {p.stock_barriles} bbl</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
