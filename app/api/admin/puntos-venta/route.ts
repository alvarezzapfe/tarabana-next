import { createServerSupabaseClient } from '../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { data, error } = await supabase
    .from('puntos_venta')
    .select('*')
    .order('orden', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!['super_admin', 'admin'].includes(profile?.role || ''))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()

  const { data, error } = await supabase.from('puntos_venta').insert({
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
    activo: true,
    fecha_inicio: body.fecha_inicio || null,
    fecha_fin: body.fecha_fin || null,
    orden: body.orden || 0,
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ ok: true, id: data.id })
}
