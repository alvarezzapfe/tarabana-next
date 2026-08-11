import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const body = await request.json()

  if (!body.nombre?.trim()) return NextResponse.json({ error: 'Nombre requerido' }, { status: 400 })
  if (!body.estilo?.trim()) return NextResponse.json({ error: 'Estilo requerido' }, { status: 400 })

  const service = createServiceClient()
  const { data, error } = await service.from('productos').insert({
    nombre: body.nombre.trim(),
    estilo: body.estilo.trim(),
    abv: body.abv ? parseFloat(body.abv) : null,
    ibu: body.ibu ? parseInt(body.ibu) : null,
    descripcion: body.descripcion || null,
    descripcion_larga: body.descripcion_larga || null,
    imagen_url: body.imagen_url || null,
    precio_lata_publico: parseFloat(body.precio_lata_publico) || null,
    precio_lata_taproom: parseFloat(body.precio_lata_taproom) || null,
    precio_barril_pet_publico: parseFloat(body.precio_barril_pet_publico) || null,
    precio_barril_pet_taproom: parseFloat(body.precio_barril_pet_taproom) || null,
    precio_barril_acero_publico: parseFloat(body.precio_barril_acero_publico) || null,
    precio_barril_acero_taproom: parseFloat(body.precio_barril_acero_taproom) || null,
    precio_barril10_pet_publico: parseFloat(body.precio_barril10_pet_publico) || null,
    precio_barril10_pet_taproom: parseFloat(body.precio_barril10_pet_taproom) || null,
    precio_barril10_acero_publico: parseFloat(body.precio_barril10_acero_publico) || null,
    precio_barril10_acero_taproom: parseFloat(body.precio_barril10_acero_taproom) || null,
    stock_latas: parseInt(body.stock_latas) || 0,
    stock_caja12: parseInt(body.stock_caja12) || 0,
    stock_caja24: parseInt(body.stock_caja24) || 0,
    stock_barril_pet: parseInt(body.stock_barril_pet) || 0,
    stock_barril_acero: parseInt(body.stock_barril_acero) || 0,
    stock_barril10_pet: parseInt(body.stock_barril10_pet) || 0,
    stock_barril10_acero: parseInt(body.stock_barril10_acero) || 0,
    activo: true,
  }).select('id').single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Ya existe un producto con ese nombre' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  logAction({
    actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
    accion: 'producto.crear', entidad: 'productos', entidadId: data.id,
    detalle: { nombre: body.nombre.trim(), estilo: body.estilo.trim() },
    request,
  })

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}
