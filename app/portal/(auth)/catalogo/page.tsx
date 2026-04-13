'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../src/lib/supabase'

type Producto = {
  id: string; nombre: string; estilo: string; abv: number; descripcion: string; imagen_url: string;
  precio_caja12_publico: number; precio_caja12_taproom: number;
  precio_caja24_publico: number; precio_caja24_taproom: number;
  precio_barril_pet_publico: number; precio_barril_pet_taproom: number;
  precio_barril_acero_publico: number; precio_barril_acero_taproom: number;
  precio_barril10_pet_publico: number; precio_barril10_pet_taproom: number;
  precio_barril10_acero_publico: number; precio_barril10_acero_taproom: number;
  stock_caja12: number; stock_caja24: number; stock_barril_pet: number; stock_barril_acero: number;
  stock_barril10_pet: number; stock_barril10_acero: number;
  ibu?: number;
}
type CartItem = { producto_id: string; nombre: string; unidad: string; unidadLabel: string; cantidad: number; precio: number }

const unidadesConfig = [
  { key: 'caja12', label: 'Caja 12 latas', sublabel: '12 × 355ml' },
  { key: 'caja24', label: 'Caja 24 latas', sublabel: '24 × 355ml' },
  { key: 'barril_pet', label: 'Barril PET 20L', sublabel: '20 litros' },
  { key: 'barril_acero', label: 'Barril Acero 20L', sublabel: '20L — solo CDMX' },
  { key: 'barril10_pet', label: 'Barril PET 10L', sublabel: '10 litros' },
  { key: 'barril10_acero', label: 'Barril Acero 10L', sublabel: '10L — solo CDMX' },
]

const niveles = [
  { nombre: 'Principiante', min: 0, max: 499, color: '#aaa' },
  { nombre: 'Aficionado', min: 500, max: 1499, color: '#f59e0b' },
  { nombre: 'Cervezero', min: 1500, max: 3999, color: '#E8531D' },
  { nombre: 'Master Brewer', min: 4000, max: 99999, color: '#7c3aed' },
]

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

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: p }, { data: prods }, { data: peds }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).single(),
        supabase.from('productos').select('*').eq('activo', true).order('nombre'),
        supabase.from('pedidos').select('*, pedido_items(cantidad, precio_unitario, productos(nombre))').eq('cliente_id', user.id).order('created_at', { ascending: false })
      ])
      setProfile(p)
      setProductos(prods || [])
      setPedidos(peds || [])
      setLoading(false)
    }
    load()
  }, [])

  const esTap = profile?.tipo_consumidor === 'tiene_tap' || profile?.tipo_consumidor === 'tiene_bar'

  const getPrecio = (p: Producto, unidad: string) => {
    const t = esTap
    if (unidad === 'caja12') return t ? p.precio_caja12_taproom : p.precio_caja12_publico
    if (unidad === 'caja24') return t ? p.precio_caja24_taproom : p.precio_caja24_publico
    if (unidad === 'barril_pet') return t ? p.precio_barril_pet_taproom : p.precio_barril_pet_publico
    if (unidad === 'barril_acero') return t ? p.precio_barril_acero_taproom : p.precio_barril_acero_publico
    if (unidad === 'barril10_pet') return t ? p.precio_barril10_pet_taproom : p.precio_barril10_pet_publico
    if (unidad === 'barril10_acero') return t ? p.precio_barril10_acero_taproom : p.precio_barril10_acero_publico
    return 0
  }

  const getStock = (p: Producto, unidad: string) => {
    if (unidad === 'caja12') return p.stock_caja12
    if (unidad === 'caja24') return p.stock_caja24
    if (unidad === 'barril_pet') return p.stock_barril_pet
    if (unidad === 'barril_acero') return p.stock_barril_acero
    if (unidad === 'barril10_pet') return p.stock_barril10_pet
    if (unidad === 'barril10_acero') return p.stock_barril10_acero
    return 0
  }

  const addToCart = (p: Producto, unidad: string) => {
    const precio = getPrecio(p, unidad)
    if (!precio) return
    const key = `${p.id}-${unidad}`
    const uLabel = unidadesConfig.find(u => u.key === unidad)?.label || unidad
    setCart(prev => {
      const existing = prev.find(i => i.producto_id === key)
      if (existing) return prev.map(i => i.producto_id === key ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { producto_id: key, nombre: p.nombre, unidad, unidadLabel: uLabel, cantidad: 1, precio }]
    })
    setShowCart(true)
  }

  const updateQty = (key: string, delta: number) => {
    setCart(prev => prev.map(i => i.producto_id === key ? { ...i, cantidad: Math.max(0, i.cantidad + delta) } : i).filter(i => i.cantidad > 0))
  }

  const total = cart.reduce((s, i) => s + i.precio * i.cantidad, 0)
  const totalItems = cart.reduce((s, i) => s + i.cantidad, 0)

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setCheckingOut(true)
    const { data: { user } } = await supabase.auth.getUser()
    const res = await fetch('/api/portal/pedidos/crear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: user!.id, tipo_precio: esTap ? 'taproom' : 'publico', items: cart, notas, total })
    })
    if (res.ok) {
      setPedidoOk(true)
      setCart([])
      setShowCart(false)
      const { data: { user: u } } = await supabase.auth.getUser()
      const { data: peds } = await supabase.from('pedidos').select('*, pedido_items(cantidad, precio_unitario, productos(nombre))').eq('cliente_id', u!.id).order('created_at', { ascending: false })
      setPedidos(peds || [])
    }
    setCheckingOut(false)
  }

  // Stats
  const puntos = profile?.puntos || 0
  const nivelActual = niveles.find(n => puntos >= n.min && puntos <= n.max) || niveles[0]
  const nivelSig = niveles[niveles.indexOf(nivelActual) + 1]
  const progreso = nivelSig ? ((puntos - nivelActual.min) / (nivelSig.min - nivelActual.min)) * 100 : 100
  const totalGastado = pedidos.filter(p => p.status !== 'cancelado').reduce((s, p) => s + (p.total || 0), 0)
  const litrosComprados = pedidos.filter(p => p.status !== 'cancelado').reduce((s, p) => {
    return s + (p.pedido_items || []).reduce((ss: number, item: any) => {
      const nombre = item.productos?.nombre || ''
      const qty = item.cantidad || 0
      if (nombre.includes('10L') || nombre.includes('10 L')) return ss + qty * 10
      if (nombre.includes('20L') || nombre.includes('20 L') || nombre.includes('Barril')) return ss + qty * 20
      if (nombre.includes('24')) return ss + qty * 24 * 0.355
      if (nombre.includes('12')) return ss + qty * 12 * 0.355
      return ss
    }, 0)
  }, 0)
  const memberSince = profile?.created_at ? new Date(profile.created_at).toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) : '—'
  const ultimoPedido = pedidos[0]
  const statusLabel: Record<string, { label: string, color: string }> = {
    pendiente: { label: 'Pendiente', color: '#f59e0b' },
    confirmado: { label: 'Confirmado', color: '#3b82f6' },
    enviado: { label: 'En camino', color: '#8b5cf6' },
    entregado: { label: 'Entregado', color: '#10b981' },
    cancelado: { label: 'Cancelado', color: '#ef4444' },
  }

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: '#aaa', fontFamily: 'system-ui' }}>Cargando...</div>

  if (pedidoOk) return (
    <div style={{ padding: '60px 48px', textAlign: 'center', fontFamily: 'system-ui' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5"><path d="M20 6L9 17l-5-5"/></svg>
      </div>
      <h2 style={{ color: '#111', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Pedido confirmado</h2>
      <p style={{ color: '#888', fontSize: 15, marginBottom: 28 }}>Te contactaremos para coordinar la entrega.</p>
      <button onClick={() => setPedidoOk(false)} style={{ padding: '12px 32px', background: '#E8531D', border: 'none', borderRadius: 9, color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Ver catálogo</button>
    </div>
  )

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', position: 'relative' }}>

      {/* DASHBOARD */}
      <div style={{ padding: '32px 48px 0' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ color: '#111', fontSize: 22, fontWeight: 800, margin: '0 0 2px' }}>
            Hola, {profile?.full_name?.split(' ')[0] || 'bienvenido'} 
          </h1>
          <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>Miembro desde {memberSince}</p>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 20 }}>
          {/* Pedidos */}
          <div style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2"/></svg>
              </div>
              <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pedidos</p>
            </div>
            <p style={{ margin: 0, color: '#111', fontSize: 28, fontWeight: 800 }}>{pedidos.length}</p>
            <p style={{ margin: '3px 0 0', color: '#aaa', fontSize: 12 }}>{pedidos.filter(p => p.status === 'entregado').length} entregados</p>
          </div>

          {/* Total gastado */}
          <div style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff5f2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E8531D" strokeWidth="2"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
              </div>
              <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total comprado</p>
            </div>
            <p style={{ margin: 0, color: '#E8531D', fontSize: 24, fontWeight: 800 }}>${totalGastado.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</p>
            <p style={{ margin: '3px 0 0', color: '#aaa', fontSize: 12 }}>MXN acumulado</p>
          </div>

          {/* Litros */}
          <div style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2"><path d="M17 11h1a3 3 0 010 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L18 8z"/></svg>
              </div>
              <p style={{ margin: 0, color: '#888', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Litros comprados</p>
            </div>
            <p style={{ margin: 0, color: '#10b981', fontSize: 28, fontWeight: 800 }}>{litrosComprados.toFixed(0)}L</p>
            <p style={{ margin: '3px 0 0', color: '#aaa', fontSize: 12 }}>de Tarabaña</p>
          </div>

          {/* Puntos */}
          <div style={{ background: '#0a0a0a', border: '1px solid #1a1a1a', borderRadius: 12, padding: '18px 20px', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#E8531D18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E8531D" strokeWidth="2"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
              </div>
              <p style={{ margin: 0, color: '#555', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Mis puntos</p>
            </div>
            <p style={{ margin: 0, color: '#E8531D', fontSize: 28, fontWeight: 800 }}>{puntos.toLocaleString()}</p>
            <p style={{ margin: '3px 0 0', color: nivelActual.color, fontSize: 12, fontWeight: 600 }}>{nivelActual.nombre}</p>
            {nivelSig && (
              <div style={{ marginTop: 8 }}>
                <div style={{ background: '#1a1a1a', borderRadius: 99, height: 4 }}>
                  <div style={{ background: '#E8531D', borderRadius: 99, height: 4, width: `${Math.min(progreso, 100)}%` }} />
                </div>
                <p style={{ margin: '4px 0 0', color: '#333', fontSize: 10 }}>{nivelSig.min - puntos} pts para {nivelSig.nombre}</p>
              </div>
            )}
          </div>
        </div>

        {/* Último pedido */}
        {ultimoPedido && (
          <div style={{ background: '#fff', border: '1px solid #ebebeb', borderRadius: 12, padding: '16px 20px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 8px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: '#f8f8f8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="1.8"><path d="M6 2H4a2 2 0 00-2 2v16a2 2 0 002 2h16a2 2 0 002-2V8l-6-6H6z M14 2v6h6"/></svg>
              </div>
              <div>
                <p style={{ margin: 0, color: '#111', fontSize: 14, fontWeight: 600 }}>Último pedido · #{ultimoPedido.id.slice(-6).toUpperCase()}</p>
                <p style={{ margin: '2px 0 0', color: '#aaa', fontSize: 12 }}>{new Date(ultimoPedido.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} · ${(ultimoPedido.total || 0).toLocaleString('es-MX')}</p>
              </div>
            </div>
            <span style={{
              background: (statusLabel[ultimoPedido.status]?.color || '#888') + '18',
              color: statusLabel[ultimoPedido.status]?.color || '#888',
              padding: '5px 14px', borderRadius: 99, fontSize: 12.5, fontWeight: 600
            }}>{statusLabel[ultimoPedido.status]?.label || ultimoPedido.status}</span>
          </div>
        )}

        {/* Header catálogo */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ color: '#111', fontSize: 18, fontWeight: 800, margin: '0 0 2px' }}>Catálogo</h2>
            <p style={{ color: '#aaa', fontSize: 13, margin: 0 }}>
              Stock en tiempo real · {esTap ? <span style={{ color: '#E8531D', fontWeight: 600 }}>Precios especiales</span> : 'Precios al público'}
            </p>
          </div>
          {cart.length > 0 && (
            <button onClick={() => setShowCart(!showCart)} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px',
              background: '#E8531D', border: 'none', borderRadius: 10, color: '#fff',
              fontSize: 14, fontWeight: 600, cursor: 'pointer'
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z M3 6h18 M16 10a4 4 0 01-8 0"/></svg>
              Mi pedido · {totalItems} · <span style={{ background: '#fff', color: '#E8531D', borderRadius: 99, padding: '1px 8px', fontSize: 13, fontWeight: 700 }}>${total.toLocaleString('es-MX')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Carrito lateral */}
      {showCart && cart.length > 0 && (
        <div style={{ position: 'fixed', top: 0, right: 0, height: '100vh', width: 380, background: '#fff', borderLeft: '1px solid #ebebeb', zIndex: 100, display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 32px rgba(0,0,0,0.08)' }}>
          <div style={{ padding: '24px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#111' }}>Tu pedido</h2>
            <button onClick={() => setShowCart(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
            {cart.map(item => (
              <div key={item.producto_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f5f5f5' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ margin: 0, color: '#111', fontSize: 14, fontWeight: 600 }}>{item.nombre}</p>
                  <p style={{ margin: '2px 0 0', color: '#aaa', fontSize: 12 }}>{item.unidadLabel}</p>
                  <p style={{ margin: '2px 0 0', color: '#E8531D', fontSize: 13, fontWeight: 600 }}>${item.precio.toLocaleString('es-MX')} c/u</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => updateQty(item.producto_id, -1)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#f5f5f5', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                  <span style={{ color: '#111', fontSize: 15, fontWeight: 700, minWidth: 20, textAlign: 'center' }}>{item.cantidad}</span>
                  <button onClick={() => updateQty(item.producto_id, 1)} style={{ width: 28, height: 28, borderRadius: '50%', background: '#E8531D', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>+</button>
                </div>
                <p style={{ margin: '0 0 0 12px', color: '#111', fontSize: 14, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>${(item.precio * item.cantidad).toLocaleString('es-MX')}</p>
              </div>
            ))}
            <div style={{ marginTop: 16 }}>
              <label style={{ color: '#888', fontSize: 12, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notas</label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2} placeholder="Instrucciones de entrega..."
                style={{ width: '100%', padding: '10px 12px', background: '#f8f8f8', border: '1px solid #ebebeb', borderRadius: 8, fontSize: 13, color: '#111', boxSizing: 'border-box' as const, resize: 'none', outline: 'none' }} />
            </div>
          </div>
          <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #f0f0f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
              <span style={{ color: '#111', fontSize: 16, fontWeight: 700 }}>Total</span>
              <span style={{ color: '#E8531D', fontSize: 20, fontWeight: 800 }}>${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
            <div style={{ background: '#f8f5f2', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              <p style={{ margin: 0, color: '#888', fontSize: 12, lineHeight: 1.5 }}>Tu pedido será revisado por nuestro equipo. Te contactaremos para confirmar entrega y pago.</p>
            </div>
            <button onClick={handleCheckout} disabled={checkingOut} style={{
              width: '100%', padding: '14px', background: '#E8531D', border: 'none', borderRadius: 10,
              color: '#fff', fontSize: 15, fontWeight: 700, cursor: checkingOut ? 'not-allowed' : 'pointer', opacity: checkingOut ? 0.7 : 1
            }}>{checkingOut ? 'Enviando...' : 'Confirmar pedido'}</button>
          </div>
        </div>
      )}

      {/* Productos */}
      <div style={{ padding: '0 48px 48px' }}>
        {!productos.length ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aaa' }}>
            <p style={{ fontSize: 14 }}>No hay productos disponibles por el momento.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
            {productos.map(p => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 16, border: '1px solid #ebebeb', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.07)', transition: 'transform 0.2s', maxWidth: 340 }}>
                {/* Imagen con gradiente */}
                <div style={{ background: 'linear-gradient(135deg, #1a0a00 0%, #3d1a00 50%, #1a0a00 100%)', height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                  {p.imagen_url
                    ? <img src={p.imagen_url} alt={p.nombre} style={{ height: '100%', width: '100%', objectFit: 'contain', padding: 12, boxSizing: 'border-box' as const, filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.5))' }} />
                    : <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="1.2"><path d="M17 11h1a3 3 0 010 6h-1M9 12v6M13 12v6M14 7.5c-1 0-1.44.5-3 .5s-2-.5-3-.5-1.44.5-3 .5M3 8l.6 12a2 2 0 002 1.4h9.8a2 2 0 002-1.4L18 8z"/></svg>
                  }
                  {esTap && <span style={{ position: 'absolute', top: 10, right: 10, background: '#E8531D', color: '#fff', fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 99, letterSpacing: '0.05em' }}>PRECIO ESPECIAL</span>}
                  {/* Badges ABV / IBU */}
                  <div style={{ position: 'absolute', bottom: 10, left: 12, display: 'flex', gap: 6 }}>
                    {p.abv && <span style={{ background: 'rgba(232,83,29,0.9)', color: '#fff', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 99 }}>{p.abv}% ABV</span>}
                    {p.ibu && <span style={{ background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 11, fontWeight: 600, padding: '3px 8px', borderRadius: 99 }}>{p.ibu} IBU</span>}
                    <span style={{ background: 'rgba(0,0,0,0.5)', color: '#ddd', fontSize: 11, padding: '3px 8px', borderRadius: 99 }}>{p.estilo}</span>
                  </div>
                </div>
                <div style={{ padding: '14px 16px' }}>
                  <p style={{ margin: '0 0 4px', fontWeight: 800, fontSize: 17, color: '#111', letterSpacing: '-0.02em' }}>{p.nombre}</p>
                  {p.descripcion && <p style={{ color: '#999', fontSize: 12.5, margin: '0 0 12px', lineHeight: 1.6 }}>{p.descripcion}</p>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {unidadesConfig.map(u => {
                      const precio = getPrecio(p, u.key)
                      const stock = getStock(p, u.key)
                      const key = `${p.id}-${u.key}`
                      const inCart = cart.find(i => i.producto_id === key)
                      if (!precio) return null
                      return (
                        <div key={u.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: inCart ? '#fff5f2' : '#f8f8f8', border: `1px solid ${inCart ? '#E8531D40' : '#ebebeb'}`, borderRadius: 8 }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: '#111' }}>{u.label}</p>
                            <p style={{ margin: 0, fontSize: 11, color: '#aaa' }}>{u.sublabel} · {stock > 0 ? <span style={{ color: '#10b981' }}>{stock} disp.</span> : <span style={{ color: '#ef4444' }}>Sin stock</span>}</p>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ color: '#E8531D', fontWeight: 700, fontSize: 14 }}>${precio.toLocaleString('es-MX')}</span>
                            {stock > 0 ? (inCart ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <button onClick={() => updateQty(key, -1)} style={{ width: 24, height: 24, borderRadius: '50%', background: '#ebebeb', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                                <span style={{ fontSize: 14, fontWeight: 700, minWidth: 16, textAlign: 'center' }}>{inCart.cantidad}</span>
                                <button onClick={() => updateQty(key, 1)} style={{ width: 24, height: 24, borderRadius: '50%', background: '#E8531D', border: 'none', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>+</button>
                              </div>
                            ) : (
                              <button onClick={() => addToCart(p, u.key)} style={{ padding: '5px 12px', background: '#111', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Agregar</button>
                            )) : <span style={{ color: '#ddd', fontSize: 12 }}>Agotado</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
