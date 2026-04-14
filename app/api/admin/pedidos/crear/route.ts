import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin', 'ventas'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { cliente_id, tipo_precio, items, notas, total, vendedor_id } = await request.json()

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    cliente_id, vendedor_id: vendedor_id || null, tipo_precio, notas, total, status: 'confirmado'
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const pedidoItems = items.map((item: any) => {
    const [producto_id] = item.producto_id.split('-')
    return { pedido_id: pedido.id, producto_id, cantidad: item.cantidad, precio_unitario: item.precio }
  })

  await supabase.from('pedido_items').insert(pedidoItems)

  // Generar comisión si hay vendedor asignado
  if (vendedor_id) {
    const { data: vendedor } = await supabase.from('vendedores').select('comision_pct').eq('id', vendedor_id).single()
    if (vendedor) {
      const monto_comision = (total * vendedor.comision_pct) / 100
      await supabase.from('comisiones').insert({
        pedido_id: pedido.id,
        vendedor_id,
        monto_pedido: total,
        porcentaje: vendedor.comision_pct,
        monto_comision
      })
    }
  }

  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
