'use client'
import { useState, useMemo } from 'react'
import { METODOS_PAGO } from '../../../src/lib/pagos'
import { tipoLabel, nivelLabel } from '../../../src/lib/clientes'
import * as XLSX from 'xlsx'

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
    lines.push([p.municipio, [p.estado, p.cp].filter(Boolean).join(' ')].filter(Boolean).join(', '))
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
  const [filterAno, setFilterAno] = useState(''); const [filterMes, setFilterMes] = useState('')
  const [filterZona, setFilterZona] = useState('')
  const [showExport, setShowExport] = useState(false)
  const [expPeriodo, setExpPeriodo] = useState<'todo' | 'ano' | 'meses'>('todo')
  const [expAno, setExpAno] = useState(new Date().getFullYear())
  const [expMeses, setExpMeses] = useState<number[]>([])
  const [expZona, setExpZona] = useState('todas')
  const [expCobro, setExpCobro] = useState('todos')
  const [expDetallado, setExpDetallado] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [cancelPagoId, setCancelPagoId] = useState<string | null>(null)
  const [cancelMotivo, setCancelMotivo] = useState(''); const [cancelLoading, setCancelLoading] = useState(false)

  const saldoMap: Record<string, any> = {}; for (const s of saldos) saldoMap[s.id] = s
  const pagosMap: Record<string, any[]> = {}; for (const pg of pagos) { (pagosMap[pg.pedido_id] ??= []).push(pg) }

  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const now = new Date()
  const [dashMes, setDashMes] = useState(now.getMonth())
  const [dashAno, setDashAno] = useState(now.getFullYear())

  // Available years and zones from data
  const anos = useMemo(() => [...new Set(data.map(p => new Date(p.created_at).getFullYear()))].sort((a, b) => b - a), [data])
  const zonas = useMemo(() => {
    const set = new Set<string>()
    data.forEach(p => { const c = p.profiles as any; if (c?.estado) set.add(c.estado) })
    return [...set].sort()
  }, [data])
  const isMetro = (estado: string) => ['Ciudad de Mexico', 'CDMX', 'Mexico', 'Estado de Mexico', 'Edomex'].some(e => estado?.toLowerCase().includes(e.toLowerCase()))

  const filtered = data.filter(p => {
    const s = saldoMap[p.id], c = p.profiles as any, fecha = new Date(p.created_at)
    if (filterCobro && s?.estado_cobro !== filterCobro) return false
    if (filterEntrega && p.status !== filterEntrega) return false
    if (filterCliente) { const q = filterCliente.toLowerCase(); if (!(c?.full_name || '').toLowerCase().includes(q) && !(c?.email || '').toLowerCase().includes(q)) return false }
    if (filterAno && fecha.getFullYear() !== parseInt(filterAno)) return false
    if (filterMes && fecha.getMonth() !== parseInt(filterMes)) return false
    if (filterZona === 'metro' && !isMetro(c?.estado || '')) return false
    if (filterZona === 'sin' && c?.estado) return false
    if (filterZona && filterZona !== 'metro' && filterZona !== 'sin' && c?.estado !== filterZona) return false
    return true
  })
  const hasFilters = !!(filterCobro || filterEntrega || filterCliente || filterAno || filterMes || filterZona)
  const clearFilters = () => { setFilterCobro(''); setFilterEntrega(''); setFilterCliente(''); setFilterAno(''); setFilterMes(''); setFilterZona('') }

  // Stats from filtered saldos
  const filteredSaldos = filtered.map(p => saldoMap[p.id]).filter(Boolean)
  const totalVentas = filteredSaldos.reduce((s, p) => s + ((p.pagado || 0) + (p.saldo || 0)), 0)
  const totalCobrado = filteredSaldos.reduce((s, p) => s + (p.pagado || 0), 0)
  const porCobrar = filteredSaldos.filter(s => s.saldo > 0).reduce((s, p) => s + p.saldo, 0)
  const vencido = filteredSaldos.filter(s => s.estado_cobro === 'vencido').reduce((s, p) => s + p.saldo, 0)
  const entregadosMes = data.filter(p => p.status === 'entregado' && new Date(p.created_at).getMonth() === now.getMonth() && new Date(p.created_at).getFullYear() === now.getFullYear()).length

  // Mini dashboard: monthly data for last 6 months
  const dashData = useMemo(() => {
    const months: { label: string; ano: number; mes: number; ventas: number; cobrado: number; pedidos: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(dashAno, dashMes - i, 1)
      const a = d.getFullYear(), m = d.getMonth()
      const mSaldos = saldos.filter(s => { const f = new Date(s.created_at); return f.getFullYear() === a && f.getMonth() === m })
      months.push({ label: `${MESES[m]} ${a}`, ano: a, mes: m, ventas: mSaldos.reduce((s, p) => s + (p.pagado || 0) + (p.saldo || 0), 0), cobrado: mSaldos.reduce((s, p) => s + (p.pagado || 0), 0), pedidos: mSaldos.length })
    }
    return months
  }, [saldos, dashMes, dashAno])
  const dashCurrent = dashData[dashData.length - 1]

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

  // Export handler
  const handleExport = () => {
    let expData = data
    if (expPeriodo === 'ano') expData = expData.filter(p => new Date(p.created_at).getFullYear() === expAno)
    if (expPeriodo === 'meses' && expMeses.length > 0) expData = expData.filter(p => { const f = new Date(p.created_at); return f.getFullYear() === expAno && expMeses.includes(f.getMonth()) })
    if (expZona === 'metro') expData = expData.filter(p => isMetro((p.profiles as any)?.estado || ''))
    else if (expZona !== 'todas') expData = expData.filter(p => (p.profiles as any)?.estado === expZona)
    if (expCobro !== 'todos') expData = expData.filter(p => saldoMap[p.id]?.estado_cobro === expCobro)

    const UNIDAD_LABEL: Record<string, string> = { caja24: 'Caja 24', caja12: 'Caja 12', barril_pet: 'Barril 20L PET', barril_acero: 'Barril 20L Acero', mix24: 'Mix 24', lata: 'Lata' }
    const rows = expData.map(p => {
      const c = p.profiles as any, s = saldoMap[p.id] || {}
      const descMonto = p.descuento_tipo === 'porcentaje' ? Math.round((p.total || 0) * (p.descuento_valor || 0) / 100) : (p.descuento_valor || 0)
      return {
        Pedido: '#' + p.id.slice(-6).toUpperCase(), Fecha: new Date(p.created_at).toLocaleDateString('es-MX'),
        Cliente: c?.full_name || '', Email: c?.email || '', Telefono: c?.phone || '',
        Zona: [c?.municipio, c?.estado].filter(Boolean).join(', ') || '',
        Subtotal: p.total || 0, Descuento: descMonto || 0, Envio: p.costo_envio || 0,
        'Total cobrable': (s.pagado || 0) + (s.saldo || 0),
        Pagado: s.pagado || 0, Saldo: s.saldo || 0,
        'Estado cobro': s.estado_cobro || '', 'Dias vencido': s.dias_vencido || 0,
        'Condiciones pago': p.condiciones_pago || '', 'Fecha vencimiento': s.fecha_vencimiento ? new Date(s.fecha_vencimiento).toLocaleDateString('es-MX') : '',
      }
    })

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    const colWidths = [12, 12, 20, 24, 14, 18, 12, 10, 10, 14, 12, 12, 12, 10, 14, 14]
    ws['!cols'] = colWidths.map(w => ({ wch: w }))
    XLSX.utils.book_append_sheet(wb, ws, 'Pedidos')

    if (expDetallado) {
      const prodRows: any[] = []
      expData.forEach(p => {
        const c = p.profiles as any
        ;(p.pedido_items || []).forEach((item: any) => {
          if (item.unidad === 'mix24' && item.metadata?.estilos) {
            ;(item.metadata.estilos as any[]).forEach((e: any) => {
              const latas = e.latas || e.cantidad_latas || 6
              prodRows.push({ Pedido: '#' + p.id.slice(-6).toUpperCase(), Cliente: c?.full_name || '', Producto: e.nombre, Estilo: '', Presentacion: 'Mix 24', Cantidad: 1, 'Latas equiv.': latas, 'Precio unit.': Math.round((item.precio_unitario || 0) / 24 * latas), Importe: Math.round((item.precio_unitario || 0) / 24 * latas * item.cantidad) })
            })
          } else {
            const latas = item.unidad === 'caja24' ? item.cantidad * 24 : item.unidad === 'caja12' ? item.cantidad * 12 : 0
            prodRows.push({ Pedido: '#' + p.id.slice(-6).toUpperCase(), Cliente: c?.full_name || '', Producto: item.productos?.nombre || '', Estilo: item.productos?.estilo || '', Presentacion: UNIDAD_LABEL[item.unidad] || item.unidad, Cantidad: item.cantidad, 'Latas equiv.': latas || '', 'Precio unit.': item.precio_unitario || 0, Importe: (item.cantidad || 0) * (item.precio_unitario || 0) })
          }
        })
      })
      const ws2 = XLSX.utils.json_to_sheet(prodRows)
      ws2['!cols'] = [12, 20, 20, 16, 14, 10, 12, 12, 12].map(w => ({ wch: w }))
      XLSX.utils.book_append_sheet(wb, ws2, 'Productos')
    }

    // Resumen sheet
    const resRows = [
      { Concepto: 'Total ventas', Valor: rows.reduce((s, r) => s + r['Total cobrable'], 0) },
      { Concepto: 'Cobrado', Valor: rows.reduce((s, r) => s + r.Pagado, 0) },
      { Concepto: 'Por cobrar', Valor: rows.reduce((s, r) => s + Math.max(0, r.Saldo), 0) },
      { Concepto: 'Pedidos', Valor: rows.length },
    ]
    const ws3 = XLSX.utils.json_to_sheet(resRows)
    ws3['!cols'] = [{ wch: 20 }, { wch: 16 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Resumen')

    const label = expPeriodo === 'ano' ? String(expAno) : expPeriodo === 'meses' ? `${expAno}-${expMeses.map(m => MESES[m]).join('-')}` : 'todo'
    XLSX.writeFile(wb, `Pedidos-Tarabana-${label}.xlsx`)
    setShowExport(false)
  }

  const expCount = useMemo(() => {
    let d = data
    if (expPeriodo === 'ano') d = d.filter(p => new Date(p.created_at).getFullYear() === expAno)
    if (expPeriodo === 'meses' && expMeses.length > 0) d = d.filter(p => { const f = new Date(p.created_at); return f.getFullYear() === expAno && expMeses.includes(f.getMonth()) })
    if (expZona === 'metro') d = d.filter(p => isMetro((p.profiles as any)?.estado || ''))
    else if (expZona !== 'todas') d = d.filter(p => (p.profiles as any)?.estado === expZona)
    if (expCobro !== 'todos') d = d.filter(p => saldoMap[p.id]?.estado_cobro === expCobro)
    return d.length
  }, [data, expPeriodo, expAno, expMeses, expZona, expCobro])

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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Pedidos</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>{data.length} pedidos totales</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setShowExport(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            Exportar
          </button>
          {canEdit && (
            <a href="/admin/pedidos/nuevo" style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#E8531D', color: '#fff', padding: '9px 20px', borderRadius: 8, textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12h14"/></svg>
              Nuevo pedido
            </a>
          )}
        </div>
      </div>

      {/* Mini dashboard */}
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => { const d = new Date(dashAno, dashMes - 1); setDashMes(d.getMonth()); setDashAno(d.getFullYear()) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>&lt;</button>
            <span style={{ color: '#1a1a1a', fontSize: 14, fontWeight: 600, minWidth: 80, textAlign: 'center' }}>{MESES[dashMes]} {dashAno}</span>
            <button onClick={() => { const d = new Date(dashAno, dashMes + 1); setDashMes(d.getMonth()); setDashAno(d.getFullYear()) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>&gt;</button>
          </div>
          <div style={{ width: 1, height: 24, background: '#e5e7eb' }} />
          <span style={{ fontSize: 13 }}><span style={{ color: '#6b7280' }}>Ventas</span> <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{fmt(dashCurrent?.ventas || 0)}</span></span>
          <span style={{ fontSize: 13 }}><span style={{ color: '#6b7280' }}>Cobrado</span> <span style={{ color: '#10b981', fontWeight: 600 }}>{fmt(dashCurrent?.cobrado || 0)}</span></span>
          <span style={{ fontSize: 13 }}><span style={{ color: '#6b7280' }}>Por cobrar</span> <span style={{ color: '#f59e0b', fontWeight: 600 }}>{fmt((dashCurrent?.ventas || 0) - (dashCurrent?.cobrado || 0))}</span></span>
          <span style={{ fontSize: 13 }}><span style={{ color: '#6b7280' }}>Pedidos</span> <span style={{ color: '#3b82f6', fontWeight: 600 }}>{dashCurrent?.pedidos || 0}</span></span>
        </div>
        {/* Sparkline: last 6 months */}
        <div style={{ display: 'flex', gap: 4, marginTop: 10, height: 32, alignItems: 'flex-end' }}>
          {dashData.map((m, i) => {
            const maxV = Math.max(...dashData.map(d => d.ventas), 1)
            const h = Math.max(4, (m.ventas / maxV) * 28)
            const isCurrent = m.ano === dashAno && m.mes === dashMes
            return (
              <button key={i} onClick={() => { setDashMes(m.mes); setDashAno(m.ano) }} title={`${m.label}: ${fmt(m.ventas)}`}
                style={{ flex: 1, height: h, background: isCurrent ? '#E8531D' : '#e5e7eb', borderRadius: 3, border: 'none', cursor: 'pointer', transition: 'height 0.2s' }} />
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          {dashData.map((m, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: '#9ca3af' }}>{m.label.split(' ')[0]}</span>)}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        {[{ label: 'Total ventas', value: fmt(totalVentas), color: '#1a1a1a' }, { label: 'Por cobrar', value: fmt(porCobrar), color: '#f59e0b' },
          { label: 'Vencido', value: fmt(vencido), color: '#ef4444' }, { label: 'Entregados este mes', value: String(entregadosMes), color: '#10b981' }].map(s => (
          <div key={s.label} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 18px' }}>
            <p style={{ ...SL, margin: '0 0 4px' }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 20, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <input placeholder="Buscar cliente..." value={filterCliente} onChange={e => setFilterCliente(e.target.value)} style={{ ...FS, width: 180 }} />
        <select value={filterCobro} onChange={e => setFilterCobro(e.target.value)} style={FS}>
          <option value="">Cobro: todos</option>
          {Object.entries(cobroConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterEntrega} onChange={e => setFilterEntrega(e.target.value)} style={FS}>
          <option value="">Entrega: todos</option>
          {Object.entries(entregaConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={filterAno} onChange={e => { setFilterAno(e.target.value); if (!e.target.value) setFilterMes('') }} style={FS}>
          <option value="">Ano: todos</option>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={filterMes} onChange={e => setFilterMes(e.target.value)} disabled={!filterAno} style={{ ...FS, opacity: filterAno ? 1 : 0.5 }}>
          <option value="">Mes: todos</option>
          {MESES.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select value={filterZona} onChange={e => setFilterZona(e.target.value)} style={FS}>
          <option value="">Zona: todas</option>
          <option value="metro">CDMX y Edomex</option>
          {zonas.map(z => <option key={z} value={z}>{z}</option>)}
          <option value="sin">Sin direccion</option>
        </select>
        {hasFilters && <button onClick={clearFilters} style={{ padding: '7px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#ef4444', fontSize: 12, cursor: 'pointer' }}>Limpiar filtros</button>}
        <span style={{ color: '#9ca3af', fontSize: 12, marginLeft: 'auto' }}>{filtered.length} pedidos</span>
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
                    {cl?.municipio ? (
                      <p style={{ margin: 0, color: '#374151', fontSize: 13 }}>{cl.municipio}, {cl.estado}</p>
                    ) : cl?.direccion_entrega ? (
                      <p style={{ margin: 0, color: '#374151', fontSize: 13, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cl.direccion_entrega}</p>
                    ) : (
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>--</span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <p style={{ margin: 0, color: '#1a1a1a', fontSize: 14, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(p.total || 0)}</p>
                    {p.descuento_valor > 0 && <p style={{ margin: '2px 0 0', color: '#10b981', fontSize: 11 }}>- {fmt(p.descuento_tipo === 'porcentaje' ? Math.round(p.total * p.descuento_valor / 100) : p.descuento_valor)} desc.</p>}
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
                          {isMix && <> <B label="MIX" color="#8b5cf6" bg="#ede9fe" /><p style={{ margin: '4px 0 0', color: '#9ca3af', fontSize: 11 }}>{(item.metadata.estilos as any[]).map((e: any) => `${e.nombre || e.estilo} x${e.latas || e.cantidad_latas || e.cantidad || '?'}`).join(', ')}</p></>}
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
                ...(dp.descuento_valor > 0 ? [{ l: `Descuento${dp.descuento_tipo === 'porcentaje' ? ` (${dp.descuento_valor}%)` : ''}${dp.descuento_motivo ? ' — ' + dp.descuento_motivo : ''}`, v: '-' + fmt(dp.descuento_tipo === 'porcentaje' ? Math.round((dp.total || 0) * dp.descuento_valor / 100) : dp.descuento_valor), color: '#10b981' }] : []),
                ...(dp.costo_envio > 0 ? [{ l: `Envio (${dp.paqueteria || ''}${dp.guia_envio ? ' — guia ' + dp.guia_envio : ''})`, v: fmt(dp.costo_envio) }] : []),
                { l: 'Total', v: fmt(dp.total || 0), b: true }, { l: 'Pagado', v: fmt(dpS?.pagado || 0) },
              ].map((r: any, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontWeight: r.b ? 700 : 400 }}>
                  <span style={{ color: r.color || '#6b7280' }}>{r.l}</span><span style={{ color: r.color || '#1a1a1a', fontFamily: 'monospace' }}>{r.v}</span>
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
                <a href={`/api/pedidos/${dp.id}/documento`} download style={btnSec}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: 4 }}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                  Word
                </a>
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

      {/* Export modal */}
      {showExport && (
        <Overlay onClose={() => setShowExport(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 520, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>Exportar a Excel</h3>

            <Label>Periodo</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[{ k: 'todo', l: 'Todo' }, { k: 'ano', l: 'Ano' }, { k: 'meses', l: 'Meses' }].map(t => (
                <button key={t.k} onClick={() => setExpPeriodo(t.k as any)} style={{ flex: 1, padding: '8px', background: expPeriodo === t.k ? '#1e1e1e' : '#f9fafb', border: `1px solid ${expPeriodo === t.k ? '#E8531D' : '#e5e7eb'}`, borderRadius: 7, color: expPeriodo === t.k ? '#fff' : '#6b7280', fontSize: 12, cursor: 'pointer' }}>{t.l}</button>
              ))}
            </div>
            {expPeriodo !== 'todo' && (
              <div style={{ marginBottom: 12 }}>
                <select value={expAno} onChange={e => setExpAno(parseInt(e.target.value))} style={FS}>{anos.map(a => <option key={a} value={a}>{a}</option>)}</select>
              </div>
            )}
            {expPeriodo === 'meses' && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {MESES.map((m, i) => (
                  <button key={i} onClick={() => setExpMeses(prev => prev.includes(i) ? prev.filter(x => x !== i) : [...prev, i])}
                    style={{ padding: '4px 10px', background: expMeses.includes(i) ? '#E8531D' : '#f9fafb', border: `1px solid ${expMeses.includes(i) ? '#E8531D' : '#e5e7eb'}`, borderRadius: 6, color: expMeses.includes(i) ? '#fff' : '#6b7280', fontSize: 11, cursor: 'pointer' }}>{m}</button>
                ))}
              </div>
            )}

            <Label>Zona</Label>
            <select value={expZona} onChange={e => setExpZona(e.target.value)} style={{ ...FS, width: '100%', marginBottom: 12 }}>
              <option value="todas">Todas las zonas</option>
              <option value="metro">CDMX y Edomex</option>
              {zonas.map(z => <option key={z} value={z}>{z}</option>)}
            </select>

            <Label>Estado de cobro</Label>
            <select value={expCobro} onChange={e => setExpCobro(e.target.value)} style={{ ...FS, width: '100%', marginBottom: 12 }}>
              <option value="todos">Todos</option>
              {Object.entries(cobroConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>

            <Label>Contenido</Label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button onClick={() => setExpDetallado(false)} style={{ flex: 1, padding: '8px', background: !expDetallado ? '#1e1e1e' : '#f9fafb', border: `1px solid ${!expDetallado ? '#E8531D' : '#e5e7eb'}`, borderRadius: 7, color: !expDetallado ? '#fff' : '#6b7280', fontSize: 12, cursor: 'pointer' }}>Resumen</button>
              <button onClick={() => setExpDetallado(true)} style={{ flex: 1, padding: '8px', background: expDetallado ? '#1e1e1e' : '#f9fafb', border: `1px solid ${expDetallado ? '#E8531D' : '#e5e7eb'}`, borderRadius: 7, color: expDetallado ? '#fff' : '#6b7280', fontSize: 12, cursor: 'pointer' }}>Detallado</button>
            </div>

            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 16 }}>Se exportaran <strong style={{ color: '#1a1a1a' }}>{expCount}</strong> pedidos</p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowExport(false)} style={{ padding: '10px 18px', background: '#f3f4f6', border: 'none', borderRadius: 8, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleExport} disabled={expCount === 0} style={{ padding: '10px 24px', background: expCount > 0 ? '#E8531D' : '#e5e7eb', border: 'none', borderRadius: 8, color: expCount > 0 ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 600, cursor: expCount > 0 ? 'pointer' : 'not-allowed' }}>Descargar</button>
            </div>
          </div>
        </Overlay>
      )}
    </div>
  )
}
