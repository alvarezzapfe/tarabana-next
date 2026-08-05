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

  const { costo_envio, paqueteria, guia_envio } = await request.json()
  if (costo_envio === undefined || costo_envio < 0) {
    return NextResponse.json({ error: 'costo_envio debe ser >= 0' }, { status: 400 })
  }

  const { data: prev } = await supabase.from('pedidos').select('costo_envio, total').eq('id', id).single()
  if (!prev) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  await supabase.from('pedidos').update({
    costo_envio,
    paqueteria: paqueteria || null,
    guia_envio: guia_envio || null,
    envio_cotizado_at: new Date().toISOString(),
  }).eq('id', id)

  // Fetch updated saldo
  const { data: saldo } = await supabase.from('pedidos_saldo').select('saldo').eq('id', id).single()

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pedido.envio', entidad: 'pedidos', entidadId: id,
    detalle: { costo_envio_anterior: prev.costo_envio, costo_envio_nuevo: costo_envio, paqueteria, guia_envio },
    request,
  })

  return NextResponse.json({ ok: true, saldo: saldo?.saldo ?? null })
}
