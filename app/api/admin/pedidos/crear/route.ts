import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { crearPedido } from '../../../../../src/lib/crear-pedido'

/**
 * Crea un pedido desde el formulario del admin.
 *
 * La regla de negocio vive en `src/lib/crear-pedido.ts`, compartida con la
 * importacion masiva de Excel: aqui solo va la autenticacion y el mapeo del
 * body a la llamada.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role) && !isVendedor(profile?.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()

  const resultado = await crearPedido(
    {
      cliente_id: body.cliente_id,
      items: body.items,
      condiciones_pago: body.condiciones_pago,
      notas: body.notas,
      vendedor_id: body.vendedor_id,
      costo_envio: body.costo_envio,
      descuento_tipo: body.descuento_tipo,
      descuento_valor: body.descuento_valor,
      descuento_motivo: body.descuento_motivo,
    },
    {
      userId: user.id,
      userEmail: user.email!,
      role: profile!.role,
      db: supabase,
      service: createServiceClient(),
      request,
    }
  )

  if (!resultado.ok) return NextResponse.json({ error: resultado.error }, { status: resultado.status })
  return NextResponse.json({ ok: true, pedido_id: resultado.pedido_id })
}
