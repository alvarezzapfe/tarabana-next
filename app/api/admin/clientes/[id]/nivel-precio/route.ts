import { createServerSupabaseClient, createServiceClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { NIVELES_PRECIO } from '../../../../../../src/lib/clientes'
import { logAction } from '../../../../../../src/lib/audit'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { nivel_precio } = await request.json()
  const valid = (NIVELES_PRECIO as readonly { value: string }[]).some(n => n.value === nivel_precio)
  if (!valid) return NextResponse.json({ error: 'Nivel de precio inválido' }, { status: 400 })

  const service = createServiceClient()

  const { data: target } = await service.from('profiles').select('nivel_precio, email').eq('id', id).single()
  if (!target) return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })

  await service.from('profiles').update({ nivel_precio }).eq('id', id)

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'cliente.nivel_precio', entidad: 'profiles', entidadId: id,
    detalle: { from: target.nivel_precio, to: nivel_precio, client_email: target.email },
    request,
  })

  return NextResponse.json({ ok: true })
}
