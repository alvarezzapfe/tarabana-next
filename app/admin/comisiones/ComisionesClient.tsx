'use client'
import { useState, useMemo } from 'react'
import { createClient } from '../../../src/lib/supabase'

export default function ComisionesClient({ comisiones: init, vendedores, canEdit }: any) {
  const [comisiones, setComisiones] = useState(init)
  const [filtroVendedor, setFiltroVendedor] = useState('todos')
  const [filtroPagada, setFiltroPagada] = useState('todas')
  const [procesandoId, setProcesandoId] = useState<string | null>(null)
  const supabase = createClient()

  const filtradas = useMemo(() => comisiones.filter((c: any) => {
    if (filtroVendedor !== 'todos' && c.vendedor_id !== filtroVendedor) return false
    if (filtroPagada === 'pagadas' && !c.pagada) return false
    if (filtroPagada === 'pendientes' && c.pagada) return false
    return true
  }), [comisiones, filtroVendedor, filtroPagada])

  const resumenPorVendedor = useMemo(() => {
    const map: Record<string, any> = {}
    comisiones.forEach((c: any) => {
      const id = c.vendedor_id
      if (!map[id]) map[id] = { nombre: c.vendedores?.nombre || '—', total: 0, pagado: 0, pendiente: 0, count: 0 }
      map[id].total += c.monto_comision || 0
      if (c.pagada) map[id].pagado += c.monto_comision || 0
      else map[id].pendiente += c.monto_comision || 0
      map[id].count += 1
    })
    return Object.values(map).sort((a: any, b: any) => b.total - a.total)
  }, [comisiones])

  const totalPendiente = comisiones.filter((c: any) => !c.pagada).reduce((s: number, c: any) => s + (c.monto_comision || 0), 0)
  const totalPagado = comisiones.filter((c: any) => c.pagada).reduce((s: number, c: any) => s + (c.monto_comision || 0), 0)

  const marcarPagada = async (id: string, pagada: boolean) => {
    setProcesandoId(id)
    await supabase.from('comisiones').update({ pagada: !pagada, fecha_pago: !pagada ? new Date().toISOString() : null }).eq('id', id)
    setComisiones((prev: any) => prev.map((c: any) => c.id === id ? { ...c, pagada: !pagada, fecha_pago: !pagada ? new Date().toISOString() : null } : c))
    setProcesandoId(null)
  }

  const selStyle = { padding: '8px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 8, color: '#1a1a1a', fontSize: 13, outline: 'none', cursor: 'pointer' }
  const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px' }

  return (
    <div style={{ padding: '36px 40px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#1a1a1a', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Comisiones</h1>
      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 24 }}>Control de comisiones por vendedor</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total comisiones', value: `$${(totalPagado + totalPendiente).toLocaleString('es-MX')}`, color: '#E8531D' },
          { label: 'Pagado', value: `$${totalPagado.toLocaleString('es-MX')}`, color: '#10b981' },
          { label: 'Por pagar', value: `$${totalPendiente.toLocaleString('es-MX')}`, color: '#f59e0b' },
          { label: 'Registros', value: comisiones.length, color: '#3b82f6' },
        ].map(s => (
          <div key={s.label} style={cardStyle}>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 22, fontWeight: 700, margin: 0 }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Resumen por vendedor */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Resumen por vendedor</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
          {resumenPorVendedor.map((v: any, i: number) => (
            <div key={i} style={{ padding: '12px 14px', background: '#f9fafb', borderRadius: 8, border: '1px solid #e5e7eb' }}>
              <div style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{v.nombre}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#6b7280', fontSize: 11 }}>Total</span>
                <span style={{ color: '#E8531D', fontSize: 13, fontWeight: 600 }}>${v.total.toLocaleString('es-MX')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#6b7280', fontSize: 11 }}>Pagado</span>
                <span style={{ color: '#10b981', fontSize: 11 }}>${v.pagado.toLocaleString('es-MX')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#6b7280', fontSize: 11 }}>Pendiente</span>
                <span style={{ color: '#f59e0b', fontSize: 11 }}>${v.pendiente.toLocaleString('es-MX')}</span>
              </div>
            </div>
          ))}
          {resumenPorVendedor.length === 0 && <p style={{ color: '#9ca3af', fontSize: 13 }}>Sin comisiones registradas</p>}
        </div>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={selStyle}>
          <option value="todos">Todos los vendedores</option>
          {vendedores.map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
        <select value={filtroPagada} onChange={e => setFiltroPagada(e.target.value)} style={selStyle}>
          <option value="todas">Todas</option>
          <option value="pendientes">Por pagar</option>
          <option value="pagadas">Pagadas</option>
        </select>
        <span style={{ color: '#6b7280', fontSize: 13, marginLeft: 'auto' }}>{filtradas.length} registros</span>
      </div>

      {/* Tabla */}
      <div style={cardStyle}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              {['Pedido', 'Cliente', 'Vendedor', 'Monto pedido', '%', 'Comisión', 'Status', canEdit ? 'Acción' : ''].map((h, i) => (
                <th key={i} style={{ color: '#9ca3af', fontSize: 13, textAlign: 'left', padding: '8px 12px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.length === 0 ? (
              <tr><td colSpan={8} style={{ color: '#9ca3af', textAlign: 'center', padding: '40px', fontSize: 14 }}>Sin comisiones</td></tr>
            ) : filtradas.map((c: any) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 13, fontFamily: 'monospace' }}>#{c.pedidos?.id?.slice(-6).toUpperCase() || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#1a1a1a', fontSize: 12 }}>{c.pedidos?.profiles?.full_name || c.pedidos?.profiles?.email || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 12 }}>{c.vendedores?.nombre || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#1a1a1a', fontSize: 12 }}>${(c.monto_pedido || 0).toLocaleString('es-MX')}</td>
                <td style={{ padding: '10px 12px', color: '#E8531D', fontSize: 13, fontWeight: 600 }}>{c.porcentaje}%</td>
                <td style={{ padding: '10px 12px', color: '#f59e0b', fontSize: 13, fontWeight: 700 }}>${(c.monto_comision || 0).toLocaleString('es-MX')}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ fontSize: 13, padding: '3px 10px', borderRadius: 99, background: c.pagada ? '#d1fae5' : '#fef3c7', color: c.pagada ? '#10b981' : '#f59e0b' }}>
                    {c.pagada ? `Pagada ${c.fecha_pago ? new Date(c.fecha_pago).toLocaleDateString('es-MX') : ''}` : 'Pendiente'}
                  </span>
                </td>
                {canEdit && (
                  <td style={{ padding: '10px 12px' }}>
                    <button onClick={() => marcarPagada(c.id, c.pagada)} disabled={procesandoId === c.id}
                      style={{ padding: '5px 12px', background: c.pagada ? '#2a1010' : '#102a10', border: `1px solid ${c.pagada ? '#ef444440' : '#10b98140'}`, borderRadius: 6, color: c.pagada ? '#ef4444' : '#10b981', fontSize: 13, cursor: 'pointer', opacity: procesandoId === c.id ? 0.5 : 1 }}>
                      {procesandoId === c.id ? '...' : c.pagada ? 'Desmarcar' : 'Marcar pagada'}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
