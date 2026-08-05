'use client'
import { useState } from 'react'
import { METODOS_PAGO } from '../../../src/lib/pagos'
import { tipoLabel, nivelLabel } from '../../../src/lib/clientes'

const entregaConfig: Record<string, { label: string, color: string, bg: string }> = {
  pendiente: { label: 'Pendiente', color: '#f59e0b', bg: '#fef3c7' },
  confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#dbeafe' },
  enviado: { label: 'En camino', color: '#8b5cf6', bg: '#ede9fe' },
  entregado: { label: 'Entregado', color: '#10b981', bg: '#d1fae5' },
  cancelado: { label: 'Cancelado', color: '#ef4444', bg: '#fee2e2' },
}
const cobroConfig: Record<string, { label: string, color: string, bg: string }> = {
  pagado: { label: 'Pagado', color: '#10b981', bg: '#d1fae5' },
  parcial: { label: 'Parcial', color: '#3b82f6', bg: '#dbeafe' },
  pendiente: { label: 'Pendiente', color: '#f59e0b', bg: '#fef3c7' },
  vencido: { label: 'Vencido', color: '#ef4444', bg: '#fee2e2' },
}

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 0 })}`
const MI: React.CSSProperties = { width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#1a1a1a', boxSizing: 'border-box', outline: 'none', fontFamily: 'system-ui' }
const SL: React.CSSProperties = { color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10, fontWeight: 600 }
const TH: React.CSSProperties = { color: '#9ca3af', fontSize: 11, textAlign: 'left', padding: '10px 16px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }
const FS: React.CSSProperties = { padding: '8px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#1a1a1a', outline: 'none' }
const CARD: React.CSSProperties = { background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }

function formatAddress(p: any): string | null {
  if (!p) return null
  if (p.calle) {
    const parts = [[p.calle, p.num_ext, p.num_int ? `Int. ${p.num_int}` : ''].filter(Boolean).join(' '), p.colonia, p.municipio, [p.estado, p.cp].filter(Boolean).join(' ')].filter(Boolean)
    const addr = parts.join(', ')
    return p.referencias ? `${addr}\n${p.referencias}` : addr
  }
  return p.direccion_entrega || null
}

function formatAddressBlock(p: any): string[] | null {
  if (!p) return null
  if (p.calle) {
    const lines = [[p.calle, p.num_ext, p.num_int ? `Int. ${p.num_int}` : ''].filter(Boolean).join(' ')]
    if (p.colonia) lines.push(p.colonia)
    lines.push([p.municipio, p.estado, p.cp].filter(Boolean).join(', '))
    if (p.referencias) lines.push(p.referencias)
    return lines
  }
  return p.direccion_entrega ? [p.direccion_entrega] : null
}

const B = ({ label, color, bg }: { label: string, color: string, bg: string }) =>
  <span style={{ background: bg, color, padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{label}</span>

const Overlay = ({ onClose, children }: { onClose: () => void, children: React.ReactNode }) => (
  <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={onClose}>
    <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px' }} onClick={e => e.stopPropagation()}>{children}</div>
  </div>
)

const Label = ({ children }: { children: string }) => <label style={{ ...SL, display: 'block', marginBottom: 4 }}>{children}</label>

export default function PedidosClient({ pedidos, saldos, pagos, canEdit }: { pedidos: any[], saldos: any[], pagos: any[], canEdit: boolean }) {
  const [data, setData] = useState(pedidos)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [statusModalId, setStatusModalId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [payModalId, setPayModalId] = useState<string | null>(null)
  const [payMonto, setPayMonto] = useState(''); const [payMetodo, setPayMetodo] = useState('transferencia')
  const [payRef, setPayRef] = useState(''); const [payLoading, setPayLoading] = useState(false); const [payError, setPayError] = useState('')
  const [shipModalId, setShipModalId] = useState<string | null>(null)
  const [shipCosto, setShipCosto] = useState(''); const [shipPaqueteria, setShipPaqueteria] = useState('Tres Guerras')
  const [shipGuia, setShipGuia] = useState(''); const [shipLoading, setShipLoading] = useState(false); const [shipError, setShipError] = useState('')
  const [filterCobro, setFilterCobro] = useState(''); const [filterEntrega, setFilterEntrega] = useState(''); const [filterCliente, setFilterCliente] = useState('')
  const [detailId, setDetailId] = useState<string | null>(null)
  const [cancelPagoId, setCancelPagoId] = useState<string | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState(''); const [cancelLoading, setCancelLoading] = useState(false)

  const saldoMap: Record<string, any> = {}; for (const s of saldos) saldoMap[s.id] = s
  const pagosMap: Record<string, any[]> = {}; for (const pg of pagos) { (pagosMap[pg.pedido_id] ??= []).push(pg) }

  const filtered = data.filter(p => {
    const s = saldoMap[p.id]
    if (filterCobro && s?.estado_cobro !== filterCobro) return false
    if (filterEntrega && p.status !== filterEntrega) return false
    if (filterCliente) {
      const q = filterCliente.toLowerCase(), c = p.profiles as any
      if (!(c?.full_name || '').toLowerCase().includes(q) && !(c?.email || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalPedidos = data.filter(p => p.status !== 'cancelado').reduce((s, p) => s + (p.total || 0), 0)
  const porCobrar = saldos.filter(s => s.saldo > 0).reduce((s, p) => s + p.saldo, 0)
  const vencido = saldos.filter(s => s.estado_cobro === 'vencido').reduce((s, p) => s + p.saldo, 0)
  const now = new Date()
  const entregadosMes = data.filter(p => p.status === 'entregado' && new Date(p.created_at).getMonth() === now.getMonth() && new Date(p.created_at).getFullYear() === now.getFullYear()).length

  const updateStatus = async (id: string, status: string) => {
    await fetch(`/api/admin/pedidos/${id}/status`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    setData(prev => prev.map(p => p.id === id ? { ...p, status } : p)); setStatusModalId(null); setMenuId(null)
  }
  const eliminarPedido = async (id: string) => {
    if (!confirm('Eliminar este pedido? Esta accion no se puede deshacer.')) return
    setDeletingId(id)
    const res = await fetch(`/api/admin/pedidos/${id}/eliminar`, { method: 'DELETE' })
    if (res.ok) { setData(prev => prev.filter(p => p.id !== id)); if (detailId === id) setDetailId(null) }
    setDeletingId(null); setMenuId(null)
  }
  const submitPago = async () => {
    if (!payModalId) return; setPayLoading(true); setPayError('')
    const monto = parseFloat(payMonto)
    if (!monto || monto <= 0) { setPayError('Monto invalido'); setPayLoading(false); return }
    const res = await fetch('/api/admin/pagos', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pedido_id: payModalId, monto, metodo: payMetodo, referencia: payRef, fecha_pago: new Date().toISOString() }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setPayError(d.error || 'Error'); setPayLoading(false); return }
    setPayModalId(null); setPayMonto(''); setPayRef(''); setMenuId(null); setPayLoading(false); window.location.reload()
  }
  const openShipModal = (id: string) => {
    const p = data.find(x => x.id === id)
    setShipCosto(p?.costo_envio > 0 ? String(p.costo_envio) : ''); setShipPaqueteria(p?.paqueteria || 'Tres Guerras')
    setShipGuia(p?.guia_envio || ''); setShipError(''); setShipModalId(id); setMenuId(null)
  }
  const submitShip = async () => {
    if (!shipModalId) return; setShipLoading(true); setShipError('')
    const costo = parseFloat(shipCosto)
    if (isNaN(costo) || costo < 0) { setShipError('Costo invalido'); setShipLoading(false); return }
    const res = await fetch(`/api/admin/pedidos/${shipModalId}/envio`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ costo_envio: costo, paqueteria: shipPaqueteria, guia_envio: shipGuia }) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setShipError(d.error || 'Error'); setShipLoading(false); return }
    setShipModalId(null); setShipLoading(false); window.location.reload()
  }
  const cancelPago = async () => {
    if (!cancelPagoId || !cancelMotivo.trim()) return; setCancelLoading(true)
    const res = await fetch(`/api/admin/pagos/${cancelPagoId}/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: cancelMotivo }) })
    setCancelLoading(false); if (res.ok) { setCancelPagoId(null); setCancelMotivo(''); window.location.reload() }
  }

  const dp = detailId ? data.find(p => p.id === detailId) : null
  const dpC = dp?.profiles as any, dpS = dp ? saldoMap[dp.id] : null, dpPagos = dp ? (pagosMap[dp.id] || []) : []
  const dpItems = (dp?.pedido_items || []) as any[]
  const dpEc = dp ? (entregaConfig[dp.status] || { label: dp.status, color: '#6b7280', bg: '#f3f4f6' }) : null
  const dpCc = dpS ? (cobroConfig[dpS.estado_cobro] || cobroConfig.pendiente) : cobroConfig.pendiente
  const itemsSubtotal = dpItems.reduce((s: number, it: any) => s + (it.cantidad || 0) * (it.precio_unitario || 0), 0)
  const openPay = (id: string) => { setPayModalId(id); setPayMonto(''); setPayRef(''); setPayError('') }
  const btnSec: React.CSSProperties = { padding: '8px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 12, color: '#374151', cursor: 'pointer', textDecoration: 'none' }

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

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[{ label: 'Total ventas', value: fmt(totalPedidos), color: '#1a1a1a' }, { label: 'Por cobrar', value: fmt(porCobrar), color: '#f59e0b' },
          { label: 'Vencido', value: fmt(vencido), color: '#ef4444' }, { label: 'Entregados este mes', value: String(entregadosMes), color: '#10b981' }].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ ...SL, margin: '0 0 6px' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <input placeholder="Buscar cliente..." value={filterCliente} onChange={e => setFilterCliente(e.target.value)} style={{ ...FS, width: 200 }} />
        <select value={filterCobro} onChange={e => setFilterCobro(e.target.value)} style={FS}>
          <option value="">Cobro: todos</option>
          {Object.entries(cobroConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterEntrega} onChange={e => setFilterEntrega(e.target.value)} style={FS}>
          <option value="">Entrega: todos</option>
          {Object.entries(entregaConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
            {['# y fecha', 'Cliente', 'Entrega a', 'Total', 'Saldo', 'Cobro', 'Entrega', ''].map((h, i) => <th key={i} style={TH}>{h}</th>)}
          </tr></thead>
          <tbody>
            {filtered.length ? filtered.map(p => {
              const ec = entregaConfig[p.status] || { label: p.status, color: '#6b7280', bg: '#f3f4f6' }
              const s = saldoMap[p.id], cc = s ? (cobroConfig[s.estado_cobro] || cobroConfig.pendiente) : cobroConfig.pendiente
              const cl = p.profiles as any, fecha = new Date(p.created_at)
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer', background: detailId === p.id ? '#f9fafb' : undefined }}
                  onClick={() => setDetailId(detailId === p.id ? null : p.id)}>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#374151', fontSize: 13, fontFamily: 'monospace', fontWeight: 600 }}>#{p.id.slice(-6).toUpperCase()}</p>
                    <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 11 }}>{fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13, fontWeight: 600 }}>{cl?.full_name || '--'}</p>
                    <p style={{ margin: '1px 0 0', color: '#9ca3af', fontSize: 11 }}>{cl?.email}</p>
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    {cl?.municipio ? <p style={{ margin: 0, color: '#374151', fontSize: 13 }}>{cl.municipio}, {cl.estado}</p> : <span style={{ color: '#9ca3af', fontSize: 13 }}>--</span>}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#1a1a1a', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(p.total || 0)}</p>
                    {p.costo_envio > 0 && <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 11 }}>+ {fmt(p.costo_envio)} envio</p>}
                  </td>
                  <td style={{ padding: '14px 16px', color: s?.saldo > 0 ? '#E8531D' : '#9ca3af', fontSize: 13, fontWeight: 600, fontFamily: 'monospace' }}>{s ? fmt(s.saldo) : '--'}</td>
                  <td style={{ padding: '14px 16px' }}>
                    {p.status === 'cancelado' ? <span style={{ color: '#9ca3af', fontSize: 13 }}>--</span>
                      : <B label={cc.label + (s?.dias_vencido > 0 && s?.estado_cobro === 'vencido' ? ` (${s.dias_vencido}d)` : '')} color={cc.color} bg={cc.bg} />}
                  </td>
                  <td style={{ padding: '14px 16px' }}><B label={ec.label} color={ec.color} bg={ec.bg} /></td>
                  <td style={{ padding: '14px 16px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                    {canEdit && <>
                      <button onClick={() => setMenuId(menuId === p.id ? null : p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '4px 8px' }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
                      </button>
                      {menuId === p.id && (
                        <div style={{ position: 'absolute', right: 16, top: 40, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 50, minWidth: 180 }}>
                          {[{ label: 'Registrar pago', fn: () => openPay(p.id) }, { label: p.costo_envio > 0 ? 'Editar envio' : 'Registrar envio', fn: () => openShipModal(p.id) },
                            { label: 'Cambiar entrega', fn: () => setStatusModalId(p.id) }].map(a => (
                            <button key={a.label} onClick={a.fn} style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#374151', cursor: 'pointer' }}>{a.label}</button>
                          ))}
                          <a href={`/admin/pedidos/${p.id}/edit`} style={{ display: 'block', padding: '10px 16px', fontSize: 13, color: '#374151', textDecoration: 'none', borderTop: '1px solid #f3f4f6' }}>Editar</a>
                          <button onClick={() => eliminarPedido(p.id)} disabled={deletingId === p.id}
                            style={{ display: 'block', width: '100%', padding: '10px 16px', background: 'none', border: 'none', textAlign: 'left', fontSize: 13, color: '#ef4444', cursor: 'pointer', borderTop: '1px solid #f3f4f6' }}>
                            {deletingId === p.id ? 'Eliminando...' : 'Eliminar'}</button>
                        </div>
                      )}
                    </>}
                  </td>
                </tr>
              )
            }) : <tr><td colSpan={8} style={{ color: '#9ca3af', textAlign: 'center', padding: '60px 20px', fontSize: 14 }}>No hay pedidos</td></tr>}
          </tbody>
        </table>
      </div>

      {/* Detail Panel */}
      {dp && <>
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 70 }} onClick={() => setDetailId(null)} />
        <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 560, background: '#fff', boxShadow: '-8px 0 32px rgba(0,0,0,0.08)', zIndex: 80, overflowY: 'auto', borderLeft: '1px solid #e5e7eb' }}>
          <div style={{ padding: '28px 32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
              <div>
                <p style={{ margin: 0, fontFamily: 'monospace', fontSize: 20, fontWeight: 700, color: '#1a1a1a' }}>#{dp.id.slice(-6).toUpperCase()}</p>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                  {new Date(dp.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} a las {new Date(dp.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  {dp.status === 'cancelado' ? <span style={{ color: '#9ca3af', fontSize: 13 }}>--</span> : <B label={dpCc.label} color={dpCc.color} bg={dpCc.bg} />}
                  {dpEc && <B label={dpEc.label} color={dpEc.color} bg={dpEc.bg} />}
                </div>
              </div>
              <button onClick={() => setDetailId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>

            <p style={SL}>Cliente</p>
            <div style={CARD}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#1a1a1a' }}>{dpC?.full_name || '--'}</p>
              {dpC?.email && <p style={{ margin: '2px 0', color: '#6b7280', fontSize: 13 }}>{dpC.email}</p>}
              {dpC?.phone && <p style={{ margin: '2px 0', color: '#6b7280', fontSize: 13 }}>{dpC.phone}</p>}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {dpC?.tipo_consumidor && <B label={tipoLabel(dpC.tipo_consumidor)} color="#6b7280" bg="#f3f4f6" />}
                {dpC?.nivel_precio && <B label={nivelLabel(dpC.nivel_precio)} color="#6b7280" bg="#f3f4f6" />}
              </div>
              <a href="/admin/clientes" style={{ display: 'inline-block', marginTop: 8, color: '#3b82f6', fontSize: 12, textDecoration: 'none' }}>Ver cliente &rarr;</a>
            </div>

            <p style={SL}>Direccion</p>
            <div style={CARD}>
              {(() => {
                const lines = formatAddressBlock(dpC)
                if (!lines) return <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>Sin direccion — <a href="/admin/clientes" style={{ color: '#3b82f6', textDecoration: 'none' }}>editar cliente</a></p>
                const hasRefs = dpC?.referencias && dpC.calle
                return <>
                  {lines.map((line, i) => <p key={i} style={{ margin: i ? '2px 0 0' : 0, color: '#1a1a1a', fontSize: 14, fontStyle: hasRefs && i === lines.length - 1 ? 'italic' : undefined }}>{line}</p>)}
                  <button onClick={() => { const a = formatAddress(dpC); if (a) navigator.clipboard.writeText(a.replace(/\n/g, ', ')) }}
                    style={{ marginTop: 12, padding: '8px 16px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#374151', fontSize: 13, cursor: 'pointer', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
                    Copiar direccion
                  </button>
                </>
              })()}
            </div>

            <p style={SL}>Productos</p>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {['Producto', 'Unidad', 'Cant', 'P.Unit', 'Subtotal'].map(h => <th key={h} style={{ ...TH, padding: '8px 12px', fontSize: 10 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {dpItems.map((item: any, i: number) => {
                    const prod = item.productos as any, isMix = item.metadata?.estilos, sub = (item.cantidad || 0) * (item.precio_unitario || 0)
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ color: '#1a1a1a', fontWeight: 500 }}>{prod?.nombre || '--'}</span>
                          {isMix && <> <B label="MIX" color="#8b5cf6" bg="#ede9fe" /><p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 11 }}>{(item.metadata.estilos as any[]).map((e: any) => `${e.nombre || e.estilo} x${e.cantidad}`).join(', ')}</p></>}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#6b7280' }}>{item.unidad}</td>
                        <td style={{ padding: '10px 12px', color: '#374151', textAlign: 'center' }}>{item.cantidad}</td>
                        <td style={{ padding: '10px 12px', color: '#374151', fontFamily: 'monospace' }}>{fmt(item.precio_unitario || 0)}</td>
                        <td style={{ padding: '10px 12px', color: '#1a1a1a', fontWeight: 600, fontFamily: 'monospace' }}>{fmt(sub)}</td>
                      </tr>)
                  })}
                  <tr><td colSpan={4} style={{ padding: '10px 12px', textAlign: 'right', color: '#6b7280', fontWeight: 600, fontSize: 12 }}>Subtotal</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 700, color: '#1a1a1a' }}>{fmt(itemsSubtotal)}</td></tr>
                </tbody>
              </table>
            </div>

            <p style={SL}>Desglose de cobro</p>
            <div style={{ ...CARD, fontSize: 13 }}>
              {[{ l: 'Subtotal productos', v: fmt(itemsSubtotal) },
                ...(dp.costo_envio > 0 ? [{ l: `Envio (${dp.paqueteria || ''}${dp.guia_envio ? ' — guia ' + dp.guia_envio : ''})`, v: fmt(dp.costo_envio) }] : []),
                { l: 'Total', v: fmt(dp.total || 0), b: true }, { l: 'Pagado', v: fmt(dpS ? (dp.total || 0) - dpS.saldo : 0) },
              ].map((r: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: r.b ? 700 : 400 }}>
                  <span style={{ color: '#6b7280' }}>{r.l}</span><span style={{ color: '#1a1a1a', fontFamily: 'monospace' }}>{r.v}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0 0', borderTop: '1px solid #e5e7eb', marginTop: 6, fontWeight: 700 }}>
                <span style={{ color: dpS?.saldo > 0 ? '#E8531D' : '#10b981' }}>SALDO</span>
                <span style={{ color: dpS?.saldo > 0 ? '#E8531D' : '#10b981', fontFamily: 'monospace', fontSize: 15 }}>{dpS ? fmt(dpS.saldo) : '--'}</span>
              </div>
              {dp.condiciones_pago && <p style={{ margin: '10px 0 0', color: '#6b7280', fontSize: 12 }}>Condiciones: {dp.condiciones_pago}</p>}
              {dp.fecha_vencimiento && <p style={{ margin: '2px 0 0', fontSize: 12, color: dpS?.dias_vencido > 0 ? '#ef4444' : '#6b7280' }}>
                Vencimiento: {new Date(dp.fecha_vencimiento).toLocaleDateString('es-MX')}{dpS?.dias_vencido > 0 && ` (${dpS.dias_vencido} dias vencido)`}</p>}
            </div>

            <p style={SL}>Historial de pagos</p>
            <div style={{ marginBottom: 24 }}>
              {dpPagos.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin pagos registrados</p>}
              {dpPagos.map((pg: any) => {
                const cx = pg.cancelado || pg.estado === 'cancelado'
                return (
                  <div key={pg.id} style={{ padding: '10px 14px', background: cx ? '#fafafa' : '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ textDecoration: cx ? 'line-through' : undefined, color: cx ? '#9ca3af' : '#1a1a1a' }}>
                        <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{fmt(pg.monto)}</span>
                        <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>{pg.metodo}{pg.referencia ? ` - ${pg.referencia}` : ''}</span>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>{new Date(pg.fecha_pago || pg.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    {cx && pg.motivo_cancelacion && <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 11 }}>Motivo: {pg.motivo_cancelacion}</p>}
                    {!cx && canEdit && (cancelPagoId === pg.id
                      ? <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <input placeholder="Motivo de cancelacion" value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} style={{ ...MI, padding: '6px 10px', fontSize: 12, flex: 1 }} />
                          <button onClick={cancelPago} disabled={cancelLoading || !cancelMotivo.trim()} style={{ padding: '6px 12px', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', opacity: cancelLoading ? 0.6 : 1 }}>{cancelLoading ? '...' : 'Confirmar'}</button>
                          <button onClick={() => { setCancelPagoId(null); setCancelMotivo('') }} style={{ padding: '6px 10px', background: '#f3f4f6', border: 'none', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#6b7280' }}>X</button>
                        </div>
                      : <button onClick={() => { setCancelPagoId(pg.id); setCancelMotivo('') }} style={{ marginTop: 6, padding: '3px 8px', background: 'none', border: '1px solid #e5e7eb', borderRadius: 4, color: '#ef4444', fontSize: 11, cursor: 'pointer' }}>Cancelar</button>
                    )}
                  </div>)
              })}
            </div>

            {(dp.notas_cliente || dp.notas_internas) && <>
              <p style={SL}>Notas</p>
              <div style={{ marginBottom: 24 }}>
                {dp.notas_cliente && <div style={{ marginBottom: 8 }}><p style={{ margin: 0, color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>Del cliente</p><p style={{ margin: 0, color: '#374151', fontSize: 13 }}>{dp.notas_cliente}</p></div>}
                {dp.notas_internas && <div><p style={{ margin: 0, color: '#9ca3af', fontSize: 11, marginBottom: 2 }}>Internas</p><p style={{ margin: 0, color: '#374151', fontSize: 13 }}>{dp.notas_internas}</p></div>}
              </div>
            </>}

            {canEdit && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: '1px solid #e5e7eb', paddingTop: 20 }}>
                <button onClick={() => openPay(dp.id)} style={{ padding: '8px 14px', background: '#E8531D', color: '#fff', border: 'none', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Registrar pago</button>
                <button onClick={() => openShipModal(dp.id)} style={btnSec}>Registrar envio</button>
                <button onClick={() => setStatusModalId(dp.id)} style={btnSec}>Cambiar entrega</button>
                <a href={`/admin/pedidos/${dp.id}/edit`} style={btnSec}>Editar</a>
                <button onClick={() => eliminarPedido(dp.id)} disabled={deletingId === dp.id}
                  style={{ padding: '8px 14px', background: '#fff', border: '1px solid #fee2e2', borderRadius: 8, fontSize: 12, color: '#ef4444', cursor: 'pointer' }}>
                  {deletingId === dp.id ? 'Eliminando...' : 'Eliminar'}</button>
              </div>
            )}
          </div>
        </div>
      </>}

      {statusModalId && (
        <Overlay onClose={() => setStatusModalId(null)}>
          <div style={{ width: 340 }}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>Cambiar estado de entrega</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {Object.entries(entregaConfig).map(([k, v]) => (
                <button key={k} onClick={() => updateStatus(statusModalId, k)}
                  style={{ padding: '10px 14px', background: data.find(p => p.id === statusModalId)?.status === k ? v.bg : '#f9fafb', border: `1px solid ${data.find(p => p.id === statusModalId)?.status === k ? v.color + '40' : '#e5e7eb'}`, borderRadius: 8, color: v.color, fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left' }}>
                  {v.label}</button>
              ))}
            </div>
          </div>
        </Overlay>
      )}

      {payModalId && (
        <Overlay onClose={() => setPayModalId(null)}>
          <div style={{ width: 380 }}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>Registrar pago</h3>
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 16px' }}>Pedido #{payModalId.slice(-6).toUpperCase()} — Saldo: {saldoMap[payModalId] ? fmt(saldoMap[payModalId].saldo) : '--'}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div><Label>Monto</Label><input type="number" value={payMonto} onChange={e => setPayMonto(e.target.value)} placeholder="0.00" style={{ ...MI, fontSize: 15, fontWeight: 700 }} /></div>
              <div><Label>Metodo</Label><select value={payMetodo} onChange={e => setPayMetodo(e.target.value)} style={{ ...MI, cursor: 'pointer' }}>{METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}</select></div>
              <div><Label>Referencia</Label><input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="No. de operacion" style={MI} /></div>
            </div>
            {payError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{payError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPayModalId(null)} style={{ padding: '9px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitPago} disabled={payLoading} style={{ padding: '9px 20px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: payLoading ? 0.6 : 1 }}>
                {payLoading ? 'Registrando...' : 'Registrar'}</button>
            </div>
          </div>
        </Overlay>
      )}

      {shipModalId && (
        <Overlay onClose={() => setShipModalId(null)}>
          <div style={{ width: 400 }}>
            <h3 style={{ color: '#1a1a1a', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>{data.find(p => p.id === shipModalId)?.costo_envio > 0 ? 'Editar envio' : 'Registrar envio'}</h3>
            <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 16px' }}>Pedido #{shipModalId.slice(-6).toUpperCase()}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              <div><Label>Costo de envio</Label><input type="number" value={shipCosto} onChange={e => setShipCosto(e.target.value)} placeholder="0.00" min="0" step="0.01" style={{ ...MI, fontSize: 15, fontWeight: 700 }} /></div>
              <div><Label>Paqueteria</Label><input value={shipPaqueteria} onChange={e => setShipPaqueteria(e.target.value)} style={MI} /></div>
              <div><Label>Numero de guia</Label><input value={shipGuia} onChange={e => setShipGuia(e.target.value)} placeholder="Opcional" style={{ ...MI, fontFamily: 'monospace' }} /></div>
            </div>
            {shipError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{shipError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShipModalId(null)} style={{ padding: '9px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitShip} disabled={shipLoading} style={{ padding: '9px 20px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: shipLoading ? 0.6 : 1 }}>
                {shipLoading ? 'Guardando...' : 'Guardar envio'}</button>
            </div>
          </div>
        </Overlay>
      )}

      {menuId && <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40 }} onClick={() => setMenuId(null)} />}
    </div>
  )
}
