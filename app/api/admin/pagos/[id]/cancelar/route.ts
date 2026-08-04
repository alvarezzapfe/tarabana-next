import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { motivo } = await request.json()
  if (!motivo || typeof motivo !== 'string' || motivo.trim().length === 0) {
    return NextResponse.json({ error: 'El motivo de cancelación es obligatorio' }, { status: 400 })
  }

  const service = createServiceClient()

  const { data: pago } = await service.from('pagos').select('*').eq('id', id).single()
  if (!pago) return NextResponse.json({ error: 'Pago no encontrado' }, { status: 404 })
  if (pago.cancelado_at) return NextResponse.json({ error: 'Este pago ya fue cancelado' }, { status: 400 })

  const { error } = await service.from('pagos').update({
    cancelado_at: new Date().toISOString(),
    cancelado_por: user.id,
    cancelado_motivo: motivo.trim(),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pago.cancelar', entidad: 'pagos', entidadId: id,
    detalle: { pedido_id: pago.pedido_id, monto: pago.monto, motivo: motivo.trim() },
    request,
  })

  return NextResponse.json({ ok: true })
}
