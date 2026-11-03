import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { enviarInvitacionCliente } from '../../../../../src/lib/invitar-cliente'
import { calcularPedido } from '../../../../../src/lib/calcular-pedido'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const esVendedor = isVendedor(profile?.role)
  if (!canWrite(profile?.role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { cliente_id, condiciones_pago, items, notas, vendedor_id, descuento_tipo, descuento_valor, descuento_motivo } = await request.json()

  if (!cliente_id) return NextResponse.json({ error: 'cliente_id requerido' }, { status: 400 })

  // El vendedor no pone descuentos. Se rechaza en vez de ignorarlo en silencio
  // para que un cliente manipulado no crea que el descuento se aplico.
  if (esVendedor && (descuento_tipo || descuento_valor)) {
    return NextResponse.json({ error: 'Un vendedor no puede aplicar descuentos' }, { status: 403 })
  }

  // Validate discount server-side
  if (descuento_tipo) {
    if (!['porcentaje', 'monto'].includes(descuento_tipo)) return NextResponse.json({ error: 'Tipo de descuento invalido' }, { status: 400 })
    if (!descuento_valor || descuento_valor <= 0) return NextResponse.json({ error: 'Valor de descuento invalido' }, { status: 400 })
    if (descuento_tipo === 'porcentaje' && descuento_valor > 100) return NextResponse.json({ error: 'El porcentaje no puede ser mayor a 100' }, { status: 400 })
    if (!descuento_motivo?.trim()) return NextResponse.json({ error: 'El motivo del descuento es obligatorio' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) return NextResponse.json({ error: 'Sin productos' }, { status: 400 })

  const service = createServiceClient()

  // Un vendedor solo puede levantar pedidos a su nombre: se ignora el
  // vendedor_id del body y se resuelve desde su ficha. Las policies de
  // pedidos tambien lo exigen (vendedor_id = mi_vendedor_id()), asi que un
  // valor ajeno fallaria igual en el insert; aqui se resuelve antes para dar
  // un error claro.
  let vendedorFinal: string | null = vendedor_id || null
  if (esVendedor) {
    const { data: ficha } = await service
      .from('vendedores')
      .select('id')
      .eq('profile_id', user.id)
      .eq('activo', true)
      .maybeSingle()
    if (!ficha) {
      return NextResponse.json(
        { error: 'Tu usuario no esta ligado a una ficha de vendedor activa. Pide a un super admin que la asigne.' },
        { status: 403 }
      )
    }
    vendedorFinal = ficha.id

    // Y solo a clientes de su cartera.
    const { data: cli } = await service
      .from('profiles')
      .select('vendedor_id')
      .eq('id', cliente_id)
      .maybeSingle()
    if (!cli || cli.vendedor_id !== ficha.id) {
      return NextResponse.json({ error: 'Ese cliente no esta en tu cartera' }, { status: 403 })
    }
  }

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
    cliente_id, vendedor_id: vendedorFinal, tipo_precio: result.sufijo,
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

  // La comision NO se genera aqui. Lo que habia era comision_pct fijo (12%)
  // sobre lo VENDIDO, y eso esta mal: en Fase 3 pasa a tramos marginales sobre
  // lo COBRADO. El pedido solo guarda vendedor_id; `comisiones` no se toca
  // hasta que ese calculo este definido.

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'pedido.crear', entidad: 'pedidos', entidadId: pedido.id, detalle: { cliente_id, total: result.total, vendedor_id: vendedorFinal }, request })

  // Fire-and-forget: invite client on first order
  // Con el service client a proposito: con el del usuario, RLS le muestra al
  // vendedor solo sus propios pedidos, asi que un cliente que ya tenia pedidos
  // de otro vendedor contaria 1 y se le reenviaria la invitacion.
  const { count: pedidoCount } = await service.from('pedidos').select('id', { count: 'exact', head: true }).eq('cliente_id', cliente_id)
  if (pedidoCount === 1) {
    enviarInvitacionCliente(cliente_id, { pedidoId: pedido.id, pedidoTotal: result.total }).then(r => {
      if (r.sent) logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'cliente.invitacion', entidad: 'profiles', entidadId: cliente_id, detalle: { pedido_id: pedido.id, trigger: 'primer_pedido' }, request })
    })
  }

  return NextResponse.json({ ok: true, pedido_id: pedido.id })
}
