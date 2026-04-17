import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()

  const { error } = await supabase.from('puntos_venta').update({
    nombre: body.nombre,
    tipo: body.tipo,
    direccion: body.direccion,
    ciudad: body.ciudad,
    zona: body.zona || null,
    estado: body.estado,
    lat: body.lat || null,
    lng: body.lng || null,
    imagen_url: body.imagen_url || null,
    telefono: body.telefono || null,
    instagram: body.instagram || null,
    horario: body.horario || null,
    notas: body.notas || null,
    fecha_inicio: body.fecha_inicio || null,
    fecha_fin: body.fecha_fin || null,
    orden: body.orden || 0,
    updated_at: new Date().toISOString(),
  }).eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // Fetch the record to check for image
  const { data: pdv } = await supabase.from('puntos_venta').select('imagen_url').eq('id', id).single()

  // Delete image from storage if exists
  if (pdv?.imagen_url) {
    const url = new URL(pdv.imagen_url)
    const pathParts = url.pathname.split('/storage/v1/object/public/puntos-venta-imgs/')
    if (pathParts[1]) {
      await supabase.storage.from('puntos-venta-imgs').remove([pathParts[1]])
    }
  }

  const { error } = await supabase.from('puntos_venta').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
