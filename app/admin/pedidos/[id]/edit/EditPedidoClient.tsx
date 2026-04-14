'use client'
import { useState } from 'react'
import { createClient } from '../../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'

const statusConfig: Record<string, string> = {
  pendiente: 'Pendiente', confirmado: 'Confirmado', enviado: 'En camino',
  entregado: 'Entregado', cancelado: 'Cancelado',
}

export default function EditPedidoClient({ pedido, vendedores, isSuperAdmin }: any) {
  const router = useRouter()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)

  const [status, setStatus] = useState(pedido.status || 'pendiente')
  const [pagado, setPagado] = useState(pedido.pagado || false)
  const [vendedorId, setVendedorId] = useState(pedido.vendedor_id || '')
  const [notas, setNotas] = useState(pedido.notas || '')
  const [notasInternas, setNotasInternas] = useState(pedido.notas_internas || '')
  const [fechaEntrega, setFechaEntrega] = useState(
    pedido.fecha_entrega ? new Date(pedido.fecha_entrega).toISOString().slice(0, 16) : ''
  )
  const [fechaPedido, setFechaPedido] = useState(
    pedido.created_at ? new Date(pedido.created_at).toISOString().slice(0, 16) : ''
  )

  const handleSave = async () => {
    setSaving(true)
    const { error } = await supabase.from('pedidos').update({
      status,
      pagado,
      vendedor_id: vendedorId || null,
      notas: notas || null,
      notas_internas: notasInternas || null,
      fecha_entrega: fechaEntrega ? new Date(fechaEntrega).toISOString() : null,
    }).eq('id', pedido.id)

    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    router.push('/admin/pedidos')
    router.refresh()
  }

  const inputStyle = { width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', fontFamily: 'system-ui' }
  const labelStyle = { color: '#555', fontSize: 11, display: 'block' as const, marginBottom: 5, textTransform: 'uppercase' as const, letterSpacing: '0.07em' }
  const Section = ({ title }: { title: string }) => (
    <p style={{ color: '#E8531D', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '24px 0 12px', paddingBottom: 6, borderBottom: '1px solid #1a1a1a' }}>{title}</p>
  )

  return (
    <div style={{ padding: '36px 40px', maxWidth: 800, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <a href="/admin/pedidos" style={{ color: '#444', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Pedidos
        </a>
        <span style={{ color: '#2a2a2a' }}>/</span>
        <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>
          Editar pedido <span style={{ color: '#E8531D', fontFamily: 'monospace' }}>#{pedido.id.slice(-6).toUpperCase()}</span>
        </h1>
      </div>

      {/* Info cliente (read-only) */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, padding: '14px 16px', marginBottom: 4 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ margin: 0, color: '#fff', fontSize: 14, fontWeight: 600 }}>{pedido.profiles?.full_name || '—'}</p>
            <p style={{ margin: '2px 0 0', color: '#555', fontSize: 12 }}>{pedido.profiles?.email}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ margin: 0, color: '#E8531D', fontSize: 20, fontWeight: 700 }}>${(pedido.total || 0).toLocaleString('es-MX')}</p>
            <p style={{ margin: '2px 0 0', color: '#555', fontSize: 11 }}>{pedido.tipo_precio === 'taproom' ? 'Precio taproom' : 'Precio público'}</p>
          </div>
        </div>
      </div>

      {/* Productos (read-only) */}
      <Section title="Productos del pedido" />
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 10, overflow: 'hidden', marginBottom: 4 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
              {['Producto', 'Estilo', 'Cantidad', 'Precio unit.', 'Subtotal'].map((h, i) => (
                <th key={i} style={{ color: '#444', fontSize: 10, textAlign: 'left', padding: '8px 14px', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pedido.pedido_items?.length > 0 ? pedido.pedido_items.map((item: any, i: number) => (
              <tr key={i} style={{ borderBottom: '1px solid #161616' }}>
                <td style={{ padding: '10px 14px', color: '#fff', fontSize: 13 }}>{item.productos?.nombre || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#888', fontSize: 12 }}>{item.productos?.estilo || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>{item.cantidad}</td>
                <td style={{ padding: '10px 14px', color: '#ccc', fontSize: 12 }}>${(item.precio_unitario || 0).toLocaleString('es-MX')}</td>
                <td style={{ padding: '10px 14px', color: '#fff', fontSize: 13, fontWeight: 600 }}>${((item.cantidad || 0) * (item.precio_unitario || 0)).toLocaleString('es-MX')}</td>
              </tr>
            )) : (
              <tr><td colSpan={5} style={{ padding: '20px 14px', color: '#444', fontSize: 13 }}>Sin productos registrados</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Status y pago */}
      <Section title="Status" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
        <div>
          <label style={labelStyle}>Status de entrega</label>
          <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
            {Object.entries(statusConfig).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Status de pago</label>
          <button onClick={() => setPagado(!pagado)} style={{ ...inputStyle, background: pagado ? '#102a10' : '#2a1010', border: `1px solid ${pagado ? '#10b98140' : '#ef444440'}`, color: pagado ? '#10b981' : '#ef4444', cursor: 'pointer', textAlign: 'left' as const }}>
            {pagado ? '✓ Pagado' : '✗ Sin pagar'} — click para cambiar
          </button>
        </div>
      </div>

      {/* Fechas */}
      <Section title="Fechas" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 4 }}>
        <div>
          <label style={labelStyle}>Fecha del pedido</label>
          <input type="datetime-local" value={fechaPedido} onChange={e => setFechaPedido(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} disabled />
          <p style={{ color: '#444', fontSize: 11, marginTop: 4 }}>Solo lectura</p>
        </div>
        <div>
          <label style={labelStyle}>Fecha de entrega prometida</label>
          <input type="datetime-local" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }} />
        </div>
      </div>

      {/* Vendedor */}
      <Section title="Vendedor" />
      <div style={{ marginBottom: 4 }}>
        <label style={labelStyle}>Vendedor asignado</label>
        <select value={vendedorId} onChange={e => setVendedorId(e.target.value)} style={inputStyle}>
          <option value="">— Sin vendedor —</option>
          {vendedores.map((v: any) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      </div>

      {/* Notas */}
      <Section title="Notas" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 24 }}>
        <div>
          <label style={labelStyle}>Notas del cliente</label>
          <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3} placeholder="Instrucciones de entrega..."
            style={{ ...inputStyle, resize: 'none' as const }} />
        </div>
        <div>
          <label style={labelStyle}>Notas internas</label>
          <textarea value={notasInternas} onChange={e => setNotasInternas(e.target.value)} rows={3} placeholder="Solo visible para el equipo..."
            style={{ ...inputStyle, resize: 'none' as const }} />
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 10 }}>
        <a href="/admin/pedidos" style={{ padding: '11px 20px', background: '#1a1a1a', color: '#555', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>Cancelar</a>
        <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '11px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
