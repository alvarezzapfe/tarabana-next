'use client'
import { useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface Props { pedidos: any[]; saldos: any[]; clientes: any[] }

export default function ReportesClient({ pedidos, saldos, clientes }: Props) {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  const saldoMap = useMemo(() => {
    const m: Record<string, any> = {}
    saldos.forEach(s => { m[s.id] = s })
    return m
  }, [saldos])

  const años = useMemo(() => {
    const set = new Set(pedidos.map(p => new Date(p.created_at).getFullYear()))
    return Array.from(set).sort((a, b) => b - a)
  }, [pedidos])

  const hoy = new Date()
  const [vista, setVista] = useState<'mes' | 'año' | 'rango'>('mes')
  const [añoSel, setAñoSel] = useState(hoy.getFullYear())
  const [mesSel, setMesSel] = useState(hoy.getMonth())
  const [rangoDesde, setRangoDesde] = useState(`${hoy.getFullYear()}-01-01`)
  const [rangoHasta, setRangoHasta] = useState(`${hoy.getFullYear()}-12-31`)

  const pedidosFiltrados = useMemo(() => {
    return pedidos.filter(p => {
      const fecha = new Date(p.created_at)
      if (vista === 'mes') return fecha.getFullYear() === añoSel && fecha.getMonth() === mesSel
      if (vista === 'año') return fecha.getFullYear() === añoSel
      if (vista === 'rango') return fecha >= new Date(rangoDesde) && fecha <= new Date(rangoHasta + 'T23:59:59')
      return true
    })
  }, [pedidos, vista, añoSel, mesSel, rangoDesde, rangoHasta])

  const resumen = useMemo(() => {
    let totalVentas = 0, cobrado = 0, porCobrar = 0, vencido = 0
    const clienteSet = new Set<string>()
    pedidosFiltrados.forEach(p => {
      const s = saldoMap[p.id]
      if (!s) return
      const cobrable = (s.pagado || 0) + (s.saldo || 0)
      totalVentas += cobrable
      cobrado += s.pagado || 0
      if ((s.saldo || 0) > 0) porCobrar += s.saldo
      if (s.estado_cobro === 'vencido') vencido += s.saldo || 0
      clienteSet.add(p.cliente_id)
    })
    const n = pedidosFiltrados.length
    return { totalVentas, cobrado, porCobrar, vencido, pedidos: n, ticket: n > 0 ? totalVentas / n : 0, clientesUnicos: clienteSet.size }
  }, [pedidosFiltrados, saldoMap])

  const ventasPorPeriodo = useMemo(() => {
    const map: Record<string, { ventas: number; cobrado: number }> = {}
    pedidosFiltrados.forEach(p => {
      const fecha = new Date(p.created_at)
      let key = ''
      if (vista === 'mes') key = `${fecha.getDate()} ${meses[fecha.getMonth()].slice(0, 3)}`
      else if (vista === 'año') key = meses[fecha.getMonth()].slice(0, 3)
      else key = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
      if (!map[key]) map[key] = { ventas: 0, cobrado: 0 }
      const s = saldoMap[p.id]
      if (!s) return
      map[key].ventas += (s.pagado || 0) + (s.saldo || 0)
      map[key].cobrado += s.pagado || 0
    })
    return Object.entries(map).map(([periodo, d]) => ({ periodo, ...d }))
  }, [pedidosFiltrados, saldoMap, vista])

  const topClientes = useMemo(() => {
    const map: Record<string, any> = {}
    pedidosFiltrados.forEach(p => {
      const cid = p.cliente_id
      if (!map[cid]) {
        const prof = p.profiles || {}
        map[cid] = { nombre: prof.full_name || '-', email: prof.email || '-', pedidos: 0, cobrable: 0, cobrado: 0, saldo: 0 }
      }
      const s = saldoMap[p.id]
      if (!s) return
      map[cid].pedidos += 1
      map[cid].cobrable += (s.pagado || 0) + (s.saldo || 0)
      map[cid].cobrado += s.pagado || 0
      if ((s.saldo || 0) > 0) map[cid].saldo += s.saldo
    })
    return Object.values(map).sort((a: any, b: any) => b.cobrable - a.cobrable).slice(0, 10)
  }, [pedidosFiltrados, saldoMap])

  const { latasTable, barrilesTable } = useMemo(() => {
    const latasMap: Record<string, { nombre: string; latas: number; importe: number }> = {}
    const barrilMap: Record<string, { nombre: string; tipo: string; unidades: number; importe: number }> = {}
    pedidosFiltrados.forEach(p => {
      p.pedido_items?.forEach((item: any) => {
        const nombre = item.productos?.nombre || '-'
        const uni = (item.unidad || '').toLowerCase()
        if (uni.startsWith('barril')) {
          const k = `${nombre}__${uni}`
          if (!barrilMap[k]) barrilMap[k] = { nombre, tipo: uni, unidades: 0, importe: 0 }
          barrilMap[k].unidades += item.cantidad
          barrilMap[k].importe += item.cantidad * (item.precio_unitario || 0)
        } else if (uni === 'caja24' || uni === 'caja_24') {
          if (!latasMap[nombre]) latasMap[nombre] = { nombre, latas: 0, importe: 0 }
          latasMap[nombre].latas += item.cantidad * 24
          latasMap[nombre].importe += item.cantidad * (item.precio_unitario || 0)
        } else if (uni === 'caja12' || uni === 'caja_12') {
          if (!latasMap[nombre]) latasMap[nombre] = { nombre, latas: 0, importe: 0 }
          latasMap[nombre].latas += item.cantidad * 12
          latasMap[nombre].importe += item.cantidad * (item.precio_unitario || 0)
        } else if (uni === 'mix24' || uni === 'mix_24') {
          const estilos: any[] = item.metadata?.estilos || []
          if (estilos.length > 0) {
            estilos.forEach((e: any) => {
              const eName = e.nombre || nombre
              if (!latasMap[eName]) latasMap[eName] = { nombre: eName, latas: 0, importe: 0 }
              const latas = e.latas || e.cantidad_latas || 6
              latasMap[eName].latas += item.cantidad * latas
              const totalLatas = estilos.reduce((s: number, x: any) => s + (x.latas || x.cantidad_latas || 6), 0)
              latasMap[eName].importe += totalLatas > 0 ? item.cantidad * (item.precio_unitario || 0) * latas / totalLatas : 0
            })
          }
        }
      })
    })
    return {
      latasTable: Object.values(latasMap).sort((a, b) => b.latas - a.latas),
      barrilesTable: Object.values(barrilMap).sort((a, b) => b.importe - a.importe),
    }
  }, [pedidosFiltrados])

  const clientesInactivos = useMemo(() => {
    const now = Date.now()
    const clienteMap: Record<string, { nombre: string; email: string; lastOrder: number; cobrable: number }> = {}
    pedidos.forEach(p => {
      const cid = p.cliente_id
      if (!cid) return
      const prof = p.profiles || {}
      if (!clienteMap[cid]) clienteMap[cid] = { nombre: prof.full_name || '-', email: prof.email || '-', lastOrder: 0, cobrable: 0 }
      const t = new Date(p.created_at).getTime()
      if (t > clienteMap[cid].lastOrder) clienteMap[cid].lastOrder = t
      const s = saldoMap[p.id]
      if (s) clienteMap[cid].cobrable += (s.pagado || 0) + (s.saldo || 0)
    })
    return Object.values(clienteMap)
      .map(c => ({ ...c, dias: Math.floor((now - c.lastOrder) / 86400000) }))
      .filter(c => c.dias > 45)
      .sort((a, b) => b.cobrable - a.cobrable)
  }, [pedidos, saldoMap])

  const handleExport = () => {
    const header = ['Pedido','Fecha','Cliente','Subtotal','Descuento','Envio','Total cobrable','Pagado','Saldo','Estado cobro','Dias vencido']
    const rows = pedidosFiltrados.map(p => {
      const s = saldoMap[p.id] || {}
      const cobrable = (s.pagado || 0) + (s.saldo || 0)
      let descMonto = 0
      if (p.descuento_tipo === 'porcentaje') descMonto = Math.round((s.total || 0) * (p.descuento_valor || 0) / 100)
      else descMonto = p.descuento_valor || 0
      return [
        p.id.slice(-6).toUpperCase(),
        new Date(p.created_at).toLocaleDateString('es-MX'),
        (p.profiles?.full_name || p.profiles?.email || '-').replace(/,/g, ' '),
        s.total || 0, descMonto, s.costo_envio || 0, cobrable, s.pagado || 0, s.saldo || 0,
        s.estado_cobro || '-', s.dias_vencido || 0
      ]
    })
    const csv = [header, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `reporte_tarabana_${vista === 'mes' ? `${meses[mesSel]}_${añoSel}` : vista === 'año' ? añoSel : `${rangoDesde}_${rangoHasta}`}.csv`
    a.click()
  }

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' } as const
  const title = { color: '#6b7280', fontSize: 13, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }
  const sel = { padding: '8px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 13, outline: 'none', cursor: 'pointer' }
  const th = { color: '#9ca3af', fontSize: 12, textAlign: 'left' as const, padding: '6px 8px', textTransform: 'uppercase' as const }
  const td = { padding: '8px', fontSize: 12, borderBottom: '1px solid #f3f4f6' } as const
  const fmt = (v: number) => `$${v.toLocaleString('es-MX')}`

  const btnVista = (v: 'mes' | 'año' | 'rango', label: string) => (
    <button key={v} onClick={() => setVista(v)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${vista === v ? '#E8531D' : '#d1d5db'}`, background: vista === v ? '#E8531D' : '#fff', color: vista === v ? '#fff' : '#6b7280', fontSize: 13, cursor: 'pointer', fontWeight: vista === v ? 600 : 400 }}>{label}</button>
  )

  const periodoLabel = vista === 'mes' ? `${meses[mesSel]} ${añoSel}` : vista === 'año' ? `Ano ${añoSel}` : `${rangoDesde} - ${rangoHasta}`

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Reportes de ventas</h1>
          <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 500 }}>{periodoLabel}</p>
        </div>
        <button onClick={handleExport} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#f3f4f6', color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>Exportar CSV</button>
      </div>

      {/* Selector de periodo */}
      <div style={{ ...card, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>{btnVista('mes', 'Por mes')}{btnVista('año', 'Por año')}{btnVista('rango', 'Rango')}</div>
        <div style={{ width: 1, height: 32, background: '#e5e7eb' }} />
        {vista === 'mes' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={añoSel} onChange={e => setAñoSel(+e.target.value)} style={sel}>
              {(años.length > 0 ? años : [hoy.getFullYear()]).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={mesSel} onChange={e => setMesSel(+e.target.value)} style={sel}>
              {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
        )}
        {vista === 'año' && (
          <select value={añoSel} onChange={e => setAñoSel(+e.target.value)} style={sel}>
            {(años.length > 0 ? años : [hoy.getFullYear()]).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {vista === 'rango' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} style={{ ...sel, fontFamily: 'system-ui' }} />
            <span style={{ color: '#6b7280' }}>-</span>
            <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} style={{ ...sel, fontFamily: 'system-ui' }} />
          </div>
        )}
        <span style={{ marginLeft: 'auto', color: '#6b7280', fontSize: 12 }}>{pedidosFiltrados.length} pedidos en periodo</span>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total ventas', value: fmt(resumen.totalVentas), color: '#E8531D' },
          { label: 'Cobrado', value: fmt(resumen.cobrado), color: '#10b981' },
          { label: 'Por cobrar', value: fmt(resumen.porCobrar), color: '#f59e0b' },
          { label: 'Vencido', value: fmt(resumen.vencido), color: '#ef4444' },
          { label: 'Pedidos', value: resumen.pedidos, color: '#3b82f6' },
          { label: 'Ticket promedio', value: fmt(Math.round(resumen.ticket)), color: '#8b5cf6' },
          { label: 'Clientes unicos', value: resumen.clientesUnicos, color: '#ec4899' },
        ].map(s => (
          <div key={s.label} style={card}>
            <p style={title}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 20, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ ...card, marginBottom: 16 }}>
        <p style={title}>Ventas vs Cobrado</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={ventasPorPeriodo}>
            <XAxis dataKey="periodo" stroke="#d1d5db" tick={{ fill: '#6b7280', fontSize: 11 }} />
            <YAxis stroke="#d1d5db" tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => fmt(v)} contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="ventas" stroke="#E8531D" fill="#E8531D22" name="Ventas" strokeWidth={2} />
            <Area type="monotone" dataKey="cobrado" stroke="#10b981" fill="#10b98122" name="Cobrado" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Top clientes */}
      <div style={{ ...card, marginBottom: 16 }}>
        <p style={title}>Top clientes</p>
        {topClientes.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin pedidos en este periodo</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['Cliente','Pedidos','Cobrable','Cobrado','Saldo'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>{topClientes.map((c: any, i: number) => (
              <tr key={i}>
                <td style={td}><div style={{ color: '#1a1a1a' }}>{c.nombre}</div><div style={{ color: '#9ca3af', fontSize: 10 }}>{c.email}</div></td>
                <td style={{ ...td, color: '#6b7280' }}>{c.pedidos}</td>
                <td style={{ ...td, color: '#E8531D', fontWeight: 600 }}>{fmt(c.cobrable)}</td>
                <td style={{ ...td, color: '#10b981' }}>{fmt(c.cobrado)}</td>
                <td style={{ ...td, color: '#f59e0b' }}>{fmt(c.saldo)}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </div>

      {/* Latas vendidas por estilo */}
      <div style={{ display: 'grid', gridTemplateColumns: barrilesTable.length > 0 ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
        <div style={card}>
          <p style={title}>Latas vendidas por estilo</p>
          {latasTable.length === 0 ? <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin datos</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Estilo','Latas','Importe'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>{latasTable.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, color: '#1a1a1a' }}>{r.nombre}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{r.latas.toLocaleString('es-MX')}</td>
                  <td style={{ ...td, color: '#f59e0b', fontWeight: 600 }}>{fmt(Math.round(r.importe))}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {barrilesTable.length > 0 && (
          <div style={card}>
            <p style={title}>Barriles vendidos</p>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                {['Estilo','Tipo','Unidades','Importe'].map(h => <th key={h} style={th}>{h}</th>)}
              </tr></thead>
              <tbody>{barrilesTable.map((r, i) => (
                <tr key={i}>
                  <td style={{ ...td, color: '#1a1a1a' }}>{r.nombre}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{r.tipo}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{r.unidades}</td>
                  <td style={{ ...td, color: '#f59e0b', fontWeight: 600 }}>{fmt(Math.round(r.importe))}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </div>

      {/* Clientes inactivos */}
      {clientesInactivos.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <p style={title}>Clientes inactivos (45+ dias sin comprar)</p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['Cliente','Ultimo pedido','Dias sin comprar','Total historico'].map(h => <th key={h} style={th}>{h}</th>)}
            </tr></thead>
            <tbody>{clientesInactivos.map((c, i) => (
              <tr key={i}>
                <td style={td}><div style={{ color: '#1a1a1a' }}>{c.nombre}</div><div style={{ color: '#9ca3af', fontSize: 10 }}>{c.email}</div></td>
                <td style={{ ...td, color: '#6b7280' }}>{new Date(c.lastOrder).toLocaleDateString('es-MX')}</td>
                <td style={{ ...td, color: '#ef4444', fontWeight: 600 }}>{c.dias}</td>
                <td style={{ ...td, color: '#E8531D', fontWeight: 600 }}>{fmt(Math.round(c.cobrable))}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}
