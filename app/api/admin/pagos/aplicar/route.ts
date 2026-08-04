import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { cliente_id, monto_total, metodo, referencia, fecha_pago, aplicaciones } = await request.json()

  if (!cliente_id || !monto_total || monto_total <= 0 || !Array.isArray(aplicaciones) || aplicaciones.length === 0) {
    return NextResponse.json({ error: 'Datos incompletos' }, { status: 400 })
  }

  // Validate sum matches
  const sumaAplicaciones = aplicaciones.reduce((s: number, a: any) => s + (a.monto || 0), 0)
  if (Math.abs(sumaAplicaciones - monto_total) > 0.01) {
    return NextResponse.json({ error: `La suma de aplicaciones ($${sumaAplicaciones}) no coincide con el monto total ($${monto_total})` }, { status: 400 })
  }

  // Basic validation before calling RPC
  for (const app of aplicaciones) {
    if (!app.pedido_id || !app.monto || app.monto <= 0) {
      return NextResponse.json({ error: 'Cada aplicación requiere pedido_id y monto > 0' }, { status: 400 })
    }
  }

  const service = createServiceClient()
  const ref = referencia || `DEP-${Date.now()}`
  const fechaPago = fecha_pago || new Date().toISOString().slice(0, 10)

  // Atomic: validation + insert in a single transaction via RPC
  const { error } = await service.rpc('aplicar_pago', {
    p_cliente_id: cliente_id,
    p_metodo: metodo || null,
    p_referencia: ref,
    p_fecha_pago: fechaPago,
    p_aplicaciones: aplicaciones.map((a: any) => ({ pedido_id: a.pedido_id, monto: a.monto })),
    p_registrado_por: user.id,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'pago.aplicar', entidad: 'pagos',
    detalle: {
      cliente_id, monto_total, metodo, referencia: ref,
      aplicaciones: aplicaciones.map((a: any) => ({ pedido_id: a.pedido_id, monto: a.monto })),
    },
    request,
  })

  return NextResponse.json({ ok: true, count: aplicaciones.length })
}
