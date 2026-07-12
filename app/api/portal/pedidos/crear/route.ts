import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { cliente_id, tipo_precio, items, notas, total } = await request.json()

  // Validate stock before creating
  const { data: productos } = await supabase.from('productos').select('id, nombre, stock_caja24')
  const stockMap = new Map(productos?.map(p => [p.id, p]) || [])

  for (const item of items) {
    if (item.tipo === 'caja24' && item.producto_id) {
      const prod = stockMap.get(item.producto_id)
      if (!prod || prod.stock_caja24 < item.cantidad) {
        return NextResponse.json({ error: `Stock insuficiente para ${prod?.nombre || 'producto'}. Disponible: ${prod?.stock_caja24 || 0} cajas.` }, { status: 400 })
      }
    } else if (item.tipo === 'mix24' && item.metadata?.estilos) {
      for (const estilo of item.metadata.estilos) {
        const prod = stockMap.get(estilo.producto_id)
        if (!prod || prod.stock_caja24 <= 0) {
          return NextResponse.json({ error: `Stock insuficiente de ${prod?.nombre || 'producto'} para armar el mix.` }, { status: 400 })
        }
      }
    }
  }

  // Create pedido
  const { data: pedido, error } = await supabase.from('pedidos').insert({
    cliente_id, tipo_precio, notas, total, status: 'pendiente', pagado: false,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Create pedido_items
  const pedidoItems = items.map((item: any) => ({
    pedido_id: pedido.id,
    producto_id: item.producto_id,
    unidad: item.tipo,       // 'caja24' or 'mix24'
    cantidad: item.cantidad,
    precio_unitario: item.precio,
    subtotal: item.cantidad * item.precio,
    metadata: item.metadata || null,
  }))

  await supabase.from('pedido_items').insert(pedidoItems)
  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
