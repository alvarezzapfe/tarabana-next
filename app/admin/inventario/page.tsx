import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { redirect } from 'next/navigation'

export default async function InventarioPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  
  const { data: productos } = await supabase
    .from('productos')
    .select('*')
    .order('nombre')

  const isSuperAdmin = profile?.role === 'super_admin'

  const totalLatas = productos?.reduce((s, p) => s + ((p.stock_caja12 || 0) * 12) + ((p.stock_caja24 || 0) * 24), 0) || 0
  const totalBblPet = productos?.reduce((s, p) => s + (p.stock_barril_pet || 0), 0) || 0
  const totalBblAcero = productos?.reduce((s, p) => s + (p.stock_barril_acero || 0), 0) || 0

  return (
    <div style={{ padding: '36px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Inventario</h1>
          <p style={{ color: '#555', fontSize: 13 }}>Stock listo para venta</p>
        </div>
        {isSuperAdmin && (
          <a href="/admin/inventario/nuevo" style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#E8531D', color: '#fff', padding: '9px 18px',
            borderRadius: 7, textDecoration: 'none', fontSize: 13.5, fontWeight: 600
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo producto
          </a>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Latas en stock', value: totalLatas.toLocaleString(), unit: 'latas', color: '#E8531D' },
          { label: 'Barriles PET', value: totalBblPet, unit: 'uds', color: '#f59e0b' },
          { label: 'Barriles Acero', value: totalBblAcero, unit: 'uds', color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '18px 22px' }}>
            <p style={{ color: '#555', fontSize: 11, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 28, fontWeight: 700, margin: 0 }}>{s.value} <span style={{ fontSize: 13, color: '#555', fontWeight: 400 }}>{s.unit}</span></p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              {['Producto', 'ABV', 'Caja 12', 'Caja 24', 'Barril PET', 'Barril Acero', 'Precio público', 'Precio taproom', 'Status', ''].map(h => (
                <th key={h} style={{ color: '#444', fontSize: 10.5, textAlign: 'left', padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {productos?.length ? productos.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #161616' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {p.imagen_url
                      ? <img src={p.imagen_url} alt={p.nombre} style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 6 }} />
                      : <div style={{ width: 36, height: 36, background: '#1a1a1a', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 16 }}>🍺</div>
                    }
                    <div>
                      <p style={{ color: '#ddd', margin: 0, fontSize: 13.5, fontWeight: 600 }}>{p.nombre}</p>
                      <p style={{ color: '#555', margin: 0, fontSize: 11.5 }}>{p.estilo}</p>
                    </div>
                  </div>
                </td>
                <td style={{ color: '#777', padding: '12px 14px', fontSize: 13 }}>{p.abv ? `${p.abv}%` : '—'}</td>
                <td style={{ color: p.stock_caja12 > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_caja12 || 0}</td>
                <td style={{ color: p.stock_caja24 > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_caja24 || 0}</td>
                <td style={{ color: p.stock_barril_pet > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_barril_pet || 0}</td>
                <td style={{ color: p.stock_barril_acero > 0 ? '#10b981' : '#ef4444', padding: '12px 14px', fontSize: 13, fontWeight: 600 }}>{p.stock_barril_acero || 0}</td>
                <td style={{ color: '#E8531D', padding: '12px 14px', fontSize: 13 }}>${p.precio_caja12_publico || p.precio_publico || '—'}</td>
                <td style={{ color: '#f59e0b', padding: '12px 14px', fontSize: 13 }}>${p.precio_caja12_taproom || p.precio_taproom || '—'}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    background: p.activo ? '#10b98118' : '#55555518',
                    color: p.activo ? '#10b981' : '#555',
                    padding: '3px 10px', borderRadius: 99, fontSize: 11
                  }}>{p.activo ? 'Activo' : 'Inactivo'}</span>
                </td>
                {isSuperAdmin && (
                  <td style={{ padding: '12px 14px' }}>
                    <a href={`/admin/inventario/edit/${p.id}`} style={{ color: '#555', fontSize: 12, textDecoration: 'none' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </a>
                  </td>
                )}
              </tr>
            )) : (
              <tr><td colSpan={10} style={{ color: '#444', textAlign: 'center', padding: 60, fontSize: 14 }}>No hay productos — agrega el primero</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
