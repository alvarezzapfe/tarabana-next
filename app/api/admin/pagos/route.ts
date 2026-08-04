import { createServerSupabaseClient, createServiceClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../src/lib/roles'
import { logAction } from '../../../../src/lib/audit'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { pedido_id, monto, metodo, referencia, fecha_pago, notas } = await request.json()

  if (!pedido_id || !monto || monto <= 0) {
    return NextResponse.json({ error: 'pedido_id y monto > 0 son requeridos' }, { status: 400 })
  }

  const service = createServiceClient()

  // Check saldo
  const { data: saldo } = await service.from('pedidos_saldo').select('saldo, total').eq('id', pedido_id).single()
  if (!saldo) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })
  if (monto > saldo.saldo) {
    return NextResponse.json({ error: `El monto ($${monto}) excede el saldo del pedido ($${saldo.saldo})` }, { status: 400 })
  }

  const { data: pago, error } = await service.from('pagos').insert({
    pedido_id,
    monto,
    metodo: metodo || null,
    referencia: referencia || null,
    fecha_pago: fecha_pago || new Date().toISOString(),
    notas: notas || null,
    registrado_por: user.id,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pago.registrar', entidad: 'pagos', entidadId: pago.id,
    detalle: { pedido_id, monto, metodo, saldo_anterior: saldo.saldo, saldo_resultante: saldo.saldo - monto },
    request,
  })

  return NextResponse.json({ ok: true, id: pago.id })
}
