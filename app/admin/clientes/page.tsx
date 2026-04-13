import { createServerSupabaseClient } from '../../../src/lib/supabase-server'

const tipoLabel: Record<string, string> = {
  ocasional: 'Ocasional',
  tiene_tap: 'Tap Room',
  tiene_bar: 'Bar',
  restaurante: 'Restaurante',
}

export default async function ClientesPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = ['super_admin', 'admin', 'ventas'].includes(myProfile?.role || '')

  const { data: clientes } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'comprador')
    .order('created_at', { ascending: false })

  const total = clientes?.length || 0
  const taps = clientes?.filter(c => c.tipo_consumidor === 'tiene_tap' || c.tipo_consumidor === 'tiene_bar').length || 0

  return (
    <div style={{ padding: '36px 40px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Clientes</h1>
          <p style={{ color: '#555', fontSize: 13 }}>{total} registrados · {taps} con tap/bar</p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 10 }}>
            <a href="/admin/pedidos/nuevo" style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
              background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#aaa',
              borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 500
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6"/></svg>
              Nuevo pedido
            </a>
            <a href="/admin/clientes/nuevo" style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '9px 16px',
              background: '#E8531D', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 600
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo cliente
            </a>
          </div>
        )}
      </div>

      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #161616' }}>
              {['Cliente', 'Contacto', 'Tipo', 'Dirección', 'Razón social', 'RFC', 'CFDI', 'Registrado', ''].map((h, i) => (
                <th key={i} style={{ color: '#3a3a3a', fontSize: 10.5, textAlign: 'left', padding: '10px 14px', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clientes?.length ? clientes.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #141414' }}>
                <td style={{ padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#1e1e1e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8531D', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                      {(c.full_name || c.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p style={{ color: '#ddd', margin: 0, fontSize: 13, fontWeight: 500 }}>{c.full_name || '—'}</p>
                      <p style={{ color: '#444', margin: '1px 0 0', fontSize: 11 }}>{c.email}</p>
                    </div>
                  </div>
                </td>
                <td style={{ padding: '12px 14px', color: '#555', fontSize: 12.5, whiteSpace: 'nowrap' }}>{c.phone || '—'}</td>
                <td style={{ padding: '12px 14px', color: '#777', fontSize: 12.5 }}>{tipoLabel[c.tipo_consumidor] || '—'}</td>
                <td style={{ padding: '12px 14px', maxWidth: 140 }}>
                  <p style={{ color: '#555', margin: 0, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.direccion_entrega || '—'}</p>
                  {c.ciudad && <p style={{ color: '#3a3a3a', margin: '1px 0 0', fontSize: 11 }}>{c.ciudad}</p>}
                </td>
                <td style={{ padding: '12px 14px', color: '#777', fontSize: 12.5, maxWidth: 140 }}>
                  <p style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.razon_social || '—'}</p>
                </td>
                <td style={{ padding: '12px 14px', color: '#555', fontSize: 12, fontFamily: 'monospace' }}>{c.rfc || '—'}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{
                    background: c.requiere_factura ? '#E8531D18' : '#1a1a1a',
                    color: c.requiere_factura ? '#E8531D' : '#444',
                    padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 500
                  }}>{c.requiere_factura ? 'Sí' : 'No'}</span>
                </td>
                <td style={{ padding: '12px 14px', color: '#444', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {new Date(c.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
                {canEdit && (
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <a href={`/admin/pedidos/nuevo?cliente=${c.id}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                        background: '#1a1a1a', color: '#888', borderRadius: 6, textDecoration: 'none', fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap'
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                        Pedido
                      </a>
                      <a href={`/admin/clientes/edit/${c.id}`} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '5px 10px',
                        background: '#1a1a1a', color: '#888', borderRadius: 6, textDecoration: 'none', fontSize: 11.5, fontWeight: 500
                      }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        Editar
                      </a>
                    </div>
                  </td>
                )}
              </tr>
            )) : (
              <tr><td colSpan={9} style={{ color: '#444', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>
                No hay clientes aún — agrega el primero
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
