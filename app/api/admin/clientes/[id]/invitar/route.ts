import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../../src/lib/roles'
import { logAction } from '../../../../../../src/lib/audit'
import { enviarInvitacionCliente } from '../../../../../../src/lib/invitar-cliente'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const result = await enviarInvitacionCliente(id, { force: true })

  if (result.sent) {
    logAction({
      actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
      accion: 'cliente.invitacion', entidad: 'profiles', entidadId: id,
      detalle: { trigger: 'manual' },
      request,
    })
    return NextResponse.json({ ok: true })
  }

  if (result.skipped === 'ya_activada') {
    return NextResponse.json({ error: 'Este cliente ya activo su cuenta.' }, { status: 400 })
  }

  return NextResponse.json({ error: result.error || 'Error al enviar invitacion' }, { status: 400 })
}
