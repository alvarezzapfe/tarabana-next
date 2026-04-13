'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../src/lib/supabase'

const statusConfig: Record<string, { label: string, color: string, bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef9c3' },
  confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#dbeafe' },
  enviado:    { label: 'En camino',  color: '#8b5cf6', bg: '#ede9fe' },
  entregado:  { label: 'Entregado',  color: '#10b981', bg: '#dcfce7' },
  cancelado:  { label: 'Cancelado',  color: '#ef4444', bg: '#fee2e2' },
}

export default function MisPedidosPage() {
  const supabase = createClient()
  const [pedidos, setPedidos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [canceling, setCanceling] = useState<string | null>(null)

  const cancelarPedido = async (id: string) => {
    if (!confirm('¿Seguro que quieres cancelar este pedido?')) return
    setCanceling(id)
    await fetch(`/api/portal/pedidos/${id}/cancelar`, { method: 'POST' })
    setPedidos(prev => prev.map(p => p.id === id ? { ...p, status: 'cancelado' } : p))
    setCanceling(null)
  }

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('pedidos')
        .select('*, pedido_items(cantidad, precio_unitario, productos(nombre, estilo, imagen_url))')
        .eq('cliente_id', user.id)
        .order('created_at', { ascending: false })
      setPedidos(data || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontFamily: 'system-ui' }}>Cargando...</div>

  return (
    <div style={{ padding: '36px 48px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ color: '#111', fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Mis pedidos</h1>
        <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>{pedidos.length} pedidos en total</p>
      </div>

      {!pedidos.length ? (
        <div style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 16, padding: '60px 20px', textAlign: 'center', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.8"><path d="M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6"/></svg>
          </div>
          <p style={{ color: '#888', fontSize: 15, marginBottom: 16 }}>Aún no tienes pedidos</p>
          <a href="/portal/catalogo" style={{ display: 'inline-block', padding: '11px 24px', background: '#E8531D', color: '#fff', borderRadius: 9, textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>Ver catálogo</a>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {pedidos.map(p => {
            const sc = statusConfig[p.status] || { label: p.status, color: '#888', bg: '#f5f5f5' }
            const items = p.pedido_items as any[]
            const isExpanded = expanded === p.id
            const fecha = new Date(p.created_at)

            return (
              <div key={p.id} style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.04)', transition: 'all 0.2s' }}>
                {/* Header del pedido */}
                <button onClick={() => setExpanded(isExpanded ? null : p.id)} style={{
                  width: '100%', padding: '18px 24px', background: 'none', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', textAlign: 'left'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 42, height: 42, borderRadius: 10, background: sc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sc.color} strokeWidth="1.8"><path d="M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8"/></svg>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 3 }}>
                        <p style={{ margin: 0, color: '#111', fontSize: 15, fontWeight: 700 }}>Pedido #{p.id.slice(-6).toUpperCase()}</p>
                        <span style={{ background: sc.bg, color: sc.color, padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600 }}>{sc.label}</span>
                        {p.pagado && <span style={{ background: '#dcfce7', color: '#10b981', padding: '3px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600 }}>Pagado</span>}
                      </div>
                      <p style={{ margin: 0, color: '#aaa', fontSize: 12.5 }}>
                        {fecha.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <p style={{ margin: 0, color: '#E8531D', fontSize: 18, fontWeight: 800 }}>${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 0 })}</p>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                </button>

                {/* Detalle expandido */}
                {isExpanded && (
                  <div style={{ borderTop: '1px solid #f5f5f5', padding: '16px 24px 20px' }}>
                    {/* Items */}
                    <p style={{ color: '#aaa', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', margin: '0 0 12px' }}>Productos</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                      {items?.map((item: any, i: number) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: '#fafafa', borderRadius: 10, border: '1px solid #f0f0f0' }}>
                          {item.productos?.imagen_url
                            ? <img src={item.productos.imagen_url} alt={item.productos.nombre} style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover' }} />
                            : <div style={{ width: 40, height: 40, borderRadius: 8, background: '#f0ebe5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><path d="M17 11h1a3 3 0 010 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L18 8z"/></svg>
                              </div>
                          }
                          <div style={{ flex: 1 }}>
                            <p style={{ margin: 0, color: '#111', fontSize: 14, fontWeight: 600 }}>{item.productos?.nombre || '—'}</p>
                            <p style={{ margin: '1px 0 0', color: '#aaa', fontSize: 12 }}>{item.productos?.estilo}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ margin: 0, color: '#111', fontSize: 13, fontWeight: 600 }}>{item.cantidad}× ${item.precio_unitario?.toLocaleString('es-MX')}</p>
                            <p style={{ margin: '1px 0 0', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>${(item.cantidad * item.precio_unitario)?.toLocaleString('es-MX')}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Notas */}
                    {p.notas && (
                      <div style={{ background: '#fffbf5', border: '1px solid #fde8d0', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                        <p style={{ margin: 0, color: '#888', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notas</p>
                        <p style={{ margin: 0, color: '#666', fontSize: 13 }}>{p.notas}</p>
                      </div>
                    )}

                    {/* Total y tipo */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid #f5f5f5' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ background: p.tipo_precio === 'taproom' ? '#fef3c7' : '#f5f5f5', color: p.tipo_precio === 'taproom' ? '#d97706' : '#888', fontSize: 12, padding: '4px 10px', borderRadius: 99, fontWeight: 500 }}>
                          {p.tipo_precio === 'taproom' ? 'Precio taproom' : 'Precio público'}
                        </span>
                        {p.status === 'pendiente' && (
                          <button onClick={() => cancelarPedido(p.id)} disabled={canceling === p.id} style={{
                            padding: '4px 12px', background: '#fee2e2', color: '#ef4444',
                            border: 'none', borderRadius: 99, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                          }}>
                            {canceling === p.id ? 'Cancelando...' : 'Cancelar pedido'}
                          </button>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <p style={{ margin: 0, color: '#aaa', fontSize: 12 }}>Total del pedido</p>
                        <p style={{ margin: 0, color: '#E8531D', fontSize: 20, fontWeight: 800 }}>${(p.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
