'use client'
import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const STATUS_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  pendiente:  { color: '#d97706', bg: '#fef3c7', label: 'Pendiente' },
  confirmado: { color: '#2563eb', bg: '#dbeafe', label: 'Confirmado' },
  enviado:    { color: '#7c3aed', bg: '#ede9fe', label: 'En camino' },
  entregado:  { color: '#059669', bg: '#d1fae5', label: 'Entregado' },
  cancelado:  { color: '#dc2626', bg: '#fee2e2', label: 'Cancelado' },
}

export default function DashboardClient({ pedidos, totalUsuarios, totalProductos, productos }: any) {

  // Current month and previous month for trend calculation
  const now = new Date()
  const thisMonth = now.getMonth()
  const thisYear = now.getFullYear()
  const isThisMonth = (d: string) => { const dt = new Date(d); return dt.getMonth() === thisMonth && dt.getFullYear() === thisYear }
  const isPrevMonth = (d: string) => {
    const dt = new Date(d)
    const prevMonth = thisMonth === 0 ? 11 : thisMonth - 1
    const prevYear = thisMonth === 0 ? thisYear - 1 : thisYear
    return dt.getMonth() === prevMonth && dt.getFullYear() === prevYear
  }

  const pedidosThisMonth = pedidos.filter((p: any) => isThisMonth(p.created_at))
  const pedidosPrevMonth = pedidos.filter((p: any) => isPrevMonth(p.created_at))

  const cobradoThis = pedidosThisMonth.filter((p: any) => p.pagado).reduce((s: number, p: any) => s + (p.total || 0), 0)
  const cobradoPrev = pedidosPrevMonth.filter((p: any) => p.pagado).reduce((s: number, p: any) => s + (p.total || 0), 0)

  const ventasThis = pedidosThisMonth.reduce((s: number, p: any) => s + (p.total || 0), 0)
  const ventasPrev = pedidosPrevMonth.reduce((s: number, p: any) => s + (p.total || 0), 0)

  const pedidosActivosThis = pedidosThisMonth.filter((p: any) => !['entregado', 'cancelado'].includes(p.status)).length
  const pedidosActivosPrev = pedidosPrevMonth.filter((p: any) => !['entregado', 'cancelado'].includes(p.status)).length

  // Stats
  const totalCobrado = pedidos.filter((p: any) => p.pagado).reduce((s: number, p: any) => s + (p.total || 0), 0)
  const porCobrar = pedidos.filter((p: any) => !p.pagado && p.status !== 'cancelado').reduce((s: number, p: any) => s + (p.total || 0), 0)
  const totalVentas = pedidos.reduce((s: number, p: any) => s + (p.total || 0), 0)
  const pedidosActivos = pedidos.filter((p: any) => !['entregado', 'cancelado'].includes(p.status)).length
  const stockTotal = productos.reduce((s: number, p: any) => s + (p.stock_caja12 || 0) * 12 + (p.stock_caja24 || 0) * 24 + (p.stock_barril_pet || 0) * 20 + (p.stock_barril_acero || 0) * 20, 0)

  const calcTrend = (current: number, prev: number) => {
    if (prev === 0 && current === 0) return null
    if (prev === 0) return { pct: 100, dir: 'up' as const }
    const pct = Math.round(((current - prev) / prev) * 100)
    return { pct: Math.abs(pct), dir: pct >= 0 ? 'up' as const : 'down' as const }
  }

  const statCards = [
    { label: 'Clientes', value: totalUsuarios, bg: '#EFF6FF', border: '#BFDBFE', color: '#1e40af', trend: null, currency: false, suffix: '' },
    { label: 'Cobrado (total)', value: totalCobrado, bg: '#D1FAE5', border: '#6EE7B7', color: '#065f46', trend: calcTrend(cobradoThis, cobradoPrev), currency: true, suffix: '' },
    { label: 'Por cobrar', value: porCobrar, bg: '#FEF3C7', border: '#FCD34D', color: '#92400e', trend: null, currency: true, suffix: '' },
    { label: 'Pedidos activos', value: pedidosActivos, bg: '#EDE9FE', border: '#C4B5FD', color: '#5b21b6', trend: calcTrend(pedidosActivosThis, pedidosActivosPrev), currency: false, suffix: '' },
    { label: 'Ventas totales', value: totalVentas, bg: '#FCE7F3', border: '#F9A8D4', color: '#9d174d', trend: calcTrend(ventasThis, ventasPrev), currency: true, suffix: '' },
    { label: 'Litros en stock', value: stockTotal, bg: '#F0FDF4', border: '#86EFAC', color: '#166534', trend: null, currency: false, suffix: ' L' },
  ]

  // Ventas por mes (last 6)
  const ventasPorMes = useMemo(() => {
    const meses: Record<string, number> = {}
    pedidos.forEach((p: any) => {
      const fecha = new Date(p.created_at)
      const key = fecha.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' })
      meses[key] = (meses[key] || 0) + (p.total || 0)
    })
    return Object.entries(meses).slice(-6).map(([mes, total]) => ({ mes, total }))
  }, [pedidos])

  // Status breakdown
  const statusData = useMemo(() => {
    const map: Record<string, number> = {}
    pedidos.forEach((p: any) => { map[p.status] = (map[p.status] || 0) + 1 })
    return Object.entries(STATUS_COLORS).map(([key, cfg]) => ({
      name: cfg.label, value: map[key] || 0, color: cfg.color,
    })).filter(d => d.value > 0)
  }, [pedidos])

  // Top clientes
  const topClientes = useMemo(() => {
    const map: Record<string, { nombre: string; total: number }> = {}
    pedidos.forEach((p: any) => {
      const nombre = p.profiles?.full_name || p.profiles?.email || 'Desconocido'
      if (!map[nombre]) map[nombre] = { nombre, total: 0 }
      map[nombre].total += p.total || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5)
  }, [pedidos])

  // Top productos
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

  const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '24px 28px' }
  const sectionTitle = { color: '#1a1a1a', fontSize: 15, fontWeight: 600 as const, marginBottom: 16 }

  const TrendBadge = ({ trend }: { trend: { pct: number; dir: 'up' | 'down' } | null }) => {
    if (!trend) return <span style={{ fontSize: 13, color: '#9ca3af' }}>—</span>
    const isUp = trend.dir === 'up'
    return (
      <span style={{
        fontSize: 13, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 2,
        color: isUp ? '#059669' : '#dc2626',
        background: isUp ? '#d1fae5' : '#fee2e2',
        padding: '2px 8px', borderRadius: 99,
      }}>
        {isUp ? '↑' : '↓'} {trend.pct}%
      </span>
    )
  }

  const EmptyState = ({ message }: { message: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 180, color: '#9ca3af', fontSize: 14 }}>
      {message}
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#1a1a1a', fontSize: 26, fontWeight: 700, marginBottom: 4 }}>Dashboard</h1>
        <p style={{ color: '#888', fontSize: 15 }}>Vista general de la operación Tarabaña</p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 14, marginBottom: 28 }}>
        {statCards.map(s => (
          <div key={s.label} style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 12, padding: '20px 22px' }}>
            <p style={{ color: s.color, fontSize: 13, fontWeight: 500, marginBottom: 8, opacity: 0.8 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 30, fontWeight: 700, margin: '0 0 6px', lineHeight: 1 }}>
              {s.currency ? `$${s.value.toLocaleString('es-MX')}` : `${s.value.toLocaleString()}${s.suffix}`}
            </p>
            <TrendBadge trend={s.trend} />
          </div>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Ventas por mes */}
        <div style={cardStyle}>
          <p style={sectionTitle}>Ventas por mes</p>
          {ventasPorMes.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={ventasPorMes}>
                <XAxis dataKey="mes" stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 13 }} />
                <YAxis stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 13 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: any) => [`$${v.toLocaleString('es-MX')}`, 'Ventas']}
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a1a1a' }}
                />
                <Bar dataKey="total" fill="#E8531D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Aún no hay ventas este periodo" />
          )}
        </div>

        {/* Pedidos por status */}
        <div style={cardStyle}>
          <p style={sectionTitle}>Pedidos por status</p>
          {statusData.length > 0 ? (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
                {Object.entries(STATUS_COLORS).map(([key, cfg]) => {
                  const count = pedidos.filter((p: any) => p.status === key).length
                  const total = pedidos.length || 1
                  const pct = Math.round((count / total) * 100)
                  if (count === 0) return null
                  return (
                    <div key={key}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 14, color: '#374151' }}>{cfg.label}</span>
                        <span style={{ fontSize: 14, fontWeight: 600, color: cfg.color }}>{count}</span>
                      </div>
                      <div style={{ height: 8, background: '#f3f4f6', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: cfg.color, borderRadius: 4 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <EmptyState message="Sin pedidos registrados" />
          )}
        </div>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Top clientes */}
        <div style={cardStyle}>
          <p style={sectionTitle}>Top clientes por venta</p>
          {topClientes.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topClientes} layout="vertical">
                <XAxis type="number" stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 13 }} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="nombre" stroke="#e5e7eb" tick={{ fill: '#374151', fontSize: 13 }} width={110} />
                <Tooltip
                  formatter={(v: any) => [`$${v.toLocaleString('es-MX')}`, 'Total']}
                  contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a1a1a' }}
                />
                <Bar dataKey="total" fill="#f59e0b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin datos de clientes" />
          )}
        </div>

        {/* Top productos */}
        <div style={cardStyle}>
          <p style={sectionTitle}>Productos más vendidos</p>
          {topProductos.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProductos} layout="vertical">
                <XAxis type="number" stroke="#e5e7eb" tick={{ fill: '#6b7280', fontSize: 13 }} />
                <YAxis type="category" dataKey="nombre" stroke="#e5e7eb" tick={{ fill: '#374151', fontSize: 13 }} width={110} />
                <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a1a1a' }} />
                <Bar dataKey="cantidad" fill="#3B6D11" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState message="Sin ventas de productos" />
          )}
        </div>
      </div>

      {/* Últimos pedidos */}
      <div style={cardStyle}>
        <p style={{ ...sectionTitle, marginBottom: 20 }}>Últimos pedidos</p>
        {pedidos.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f3f4f6' }}>
                {['#', 'Cliente', 'Total', 'Status', 'Pago'].map((h, i) => (
                  <th key={i} style={{ color: '#6b7280', fontSize: 13, textAlign: 'left', padding: '8px 14px', fontWeight: 500 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pedidos.slice(0, 8).map((p: any) => {
                const st = STATUS_COLORS[p.status] || STATUS_COLORS.pendiente
                return (
                  <tr key={p.id} style={{ borderBottom: '1px solid #f9fafb' }}>
                    <td style={{ padding: '12px 14px', color: '#9ca3af', fontSize: 13, fontFamily: 'monospace' }}>#{p.id.slice(-6).toUpperCase()}</td>
                    <td style={{ padding: '12px 14px', color: '#1a1a1a', fontSize: 14 }}>{p.profiles?.full_name || p.profiles?.email || '—'}</td>
                    <td style={{ padding: '12px 14px', color: '#E8531D', fontSize: 15, fontWeight: 700 }}>${(p.total || 0).toLocaleString('es-MX')}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 99, background: st.bg, color: st.color, fontWeight: 500 }}>
                        {st.label}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 99, background: p.pagado ? '#d1fae5' : '#fee2e2', color: p.pagado ? '#059669' : '#dc2626', fontWeight: 500 }}>
                        {p.pagado ? 'Pagado' : 'Pendiente'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        ) : (
          <EmptyState message="Sin pedidos registrados" />
        )}
      </div>
    </div>
  )
}
