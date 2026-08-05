'use client'
import { useState } from 'react'

const entregaConfig: Record<string, { label: string, color: string, bg: string }> = {
  pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef3c7' },
  confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#dbeafe' },
  enviado:    { label: 'En camino',  color: '#8b5cf6', bg: '#ede9fe' },
  entregado:  { label: 'Entregado',  color: '#10b981', bg: '#d1fae5' },
  cancelado:  { label: 'Cancelado',  color: '#ef4444', bg: '#fee2e2' },
}

const cobroConfig: Record<string, { label: string, color: string, bg: string }> = {
  pagado:    { label: 'Pagado',    color: '#10b981', bg: '#d1fae5' },
  parcial:   { label: 'Parcial',   color: '#3b82f6', bg: '#dbeafe' },
  pendiente: { label: 'Pendiente', color: '#f59e0b', bg: '#fef3c7' },
  vencido:   { label: 'Vencido',   color: '#ef4444', bg: '#fee2e2' },
}

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`

export default function PedidosClient({ pedidos, saldos, canEdit }: { pedidos: any[], saldos: any[], canEdit: boolean }) {
  const [data, setData] = useState(pedidos)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [statusModalId, setStatusModalId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [payModalId, setPayModalId] = useState<string | null>(null)
  const [payMonto, setPayMonto] = useState('')
  const [payMetodo, setPayMetodo] = useState('transferencia')
  const [payRef, setPayRef] = useState('')
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  // Shipping modal
  const [shipModalId, setShipModalId] = useState<string | null>(null)
  const [shipCosto, setShipCosto] = useState('')
  const [shipPaqueteria, setShipPaqueteria] = useState('Tres Guerras')
  const [shipGuia, setShipGuia] = useState('')
  const [shipLoading, setShipLoading] = useState(false)
  const [shipError, setShipError] = useState('')

  // Filters
  const [filterCobro, setFilterCobro] = useState('')
  const [filterEntrega, setFilterEntrega] = useState('')
  const [filterCliente, setFilterCliente] = useState('')

  // Build saldo map
  const saldoMap: Record<string, any> = {}
  for (const s of saldos) saldoMap[s.id] = s

  // Filtered data
  const filtered = data.filter(p => {
    const s = saldoMap[p.id]
    if (filterCobro && s?.estado_cobro !== filterCobro) return false
    if (filterEntrega && p.status !== filterEntrega) return false
    if (filterCliente) {
      const q = filterCliente.toLowerCase()
      const c = p.profiles as any
      if (!(c?.full_name || '').toLowerCase().includes(q) && !(c?.email || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // Stats from saldos
  const totalPedidos = data.filter(p => p.status !== 'cancelado').reduce((s, p) => s + (p.total || 0), 0)
  const porCobrar = saldos.filter(s => s.saldo > 0).reduce((s, p) => s + p.saldo, 0)
  const vencido = saldos.filter(s => s.estado_cobro === 'vencido').reduce((s, p) => s + p.saldo, 0)
  const now = new Date()
  const entregadosMes = data.filter(p => p.status === 'entregado' && new Date(p.created_at).getMonth() === now.getMonth() && new Date(p.created_at).getFullYear() === now.getFullYear()).length

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/pedidos/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setData(prev => prev.map(p => p.id === id ? { ...p, status } : p))
    setStatusModalId(null)
    setMenuId(null)
  }

  const eliminarPedido = async (id: string) => {
    if (!confirm('Eliminar este pedido? Esta accion no se puede deshacer.')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/pedidos/${id}/eliminar`, { method: 'DELETE' })
    if (res.ok) setData(prev => prev.filter(p => p.id !== id))
    setDeletingId(null)
    setMenuId(null)
  }

  const submitPago = async () => {
    if (!payModalId) return
    setPayLoading(true); setPayError('')
    const monto = parseFloat(payMonto)
    if (!monto || monto <= 0) { setPayError('Monto invalido'); setPayLoading(false); return }
    const res = await fetch('/api/admin/pagos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedido_id: payModalId, monto, metodo: payMetodo, referencia: payRef, fecha_pago: new Date().toISOString() }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setPayError(d.error || 'Error'); setPayLoading(false); return }
    setPayModalId(null); setPayMonto(''); setPayRef(''); setMenuId(null)
    setPayLoading(false)
    // Reload would be ideal but we don't have a reload mechanism from server component
    // For now the saldo will be stale until page refresh
    window.location.reload()
  }

  const openShipModal = (id: string) => {
    const p = data.find(x => x.id === id)
    setShipCosto(p?.costo_envio > 0 ? String(p.costo_envio) : '')
    setShipPaqueteria(p?.paqueteria || 'Tres Guerras')
    setShipGuia(p?.guia_envio || '')
    setShipError('')
    setShipModalId(id)
    setMenuId(null)
  }

  const submitShip = async () => {
    if (!shipModalId) return
    setShipLoading(true); setShipError('')
    const costo = parseFloat(shipCosto)
    if (isNaN(costo) || costo < 0) { setShipError('Costo invalido'); setShipLoading(false); return }
    const res = await fetch(`/api/admin/pedidos/${shipModalId}/envio`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costo_envio: costo, paqueteria: shipPaqueteria, guia_envio: shipGuia }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setShipError(d.error || 'Error'); setShipLoading(false); return }
    setShipModalId(null)
    setShipLoading(false)
    window.location.reload()
  }

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total ventas', value: fmt(totalPedidos), color: '#1a1a1a' },
          { label: 'Por cobrar', value: fmt(porCobrar), color: '#f59e0b' },
          { label: 'Vencido', value: fmt(vencido), color: '#ef4444' },
          { label: 'Entregados este mes', value: String(entregadosMes), color: '#10b981' },
        ].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input placeholder="Buscar cliente..." value={filterCliente} onChange={e => setFilterCliente(e.target.value)}
          style={{ padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#1a1a1a', outline: 'none', width: 200 }} />
        <select value={filterCobro} onChange={e => setFilterCobro(e.target.value)}
          style={{ padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#1a1a1a', outline: 'none' }}>
          <option value="">Cobro: todos</option>
          {Object.entries(cobroConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterEntrega} onChange={e => setFilterEntrega(e.target.value)}
          style={{ padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#1a1a1a', outline: 'none' }}>
          <option value="">Entrega: todos</option>
          {Object.entries(entregaConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['# y fecha', 'Cliente', 'Total', 'Saldo', 'Cobro', 'Entrega', ''].map((h, i) => (
                <th key={i} style={{ color: '#9ca3af', fontSize: 11, textAlign: 'left', padding: '10px 16px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length ? filtered.map(p => {
              const ec = entregaConfig[p.status] || { label: p.status, color: '#6b7280', bg: '#f3f4f6' }
              const s = saldoMap[p.id]
              const cc = s ? (cobroConfig[s.estado_cobro] || cobroConfig.pendiente) : cobroConfig.pendiente
              const cliente = p.profiles as any
              const fecha = new Date(p.created_at)
              const isExpanded = expandedId === p.id
              const items = p.pedido_items as any[]

              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => setExpandedId(isExpanded ? null : p.id)}>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#374151', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>#{p.id.slice(-6).toUpperCase()}</p>
                    <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 11 }}>{fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13, fontWeight: 500 }}>{cliente?.full_name || '--'}</p>
                    <p style={{ margin: '1px 0 0', color: '#9ca3af', fontSize: 11 }}>{cliente?.email}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#1a1a1a', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(p.total || 0)}</p>
                    {p.costo_envio > 0 && <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 11 }}>+ {fmt(p.costo_envio)} envio</p>}
                  </td>
                  <td style={{ padding: '14px 16px', color: s?.saldo > 0 ? '#E8531D' : '#9ca3af', fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>
                    {s ? fmt(s.saldo) : '--'}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: cc.bg, color: cc.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      {cc.label}
                      {s?.dias_vencido > 0 && s?.estado_cobro === 'vencido' ? ` (${s.dias_vencido}d)` : ''}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: ec.bg, color: ec.color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600 }}>{ec.label}</span>
                  </td>
                  <td style={{ padding: '14px 16px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                    {canEdit && (
                      <>
                        <button onClick={() => setMenuId(menuId === p.id ? null : p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, padding: '4px 8px' }}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                        </button>
                        {menuId === p.id && (
                          <div style={{ position: 'absolute', right: 16, top: 40, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 50, minWidth: 180 }}>
                            <button onClick={() => { setPayModalId(p.id); setPayMonto(''); setPayRef(''); setPayError('') }}
                              style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                              Registrar pago
                            </button>
                            <button onClick={() => openShipModal(p.id)}
                              style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                              {p.costo_envio > 0 ? 'Editar envio' : 'Registrar envio'}
                            </button>
                            <button onClick={() => setStatusModalId(p.id)}
                              style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#374151', cursor: 'pointer' }}>
                              Cambiar entrega
                            </button>
                            <a href={`/admin/pedidos/${p.id}/edit`}
                              style={{ display: 'block', padding: '10px 16px', fontSize: 13, color: '#374151', textDecoration: 'none', borderTop: '1px solid #f3f4f6' }}>
                              Editar
                            </a>
                            <button onClick={() => eliminarPedido(p.id)} disabled={deletingId === p.id}
                              style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#ef4444', cursor: 'pointer', borderTop: '1px solid #f3f4f6' }}>
                              {deletingId === p.id ? 'Eliminando...' : 'Eliminar'}
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            }) : (
              <tr><td colSpan={7} style={{ color: '#9ca3af', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>No hay pedidos</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status change modal */}
      {statusModalId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setStatusModalId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 340 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Cambiar estado de entrega</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(entregaConfig).map(([k, v]) => (
                <button key={k} onClick={() => updateStatus(statusModalId, k)}
                  style={{ padding: '10px 14px', background: data.find(p => p.id === statusModalId)?.status === k ? v.bg : '#f9fafb', border: `1px solid ${data.find(p => p.id === statusModalId)?.status === k ? v.color + '40' : '#e5e7eb'}`, borderRadius: 8, color: v.color, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick pay modal */}
      {payModalId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setPayModalId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 380 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Registrar pago</h3>
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 16px' }}>Pedido #{payModalId.slice(-6).toUpperCase()} — Saldo: {saldoMap[payModalId] ? fmt(saldoMap[payModalId].saldo) : '--'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monto</label>
                <input type="number" value={payMonto} onChange={e => setPayMonto(e.target.value)} placeholder="0.00"
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, fontWeight: 700, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Método</label>
                <select value={payMetodo} onChange={e => setPayMetodo(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="cheque">Cheque</option>
                  <option value="otro">Otro</option>
                </select>
              </div>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Referencia</label>
                <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="No. de operación"
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            {payError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{payError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPayModalId(null)} style={{ padding: '9px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitPago} disabled={payLoading} style={{ padding: '9px 20px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: payLoading ? 0.6 : 1 }}>
                {payLoading ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Shipping modal */}
      {shipModalId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShipModalId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
              {data.find(p => p.id === shipModalId)?.costo_envio > 0 ? 'Editar envio' : 'Registrar envio'}
            </h3>
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 16px' }}>Pedido #{shipModalId.slice(-6).toUpperCase()}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Costo de envio</label>
                <input type="number" value={shipCosto} onChange={e => setShipCosto(e.target.value)} placeholder="0.00" min="0" step="0.01"
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, fontWeight: 700, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Paqueteria</label>
                <input value={shipPaqueteria} onChange={e => setShipPaqueteria(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Numero de guia</label>
                <input value={shipGuia} onChange={e => setShipGuia(e.target.value)} placeholder="Opcional"
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>
            {shipError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{shipError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShipModalId(null)} style={{ padding: '9px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitShip} disabled={shipLoading} style={{ padding: '9px 20px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: shipLoading ? 0.6 : 1 }}>
                {shipLoading ? 'Guardando...' : 'Guardar envio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close menu */}
      {menuId && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setMenuId(null)} />}
    </div>
  )
}
