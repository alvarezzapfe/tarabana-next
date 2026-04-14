'use client'
import { useState, useMemo } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

export default function ReportesClient({ pedidos }: { pedidos: any[] }) {
  const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  
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

  const ventasPorPeriodo = useMemo(() => {
    const map: Record<string, { ventas: number, cobrado: number, pedidos: number }> = {}
    pedidosFiltrados.forEach(p => {
      const fecha = new Date(p.created_at)
      let key = ''
      if (vista === 'mes') key = `${fecha.getDate()} ${meses[fecha.getMonth()].slice(0,3)}`
      else if (vista === 'año') key = meses[fecha.getMonth()].slice(0,3)
      else key = fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
      if (!map[key]) map[key] = { ventas: 0, cobrado: 0, pedidos: 0 }
      map[key].ventas += p.total || 0
      if (p.pagado) map[key].cobrado += p.total || 0
      map[key].pedidos += 1
    })
    return Object.entries(map).map(([periodo, data]) => ({ periodo, ...data }))
  }, [pedidosFiltrados, vista])

  const topClientes = useMemo(() => {
    const map: Record<string, any> = {}
    pedidosFiltrados.forEach(p => {
      const id = p.profiles?.email || 'desconocido'
      if (!map[id]) map[id] = { nombre: p.profiles?.full_name || '—', email: id, total: 0, pedidos: 0, pagado: 0 }
      map[id].total += p.total || 0
      map[id].pedidos += 1
      if (p.pagado) map[id].pagado += p.total || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10)
  }, [pedidosFiltrados])

  const topProductos = useMemo(() => {
    const map: Record<string, any> = {}
    pedidosFiltrados.forEach(p => {
      p.pedido_items?.forEach((item: any) => {
        const nombre = item.productos?.nombre || '—'
        if (!map[nombre]) map[nombre] = { nombre, estilo: item.productos?.estilo || '—', cantidad: 0, revenue: 0 }
        map[nombre].cantidad += item.cantidad
        map[nombre].revenue += item.cantidad * (item.precio_unitario || 0)
      })
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [pedidosFiltrados])

  const resumen = useMemo(() => ({
    totalVentas: pedidosFiltrados.reduce((s, p) => s + (p.total || 0), 0),
    totalCobrado: pedidosFiltrados.filter(p => p.pagado).reduce((s, p) => s + (p.total || 0), 0),
    porCobrar: pedidosFiltrados.filter(p => !p.pagado && p.status !== 'cancelado').reduce((s, p) => s + (p.total || 0), 0),
    totalPedidos: pedidosFiltrados.length,
    ticketPromedio: pedidosFiltrados.length > 0 ? pedidosFiltrados.reduce((s, p) => s + (p.total || 0), 0) / pedidosFiltrados.length : 0,
    clientesUnicos: new Set(pedidosFiltrados.map(p => p.profiles?.email)).size,
  }), [pedidosFiltrados])

  const handleExport = () => {
    const rows = [
      ['#', 'Cliente', 'Email', 'Total', 'Pagado', 'Status', 'Fecha'],
      ...pedidosFiltrados.map(p => [
        p.id.slice(-6).toUpperCase(),
        p.profiles?.full_name || '—',
        p.profiles?.email || '—',
        p.total || 0,
        p.pagado ? 'Sí' : 'No',
        p.status,
        new Date(p.created_at).toLocaleDateString('es-MX')
      ])
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte_tarabana_${vista === 'mes' ? `${meses[mesSel]}_${añoSel}` : vista === 'año' ? añoSel : `${rangoDesde}_${rangoHasta}`}.csv`
    a.click()
  }

  const cardStyle = { background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '20px 24px' }
  const titleStyle = { color: '#555', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }
  const selStyle = { padding: '8px 14px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#ddd', fontSize: 13, outline: 'none', cursor: 'pointer' }
  const btnVista = (v: 'mes' | 'año' | 'rango', label: string) => (
    <button onClick={() => setVista(v)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${vista === v ? '#E8531D' : '#1e1e1e'}`, background: vista === v ? '#E8531D' : '#111', color: vista === v ? '#fff' : '#555', fontSize: 12, cursor: 'pointer', fontWeight: vista === v ? 600 : 400 }}>{label}</button>
  )

  const periodoLabel = vista === 'mes' ? `${meses[mesSel]} ${añoSel}` : vista === 'año' ? `Año ${añoSel}` : `${rangoDesde} → ${rangoHasta}`

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Reportes de ventas</h1>
          <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 500 }}>{periodoLabel}</p>
        </div>
        <button onClick={handleExport} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #1e1e1e', background: '#1a1a1a', color: '#888', fontSize: 12, cursor: 'pointer' }}>↓ Exportar CSV</button>
      </div>

      {/* Selector de periodo */}
      <div style={{ ...cardStyle, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {btnVista('mes', 'Por mes')}
          {btnVista('año', 'Por año')}
          {btnVista('rango', 'Rango')}
        </div>
        <div style={{ width: 1, height: 32, background: '#1e1e1e' }} />
        {vista === 'mes' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select value={añoSel} onChange={e => setAñoSel(+e.target.value)} style={selStyle}>
              {(años.length > 0 ? años : [hoy.getFullYear()]).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={mesSel} onChange={e => setMesSel(+e.target.value)} style={selStyle}>
              {meses.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
        )}
        {vista === 'año' && (
          <select value={añoSel} onChange={e => setAñoSel(+e.target.value)} style={selStyle}>
            {(años.length > 0 ? años : [hoy.getFullYear()]).map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
        {vista === 'rango' && (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <input type="date" value={rangoDesde} onChange={e => setRangoDesde(e.target.value)} style={{ ...selStyle, fontFamily: 'system-ui' }} />
            <span style={{ color: '#555' }}>→</span>
            <input type="date" value={rangoHasta} onChange={e => setRangoHasta(e.target.value)} style={{ ...selStyle, fontFamily: 'system-ui' }} />
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 20 }}>
          <span style={{ color: '#555', fontSize: 12 }}>{pedidosFiltrados.length} pedidos en periodo</span>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total ventas', value: `$${resumen.totalVentas.toLocaleString('es-MX')}`, color: '#E8531D' },
          { label: 'Cobrado', value: `$${resumen.totalCobrado.toLocaleString('es-MX')}`, color: '#10b981' },
          { label: 'Por cobrar', value: `$${resumen.porCobrar.toLocaleString('es-MX')}`, color: '#f59e0b' },
          { label: 'Pedidos', value: resumen.totalPedidos, color: '#3b82f6' },
          { label: 'Ticket promedio', value: `$${Math.round(resumen.ticketPromedio).toLocaleString('es-MX')}`, color: '#8b5cf6' },
          { label: 'Clientes únicos', value: resumen.clientesUnicos, color: '#ec4899' },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <p style={titleStyle}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 20, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Gráfica ventas */}
      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={titleStyle}>Ventas vs Cobrado</p>
        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={ventasPorPeriodo}>
            <XAxis dataKey="periodo" stroke="#333" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis stroke="#333" tick={{ fill: '#555', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: any) => `$${v.toLocaleString('es-MX')}`} contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }} />
            <Legend wrapperStyle={{ color: '#555', fontSize: 11 }} />
            <Area type="monotone" dataKey="ventas" stroke="#E8531D" fill="#E8531D22" name="Ventas" strokeWidth={2} />
            <Area type="monotone" dataKey="cobrado" stroke="#10b981" fill="#10b98122" name="Cobrado" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top clientes */}
        <div style={cardStyle}>
          <p style={titleStyle}>Concentración de clientes</p>
          {topClientes.length === 0 ? <p style={{ color: '#333', fontSize: 13 }}>Sin pedidos en este periodo</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>{['Cliente','Pedidos','Total','Cobrado'].map((h,i) => <th key={i} style={{ color: '#333', fontSize: 10, textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{topClientes.map((c, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #0f0f0f' }}>
                  <td style={{ padding: '8px', color: '#ddd', fontSize: 12 }}><div>{c.nombre}</div><div style={{ color: '#444', fontSize: 10 }}>{c.email}</div></td>
                  <td style={{ padding: '8px', color: '#555', fontSize: 12 }}>{c.pedidos}</td>
                  <td style={{ padding: '8px', color: '#E8531D', fontSize: 12, fontWeight: 600 }}>${c.total.toLocaleString('es-MX')}</td>
                  <td style={{ padding: '8px', color: '#10b981', fontSize: 12 }}>${c.pagado.toLocaleString('es-MX')}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>

        {/* Top productos */}
        <div style={cardStyle}>
          <p style={titleStyle}>Productos más vendidos</p>
          {topProductos.length === 0 ? <p style={{ color: '#333', fontSize: 13 }}>Sin pedidos en este periodo</p> : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>{['Producto','Unidades','Revenue'].map((h,i) => <th key={i} style={{ color: '#333', fontSize: 10, textAlign: 'left', padding: '6px 8px', textTransform: 'uppercase' }}>{h}</th>)}</tr></thead>
              <tbody>{topProductos.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #0f0f0f' }}>
                  <td style={{ padding: '8px', color: '#ddd', fontSize: 12 }}><div>{p.nombre}</div><div style={{ color: '#444', fontSize: 10 }}>{p.estilo}</div></td>
                  <td style={{ padding: '8px', color: '#555', fontSize: 12 }}>{p.cantidad}</td>
                  <td style={{ padding: '8px', color: '#f59e0b', fontSize: 12, fontWeight: 600 }}>${p.revenue.toLocaleString('es-MX')}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </div>

      {/* Pedidos del periodo */}
      <div style={cardStyle}>
        <p style={titleStyle}>Detalle de pedidos — {periodoLabel}</p>
        {pedidosFiltrados.length === 0 ? <p style={{ color: '#333', fontSize: 13 }}>Sin pedidos en este periodo</p> : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #1a1a1a' }}>{['#','Fecha','Cliente','Total','Status','Pago'].map((h,i) => <th key={i} style={{ color: '#333', fontSize: 10, textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>)}</tr></thead>
            <tbody>
              {pedidosFiltrados.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                  <td style={{ padding: '10px 12px', color: '#444', fontSize: 11, fontFamily: 'monospace' }}>#{p.id.slice(-6).toUpperCase()}</td>
                  <td style={{ padding: '10px 12px', color: '#555', fontSize: 11 }}>{new Date(p.created_at).toLocaleDateString('es-MX')}</td>
                  <td style={{ padding: '10px 12px', color: '#ddd', fontSize: 12 }}>{p.profiles?.full_name || p.profiles?.email || '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>${(p.total || 0).toLocaleString('es-MX')}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: p.status === 'entregado' ? '#10b98118' : p.status === 'pendiente' ? '#f59e0b18' : '#3b82f618', color: p.status === 'entregado' ? '#10b981' : p.status === 'pendiente' ? '#f59e0b' : '#3b82f6' }}>{p.status}</span>
                  </td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: p.pagado ? '#10b98118' : '#ef444418', color: p.pagado ? '#10b981' : '#ef4444' }}>{p.pagado ? 'Pagado' : 'Pendiente'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
