'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'

type Producto = { id: string; nombre: string; estilo: string; precio_caja12_publico: number; precio_caja12_taproom: number; precio_caja24_publico: number; precio_caja24_taproom: number; precio_barril_pet_publico: number; precio_barril_pet_taproom: number; precio_barril_acero_taproom: number; stock_caja12: number; stock_caja24: number; stock_barril_pet: number; stock_barril_acero: number; imagen_url: string }
type Cliente = { id: string; full_name: string; email: string; tipo_consumidor: string }
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
  const [items, setItems] = useState<Item[]>([])
  const [notas, setNotas] = useState('')
  const [loading, setLoading] = useState(false)
  const [clienteSearch, setClienteSearch] = useState('')
  const [vendedores, setVendedores] = useState<any[]>([])
  const [vendedorId, setVendedorId] = useState('')

  useEffect(() => {
    const load = async () => {
      const [{ data: cl }, { data: pr }, { data: vend }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, email, tipo_consumidor').eq('role', 'comprador').order('full_name'),
        supabase.from('productos').select('*').eq('activo', true).order('nombre'),
        supabase.from('vendedores').select('id, nombre, comision_pct').eq('activo', true).order('nombre')
      ])
      setClientes(cl || [])
      setProductos(pr || [])
      setVendedores(vend || [])
    }
    load()
  }, [])

  const clienteSeleccionado = clientes.find(c => c.id === clienteId)
  const esTap = clienteSeleccionado?.tipo_consumidor === 'tiene_tap' || clienteSeleccionado?.tipo_consumidor === 'tiene_bar'

  const getPrecio = (p: Producto, unidad: string): number => {
    const isTap = tipoPrecio === 'taproom'
    if (unidad === 'caja12') return isTap ? p.precio_caja12_taproom : p.precio_caja12_publico
    if (unidad === 'caja24') return isTap ? p.precio_caja24_taproom : p.precio_caja24_publico
    if (unidad === 'barril_pet') return isTap ? p.precio_barril_pet_taproom : p.precio_barril_pet_publico
    if (unidad === 'barril_acero') return p.precio_barril_acero_taproom
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

  const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0)

  const handleConfirmar = async () => {
    if (!clienteId || items.length === 0) return
    setLoading(true)
    const res = await fetch('/api/admin/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: clienteId, tipo_precio: tipoPrecio, items, notas, total, vendedor_id: vendedorId || null })
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
          <a href="/admin/pedidos" style={{ color: '#444', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Pedidos
          </a>
          <span style={{ color: '#2a2a2a' }}>/</span>
          <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Nuevo pedido</h1>
        </div>

        {/* Selección cliente */}
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Cliente *</p>
          <input value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} placeholder="Buscar cliente..."
            style={{ width: '100%', padding: '9px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 7, color: '#fff', fontSize: 13.5, boxSizing: 'border-box' as const, outline: 'none', marginBottom: 10 }} />
          <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filteredClientes.map(c => (
              <button key={c.id} onClick={() => { setClienteId(c.id); setClienteSearch('') }} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px',
                background: clienteId === c.id ? '#1e1e1e' : 'transparent',
                border: `1px solid ${clienteId === c.id ? '#E8531D' : 'transparent'}`,
                borderRadius: 7, cursor: 'pointer', textAlign: 'left', width: '100%'
              }}>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#2a2a2a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#E8531D', fontSize: 11, fontWeight: 700 }}>
                  {(c.full_name || c.email)[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: 0, color: '#ddd', fontSize: 13 }}>{c.full_name || c.email}</p>
                  <p style={{ margin: 0, color: '#555', fontSize: 11 }}>{c.email}</p>
                </div>
              </button>
            ))}
          </div>
          {clienteSeleccionado && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: '#1a1a1a', borderRadius: 7, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#10b981', fontSize: 12.5 }}>✓ {clienteSeleccionado.full_name}</p>
              {esTap && <span style={{ background: '#f59e0b18', color: '#f59e0b', fontSize: 11, padding: '2px 8px', borderRadius: 99 }}>Tap/Bar</span>}
            </div>
          )}
        </div>

        {/* Tipo precio */}
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Tipo de precio</p>
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

        {/* Productos */}
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 16 }}>
          <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Productos</p>
          {productos.length === 0 ? (
            <p style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: 20 }}>No hay productos en inventario</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {productos.map(p => (
                <div key={p.id} style={{ background: '#0f0f0f', border: '1px solid #1a1a1a', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    {p.imagen_url
                      ? <img src={p.imagen_url} style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover' }} />
                      : <div style={{ width: 36, height: 36, borderRadius: 6, background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 11h1a3 3 0 010 6h-1"/><path d="M9 12v6"/><path d="M13 12v6"/><path d="M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5"/><path d="M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4l.6-12z"/></svg>
                  </div>
                    }
                    <div>
                      <p style={{ margin: 0, color: '#ddd', fontSize: 13.5, fontWeight: 600 }}>{p.nombre}</p>
                      <p style={{ margin: 0, color: '#555', fontSize: 11.5 }}>{p.estilo}</p>
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {unidades.map(u => {
                      const precio = getPrecio(p, u.key)
                      const stock = getStock(p, u.key)
                      const itemKey = `${p.id}-${u.key}`
                      const itemInCart = items.find(i => i.producto_id === itemKey)
                      if (!precio || stock === 0) return (
                        <div key={u.key} style={{ padding: '7px 8px', background: '#141414', borderRadius: 7, textAlign: 'center', opacity: 0.4 }}>
                          <p style={{ margin: 0, color: '#444', fontSize: 10.5 }}>{u.label}</p>
                          <p style={{ margin: '2px 0 0', color: '#333', fontSize: 10 }}>{!precio ? 'Sin precio' : 'Sin stock'}</p>
                        </div>
                      )
                      return (
                        <div key={u.key} style={{ padding: '7px 8px', background: '#141414', border: `1px solid ${itemInCart ? '#E8531D40' : '#1a1a1a'}`, borderRadius: 7, textAlign: 'center' }}>
                          <p style={{ margin: 0, color: '#888', fontSize: 10 }}>{u.label}</p>
                          <p style={{ margin: '2px 0 4px', color: '#E8531D', fontSize: 12, fontWeight: 600 }}>${precio?.toLocaleString()}</p>
                          <p style={{ margin: '0 0 6px', color: '#444', fontSize: 10 }}>Stock: {stock}</p>
                          {itemInCart ? (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                              <button onClick={() => updateCantidad(itemKey, -1)} style={{ width: 22, height: 22, borderRadius: '50%', background: '#2a2a2a', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                              <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, minWidth: 16, textAlign: 'center' }}>{itemInCart.cantidad}</span>
                              <button onClick={() => updateCantidad(itemKey, 1)} style={{ width: 22, height: 22, borderRadius: '50%', background: '#E8531D', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                            </div>
                          ) : (
                            <button onClick={() => addItem(p, u.key)} style={{ width: '100%', padding: '4px', background: '#1e1e1e', border: 'none', borderRadius: 5, color: '#888', fontSize: 11, cursor: 'pointer' }}>+ Agregar</button>
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
        <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 20 }}>
          <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14 }}>Resumen del pedido</p>

          {items.length === 0 ? (
            <p style={{ color: '#333', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>Agrega productos al pedido</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {items.map(item => (
                <div key={item.producto_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, color: '#ccc', fontSize: 12.5 }}>{item.nombre}</p>
                    <p style={{ margin: '1px 0 0', color: '#555', fontSize: 11.5 }}>{item.cantidad} × ${item.precio.toLocaleString()}</p>
                  </div>
                  <p style={{ margin: 0, color: '#E8531D', fontSize: 13, fontWeight: 600 }}>${(item.precio * item.cantidad).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: '1px solid #1a1a1a', paddingTop: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ margin: 0, color: '#888', fontSize: 13 }}>Total</p>
              <p style={{ margin: 0, color: '#fff', fontSize: 20, fontWeight: 700 }}>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
          </div>

          {/* Vendedor */}
          <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 16, marginBottom: 14 }}>
            <p style={{ color: '#555', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>Vendedor asignado</p>
            <select value={vendedorId} onChange={e => setVendedorId(e.target.value)}
              style={{ width: '100%', padding: '9px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 7, color: vendedorId ? '#fff' : '#555', fontSize: 13.5, boxSizing: 'border-box' as const, outline: 'none', cursor: 'pointer' }}>
              <option value="">— Sin vendedor asignado —</option>
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.nombre} ({v.comision_pct}%)</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notas del pedido</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Instrucciones de entrega, comentarios..."
              style={{ width: '100%', padding: '9px 12px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 7, color: '#fff', fontSize: 13, boxSizing: 'border-box' as const, resize: 'none', outline: 'none' }} />
          </div>

          <button onClick={handleConfirmar} disabled={loading || !clienteId || items.length === 0} style={{
            width: '100%', padding: '13px', background: clienteId && items.length > 0 ? '#E8531D' : '#1a1a1a',
            border: 'none', borderRadius: 8, color: clienteId && items.length > 0 ? '#fff' : '#444',
            fontSize: 14, fontWeight: 600, cursor: clienteId && items.length > 0 ? 'pointer' : 'not-allowed',
            opacity: loading ? 0.7 : 1
          }}>{loading ? 'Confirmando...' : 'Confirmar pedido'}</button>
        </div>
      </div>
    </div>
  )
}
