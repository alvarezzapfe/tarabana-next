import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

const PRECIO_COL: Record<string, string> = {
  caja12:       'precio_caja12',
  caja24:       'precio_caja24',
  barril_pet:   'precio_barril_pet',
  barril_acero: 'precio_barril_acero',
  pieza:        'precio',
}

function precioColumn(unidad: string, sufijo: 'taproom' | 'publico'): string {
  const base = PRECIO_COL[unidad]
  if (!base) return `precio_caja24_${sufijo}`
  return base === 'precio' ? `precio_${sufijo}` : `${base}_${sufijo}`
}

const STOCK_COL: Record<string, string> = {
  caja12: 'stock_caja12',
  caja24: 'stock_caja24',
  barril_pet: 'stock_barril_pet',
  barril_acero: 'stock_barril_acero',
}

// Presentaciones que requieren nivel mayorista
const MAYORISTA_ONLY = new Set(['barril_pet', 'barril_acero'])

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const service = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { items, notas } = await request.json()

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
  }

  // Sufijo de precio derivado de nivel_precio en el perfil, nunca del body
  const { data: profile } = await service.from('profiles').select('nivel_precio').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 400 })
  const nivelPrecio = profile.nivel_precio || 'publico'
  const esMayorista = nivelPrecio === 'taproom' || nivelPrecio === 'distribuidor'
  const sufijo = esMayorista ? 'taproom' as const : 'publico' as const

  // Cargar productos con todas las columnas
  const { data: productos } = await service.from('productos').select('*').eq('activo', true)
  const stockMap = new Map<string, Record<string, any>>(productos?.map((p: any) => [p.id, p]) || [])

  // Validar y calcular precios server-side
  const pedidoItems: Array<{
    producto_id: string
    unidad: string
    cantidad: number
    precio_unitario: number
    subtotal: number
    metadata: any
  }> = []
  let totalCalculado = 0

  for (const item of items) {
    const unidad: string = item.tipo
    const cantidad: number = item.cantidad

    if (unidad === 'mix24' && item.metadata?.estilos) {
      // ── MIX FLEXIBLE ──
      const estilos: Array<{ producto_id: string; nombre: string; latas: number }> = item.metadata.estilos

      // Validar que las latas sumen exactamente 24
      const totalLatas = estilos.reduce((s, e) => s + (e.latas || 0), 0)
      if (totalLatas !== 24) {
        return NextResponse.json({ error: `El mix debe sumar exactamente 24 latas, tiene ${totalLatas}.` }, { status: 400 })
      }

      // Validar stock de latas de cada estilo (mix se surte de stock_latas)
      const col = precioColumn('caja24', sufijo)
      for (const estilo of estilos) {
        const prod = stockMap.get(estilo.producto_id)
        if (!prod) {
          return NextResponse.json({ error: `Producto ${estilo.nombre || estilo.producto_id} no encontrado.` }, { status: 400 })
        }
        const latasNecesarias = estilo.latas * cantidad
        if ((prod.stock_latas || 0) < latasNecesarias) {
          return NextResponse.json({ error: `Stock de latas insuficiente de ${prod.nombre}. Disponible: ${prod.stock_latas || 0} latas, necesitas ${latasNecesarias}.` }, { status: 400 })
        }
      }

      // Precio: prorrateo por lata, recalculado server-side
      const precioUnitario = Math.round(estilos.reduce((s, e) => {
        const prod = stockMap.get(e.producto_id)
        const precioCaja = prod ? (prod[col] as number || 0) : 0
        return s + (precioCaja / 24) * e.latas
      }, 0))

      const subtotal = cantidad * precioUnitario
      pedidoItems.push({
        producto_id: estilos[0].producto_id,
        unidad: 'mix24',
        cantidad,
        precio_unitario: precioUnitario,
        subtotal,
        metadata: item.metadata,
      })
      totalCalculado += subtotal

    } else {
      // ── ITEM NORMAL (caja24, caja12, barril_pet) ──
      const productoId: string | undefined = item.producto_id
      if (!productoId) {
        return NextResponse.json({ error: 'Item sin producto_id' }, { status: 400 })
      }

      // Gate: barril solo para mayoristas
      if (MAYORISTA_ONLY.has(unidad) && !esMayorista) {
        return NextResponse.json({ error: `La presentación ${unidad} no está disponible para tu nivel de precio.` }, { status: 403 })
      }

      const prod = stockMap.get(productoId)
      if (!prod) {
        return NextResponse.json({ error: 'Producto no encontrado' }, { status: 400 })
      }

      // Validar stock según unidad
      const stockKey = STOCK_COL[unidad] || `stock_${unidad}`
      const stockDisponible = (prod[stockKey] as number) ?? 0
      if (stockDisponible < cantidad) {
        return NextResponse.json({ error: `Stock insuficiente para ${prod.nombre}. Disponible: ${stockDisponible}.` }, { status: 400 })
      }

      // Precio de la DB
      const colPrecio = precioColumn(unidad, sufijo)
      const precioUnitario = (prod[colPrecio] as number) ?? 0
      if (precioUnitario <= 0) {
        return NextResponse.json({ error: `${prod.nombre} no tiene precio configurado para esta presentación.` }, { status: 400 })
      }

      const subtotal = cantidad * precioUnitario
      pedidoItems.push({
        producto_id: productoId,
        unidad,
        cantidad,
        precio_unitario: precioUnitario,
        subtotal,
        metadata: item.metadata || null,
      })
      totalCalculado += subtotal
    }
  }

  // Crear pedido — cliente_id siempre de auth, total recalculado
  const { data: pedido, error } = await service.from('pedidos').insert({
    cliente_id: user.id,
    tipo_precio: sufijo,
    notas: notas || null,
    total: totalCalculado,
    status: 'pendiente',
    pagado: false,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await service.from('pedido_items').insert(
    pedidoItems.map(i => ({ ...i, pedido_id: pedido.id }))
  )

  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
