import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

/**
 * Borra un pedido y sus partidas.
 *
 * El guard de abajo NO es decorativo: esta ruta borra con el service client,
 * que salta RLS, y antes solo comprobaba que hubiera sesion — para el log.
 * Cualquier usuario autenticado, un comprador del portal incluido, podia
 * borrar cualquier pedido llamandola directo. Esconder el boton en la UI no
 * es lo mismo que negar la operacion.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: perfil } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(perfil?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const service = createServiceClient()

  const { data: pedido } = await service.from('pedidos').select('total, status, cliente_id').eq('id', id).single()
  if (!pedido) return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

  const { error: itemsError } = await service.from('pedido_items').delete().eq('pedido_id', id)
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const { error } = await service.from('pedidos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: perfil?.role || '',
    accion: 'pedido.eliminar', entidad: 'pedidos', entidadId: id,
    detalle: { total: pedido.total, status: pedido.status, cliente_id: pedido.cliente_id },
    request,
  })

  return NextResponse.json({ ok: true })
}
