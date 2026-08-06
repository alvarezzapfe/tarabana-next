import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { calcularPedido } from '../../../../../src/lib/calcular-pedido'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const service = createServiceClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { items, notas } = await request.json()
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'El carrito esta vacio' }, { status: 400 })
  }

  const { data: profile } = await service.from('profiles').select('nivel_precio').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Perfil no encontrado' }, { status: 400 })
  const nivelPrecio = profile.nivel_precio || 'publico'
  const esMayorista = nivelPrecio === 'taproom' || nivelPrecio === 'distribuidor'
  const sufijo = esMayorista ? 'taproom' as const : 'publico' as const

  const { data: productos } = await service.from('productos').select('*').eq('activo', true)
  const stockMap = new Map<string, Record<string, any>>(productos?.map((p: any) => [p.id, p]) || [])

  // Portal items use { tipo, producto_id }
  const result = calcularPedido(items, stockMap, sufijo, esMayorista, (item) => ({
    productoId: item.producto_id || '',
    unidad: item.tipo || 'caja24',
  }))

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  const { data: pedido, error } = await service.from('pedidos').insert({
    cliente_id: user.id,
    tipo_precio: result.sufijo,
    notas: notas || null,
    total: result.total,
    status: 'pendiente',
    pagado: false,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await service.from('pedido_items').insert(
    result.items.map(i => ({ ...i, pedido_id: pedido.id }))
  )

  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
