'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import MixBuilder, { type MixResult, type MixProduct } from '../../../../src/components/MixBuilder'

type Producto = {
  id: string; nombre: string; estilo: string; abv: number; descripcion: string; imagen_url: string;
  precio_caja24_publico: number; precio_caja24_taproom: number; stock_caja24: number;
  precio_caja12_publico: number; precio_caja12_taproom: number; stock_caja12: number;
  precio_barril_pet_publico: number; precio_barril_pet_taproom: number; stock_barril_pet: number;
  precio_barril_acero_publico: number; precio_barril_acero_taproom: number; stock_barril_acero: number;
  stock_latas: number;
}

type CartItem = {
  key: string
  tipo: 'caja24' | 'caja12' | 'barril_pet' | 'mix24'
  nombre: string
  cantidad: number
  precio: number
  producto_id?: string
  metadata?: {
    tipo: 'mix24'
    estilos: { producto_id: string; nombre: string; latas: number }[]
  }
}

const statusLabel: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#d97706' },
  confirmado: { label: 'Confirmado', color: '#2563eb' },
  enviado: { label: 'En camino', color: '#7c3aed' },
  entregado: { label: 'Entregado', color: '#059669' },
  cancelado: { label: 'Cancelado', color: '#dc2626' },
}

const tipoBadge: Record<string, { label: string; color: string; bg: string }> = {
  caja24: { label: 'CAJA 24', color: '#2563eb', bg: '#dbeafe' },
  caja12: { label: 'CAJA 12', color: '#0891b2', bg: '#cffafe' },
  barril_pet: { label: 'BARRIL', color: '#059669', bg: '#dcfce7' },
  mix24: { label: 'MIX', color: '#7c3aed', bg: '#ede9fe' },
}

export default function CatalogoPage() {
  const supabase = createClient()
  const [productos, setProductos] = useState<Producto[]>([])
  const [profile, setProfile] = useState<any>(null)
  const [pedidos, setPedidos] = useState<any[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [showCart, setShowCart] = useState(false)
  const [loading, setLoading] = useState(true)
  const [checkingOut, setCheckingOut] = useState(false)
  const [pedidoOk, setPedidoOk] = useState(false)
  const [notas, setNotas] = useState('')
  const [stockError, setStockError] = useState('')
  // Mix builder uses shared component — no local state needed

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { data: prods }, { data: peds }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('productos').select('id, nombre, estilo, abv, descripcion, imagen_url, precio_caja24_publico, precio_caja24_taproom, stock_caja24, precio_caja12_publico, precio_caja12_taproom, stock_caja12, precio_barril_pet_publico, precio_barril_pet_taproom, stock_barril_pet, precio_barril_acero_publico, precio_barril_acero_taproom, stock_barril_acero, stock_latas').eq('activo', true).order('nombre'),
        supabase.from('pedidos').select('*, pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre))').eq('cliente_id', user.id).order('created_at', { ascending: false }),
      ])
      setProfile(p)
      setProductos(prods || [])
      setPedidos(peds || [])
      setLoading(false)
    }
    load()
  }, [])

  const esMayorista = profile?.nivel_precio === 'taproom' || profile?.nivel_precio === 'distribuidor'

  const getP = (p: Producto, pres: string) => {
    const sufijo = esMayorista ? 'taproom' : 'publico'
    return (p as any)[`precio_${pres}_${sufijo}`] as number
  }

  // ── Cart helpers ──
  const addItem = (p: Producto, tipo: 'caja24' | 'caja12' | 'barril_pet', label: string) => {
    const precio = getP(p, tipo === 'barril_pet' ? 'barril_pet' : tipo)
    if (!precio) return
    const key = `${tipo}-${p.id}`
    setCart(prev => {
      const existing = prev.find(i => i.key === key)
      if (existing) return prev.map(i => i.key === key ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { key, tipo, nombre: `${p.nombre} (${label})`, cantidad: 1, precio, producto_id: p.id }]
    })
    setShowCart(true)
  }

  const handleMixAdd = (result: MixResult) => {
    const names = result.estilos.map(e => `${e.nombre} x${e.latas}`).sort().join(', ')
    const key = `mix24-${names}`
    setCart(prev => [...prev, {
      key, tipo: 'mix24' as const, nombre: `Mix: ${names}`, cantidad: 1, precio: result.precio,
      producto_id: result.estilos[0].producto_id,
      metadata: { tipo: 'mix24' as const, estilos: result.estilos },
    }])
    setShowCart(true)
  }

  const updateQty = (key: string, delta: number) => {
    setCart(prev => prev.map(i => i.key === key ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i).filter(i => i.cantidad > 0))
  }

  const total = cart.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const totalItems = cart.reduce((s, i) => s + i.cantidad, 0)

  // ── Checkout ──
  const handleCheckout = async () => {
    if (cart.length === 0) return
    setCheckingOut(true)
    setStockError('')
    const { data: { user } } = await supabase.auth.getUser()
    const res = await fetch('/api/portal/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: user!.id, tipo_precio: esMayorista ? 'taproom' : 'publico', items: cart, notas, total }),
    })
    const data = await res.json()
    if (!res.ok) { setStockError(data.error || 'Error al crear pedido'); setCheckingOut(false); return }
    setPedidoOk(true)
    setCart([])
    setShowCart(false)
    const { data: peds } = await supabase.from('pedidos').select('*, pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre))').eq('cliente_id', user!.id).order('created_at', { ascending: false })
    setPedidos(peds || [])
    setCheckingOut(false)
  }

  // ── Stats ──
  const puntos = profile?.puntos || 0
  const totalGastado = pedidos.filter(p => p.status !== 'cancelado').reduce((s: number, p: any) => s + (p.total || 0), 0)
  const hasPedidos = pedidos.length > 0
  const pedidoActivo = pedidos.find((p: any) => !['entregado', 'cancelado'].includes(p.status))

  // Timeline
  const timelineSteps = [
    { key: 'pendiente', label: 'Recibido' },
    { key: 'confirmado', label: 'Confirmado' },
    { key: 'pagado', label: 'Pago' },
    { key: 'entregado', label: 'Entregado' },
  ]
  const getTimelineIndex = (p: any) => {
    if (!p) return -1
    if (p.status === 'entregado') return 3
    if (p.pagado) return 2
    if (p.status === 'confirmado' || p.status === 'enviado') return 1
    return 0
  }
  const activeStep = getTimelineIndex(pedidoActivo)

  const getNextStepMessage = (p: any) => {
    if (!p) return ''
    if (p.pagado && p.status !== 'entregado') return 'Pago confirmado. Preparando tu entrega.'
    if (p.status === 'confirmado' || p.status === 'enviado') {
      if (!p.envio_cotizado_at) return 'Pedido confirmado. Te contactamos para coordinar el pago. El costo de envio se cotiza por separado y te lo confirmamos antes del envio.'
      return 'Pedido confirmado. Te contactamos para coordinar el pago.'
    }
    return 'Estamos revisando tu pedido. Te contactamos hoy para coordinar el pago.'
  }

  // Filtered product lists
  const prodsCaja24 = productos.filter(p => p.stock_caja24 > 0 && getP(p, 'caja24'))
  const prodsCaja12 = productos.filter(p => p.stock_caja12 > 0 && getP(p, 'caja12'))
  const prodsBarril = productos.filter(p => p.stock_barril_pet > 0 && getP(p, 'barril_pet'))
  const prodsMix = productos.filter(p => (p.stock_latas || 0) > 0 && getP(p, 'caja24'))
  const mixProducts: MixProduct[] = prodsMix.map(p => ({
    id: p.id, nombre: p.nombre, imagen_url: p.imagen_url,
    stock_latas: p.stock_latas || 0,
    precio_por_lata: Math.round(getP(p, 'caja24') / 24),
  }))

  // ── Product card renderer ──
  const ProductCard = ({ p, tipo, label }: { p: Producto; tipo: 'caja24' | 'caja12' | 'barril_pet'; label: string }) => {
    const precio = getP(p, tipo === 'barril_pet' ? 'barril_pet' : tipo)
    const inCart = cart.find(i => i.key === `${tipo}-${p.id}`)
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
        {p.imagen_url && (
          <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
            <img src={p.imagen_url} alt={p.nombre} style={{ maxHeight: 70, objectFit: 'contain' }} />
          </div>
        )}
        <p style={{ margin: '0 0 3px', fontWeight: 700, fontSize: 17, color: '#111' }}>{p.nombre}</p>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: '#9ca3af' }}>{p.estilo} · {p.abv}%</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <p style={{ margin: 0, color: '#E8531D', fontSize: 22, fontWeight: 800 }}>${precio?.toLocaleString('es-MX') || '--'}</p>
          {precio && (inCart ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button onClick={() => updateQty(`${tipo}-${p.id}`, -1)} style={{ width: 30, height: 30, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontSize: 17 }}>-</button>
              <span style={{ fontWeight: 700, fontSize: 16, minWidth: 18, textAlign: 'center' }}>{inCart.cantidad}</span>
              <button onClick={() => updateQty(`${tipo}-${p.id}`, 1)} style={{ width: 30, height: 30, borderRadius: '50%', background: '#E8531D', border: 'none', cursor: 'pointer', fontSize: 17, color: '#fff' }}>+</button>
            </div>
          ) : (
            <button onClick={() => addItem(p, tipo, label)} style={{ padding: '10px 20px', background: '#111', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Agregar</button>
          ))}
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#9ca3af', fontFamily: 'system-ui' }}>Cargando...</div>

  if (pedidoOk) return (
    <div style={{ padding: '60px 48px', textAlign: 'center', fontFamily: 'system-ui' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h2 style={{ color: '#111', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Pedido recibido</h2>
      <p style={{ color: '#888', fontSize: 15, marginBottom: 8 }}>Estamos revisando tu pedido.</p>
      <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 28 }}>Te contactaremos hoy para coordinar el pago y la entrega.</p>
      <button onClick={() => setPedidoOk(false)} style={{ padding: '12px 32px', background: '#E8531D', border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Ver catalogo</button>
    </div>
  )

  return (
    <div className="portal-page" style={{ fontFamily: 'system-ui, sans-serif', position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '0 48px' }}>

      {/* HEADER */}
      <div style={{ padding: '40px 48px 0' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ color: '#111', fontSize: 34, fontWeight: 800, margin: '0 0 4px', lineHeight: 1.15 }}>
            Hola, {profile?.full_name?.split(' ')[0] || 'bienvenido'}
          </h1>
          <p style={{ color: '#9ca3af', fontSize: 15, margin: 0 }}>
            {esMayorista ? <span style={{ color: '#E8531D', fontWeight: 600 }}>Precios mayoristas</span> : 'Precios al publico'}
          </p>
        </div>

        {/* PEDIDO ACTIVO: timeline */}
        {pedidoActivo && (
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14, padding: '24px 28px', marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <p style={{ margin: 0, color: '#374151', fontSize: 15, fontWeight: 600 }}>
                Pedido <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>#{pedidoActivo.id.slice(-6).toUpperCase()}</span>
                {' '}· ${((pedidoActivo.total || 0) + (pedidoActivo.costo_envio || 0)).toLocaleString('es-MX')}
                {pedidoActivo.costo_envio > 0 && <span style={{ color: '#9ca3af', fontSize: 12 }}> (incluye ${(pedidoActivo.costo_envio || 0).toLocaleString('es-MX')} envio)</span>}
              </p>
              <a href="/portal/pedidos" style={{ color: '#4DA3FF', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Ver detalle →</a>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 16 }}>
              {timelineSteps.map((step, i) => {
                const done = i <= activeStep
                const current = i === activeStep
                return (
                  <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: i < timelineSteps.length - 1 ? 1 : 'none' }}>
                    <div style={{
                      width: current ? 32 : 24, height: current ? 32 : 24, borderRadius: '50%', flexShrink: 0,
                      background: done ? '#E8531D' : '#f3f4f6',
                      border: current ? '3px solid #FDBA74' : 'none',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s',
                    }}>
                      {done && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                    </div>
                    {i < timelineSteps.length - 1 && (
                      <div style={{ flex: 1, height: 2, background: i < activeStep ? '#E8531D' : '#e5e7eb', margin: '0 4px' }} />
                    )}
                  </div>
                )
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              {timelineSteps.map((step, i) => (
                <p key={step.key} style={{
                  margin: 0, fontSize: 11, fontWeight: i <= activeStep ? 600 : 400,
                  color: i <= activeStep ? '#374151' : '#9ca3af',
                  textAlign: i === 0 ? 'left' : i === timelineSteps.length - 1 ? 'right' : 'center',
                  flex: i < timelineSteps.length - 1 ? 1 : 'none',
                }}>{step.label}</p>
              ))}
            </div>
            <p style={{ margin: 0, color: '#6b7280', fontSize: 13, lineHeight: 1.5 }}>
              {getNextStepMessage(pedidoActivo)}
              {pedidoActivo.fecha_entrega && ` Entrega estimada: ${new Date(pedidoActivo.fecha_entrega).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}.`}
            </p>
          </div>
        )}

        {/* Cart button */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
          <h2 style={{ color: '#111', fontSize: 26, fontWeight: 700, margin: 0 }}>Arma tu pedido</h2>
          {cart.length > 0 && (
            <button onClick={() => setShowCart(!showCart)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              background: '#E8531D', border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer',
            }}>
              Carrito · {totalItems} · ${total.toLocaleString('es-MX')}
            </button>
          )}
        </div>
      </div>

      {/* SECTION 1: Caja 24 latas */}
      {prodsCaja24.length > 0 && (
        <div style={{ padding: '0 48px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: '#374151', fontSize: 16, fontWeight: 700 }}>Caja 24 latas</h3>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>24 latas del mismo estilo</span>
          </div>
          <div className="portal-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {prodsCaja24.map(p => <ProductCard key={p.id} p={p} tipo="caja24" label="Caja 24" />)}
          </div>
        </div>
      )}

      {/* SECTION 2: Caja 12 latas */}
      {prodsCaja12.length > 0 && (
        <div style={{ padding: '0 48px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: '#374151', fontSize: 16, fontWeight: 700 }}>Caja 12 latas</h3>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>12 latas del mismo estilo</span>
          </div>
          <div className="portal-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {prodsCaja12.map(p => <ProductCard key={p.id} p={p} tipo="caja12" label="Caja 12" />)}
          </div>
        </div>
      )}

      {/* SECTION 3: Barril 20L PET (mayoristas only) */}
      {esMayorista && prodsBarril.length > 0 && (
        <div style={{ padding: '0 48px 40px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: '#374151', fontSize: 16, fontWeight: 700 }}>Barril 20L PET</h3>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Barril desechable 20 litros</span>
          </div>
          <div className="portal-products-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {prodsBarril.map(p => <ProductCard key={p.id} p={p} tipo="barril_pet" label="Barril 20L" />)}
          </div>
        </div>
      )}

      {/* SECTION 4: Arma tu caja (shared MixBuilder) */}
      {mixProducts.length > 0 && (
        <div style={{ padding: '0 48px 48px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <h3 style={{ margin: 0, color: '#374151', fontSize: 16, fontWeight: 700 }}>Arma tu caja</h3>
            <span style={{ color: '#9ca3af', fontSize: 14 }}>Elige cualquier combinacion de 24 latas</span>
          </div>
          <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24 }}>
            <MixBuilder productos={mixProducts} onAdd={handleMixAdd} />
          </div>
        </div>
      )}

      {/* CART SIDEBAR */}
      {showCart && cart.length > 0 && (
        <div className="portal-cart" style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 400, background: '#fff', borderLeft: '1px solid #e5e7eb', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.08)' }}>
          <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>Tu pedido</h2>
            <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 20 }}>x</button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {cart.map(item => {
              const badge = tipoBadge[item.tipo] || tipoBadge.caja24
              return (
                <div key={item.key} style={{ padding: '14px 0', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                      <p style={{ margin: '0 0 2px', color: '#111', fontSize: 14, fontWeight: 600 }}>{item.nombre}</p>
                      <p style={{ margin: 0, color: '#E8531D', fontSize: 13, fontWeight: 600 }}>${item.precio.toLocaleString('es-MX')} c/u</p>
                      {/* Mix breakdown */}
                      {item.metadata?.tipo === 'mix24' && item.metadata.estilos && (
                        <div style={{ marginTop: 6 }}>
                          {item.metadata.estilos.map(e => {
                            const prod = productos.find(pr => pr.id === e.producto_id)
                            const perLata = prod ? Math.round(getP(prod, 'caja24') / 24) : 0
                            return (
                              <p key={e.producto_id} style={{ margin: '1px 0', color: '#9ca3af', fontSize: 11 }}>
                                {e.nombre}: {e.latas} latas · ${(perLata * e.latas).toLocaleString('es-MX')}
                              </p>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button onClick={() => updateQty(item.key, -1)} style={{ width: 26, height: 26, borderRadius: '50%', background: '#f3f4f6', border: 'none', cursor: 'pointer', fontSize: 15 }}>-</button>
                      <span style={{ fontWeight: 700, fontSize: 15, minWidth: 16, textAlign: 'center' }}>{item.cantidad}</span>
                      <button onClick={() => updateQty(item.key, 1)} style={{ width: 26, height: 26, borderRadius: '50%', background: '#E8531D', border: 'none', cursor: 'pointer', fontSize: 15, color: '#fff' }}>+</button>
                    </div>
                  </div>
                  <p style={{ margin: '6px 0 0', textAlign: 'right', color: '#111', fontSize: 15, fontWeight: 700 }}>${(item.precio * item.cantidad).toLocaleString('es-MX')}</p>
                </div>
              )
            })}
            <div style={{ marginTop: 16 }}>
              <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6 }}>Notas de entrega</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Instrucciones..."
                style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 13, color: '#111', boxSizing: 'border-box', resize: 'none', outline: 'none' }} />
            </div>
          </div>
          <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #f3f4f6' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ color: '#111', fontSize: 16, fontWeight: 700 }}>Total</span>
              <span style={{ color: '#E8531D', fontSize: 22, fontWeight: 800 }}>${total.toLocaleString('es-MX')}</span>
            </div>
            {stockError && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12, background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>{stockError}</p>}
            {profile?.requiere_factura && !profile?.rfc && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                <p style={{ margin: 0, color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
                  Tienes facturacion activa pero faltan datos fiscales.{' '}
                  <a href="/portal/cuenta" style={{ color: '#E8531D', fontWeight: 600 }}>Completar datos</a>
                </p>
              </div>
            )}
            <div style={{ background: '#f9fafb', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13, lineHeight: 1.5 }}>Tu pedido sera revisado por nuestro equipo. Te contactaremos para confirmar entrega y pago. El costo de envio no esta incluido y se cotiza por separado.</p>
            </div>
            <button onClick={handleCheckout} disabled={checkingOut} style={{
              width: '100%', padding: '14px', background: '#E8531D', border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1,
            }}>{checkingOut ? 'Enviando...' : 'Confirmar pedido'}</button>
          </div>
        </div>
      )}

      {/* HISTORIAL DE PEDIDOS */}
      {(() => {
        const historial = pedidos.filter((p: any) => !(pedidoActivo && p.id === pedidoActivo.id)).slice(0, 5)
        if (historial.length === 0) return null
        const sc: Record<string, { label: string; color: string; bg: string }> = {
          pendiente:  { label: 'Pendiente',  color: '#f59e0b', bg: '#fef9c3' },
          confirmado: { label: 'Confirmado', color: '#3b82f6', bg: '#dbeafe' },
          enviado:    { label: 'En camino',  color: '#8b5cf6', bg: '#ede9fe' },
          entregado:  { label: 'Entregado',  color: '#10b981', bg: '#dcfce7' },
          cancelado:  { label: 'Cancelado',  color: '#ef4444', bg: '#fee2e2' },
        }
        return (
          <div style={{ padding: '0 48px 40px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#374151', fontSize: 16, fontWeight: 700 }}>Historial de pedidos</h3>
              <a href="/portal/pedidos" style={{ color: '#4DA3FF', fontSize: 13, fontWeight: 500, textDecoration: 'none' }}>Ver todos →</a>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {historial.map((p: any) => {
                const s = sc[p.status] || { label: p.status, color: '#888', bg: '#f5f5f5' }
                const fecha = new Date(p.created_at)
                return (
                  <div key={p.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ fontFamily: 'monospace', color: '#6b7280', fontSize: 13, fontWeight: 600 }}>#{p.id.slice(-6).toUpperCase()}</span>
                      <span style={{ color: '#9ca3af', fontSize: 13 }}>{fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <span style={{ color: '#111', fontSize: 15, fontWeight: 700 }}>${(p.total || 0).toLocaleString('es-MX')}</span>
                      <span style={{ background: s.bg, color: s.color, padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600 }}>{s.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* KPIs */}
      {hasPedidos && (
        <div style={{ padding: '0 48px 48px' }}>
          <div className="portal-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Pedidos</p>
              <p style={{ margin: '4px 0 0', color: '#111', fontSize: 26, fontWeight: 800 }}>{pedidos.length}</p>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Total comprado</p>
              <p style={{ margin: '4px 0 0', color: '#E8531D', fontSize: 22, fontWeight: 800 }}>${totalGastado.toLocaleString('es-MX')}</p>
            </div>
            <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '16px 20px' }}>
              <p style={{ margin: 0, color: '#6b7280', fontSize: 13 }}>Puntos</p>
              <p style={{ margin: '4px 0 0', color: '#7c3aed', fontSize: 26, fontWeight: 800 }}>{puntos.toLocaleString()}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
