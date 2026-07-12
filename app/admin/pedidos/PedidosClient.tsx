'use client'
import { useState } from 'react'

const statusConfig: Record<string, { label: string, color: string, bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef3c7' },
  confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#dbeafe' },
  enviado:    { label: 'En camino',  color: '#8b5cf6', bg: '#ede9fe' },
  entregado:  { label: 'Entregado',  color: '#10b981', bg: '#d1fae5' },
  cancelado:  { label: 'Cancelado',  color: '#ef4444', bg: '#fee2e2' },
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
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Pedidos</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>{data.length} pedidos totales</p>
        </div>
        {canEdit && (
          <a href="/admin/pedidos/nuevo" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#E8531D', color: '#1a1a1a', padding: '10px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13.5, fontWeight: 600 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
            Nuevo pedido
          </a>
        )}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total', value: data.length, color: '#1a1a1a', currency: false },
          { label: 'Sin entregar', value: data.filter(p => !['entregado','cancelado'].includes(p.status)).length, color: '#3b82f6', currency: false },
          { label: 'Cobrado', value: totalVentas, color: '#10b981', currency: true },
          { label: 'Por cobrar', value: porCobrar, color: '#f59e0b', currency: true },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>
              {s.currency ? `$${(s.value as number).toLocaleString('es-MX', { minimumFractionDigits: 0 })}` : s.value}
            </p>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['#', 'Cliente', 'Productos', 'Total', 'Entrega', 'Pago', canEdit ? 'Pago' : '', canEdit ? 'Entrega' : '', canEdit ? 'Editar' : '', canEdit ? 'Eliminar' : ''].filter(h => h !== '' || !canEdit).map((h, i) => (
                <th key={i} style={{ color: '#6b7280', fontSize: 13, textAlign: 'left', padding: '10px 16px', textTransform: 'uppercase', letterSpacing: '0.07em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.length ? data.map(p => {
              const sc = statusConfig[p.status] || { label: p.status, color: '#6b7280', bg: '#88888818' }
              const cliente = p.profiles as any
              const items = p.pedido_items as any[]
              const fecha = new Date(p.created_at)
              const isExpanded = expandedId === p.id
              return (
                <>
                  <tr key={p.id} style={{ borderBottom: isExpanded ? 'none' : '1px solid #181818', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                    <td style={{ padding: '14px 16px' }}>
                      <p style={{ margin: 0, color: '#374151', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>#{p.id.slice(-6).toUpperCase()}</p>
                      <p style={{ margin: '3px 0 0', color: '#6b7280', fontSize: 13 }}>{fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</p>
                      <p style={{ margin: '1px 0 0', color: '#6b7280', fontSize: 10 }}>{fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13, fontWeight: 500 }}>{cliente?.full_name || '—'}</p>
                      <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11 }}>{cliente?.email}</p>
                      <span style={{ background: p.tipo_precio === 'taproom' ? '#fef3c7' : '#1a1a1a', color: p.tipo_precio === 'taproom' ? '#f59e0b' : '#888', fontSize: 13, padding: '1px 6px', borderRadius: 99, marginTop: 4, display: 'inline-block' }}>
                        {p.tipo_precio === 'taproom' ? 'Taproom' : 'Público'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', maxWidth: 260 }}>
                      {items?.length > 0 ? items.map((item: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ color: '#E8531D', fontSize: 13, fontWeight: 700, minWidth: 20 }}>{item.cantidad}×</span>
                          {item.unidad === 'mix24' ? (
                            <span style={{ color: '#1a1a1a', fontSize: 13 }}>
                              <span style={{ background: '#ede9fe', color: '#7c3aed', fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 99, marginRight: 4 }}>MIX</span>
                              {item.metadata?.estilos?.map((e: any) => e.nombre).join(', ') || item.productos?.nombre}
                            </span>
                          ) : (
                            <span style={{ color: '#1a1a1a', fontSize: 13 }}>{item.productos?.nombre}</span>
                          )}
                          <span style={{ color: '#6b7280', fontSize: 10 }}>${(item.precio_unitario || 0).toLocaleString('es-MX')}</span>
                        </div>
                      )) : <span style={{ color: '#6b7280', fontSize: 13 }}>Sin productos</span>}
                    </td>
                    <td style={{ padding: '14px 16px', color: '#E8531D', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap' }}>
                      ${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: sc.bg, color: sc.color, padding: '4px 10px', borderRadius: 99, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{sc.label}</span>
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{ background: p.pagado ? '#d1fae5' : '#fee2e2', color: p.pagado ? '#10b981' : '#ef4444', padding: '4px 10px', borderRadius: 99, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                        {p.pagado ? 'Pagado' : 'Sin pagar'}
                      </span>
                    </td>
                    {canEdit && (
                      <>
                        <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => togglePago(p.id, !p.pagado)} style={{ padding: '6px 10px', background: p.pagado ? '#2a1010' : '#102a10', border: `1px solid ${p.pagado ? '#ef444440' : '#10b98140'}`, borderRadius: 6, color: p.pagado ? '#ef4444' : '#10b981', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                            {p.pagado ? 'Sin pagar' : 'Marcar pagado'}
                          </button>
                        </td>
                        <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                          <select value={p.status} onChange={e => updateStatus(p.id, e.target.value)}
                            style={{ background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, color: '#374151', fontSize: 13, padding: '6px 8px', cursor: 'pointer' }}>
                            {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                          <a href={`/admin/pedidos/${p.id}/edit`} style={{ padding: '6px 14px', background: '#1a1a2a', border: '1px solid #3b82f640', borderRadius: 6, color: '#3b82f6', fontSize: 13, textDecoration: 'none', whiteSpace: 'nowrap', display: 'inline-block' }}>
                            ✏️ Editar
                          </a>
                        </td>
                        <td style={{ padding: '14px 16px' }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => eliminarPedido(p.id)} disabled={deletingId === p.id}
                            style={{ padding: '6px 14px', background: '#1a0a0a', border: '1px solid #ef444430', borderRadius: 6, color: '#ef4444', fontSize: 13, cursor: 'pointer', whiteSpace: 'nowrap', opacity: deletingId === p.id ? 0.5 : 1 }}>
                            {deletingId === p.id ? '...' : '🗑 Eliminar'}
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                  {/* Fila expandida con detalle */}
                  {isExpanded && (
                    <tr key={`${p.id}-detail`} style={{ borderBottom: '1px solid #181818' }}>
                      <td colSpan={7} style={{ padding: '0 16px 16px 16px', background: '#f9fafb' }}>
                        <div style={{ padding: '16px', background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                          <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Detalle del pedido</p>
                          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                                {['Producto', 'Estilo', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h, i) => (
                                  <th key={i} style={{ color: '#6b7280', fontSize: 13, textAlign: 'left', padding: '6px 12px', textTransform: 'uppercase' }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {items?.map((item: any, i: number) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '8px 12px', color: '#1a1a1a', fontSize: 13, fontWeight: 500 }}>{item.productos?.nombre || '—'}</td>
                                  <td style={{ padding: '8px 12px', color: '#6b7280', fontSize: 12 }}>{item.productos?.estilo || '—'}</td>
                                  <td style={{ padding: '8px 12px', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>{item.cantidad}</td>
                                  <td style={{ padding: '8px 12px', color: '#374151', fontSize: 12 }}>${(item.precio_unitario || 0).toLocaleString('es-MX')}</td>
                                  <td style={{ padding: '8px 12px', color: '#1a1a1a', fontSize: 13, fontWeight: 600 }}>${((item.cantidad || 0) * (item.precio_unitario || 0)).toLocaleString('es-MX')}</td>
                                </tr>
                              ))}
                              <tr>
                                <td colSpan={4} style={{ padding: '10px 12px', color: '#6b7280', fontSize: 13, textAlign: 'right', fontWeight: 600 }}>TOTAL</td>
                                <td style={{ padding: '10px 12px', color: '#E8531D', fontSize: 15, fontWeight: 700 }}>${(p.total || 0).toLocaleString('es-MX')}</td>
                              </tr>
                            </tbody>
                          </table>
                          {p.notas && <p style={{ color: '#6b7280', fontSize: 13, marginTop: 12, fontStyle: 'italic' }}>📝 {p.notas}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            }) : (
              <tr><td colSpan={7} style={{ color: '#6b7280', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>No hay pedidos aún</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
