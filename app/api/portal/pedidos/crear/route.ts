import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { cliente_id, tipo_precio, items, notas, total } = await request.json()

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    cliente_id, tipo_precio, notas, total, status: 'pendiente', pagado: false
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const pedidoItems = items.map((item: any) => {
    const [producto_id] = item.producto_id.split('-')
    return { pedido_id: pedido.id, producto_id, cantidad: item.cantidad, precio_unitario: item.precio }
  })

  await supabase.from('pedido_items').insert(pedidoItems)
  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
