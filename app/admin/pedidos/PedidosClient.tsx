'use client'
import { useState } from 'react'

const statusConfig: Record<string, { label: string, color: string, bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#f59e0b18' },
  confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#3b82f618' },
  enviado:    { label: 'En camino',  color: '#8b5cf6', bg: '#8b5cf618' },
  entregado:  { label: 'Entregado',  color: '#10b981', bg: '#10b98118' },
  cancelado:  { label: 'Cancelado',  color: '#ef4444', bg: '#ef444418' },
}

export default function PedidosClient({ pedidos, canEdit }: { pedidos: any[], canEdit: boolean }) {
  const [data, setData] = useState(pedidos)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/pedidos/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setData(prev => prev.map(p => p.id === id ? { ...p, status } : p))
  }

  const togglePago = async (id: string, pagado: boolean) => {
    await fetch(`/api/admin/pedidos/${id}/pago`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pagado }) })
    setData(prev => prev.map(p => p.id === id ? { ...p, pagado } : p))
  }

  const eliminarPedido = async (id: string) => {
    if (!confirm('¿Eliminar este pedido? Esta acción no se puede deshacer.')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/pedidos/${id}/eliminar`, { method: 'DELETE' })
    if (res.ok) { setData(prev => prev.filter(p => p.id !== id)) }
    else { alert('Error al eliminar pedido') }
    setDeletingId(null)
  }

  const totalVentas = data.filter(p => p.pagado).reduce((s, p) => s + (p.total || 0), 0)
  const porCobrar = data.filter(p => !p.pagado && p.status !== 'cancelado').reduce((s, p) => s + (p.total || 0), 0)

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Pedidos</h1>
          <p style={{ color: '#aaa', fontSize: 13 }}>{data.length} pedidos totales</p>
        </div>
        {canEdit && (
          <a href="/admin/pedidos/nuevo" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#E8531D', color: '#fff', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo pedido
          </a>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total', value: data.length, color: '#fff', currency: false },
          { label: 'Sin entregar', value: data.filter(p => !['entregado','cancelado'].includes(p.status)).length, color: '#3b82f6', currency: false },
          { label: 'Cobrado', value: totalVentas, color: '#10b981', currency: true },
          { label: 'Por cobrar', value: porCobrar, color: '#f59e0b', currency: true },
        ].map(s => (
          <div key={s.label} style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ color: '#aaa', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>
              {s.currency ? `$${(s.value as number).toLocaleString('es-MX', { minimumFractionDigits: 0 })}` : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
              {['#', 'Cliente', 'Productos', 'Total', 'Entrega', 'Pago', canEdit ? 'Pago' : '', canEdit ? 'Entrega' : '', canEdit ? 'Editar' : '', canEdit ? 'Eliminar' : ''].filter(h => h !== '' || !canEdit).map((h, i) => (
                <th key={i} style={{ color: '#888', fontSize: 10.5, textAlign: 'left', padding: '10px 16px', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length ? data.map(p => {
              const sc = statusConfig[p.status] || { label: p.status, color: '#888', bg: '#88888818' }
              const cliente = p.profiles as any
              const items = p.pedido_items as any[]
              const fecha = new Date(p.created_at)
              const isExpanded = expandedId === p.id
              return (
                <>
                  <tr key={p.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid #181818', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <td style={{ padding: '14px 16px' }}>
                      <p style={{ margin: 0, color: '#ccc', fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}>#{p.id.slice(-6).toUpperCase()}</p>
                      <p style={{ margin: '3px 0 0', color: '#888', fontSize: 10.5 }}>{fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</p>
                      <p style={{ margin: '1px 0 0', color: '#666', fontSize: 10 }}>{fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <p style={{ margin: 0, color: '#fff', fontSize: 13, fontWeight: 500 }}>{cliente?.full_name || '—'}</p>
                      <p style={{ margin: '2px 0 0', color: '#888', fontSize: 11 }}>{cliente?.email}</p>
                      <span style={{ background: p.tipo_precio === 'taproom' ? '#f59e0b18' : '#1a1a1a', color: p.tipo_precio === 'taproom' ? '#f59e0b' : '#888', fontSize: 10, padding: '1px 6px', borderRadius: 99, marginTop: 4, display: 'inline-block' }}>
                        {p.tipo_precio === 'taproom' ? 'Taproom' : 'Público'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: 220 }}>
                      {items?.length > 0 ? items.map((item: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E8531D', fontSize: 11, fontWeight: 700, minWidth: 20 }}>{item.cantidad}×</span>
                          <span style={{ color: '#ddd', fontSize: 11.5 }}>{item.productos?.nombre}</span>
                          <span style={{ color: '#666', fontSize: 10 }}>${(item.precio_unitario || 0).toLocaleString('es-MX')}</span>
                        </div>
                      )) : <span style={{ color: '#555', fontSize: 11 }}>Sin productos</span>}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#E8531D', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      ${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap' }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: p.pagado ? '#10b98118' : '#ef444418', color: p.pagado ? '#10b981' : '#ef4444', padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {p.pagado ? 'Pagado' : 'Sin pagar'}
                      </span>
                    </td>
                    {canEdit && (
                      <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <select value={p.status} onChange={e => updateStatus(p.id, e.target.value)}
                            style={{ background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 6, color: '#ccc', fontSize: 11.5, padding: '5px 8px', cursor: 'pointer', width: '100%' }}>
                            {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                          <button onClick={() => togglePago(p.id, !p.pagado)} style={{ padding: '5px 8px', background: p.pagado ? '#2a1010' : '#102a10', border: `1px solid ${p.pagado ? '#ef444440' : '#10b98140'}`, borderRadius: 6, color: p.pagado ? '#ef4444' : '#10b981', fontSize: 11.5, cursor: 'pointer', width: '100%' }}>
                            {p.pagado ? 'Marcar sin pagar' : 'Marcar pagado'}
                          </button>
                          <a href={`/admin/pedidos/${p.id}/edit`} style={{ padding: '5px 8px', background: '#1a1a2a', border: '1px solid #3b82f640', borderRadius: 6, color: '#3b82f6', fontSize: 11.5, cursor: 'pointer', width: '100%', textDecoration: 'none', textAlign: 'center', display: 'block', boxSizing: 'border-box' }}>
                            ✏️ Editar
                          </a>
                          <button onClick={() => eliminarPedido(p.id)} disabled={deletingId === p.id}
                            style={{ padding: '5px 8px', background: '#1a0a0a', border: '1px solid #ef444430', borderRadius: 6, color: '#ef4444', fontSize: 11.5, cursor: 'pointer', width: '100%', opacity: deletingId === p.id ? 0.5 : 1 }}>
                            {deletingId === p.id ? 'Eliminando...' : '🗑 Eliminar'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                  {/* Fila expandida con detalle */}
                  {isExpanded && (
                    <tr key={`${p.id}-detail`} style={{ borderBottom: '1px solid #181818' }}>
                      <td colSpan={7} style={{ padding: '0 16px 16px 16px', background: '#0d0d0d' }}>
                        <div style={{ padding: '16px', background: '#111', borderRadius: 8, border: '1px solid #1e1e1e' }}>
                          <p style={{ color: '#888', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Detalle del pedido</p>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #1e1e1e' }}>
                                {['Producto', 'Estilo', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h, i) => (
                                  <th key={i} style={{ color: '#666', fontSize: 10, textAlign: 'left', padding: '6px 12px', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {items?.map((item: any, i: number) => (
                                <tr key={i} style={{ borderBottom: '1px solid #161616' }}>
                                  <td style={{ padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 500 }}>{item.productos?.nombre || '—'}</td>
                                  <td style={{ padding: '8px 12px', color: '#888', fontSize: 12 }}>{item.productos?.estilo || '—'}</td>
                                  <td style={{ padding: '8px 12px', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>{item.cantidad}</td>
                                  <td style={{ padding: '8px 12px', color: '#ccc', fontSize: 12 }}>${(item.precio_unitario || 0).toLocaleString('es-MX')}</td>
                                  <td style={{ padding: '8px 12px', color: '#fff', fontSize: 13, fontWeight: 600 }}>${((item.cantidad || 0) * (item.precio_unitario || 0)).toLocaleString('es-MX')}</td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={4} style={{ padding: '10px 12px', color: '#888', fontSize: 12, textAlign: 'right', fontWeight: 600 }}>TOTAL</td>
                                <td style={{ padding: '10px 12px', color: '#E8531D', fontSize: 15, fontWeight: 700 }}>${(p.total || 0).toLocaleString('es-MX')}</td>
                              </tr>
                            </tbody>
                          </table>
                          {p.notas && <p style={{ color: '#888', fontSize: 12, marginTop: 12, fontStyle: 'italic' }}>📝 {p.notas}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            }) : (
              <tr><td colSpan={7} style={{ color: '#666', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>No hay pedidos aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
