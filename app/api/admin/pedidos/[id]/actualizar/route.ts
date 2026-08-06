import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()
  const { status, condiciones_pago, vendedor_id, notas, notas_internas, fecha_entrega, descuento_tipo, descuento_valor, descuento_motivo } = body

  // Validate discount
  if (descuento_tipo) {
    if (!['porcentaje', 'monto'].includes(descuento_tipo)) return NextResponse.json({ error: 'Tipo de descuento invalido' }, { status: 400 })
    if (!descuento_valor || descuento_valor <= 0) return NextResponse.json({ error: 'Valor de descuento invalido' }, { status: 400 })
    if (descuento_tipo === 'porcentaje' && descuento_valor > 100) return NextResponse.json({ error: 'El porcentaje no puede ser mayor a 100' }, { status: 400 })
    if (!descuento_motivo?.trim()) return NextResponse.json({ error: 'El motivo del descuento es obligatorio' }, { status: 400 })
  }

  // Get current state for audit diff
  const { data: prev } = await supabase.from('pedidos').select('status, condiciones_pago, vendedor_id, descuento_tipo, descuento_valor, descuento_motivo').eq('id', id).single()
  if (!prev) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const update: Record<string, any> = {
    status: status || prev.status,
    condiciones_pago: condiciones_pago || prev.condiciones_pago,
    vendedor_id: vendedor_id || null,
    notas: notas || null,
    notas_internas: notas_internas || null,
    fecha_entrega: fecha_entrega ? new Date(fecha_entrega).toISOString() : null,
    descuento_tipo: descuento_tipo || null,
    descuento_valor: descuento_tipo ? descuento_valor : null,
    descuento_motivo: descuento_tipo ? descuento_motivo : null,
  }

  const { error } = await supabase.from('pedidos').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Build audit detail with what changed
  const changes: Record<string, { from: any; to: any }> = {}
  if (prev.status !== update.status) changes.status = { from: prev.status, to: update.status }
  if (prev.condiciones_pago !== update.condiciones_pago) changes.condiciones_pago = { from: prev.condiciones_pago, to: update.condiciones_pago }
  if (prev.descuento_tipo !== update.descuento_tipo || prev.descuento_valor !== update.descuento_valor) {
    changes.descuento = { from: { tipo: prev.descuento_tipo, valor: prev.descuento_valor }, to: { tipo: update.descuento_tipo, valor: update.descuento_valor, motivo: update.descuento_motivo } }
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.editar', entidad: 'pedidos', entidadId: id,
    detalle: changes,
    request,
  })

  return NextResponse.json({ ok: true })
}
