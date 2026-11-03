import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canManageInventory } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canManageInventory(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const service = createServiceClient()

  // Check for pedido_items referencing this product
  const { count } = await service.from('pedido_items').select('id', { count: 'exact', head: true }).eq('producto_id', id)
  if (count && count > 0) {
    return NextResponse.json({ error: `Este producto tiene ${count} item${count > 1 ? 's' : ''} de pedido. Solo puede darse de baja.`, count }, { status: 409 })
  }

  const { data: prod } = await service.from('productos').select('nombre').eq('id', id).single()
  const { error } = await service.from('productos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'producto.eliminar', entidad: 'productos', entidadId: id, detalle: { nombre: prod?.nombre }, request })
  return NextResponse.json({ ok: true })
}
