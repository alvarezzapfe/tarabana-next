import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

/**
 * Marca un corte como pagado o lo regresa a pendiente.
 *
 * Body: { accion: 'pagar' | 'despagar' }
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { accion } = await request.json()
  if (accion !== 'pagar' && accion !== 'despagar') {
    return NextResponse.json({ error: "accion debe ser 'pagar' o 'despagar'" }, { status: 400 })
  }

  const { data: corte } = await supabase
    .from('comision_cortes')
    .select('id, vendedor_id, periodo, comision, estado')
    .eq('id', id)
    .maybeSingle()
  if (!corte) return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 })

  const pagar = accion === 'pagar'
  if (pagar && corte.estado === 'pagada') return NextResponse.json({ error: 'Ese corte ya esta pagado' }, { status: 409 })
  if (!pagar && corte.estado === 'pendiente') return NextResponse.json({ error: 'Ese corte no esta pagado' }, { status: 409 })

  // El CHECK `comision_cortes_pagado_coherente` exige que pagado_at vaya de
  // la mano del estado, asi que los dos campos se mueven juntos.
  const { error } = await supabase
    .from('comision_cortes')
    .update({
      estado: pagar ? 'pagada' : 'pendiente',
      pagado_at: pagar ? new Date().toISOString() : null,
      pagado_por: pagar ? user.id : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: pagar ? 'comision.corte.pagar' : 'comision.corte.despagar',
    entidad: 'comision_cortes', entidadId: id,
    detalle: { vendedor_id: corte.vendedor_id, periodo: corte.periodo, comision: corte.comision },
    request,
  })

  return NextResponse.json({ ok: true })
}

/**
 * Reabre el mes: borra el snapshot.
 *
 * Que la fila exista es lo que significa "cerrado", asi que reabrir es
 * borrarla; el mes vuelve a calcularse en vivo. Solo se permite si no esta
 * pagado: un corte pagado es un movimiento de dinero ya hecho y primero hay
 * que desmarcar el pago, a sabiendas.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Solo super admin' }, { status: 403 })

  const { data: corte } = await supabase
    .from('comision_cortes')
    .select('id, vendedor_id, periodo, base, comision, estado')
    .eq('id', id)
    .maybeSingle()
  if (!corte) return NextResponse.json({ error: 'Corte no encontrado' }, { status: 404 })

  if (corte.estado === 'pagada') {
    return NextResponse.json(
      { error: 'Ese corte ya esta pagado. Desmarca el pago antes de reabrir el mes.' },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('comision_cortes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'comision.corte.reabrir', entidad: 'comision_cortes', entidadId: id,
    detalle: { vendedor_id: corte.vendedor_id, periodo: corte.periodo, base: corte.base, comision: corte.comision },
    request,
  })

  return NextResponse.json({ ok: true })
}
