'use client'
import { useEffect, useState, useMemo } from 'react'
import { createClient } from '../../../src/lib/supabase'
import { canWrite } from '../../../src/lib/roles'
import { METODOS_PAGO } from '../../../src/lib/pagos'

const fmt = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`

interface Saldo { id: string; cliente_id: string; total: number; pagado: number; saldo: number; estado_cobro: string; dias_vencido: number; fecha_vencimiento: string; condiciones_pago: string; created_at: string; status: string }
interface Pago { id: string; pedido_id: string; monto: number; metodo: string; referencia: string; fecha_pago: string; notas: string; cancelado_at: string | null; cancelado_motivo: string | null; created_at: string }
interface Cliente { id: string; full_name: string; email: string }

export default function CobranzaPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [saldos, setSaldos] = useState<Saldo[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [clientes, setClientes] = useState<Record<string, Cliente>>({})
  const [authorized, setAuthorized] = useState(false)

  // Panel
  const [panelClienteId, setPanelClienteId] = useState<string | null>(null)
  const [panelPagos, setPanelPagos] = useState<Pago[]>([])

  // Payment modal
  const [payModal, setPayModal] = useState<string | null>(null) // cliente_id
  const [payMonto, setPayMonto] = useState('')
  const [payMetodo, setPayMetodo] = useState('transferencia')
  const [payRef, setPayRef] = useState('')
  const [payFecha, setPayFecha] = useState(new Date().toISOString().slice(0, 10))
  const [payApps, setPayApps] = useState<{ pedido_id: string; monto: number; saldo: number }[]>([])
  const [payLoading, setPayLoading] = useState(false)
  const [payError, setPayError] = useState('')

  // Cancel modal
  const [cancelId, setCancelId] = useState<string | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState('')
  const [cancelLoading, setCancelLoading] = useState(false)

  const loadData = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data: prof } = await supabase.from('profiles').select('role').eq('id', user.id).single()
    if (!canWrite(prof?.role)) { setLoading(false); return }
    setAuthorized(true)

    const [{ data: s }, { data: p }, { data: c }] = await Promise.all([
      supabase.from('pedidos_saldo').select('*'),
      supabase.from('pagos').select('*').order('fecha_pago', { ascending: false }),
      supabase.from('profiles').select('id, full_name, email').eq('role', 'comprador'),
    ])
    setSaldos(s || [])
    setPagos(p || [])
    const map: Record<string, Cliente> = {}
    for (const cl of c || []) map[cl.id] = cl
    setClientes(map)
    setLoading(false)
  }

  useEffect(() => { loadData() }, [])

  // Group by client
  const clienteData = useMemo(() => {
    const grouped: Record<string, { cliente: Cliente; saldos: Saldo[]; corriente: number; d1_30: number; d31_60: number; d60plus: number; total: number }> = {}
    for (const s of saldos) {
      if (s.saldo <= 0) continue
      const cid = s.cliente_id
      if (!grouped[cid]) {
        grouped[cid] = { cliente: clientes[cid] || { id: cid, full_name: cid.slice(-6), email: '' }, saldos: [], corriente: 0, d1_30: 0, d31_60: 0, d60plus: 0, total: 0 }
      }
      const g = grouped[cid]
      g.saldos.push(s)
      g.total += s.saldo
      if (s.dias_vencido <= 0) g.corriente += s.saldo
      else if (s.dias_vencido <= 30) g.d1_30 += s.saldo
      else if (s.dias_vencido <= 60) g.d31_60 += s.saldo
      else g.d60plus += s.saldo
    }
    return Object.values(grouped).sort((a, b) => b.total - a.total)
  }, [saldos, clientes])

  // Summary
  const totalPorCobrar = clienteData.reduce((s, c) => s + c.total, 0)
  const totalVencido = clienteData.reduce((s, c) => s + c.d1_30 + c.d31_60 + c.d60plus, 0)
  const now = new Date()
  const weekFromNow = new Date(now.getTime() + 7 * 86400000)
  const venceEstaSemana = saldos.filter(s => s.saldo > 0 && s.fecha_vencimiento && new Date(s.fecha_vencimiento) <= weekFromNow && new Date(s.fecha_vencimiento) >= now).reduce((s, p) => s + p.saldo, 0)
  const mesActual = now.getMonth()
  const anioActual = now.getFullYear()
  const cobradoEsteMes = pagos.filter(p => !p.cancelado_at && new Date(p.fecha_pago).getMonth() === mesActual && new Date(p.fecha_pago).getFullYear() === anioActual).reduce((s, p) => s + p.monto, 0)

  // Panel helpers
  const openPanel = (clienteId: string) => {
    setPanelClienteId(clienteId)
    const clientePedidoIds = saldos.filter(s => s.cliente_id === clienteId).map(s => s.id)
    setPanelPagos(pagos.filter(p => clientePedidoIds.includes(p.pedido_id)))
  }

  // Payment flow
  const openPayModal = (clienteId: string) => {
    const openSaldos = saldos.filter(s => s.cliente_id === clienteId && s.saldo > 0).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    setPayApps(openSaldos.map(s => ({ pedido_id: s.id, monto: 0, saldo: s.saldo })))
    setPayMonto('')
    setPayRef('')
    setPayMetodo('transferencia')
    setPayFecha(new Date().toISOString().slice(0, 10))
    setPayError('')
    setPayModal(clienteId)
  }

  const distribuirFIFO = (total: number) => {
    let remaining = total
    setPayApps(prev => prev.map(a => {
      const aplicar = Math.min(remaining, a.saldo)
      remaining -= aplicar
      return { ...a, monto: aplicar }
    }))
  }

  const submitPago = async () => {
    setPayLoading(true); setPayError('')
    const montoTotal = parseFloat(payMonto)
    if (!montoTotal || montoTotal <= 0) { setPayError('Monto inválido'); setPayLoading(false); return }
    const apps = payApps.filter(a => a.monto > 0)
    if (apps.length === 0) { setPayError('Asigna el monto a al menos un pedido'); setPayLoading(false); return }
    const suma = apps.reduce((s, a) => s + a.monto, 0)
    if (Math.abs(suma - montoTotal) > 0.01) { setPayError(`La suma (${fmt(suma)}) no coincide con el monto (${fmt(montoTotal)})`); setPayLoading(false); return }

    const endpoint = apps.length === 1 ? '/api/admin/pagos' : '/api/admin/pagos/aplicar'
    const body = apps.length === 1
      ? { pedido_id: apps[0].pedido_id, monto: apps[0].monto, metodo: payMetodo, referencia: payRef, fecha_pago: payFecha }
      : { cliente_id: payModal, monto_total: montoTotal, metodo: payMetodo, referencia: payRef, fecha_pago: payFecha, aplicaciones: apps.map(a => ({ pedido_id: a.pedido_id, monto: a.monto })) }

    const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setPayError(d.error || 'Error'); setPayLoading(false); return }
    setPayModal(null)
    await loadData()
    if (panelClienteId) openPanel(panelClienteId)
    setPayLoading(false)
  }

  const submitCancel = async () => {
    if (!cancelId || !cancelMotivo.trim()) return
    setCancelLoading(true)
    await fetch(`/api/admin/pagos/${cancelId}/cancelar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo: cancelMotivo }) })
    setCancelId(null); setCancelMotivo('')
    await loadData()
    if (panelClienteId) openPanel(panelClienteId)
    setCancelLoading(false)
  }

  if (loading) return <div style={{ padding: '36px 40px' }}><p style={{ color: '#9ca3af', fontSize: 14 }}>Cargando...</p></div>
  if (!authorized) return <div style={{ padding: '36px 40px' }}><p style={{ color: '#6b7280', fontSize: 14 }}>Sin permisos de cobranza.</p></div>

  const panelCliente = panelClienteId ? clientes[panelClienteId] : null
  const panelSaldos = panelClienteId ? saldos.filter(s => s.cliente_id === panelClienteId && s.saldo > 0).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) : []

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Cobranza</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 28 }}>Antigüedad de saldos y registro de pagos</p>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total por cobrar', value: fmt(totalPorCobrar), color: '#1a1a1a' },
          { label: 'Vencido', value: fmt(totalVencido), color: '#ef4444' },
          { label: 'Vence esta semana', value: fmt(venceEstaSemana), color: '#f59e0b' },
          { label: 'Cobrado este mes', value: fmt(cobradoEsteMes), color: '#10b981' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{c.label}</p>
            <p style={{ margin: '4px 0 0', color: c.color, fontSize: 22, fontWeight: 800 }}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Aging table */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['Cliente', 'Corriente', '1-30 días', '31-60 días', '+60 días', 'Total adeudado'].map(h => (
                <th key={h} style={{ color: '#9ca3af', fontSize: 11, textAlign: h === 'Cliente' ? 'left' : 'right', padding: '12px 18px', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {clienteData.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>Sin saldos pendientes</td></tr>
            ) : clienteData.map(c => (
              <tr key={c.cliente.id} onClick={() => openPanel(c.cliente.id)} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}>
                <td style={{ padding: '14px 18px' }}>
                  <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13, fontWeight: 600 }}>{c.cliente.full_name}</p>
                  <p style={{ margin: '1px 0 0', color: '#9ca3af', fontSize: 11 }}>{c.cliente.email}</p>
                </td>
                <td style={{ padding: '14px 18px', textAlign: 'right', color: '#6b7280', fontSize: 13, fontFamily: 'monospace' }}>{c.corriente > 0 ? fmt(c.corriente) : '—'}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', color: '#f59e0b', fontSize: 13, fontFamily: 'monospace', fontWeight: c.d1_30 > 0 ? 600 : 400 }}>{c.d1_30 > 0 ? fmt(c.d1_30) : '—'}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', color: '#E8531D', fontSize: 13, fontFamily: 'monospace', fontWeight: c.d31_60 > 0 ? 600 : 400 }}>{c.d31_60 > 0 ? fmt(c.d31_60) : '—'}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', color: '#ef4444', fontSize: 13, fontFamily: 'monospace', fontWeight: c.d60plus > 0 ? 700 : 400 }}>{c.d60plus > 0 ? fmt(c.d60plus) : '—'}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', color: '#1a1a1a', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(c.total)}</td>
              </tr>
            ))}
            {clienteData.length > 0 && (
              <tr style={{ background: '#f9fafb' }}>
                <td style={{ padding: '14px 18px', fontWeight: 700, color: '#1a1a1a', fontSize: 13 }}>TOTALES</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: '#6b7280', fontSize: 13, fontFamily: 'monospace' }}>{fmt(clienteData.reduce((s, c) => s + c.corriente, 0))}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: '#f59e0b', fontSize: 13, fontFamily: 'monospace' }}>{fmt(clienteData.reduce((s, c) => s + c.d1_30, 0))}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: '#E8531D', fontSize: 13, fontFamily: 'monospace' }}>{fmt(clienteData.reduce((s, c) => s + c.d31_60, 0))}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 700, color: '#ef4444', fontSize: 13, fontFamily: 'monospace' }}>{fmt(clienteData.reduce((s, c) => s + c.d60plus, 0))}</td>
                <td style={{ padding: '14px 18px', textAlign: 'right', fontWeight: 800, color: '#1a1a1a', fontSize: 14, fontFamily: 'monospace' }}>{fmt(totalPorCobrar)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ══════ DETAIL PANEL ══════ */}
      {panelClienteId && panelCliente && (
        <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 560, background: '#fff', borderLeft: '1px solid #e5e7eb', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.08)' }}>
          <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#1a1a1a' }}>{panelCliente.full_name}</h2>
              <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 13 }}>{panelCliente.email}</p>
            </div>
            <button onClick={() => setPanelClienteId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20 }}>x</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
            {/* Pedidos con saldo */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Pedidos con saldo</p>
              <button onClick={() => openPayModal(panelClienteId)} style={{ padding: '6px 14px', background: '#E8531D', border: 'none', borderRadius: 7, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Registrar pago</button>
            </div>
            {panelSaldos.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 13, marginBottom: 24 }}>Sin saldos pendientes</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
                {panelSaldos.map(s => (
                  <div key={s.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '12px 16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <span style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: 12 }}>#{s.id.slice(-6).toUpperCase()}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, background: s.dias_vencido > 0 ? '#fee2e2' : '#d1fae5', color: s.dias_vencido > 0 ? '#ef4444' : '#10b981' }}>
                        {s.dias_vencido > 0 ? `${s.dias_vencido}d vencido` : 'Al corriente'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: '#6b7280' }}>Total: {fmt(s.total)}</span>
                      <span style={{ color: '#6b7280' }}>Pagado: {fmt(s.pagado)}</span>
                      <span style={{ color: '#1a1a1a', fontWeight: 700 }}>Saldo: {fmt(s.saldo)}</span>
                    </div>
                    {s.fecha_vencimiento && (
                      <p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 11 }}>Vence: {new Date(s.fecha_vencimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Historial de pagos */}
            <p style={{ margin: '0 0 14px', color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>Historial de pagos</p>
            {panelPagos.length === 0 ? (
              <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin pagos registrados</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {panelPagos.map(p => (
                  <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', opacity: p.cancelado_at ? 0.5 : 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <span style={{ color: p.cancelado_at ? '#ef4444' : '#1a1a1a', fontSize: 14, fontWeight: 600, textDecoration: p.cancelado_at ? 'line-through' : 'none' }}>{fmt(p.monto)}</span>
                        <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 8 }}>{p.metodo || ''}</span>
                      </div>
                      <span style={{ color: '#9ca3af', fontSize: 11 }}>{new Date(p.fecha_pago).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    {p.referencia && <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 11, fontFamily: 'monospace' }}>Ref: {p.referencia}</p>}
                    {p.cancelado_at && <p style={{ margin: '4px 0 0', color: '#ef4444', fontSize: 11 }}>Cancelado: {p.cancelado_motivo}</p>}
                    {!p.cancelado_at && (
                      <button onClick={() => { setCancelId(p.id); setCancelMotivo('') }} style={{ marginTop: 6, padding: '3px 8px', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 4, color: '#9ca3af', fontSize: 11, cursor: 'pointer' }}>Cancelar pago</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════ PAYMENT MODAL ══════ */}
      {payModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={() => setPayModal(null)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 520, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>Registrar pago</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Monto total</label>
                <input type="number" value={payMonto} onChange={e => { setPayMonto(e.target.value); if (parseFloat(e.target.value) > 0) distribuirFIFO(parseFloat(e.target.value)) }}
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, fontWeight: 700, color: '#1a1a1a', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Método</label>
                <select value={payMetodo} onChange={e => setPayMetodo(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#1a1a1a', boxSizing: 'border-box', outline: 'none', cursor: 'pointer' }}>
                  {METODOS_PAGO.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Referencia</label>
                <input value={payRef} onChange={e => setPayRef(e.target.value)} placeholder="No. de operación"
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#1a1a1a', boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fecha</label>
                <input type="date" value={payFecha} onChange={e => setPayFecha(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, color: '#1a1a1a', boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>

            <p style={{ color: '#6b7280', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 10 }}>Aplicar a pedidos</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {payApps.map((a, i) => (
                <div key={a.pedido_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
                  <span style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: 12, minWidth: 70 }}>#{a.pedido_id.slice(-6).toUpperCase()}</span>
                  <span style={{ color: '#9ca3af', fontSize: 12, flex: 1 }}>Saldo: {fmt(a.saldo)}</span>
                  <input type="number" value={a.monto || ''} onChange={e => setPayApps(prev => prev.map((p, j) => j === i ? { ...p, monto: parseFloat(e.target.value) || 0 } : p))}
                    style={{ width: 100, padding: '6px 8px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontWeight: 600, textAlign: 'right', outline: 'none', color: '#1a1a1a' }} />
                </div>
              ))}
            </div>

            {payError && <p style={{ color: '#ef4444', fontSize: 12, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{payError}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setPayModal(null)} style={{ padding: '10px 18px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={submitPago} disabled={payLoading} style={{ padding: '10px 24px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: payLoading ? 0.6 : 1 }}>
                {payLoading ? 'Registrando...' : 'Registrar pago'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ CANCEL MODAL ══════ */}
      {cancelId && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }} onClick={() => setCancelId(null)}>
          <div style={{ background: '#fff', borderRadius: 12, padding: '24px 28px', width: 400, boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, margin: '0 0 12px' }}>Cancelar pago</h3>
            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>Motivo de cancelación (obligatorio):</p>
            <textarea value={cancelMotivo} onChange={e => setCancelMotivo(e.target.value)} rows={3} placeholder="Error en el monto, duplicado, etc."
              style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#1a1a1a', boxSizing: 'border-box', resize: 'none', outline: 'none', marginBottom: 14 }} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setCancelId(null)} style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Volver</button>
              <button onClick={submitCancel} disabled={!cancelMotivo.trim() || cancelLoading} style={{ padding: '8px 16px', background: cancelMotivo.trim() ? '#ef4444' : '#e5e7eb', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: cancelMotivo.trim() ? 'pointer' : 'not-allowed', opacity: cancelLoading ? 0.6 : 1 }}>
                {cancelLoading ? 'Cancelando...' : 'Confirmar cancelación'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
