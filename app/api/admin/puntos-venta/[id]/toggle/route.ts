import { createServerSupabaseClient } from '../../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PATCH(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data: pdv } = await supabase.from('puntos_venta').select('activo').eq('id', id).single()
  if (!pdv) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const { error } = await supabase.from('puntos_venta').update({ activo: !pdv.activo }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  return NextResponse.json({ ok: true, activo: !pdv.activo })
}
