'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import MixBuilder, { type MixResult, type MixProduct } from '../../../../src/components/MixBuilder'

type Producto = { id: string; nombre: string; estilo: string; precio_lata_publico: number; precio_lata_taproom: number; precio_barril_pet_publico: number; precio_barril_pet_taproom: number; precio_barril_acero_taproom: number; stock_caja12: number; stock_caja24: number; stock_barril_pet: number; stock_barril_acero: number; stock_latas: number; imagen_url: string }
type Cliente = { id: string; full_name: string; email: string; tipo_consumidor: string; nivel_precio: string }
type Item = { producto_id: string; nombre: string; unidad: string; cantidad: number; precio: number }

const unidades = [
  { key: 'caja12', label: 'Caja 12 latas' },
  { key: 'caja24', label: 'Caja 24 latas' },
  { key: 'barril_pet', label: 'Barril 20L PET' },
  { key: 'barril_acero', label: 'Barril 20L Acero' },
]

export default function NuevoPedidoPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [clienteId, setClienteId] = useState(searchParams.get('cliente') || '')
  const [tipoPrecio, setTipoPrecio] = useState<'publico' | 'taproom'>('publico')
  const [condicionesPago, setCondicionesPago] = useState('contado')
  const [items, setItems] = useState<Item[]>([])
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [showMixModal, setShowMixModal] = useState(false)
  const [descuentoTipo, setDescuentoTipo] = useState<'' | 'porcentaje' | 'monto'>('')
  const [descuentoValor, setDescuentoValor] = useState('')
  const [descuentoMotivo, setDescuentoMotivo] = useState('')
  const [clienteSearch, setClienteSearch] = useState('')
  const [vendedores, setVendedores] = useState<any[]>([])
  const [vendedorId, setVendedorId] = useState('')

  useEffect(() => {
    const load = async () => {
      const [{ data: cl }, { data: pr }, { data: vend }, configRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, tipo_consumidor, nivel_precio').eq('role', 'comprador').order('full_name'),
        supabase.from('productos').select('*').eq('activo', true).order('nombre'),
        supabase.from('vendedores').select('id, nombre, comision_pct').eq('activo', true).order('nombre'),
        fetch('/api/admin/config').then(r => r.ok ? r.json() : {}),
      ])
      setClientes(cl || [])
      setProductos(pr || [])
      setVendedores(vend || [])
      // Set default condiciones_pago from config
      const diasDefault = (configRes as any)?.negocio?.dias_credito_default
      if (diasDefault === 15) setCondicionesPago('15_dias')
      else if (diasDefault === 30) setCondicionesPago('30_dias')
      else setCondicionesPago('contado')
    }
    load()
  }, [])

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)
  const esMayorista = clienteSeleccionado?.nivel_precio === 'taproom' || clienteSeleccionado?.nivel_precio === 'distribuidor'

  const getPrecio = (p: Producto, unidad: string): number => {
    const suf = tipoPrecio === 'taproom' ? 'taproom' : 'publico'
    const precioLata = (p as any)[`precio_lata_${suf}`] as number || 0
    if (unidad === 'caja12') return Math.round(precioLata * 12)
    if (unidad === 'caja24') return Math.round(precioLata * 24)
    if (unidad === 'barril_pet') return (p as any)[`precio_barril_pet_${suf}`] as number || 0
    if (unidad === 'barril_acero') return p.precio_barril_acero_taproom || 0
    return 0
  }

  const getStock = (p: Producto, unidad: string): number => {
    if (unidad === 'caja12') return p.stock_caja12
    if (unidad === 'caja24') return p.stock_caja24
    if (unidad === 'barril_pet') return p.stock_barril_pet
    if (unidad === 'barril_acero') return p.stock_barril_acero
    return 0
  }

  const addItem = (producto: Producto, unidad: string) => {
    const precio = getPrecio(producto, unidad)
    if (!precio) return
    const key = `${producto.id}-${unidad}`
    const existing = items.find(i => i.producto_id === key)
    if (existing) {
      setItems(items.map(i => i.producto_id === key ? { ...i, cantidad: i.cantidad + 1 } : i))
    } else {
      const uLabel = unidades.find(u => u.key === unidad)?.label || unidad
      setItems([...items, { producto_id: key, nombre: `${producto.nombre} — ${uLabel}`, unidad, cantidad: 1, precio }])
    }
  }

  const updateCantidad = (key: string, delta: number) => {
    setItems(items.map(i => i.producto_id === key ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i).filter(i => i.cantidad > 0))
  }

  // Mix builder products — use client's precio level
  const suf = tipoPrecio === 'taproom' ? 'taproom' : 'publico'
  const mixProducts: MixProduct[] = productos
    .filter(p => (p.stock_latas || 0) > 0 && ((p as any)[`precio_lata_${suf}`] || 0) > 0)
    .map(p => ({
      id: p.id, nombre: p.nombre, imagen_url: p.imagen_url,
      stock_latas: p.stock_latas || 0,
      precio_por_lata: Math.round((p as any)[`precio_lata_${suf}`] || 0),
    }))

  const handleMixAdd = (result: MixResult) => {
    const names = result.estilos.map(e => `${e.nombre} x${e.latas}`).sort().join(', ')
    const firstId = result.estilos[0].producto_id
    setItems(prev => [...prev, {
      producto_id: `${firstId}-mix24`,
      nombre: `Mix: ${names}`,
      unidad: 'mix24',
      cantidad: 1,
      precio: result.precio,
      metadata: { tipo: 'mix24', estilos: result.estilos },
    } as any])
    setShowMixModal(false)
  }

  const subtotal = items.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const descVal = parseFloat(descuentoValor) || 0
  const descuentoMonto = descuentoTipo === 'porcentaje' ? Math.round(subtotal * descVal / 100) : descuentoTipo === 'monto' ? descVal : 0
  const total = subtotal // total = subtotal (discount applied in pedidos_saldo view, NOT subtracted here)

  const handleConfirmar = async () => {
    if (!clienteId || items.length === 0) return
    if (descuentoTipo && !descuentoMotivo.trim()) { alert('El motivo del descuento es obligatorio'); return }
    setLoading(true)
    const res = await fetch('/api/admin/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cliente_id: clienteId, condiciones_pago: condicionesPago, items, notas,
        vendedor_id: vendedorId || null,
        descuento_tipo: descuentoTipo || null,
        descuento_valor: descuentoTipo ? descVal : null,
        descuento_motivo: descuentoTipo ? descuentoMotivo : null,
      })
    })
    if (res.ok) { router.push('/admin/pedidos'); router.refresh() }
    else { alert('Error al crear pedido'); setLoading(false) }
  }

  const filteredClientes = clientes.filter(c =>
    (c.full_name || '').toLowerCase().includes(clienteSearch.toLowerCase()) ||
    c.email.toLowerCase().includes(clienteSearch.toLowerCase())
  )

  return (
    <div style={{ padding: '36px 40px', display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24, maxWidth: 1100 }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <a href="/admin/pedidos" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Pedidos
          </a>
          <span style={{ color: '#2a2a2a' }}>/</span>
          <h1 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>Nuevo pedido</h1>
        </div>

        {/* Selección cliente */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Cliente *</p>
          <input value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} placeholder="Buscar cliente..."
            style={{ width: '100%', padding: '9px 13px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, color: '#1a1a1a', fontSize: 13.5, boxSizing: 'border-box' as const, outline: 'none', marginBottom: 10 }} />
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredClientes.map(c => (
              <button key={c.id} onClick={() => { setClienteId(c.id); setClienteSearch('') }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: clienteId === c.id ? '#1e1e1e' : 'transparent',
                border: `1px solid ${clienteId === c.id ? '#E8531D' : 'transparent'}`,
                borderRadius: 7, cursor: 'pointer', textAlign: 'left', width: '100%'
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8531D', fontSize: 13, fontWeight: 700 }}>
                  {(c.full_name || c.email)[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13 }}>{c.full_name || c.email}</p>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: 11 }}>{c.email}</p>
                </div>
              </button>
            ))}
          </div>
          {clienteSeleccionado && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#f3f4f6', borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#10b981', fontSize: 14 }}>✓ {clienteSeleccionado.full_name}</p>
              {esMayorista && <span style={{ background: '#dbeafe', color: '#3b82f6', fontSize: 13, padding: '2px 8px', borderRadius: 99 }}>Mayorista</span>}
            </div>
          )}
        </div>

        {/* Tipo precio */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Tipo de precio</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['publico', 'taproom'] as const).map(t => (
              <button key={t} onClick={() => setTipoPrecio(t)} style={{
                flex: 1, padding: '9px', background: tipoPrecio === t ? '#1e1e1e' : '#0a0a0a',
                border: `1.5px solid ${tipoPrecio === t ? '#E8531D' : '#1e1e1e'}`,
                borderRadius: 8, cursor: 'pointer', color: tipoPrecio === t ? '#fff' : '#555', fontSize: 13, fontWeight: tipoPrecio === t ? 600 : 400
              }}>
                {t === 'publico' ? 'Precio público' : 'Precio taproom'}
              </button>
            ))}
          </div>
        </div>

        {/* Condiciones de pago */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Condiciones de pago</p>
          <div style={{ display: 'flex', gap: 8 }}>
            {[{ key: 'contado', label: 'Contado' }, { key: '15_dias', label: '15 dias' }, { key: '30_dias', label: '30 dias' }].map(c => (
              <button key={c.key} onClick={() => setCondicionesPago(c.key)} style={{
                flex: 1, padding: '9px', background: condicionesPago === c.key ? '#1e1e1e' : '#0a0a0a',
                border: `1.5px solid ${condicionesPago === c.key ? '#E8531D' : '#1e1e1e'}`,
                borderRadius: 8, cursor: 'pointer', color: condicionesPago === c.key ? '#fff' : '#555', fontSize: 13, fontWeight: condicionesPago === c.key ? 600 : 400
              }}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Productos */}
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', margin: 0 }}>Productos</p>
            {mixProducts.length > 0 && (
              <button onClick={() => setShowMixModal(true)} style={{ padding: '6px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, color: '#6b7280', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                Armar caja mixta
              </button>
            )}
          </div>
          {productos.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: 20 }}>No hay productos en inventario</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {productos.map(p => (
                <div key={p.id} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {p.imagen_url
                      ? <img src={p.imagen_url} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 11h1a3 3 0 010 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5"/><path d="M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4l.6-12z"/></svg>
                  </div>
                    }
                    <div>
                      <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13.5, fontWeight: 600 }}>{p.nombre}</p>
                      <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>{p.estilo}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {unidades.map(u => {
                      const precio = getPrecio(p, u.key)
                      const stock = getStock(p, u.key)
                      const itemKey = `${p.id}-${u.key}`
                      const itemInCart = items.find(i => i.producto_id === itemKey)
                      if (!precio || stock === 0) return (
                        <div key={u.key} style={{ padding: '7px 8px', background: '#fff', borderRadius: 7, textAlign: 'center', opacity: 0.4 }}>
                          <p style={{ margin: 0, color: '#9ca3af', fontSize: 13 }}>{u.label}</p>
                          <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 10 }}>{!precio ? 'Sin precio' : 'Sin stock'}</p>
                        </div>
                      )
                      return (
                        <div key={u.key} style={{ padding: '7px 8px', background: '#fff', border: `1px solid ${itemInCart ? '#E8531D40' : '#1a1a1a'}`, borderRadius: 7, textAlign: 'center' }}>
                          <p style={{ margin: 0, color: '#6b7280', fontSize: 10 }}>{u.label}</p>
                          <p style={{ margin: '2px 0 4px', color: '#E8531D', fontSize: 13, fontWeight: 600 }}>${precio?.toLocaleString()}</p>
                          <p style={{ margin: '0 0 6px', color: '#9ca3af', fontSize: 10 }}>Stock: {stock}</p>
                          {itemInCart ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <button onClick={() => updateCantidad(itemKey, -1)} style={{ width: 22, height: 22, borderRadius: '50%', background: '#e5e7eb', border: 'none', color: '#1a1a1a', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                              <span style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{itemInCart.cantidad}</span>
                              <button onClick={() => updateCantidad(itemKey, 1)} style={{ width: 22, height: 22, borderRadius: '50%', background: '#E8531D', border: 'none', color: '#1a1a1a', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                          ) : (
                            <button onClick={() => addItem(p, u.key)} style={{ width: '100%', padding: '4px', background: '#f3f4f6', border: 'none', borderRadius: 5, color: '#6b7280', fontSize: 13, cursor: 'pointer' }}>+ Agregar</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Panel derecho — resumen */}
      <div style={{ position: 'sticky', top: 24 }}>
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Resumen del pedido</p>

          {items.length === 0 ? (
            <p style={{ color: '#9ca3af', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Agrega productos al pedido</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {items.map(item => (
                <div key={item.producto_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, color: '#374151', fontSize: 14 }}>{item.nombre}</p>
                    <p style={{ margin: '1px 0 0', color: '#6b7280', fontSize: 13 }}>{item.cantidad} × ${item.precio.toLocaleString()}</p>
                  </div>
                  <p style={{ margin: 0, color: '#E8531D', fontSize: 13, fontWeight: 600 }}>${(item.precio * item.cantidad).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Subtotal</p>
              <p style={{ margin: 0, color: '#1a1a1a', fontSize: 15, fontWeight: 600 }}>${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            {descuentoMonto > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <p style={{ margin: 0, color: '#10b981', fontSize: 13 }}>Descuento {descuentoTipo === 'porcentaje' ? `(${descVal}%)` : ''}</p>
                <p style={{ margin: 0, color: '#10b981', fontSize: 15, fontWeight: 600 }}>-${descuentoMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, paddingTop: 6, borderTop: '1px solid #e5e7eb' }}>
              <p style={{ margin: 0, color: '#1a1a1a', fontSize: 13, fontWeight: 600 }}>Total</p>
              <p style={{ margin: 0, color: '#E8531D', fontSize: 20, fontWeight: 700 }}>${(subtotal - descuentoMonto).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Descuento */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Descuento</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: descuentoTipo ? 12 : 0 }}>
              {[{ key: '', label: 'Sin descuento' }, { key: 'porcentaje', label: 'Porcentaje' }, { key: 'monto', label: 'Monto fijo' }].map(t => (
                <button key={t.key} onClick={() => { setDescuentoTipo(t.key as any); setDescuentoValor(''); setDescuentoMotivo('') }} style={{
                  flex: 1, padding: '8px', background: descuentoTipo === t.key ? '#1e1e1e' : '#f9fafb',
                  border: `1.5px solid ${descuentoTipo === t.key ? '#E8531D' : '#e5e7eb'}`,
                  borderRadius: 7, cursor: 'pointer', color: descuentoTipo === t.key ? '#fff' : '#6b7280', fontSize: 12, fontWeight: 500,
                }}>{t.label}</button>
              ))}
            </div>
            {descuentoTipo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {descuentoTipo === 'porcentaje' ? 'Porcentaje (0-100)' : 'Monto fijo'}
                  </label>
                  <input type="number" value={descuentoValor} onChange={e => setDescuentoValor(e.target.value)} placeholder="0"
                    min="0" max={descuentoTipo === 'porcentaje' ? '100' : String(subtotal)}
                    style={{ width: '100%', padding: '9px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, color: '#1a1a1a', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' as const, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ color: '#6b7280', fontSize: 11, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Motivo (obligatorio)</label>
                  <input value={descuentoMotivo} onChange={e => setDescuentoMotivo(e.target.value)} placeholder="Volumen, cliente nuevo, ajuste..."
                    style={{ width: '100%', padding: '9px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, color: '#1a1a1a', fontSize: 13, boxSizing: 'border-box' as const, outline: 'none' }} />
                </div>
              </div>
            )}
          </div>

          {/* Vendedor */}
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Vendedor asignado</p>
            <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, color: vendedorId ? '#fff' : '#555', fontSize: 13.5, boxSizing: 'border-box' as const, outline: 'none', cursor: 'pointer' }}>
              <option value="">— Sin vendedor asignado —</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.nombre} ({v.comision_pct}%)</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notas del pedido</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Instrucciones de entrega, comentarios..."
              style={{ width: '100%', padding: '9px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, color: '#1a1a1a', fontSize: 13, boxSizing: 'border-box' as const, resize: 'none', outline: 'none' }} />
          </div>

          <button onClick={handleConfirmar} disabled={loading || !clienteId || items.length === 0} style={{
            width: '100%', padding: '13px', background: clienteId && items.length > 0 ? '#E8531D' : '#1a1a1a',
            border: 'none', borderRadius: 8, color: clienteId && items.length > 0 ? '#fff' : '#444',
            fontSize: 14, fontWeight: 600, cursor: clienteId && items.length > 0 ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1
          }}>{loading ? 'Confirmando...' : 'Confirmar pedido'}</button>
        </div>
      </div>

      {/* Mix Builder Modal */}
      {showMixModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowMixModal(false)}>
          <div style={{ background: '#fff', borderRadius: 14, padding: '28px 32px', width: 640, maxHeight: '80vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,0.12)' }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#1a1a1a', fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>Armar caja mixta</h3>
            <MixBuilder productos={mixProducts} onAdd={handleMixAdd} onCancel={() => setShowMixModal(false)} showCancel />
          </div>
        </div>
      )}
    </div>
  )
}
