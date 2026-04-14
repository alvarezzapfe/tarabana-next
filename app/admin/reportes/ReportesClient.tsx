'use client'
import { useState, useMemo } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

type Periodo = 'semanal' | 'mensual' | 'anual'

export default function ReportesClient({ pedidos }: { pedidos: any[] }) {
  const [periodo, setPeriodo] = useState<Periodo>('mensual')

  const getKey = (fecha: Date) => {
    if (periodo === 'semanal') {
      const d = new Date(fecha)
      d.setDate(d.getDate() - d.getDay())
      return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
    }
    if (periodo === 'mensual') return fecha.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
    return fecha.getFullYear().toString()
  }

  const ventasPorPeriodo = useMemo(() => {
    const map: Record<string, { ventas: number, cobrado: number, pedidos: number }> = {}
    pedidos.forEach(p => {
      const key = getKey(new Date(p.created_at))
      if (!map[key]) map[key] = { ventas: 0, cobrado: 0, pedidos: 0 }
      map[key].ventas += p.total || 0
      if (p.pagado) map[key].cobrado += p.total || 0
      map[key].pedidos += 1
    })
    return Object.entries(map).map(([periodo, data]) => ({ periodo, ...data }))
  }, [pedidos, periodo])

  const topClientes = useMemo(() => {
    const map: Record<string, { nombre: string, email: string, total: number, pedidos: number, pagado: number }> = {}
    pedidos.forEach(p => {
      const id = p.profiles?.email || 'desconocido'
      if (!map[id]) map[id] = { nombre: p.profiles?.full_name || '—', email: id, total: 0, pedidos: 0, pagado: 0 }
      map[id].total += p.total || 0
      map[id].pedidos += 1
      if (p.pagado) map[id].pagado += p.total || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 10)
  }, [pedidos])

  const topProductos = useMemo(() => {
    const map: Record<string, { nombre: string, estilo: string, cantidad: number, revenue: number }> = {}
    pedidos.forEach(p => {
      p.pedido_items?.forEach((item: any) => {
        const nombre = item.productos?.nombre || '—'
        if (!map[nombre]) map[nombre] = { nombre, estilo: item.productos?.estilo || '—', cantidad: 0, revenue: 0 }
        map[nombre].cantidad += item.cantidad
        map[nombre].revenue += item.cantidad * (item.precio_unitario || 0)
      })
    })
    return Object.values(map).sort((a, b) => b.revenue - a.revenue)
  }, [pedidos])

  const resumen = useMemo(() => ({
    totalVentas: pedidos.reduce((s, p) => s + (p.total || 0), 0),
    totalCobrado: pedidos.filter(p => p.pagado).reduce((s, p) => s + (p.total || 0), 0),
    porCobrar: pedidos.filter(p => !p.pagado && p.status !== 'cancelado').reduce((s, p) => s + (p.total || 0), 0),
    totalPedidos: pedidos.length,
    ticketPromedio: pedidos.length > 0 ? pedidos.reduce((s, p) => s + (p.total || 0), 0) / pedidos.length : 0,
    clientesUnicos: new Set(pedidos.map(p => p.profiles?.email)).size,
  }), [pedidos])

  const handleExport = () => {
    const rows = [['Periodo', 'Ventas', 'Cobrado', 'Pedidos'], ...ventasPorPeriodo.map(r => [r.periodo, r.ventas, r.cobrado, r.pedidos])]
    const csv = rows.map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `reporte_tarabana_${periodo}.csv`; a.click()
  }

  const cardStyle = { background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '20px 24px' }
  const titleStyle = { color: '#555', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 12 }

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Reportes de ventas</h1>
          <p style={{ color: '#555', fontSize: 13 }}>Análisis completo de la operación</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['semanal', 'mensual', 'anual'] as Periodo[]).map(p => (
            <button key={p} onClick={() => setPeriodo(p)} style={{ padding: '8px 18px', borderRadius: 8, border: `1px solid ${periodo === p ? '#E8531D' : '#1e1e1e'}`, background: periodo === p ? '#E8531D' : '#111', color: periodo === p ? '#fff' : '#555', fontSize: 12, cursor: 'pointer', textTransform: 'capitalize', fontWeight: periodo === p ? 600 : 400 }}>{p}</button>
          ))}
          <button onClick={handleExport} style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #1e1e1e', background: '#1a1a1a', color: '#888', fontSize: 12, cursor: 'pointer' }}>↓ CSV</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 24 }}>
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

      <div style={{ ...cardStyle, marginBottom: 16 }}>
        <p style={titleStyle}>Ventas vs Cobrado por {periodo}</p>
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
        <div style={cardStyle}>
          <p style={titleStyle}>Concentración de clientes</p>
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
        </div>
        <div style={cardStyle}>
          <p style={titleStyle}>Productos más vendidos</p>
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
        </div>
      </div>

      <div style={cardStyle}>
        <p style={titleStyle}>Pedidos por {periodo}</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={ventasPorPeriodo}>
            <XAxis dataKey="periodo" stroke="#333" tick={{ fill: '#555', fontSize: 11 }} />
            <YAxis stroke="#333" tick={{ fill: '#555', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }} />
            <Bar dataKey="pedidos" fill="#3b82f6" radius={[4,4,0,0]} name="Pedidos" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
