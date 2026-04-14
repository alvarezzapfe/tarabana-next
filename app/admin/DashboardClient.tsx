'use client'
import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts'

const COLORS = ['#E8531D', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899']

export default function DashboardClient({ pedidos, totalUsuarios, totalProductos, productos, clientes }: any) {

  // Stats generales
  const totalCobrado = pedidos.filter((p: any) => p.pagado).reduce((s: number, p: any) => s + (p.total || 0), 0)
  const porCobrar = pedidos.filter((p: any) => !p.pagado && p.status !== 'cancelado').reduce((s: number, p: any) => s + (p.total || 0), 0)
  const totalVentas = pedidos.reduce((s: number, p: any) => s + (p.total || 0), 0)
  const pedidosPendientes = pedidos.filter((p: any) => !['entregado', 'cancelado'].includes(p.status)).length

  // Ventas por mes (últimos 6 meses)
  const ventasPorMes = useMemo(() => {
    const meses: Record<string, number> = {}
    pedidos.forEach((p: any) => {
      const fecha = new Date(p.created_at)
      const key = fecha.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      meses[key] = (meses[key] || 0) + (p.total || 0)
    })
    return Object.entries(meses).slice(-6).map(([mes, total]) => ({ mes, total }))
  }, [pedidos])

  // Top clientes
  const topClientes = useMemo(() => {
    const map: Record<string, { nombre: string, total: number, pedidos: number }> = {}
    pedidos.forEach((p: any) => {
      const nombre = p.profiles?.full_name || p.profiles?.email || 'Desconocido'
      if (!map[nombre]) map[nombre] = { nombre, total: 0, pedidos: 0 }
      map[nombre].total += p.total || 0
      map[nombre].pedidos += 1
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [pedidos])

  // Productos más vendidos
  const topProductos = useMemo(() => {
    const map: Record<string, number> = {}
    pedidos.forEach((p: any) => {
      p.pedido_items?.forEach((item: any) => {
        const nombre = item.productos?.nombre || 'Desconocido'
        map[nombre] = (map[nombre] || 0) + item.cantidad
      })
    })
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([nombre, cantidad]) => ({ nombre, cantidad }))
  }, [pedidos])

  // Status breakdown
  const statusData = useMemo(() => {
    const map: Record<string, number> = {}
    pedidos.forEach((p: any) => { map[p.status] = (map[p.status] || 0) + 1 })
    const labels: Record<string, string> = { pendiente: 'Pendiente', confirmado: 'Confirmado', enviado: 'En camino', entregado: 'Entregado', cancelado: 'Cancelado' }
    return Object.entries(map).map(([status, value]) => ({ name: labels[status] || status, value }))
  }, [pedidos])

  // Stock total
  const stockTotal = productos.reduce((s: number, p: any) => s + (p.stock_caja12 || 0) * 12 + (p.stock_caja24 || 0) * 24 + (p.stock_barril_pet || 0) * 20 + (p.stock_barril_acero || 0) * 20, 0)

  const statCards = [
    { label: 'Clientes', value: totalUsuarios, color: '#E8531D', suffix: '' },
    { label: 'Cobrado', value: totalCobrado, color: '#10b981', suffix: '', currency: true },
    { label: 'Por cobrar', value: porCobrar, color: '#f59e0b', suffix: '', currency: true },
    { label: 'Pedidos activos', value: pedidosPendientes, color: '#3b82f6', suffix: '' },
    { label: 'Total ventas', value: totalVentas, color: '#8b5cf6', suffix: '', currency: true },
    { label: 'Litros en stock', value: stockTotal, color: '#ec4899', suffix: 'L' },
  ]

  const cardStyle = { background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: '20px 24px' }
  const titleStyle = { color: '#555', fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.08em', marginBottom: 8 }

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: '#555', fontSize: 13 }}>Vista general de la operación Tarabaña</p>
      </div>

      {/* Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 12, marginBottom: 28 }}>
        {statCards.map(s => (
          <div key={s.label} style={cardStyle}>
            <p style={titleStyle}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>
              {s.currency ? `$${s.value.toLocaleString('es-MX')}` : `${s.value.toLocaleString()}${s.suffix}`}
            </p>
          </div>
        ))}
      </div>

      {/* Gráficas row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Ventas por mes */}
        <div style={cardStyle}>
          <p style={titleStyle}>Ventas por mes (MXN)</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ventasPorMes}>
              <XAxis dataKey="mes" stroke="#333" tick={{ fill: '#555', fontSize: 11 }} />
              <YAxis stroke="#333" tick={{ fill: '#555', fontSize: 11 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => [`$${v.toLocaleString('es-MX')}`, 'Ventas']} contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }} />
              <Bar dataKey="total" fill="#E8531D" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Status breakdown */}
        <div style={cardStyle}>
          <p style={titleStyle}>Pedidos por status</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" label={({ name, value }) => `${value}`}>
                {statusData.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }} />
              <Legend wrapperStyle={{ color: '#555', fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Gráficas row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top clientes */}
        <div style={cardStyle}>
          <p style={titleStyle}>Top clientes por venta</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topClientes} layout="vertical">
              <XAxis type="number" stroke="#333" tick={{ fill: '#555', fontSize: 10 }} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <YAxis type="category" dataKey="nombre" stroke="#333" tick={{ fill: '#888', fontSize: 10 }} width={100} />
              <Tooltip formatter={(v: any) => [`$${v.toLocaleString('es-MX')}`, 'Total']} contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }} />
              <Bar dataKey="total" fill="#f59e0b" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top productos */}
        <div style={cardStyle}>
          <p style={titleStyle}>Productos más vendidos (unidades)</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topProductos} layout="vertical">
              <XAxis type="number" stroke="#333" tick={{ fill: '#555', fontSize: 10 }} />
              <YAxis type="category" dataKey="nombre" stroke="#333" tick={{ fill: '#888', fontSize: 10 }} width={100} />
              <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #2a2a2a', color: '#fff' }} />
              <Bar dataKey="cantidad" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Últimos pedidos */}
      <div style={cardStyle}>
        <p style={{ ...titleStyle, marginBottom: 16 }}>Últimos pedidos</p>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              {['#', 'Cliente', 'Total', 'Status', 'Pago'].map((h, i) => (
                <th key={i} style={{ color: '#333', fontSize: 10, textAlign: 'left', padding: '6px 12px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pedidos.slice(0, 8).map((p: any) => (
              <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                <td style={{ padding: '10px 12px', color: '#444', fontSize: 11, fontFamily: 'monospace' }}>#{p.id.slice(-6).toUpperCase()}</td>
                <td style={{ padding: '10px 12px', color: '#ddd', fontSize: 12 }}>{p.profiles?.full_name || p.profiles?.email || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>${(p.total || 0).toLocaleString('es-MX')}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: p.status === 'entregado' ? '#10b98118' : p.status === 'pendiente' ? '#f59e0b18' : '#3b82f618', color: p.status === 'entregado' ? '#10b981' : p.status === 'pendiente' ? '#f59e0b' : '#3b82f6' }}>
                    {p.status}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 99, background: p.pagado ? '#10b98118' : '#ef444418', color: p.pagado ? '#10b981' : '#ef4444' }}>
                    {p.pagado ? 'Pagado' : 'Pendiente'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
