import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { logAction } from '../../../../../../src/lib/audit'

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const service = createServiceClient()

  const { data: pedido } = await service.from('pedidos').select('total, status, cliente_id').eq('id', id).single()

  const { error: itemsError } = await service.from('pedido_items').delete().eq('pedido_id', id)
  if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

  const { error } = await service.from('pedidos').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (user) {
    const { data: profile } = await service.from('profiles').select('role').eq('id', user.id).single()
    logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile?.role || '', accion: 'pedido.eliminar', entidad: 'pedidos', entidadId: id, detalle: { total: pedido?.total, status: pedido?.status, cliente_id: pedido?.cliente_id }, request })
  }

  return NextResponse.json({ ok: true })
}
