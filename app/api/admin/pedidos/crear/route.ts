import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { enviarInvitacionCliente } from '../../../../../src/lib/invitar-cliente'
import { calcularPedido } from '../../../../../src/lib/calcular-pedido'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { cliente_id, condiciones_pago, items, notas, vendedor_id, descuento_tipo, descuento_valor, descuento_motivo } = await request.json()

  if (!cliente_id) return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 })

  // Validate discount server-side
  if (descuento_tipo) {
    if (!['porcentaje', 'monto'].includes(descuento_tipo)) return NextResponse.json({ error: 'Tipo de descuento invalido' }, { status: 400 })
    if (!descuento_valor || descuento_valor <= 0) return NextResponse.json({ error: 'Valor de descuento invalido' }, { status: 400 })
    if (descuento_tipo === 'porcentaje' && descuento_valor > 100) return NextResponse.json({ error: 'El porcentaje no puede ser mayor a 100' }, { status: 400 })
    if (!descuento_motivo?.trim()) return NextResponse.json({ error: 'El motivo del descuento es obligatorio' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Sin productos' }, { status: 400 })

  const service = createServiceClient()

  // Derive price suffix from CLIENT's nivel_precio, not from body
  const { data: clienteProfile } = await service.from('profiles').select('nivel_precio').eq('id', cliente_id).single()
  if (!clienteProfile) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 400 })
  const nivelPrecio = clienteProfile.nivel_precio || 'publico'
  const esMayorista = nivelPrecio === 'taproom' || nivelPrecio === 'distribuidor'
  const sufijo = esMayorista ? 'taproom' as const : 'publico' as const

  // Load products
  const { data: productos } = await service.from('productos').select('*').eq('activo', true)
  const stockMap = new Map<string, Record<string, any>>(productos?.map((p: any) => [p.id, p]) || [])

  // Admin items use { producto_id: "uuid-unidad", cantidad, metadata }
  const result = calcularPedido(items, stockMap, sufijo, esMayorista, (item) => {
    const parts = (item.producto_id as string).split('-')
    const unidad = parts[parts.length - 1]
    const productoId = parts.slice(0, -1).join('-')
    return { productoId, unidad }
  })

  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status })

  // Validate monto discount doesn't exceed subtotal
  if (descuento_tipo === 'monto' && descuento_valor > result.total) {
    return NextResponse.json({ error: 'El descuento no puede ser mayor al subtotal' }, { status: 400 })
  }

  const { data: pedido, error } = await supabase.from('pedidos').insert({
    cliente_id, vendedor_id: vendedor_id || null, tipo_precio: result.sufijo,
    condiciones_pago: condiciones_pago || 'contado', notas: notas || null,
    total: result.total, status: 'confirmado',
    descuento_tipo: descuento_tipo || null,
    descuento_valor: descuento_tipo ? descuento_valor : null,
    descuento_motivo: descuento_tipo ? descuento_motivo : null,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  await supabase.from('pedido_items').insert(
    result.items.map(i => ({ ...i, pedido_id: pedido.id }))
  )

  // Generar comision si hay vendedor asignado
  if (vendedor_id) {
    const { data: vendedor } = await supabase.from('vendedores').select('comision_pct').eq('id', vendedor_id).single()
    if (vendedor) {
      const monto_comision = (result.total * vendedor.comision_pct) / 100
      await supabase.from('comisiones').insert({
        pedido_id: pedido.id, vendedor_id, monto_pedido: result.total,
        porcentaje: vendedor.comision_pct, monto_comision,
      })
    }
  }

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'pedido.crear', entidad: 'pedidos', entidadId: pedido.id, detalle: { cliente_id, total: result.total, vendedor_id: vendedor_id || null }, request })

  // Fire-and-forget: invite client on first order
  const { count: pedidoCount } = await supabase.from('pedidos').select('id', { count: 'exact', head: true }).eq('cliente_id', cliente_id)
  if (pedidoCount === 1) {
    enviarInvitacionCliente(cliente_id, { pedidoId: pedido.id, pedidoTotal: result.total }).then(r => {
      if (r.sent) logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'cliente.invitacion', entidad: 'profiles', entidadId: cliente_id, detalle: { pedido_id: pedido.id, trigger: 'primer_pedido' }, request })
    })
  }

  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
