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

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const service = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { items, notas } = await request.json()

  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
  }

  // Sufijo de precio derivado del perfil, nunca del body
  const { data: profile } = await service.from('profiles').select('tipo_consumidor').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 400 })
  const sufijo = (profile.tipo_consumidor === 'tiene_tap' || profile.tipo_consumidor === 'tiene_bar')
    ? 'taproom' as const
    : 'publico' as const

  // Cargar productos con todas las columnas de precio
  const { data: productos } = await service.from('productos').select('*').eq('activo', true)
  const stockMap = new Map<string, Record<string, any>>(productos?.map((p: any) => [p.id, p]) || [])

  // Validar stock y calcular precios server-side
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
      // Mix: 4 estilos × 6 latas = 24 latas, producto_id = primer estilo
      const estilos: Array<{ producto_id: string; nombre: string; cantidad_latas: number }> = item.metadata.estilos
      const col = precioColumn('caja24', sufijo)

      // Validar stock de cada estilo
      for (const estilo of estilos) {
        const prod = stockMap.get(estilo.producto_id)
        if (!prod || prod.stock_caja24 <= 0) {
          return NextResponse.json({ error: `Stock insuficiente de ${prod?.nombre || 'producto'} para armar el mix.` }, { status: 400 })
        }
      }

      // Precio = promedio de los 4 estilos (precio caja24)
      const precios = estilos.map(e => {
        const prod = stockMap.get(e.producto_id)
        return prod ? (prod[col] as number) : 0
      })
      const precioUnitario = Math.round(precios.reduce((s, p) => s + p, 0) / estilos.length)
      const subtotal = cantidad * precioUnitario

      const productoId = estilos[0].producto_id
      pedidoItems.push({
        producto_id: productoId,
        unidad: 'mix24',
        cantidad,
        precio_unitario: precioUnitario,
        subtotal,
        metadata: item.metadata,
      })
      totalCalculado += subtotal
    } else {
      // Item normal (caja24, caja12, barril, pieza)
      const productoId: string | undefined = item.producto_id || item.metadata?.estilos?.[0]?.producto_id
      if (!productoId) {
        return NextResponse.json({ error: 'Item sin producto_id' }, { status: 400 })
      }

      const prod = stockMap.get(productoId)
      if (!prod) {
        return NextResponse.json({ error: `Producto no encontrado` }, { status: 400 })
      }

      // Validar stock según unidad
      const stockKey = `stock_${unidad}` as string
      const stockDisponible = (prod[stockKey] as number) ?? 0
      if (stockDisponible < cantidad) {
        return NextResponse.json({ error: `Stock insuficiente para ${prod.nombre}. Disponible: ${stockDisponible}.` }, { status: 400 })
      }

      const col = precioColumn(unidad, sufijo)
      const precioUnitario = (prod[col] as number) ?? 0
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
