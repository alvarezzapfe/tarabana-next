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

  const service = createServiceClient()
  const { error } = await service.from('productos').update({ activo: false, descontinuado_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  logAction({ actorId: user.id, actorEmail: user.email!, actorRole: profile!.role, accion: 'producto.baja', entidad: 'productos', entidadId: id, request })
  return NextResponse.json({ ok: true })
}
