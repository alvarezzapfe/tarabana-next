import { NextResponse } from 'next/server'
import { logAction } from '../../../../../src/lib/audit'
import { mensajeDeError } from '../guard'
import { guardTanques, leerTanque } from '../tanques-lib'

/**
 * Lista y alta de tanques. El guard y la validacion viven en ../tanques-lib,
 * compartidos con tanques/[id]/route.ts.
 */

export async function GET() {
  const g = await guardTanques()
  if (!g.ok) return g.respuesta

  const { data, error } = await g.service
    .from('tanques')
    .select('id, nombre, tipo, capacidad_litros, activo, notas')
    .order('nombre')

  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })
  return NextResponse.json(data || [])
}

export async function POST(request: Request) {
  const g = await guardTanques()
  if (!g.ok) return g.respuesta

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const leido = leerTanque(body)
  if ('error' in leido) return NextResponse.json({ error: leido.error }, { status: 400 })

  const { data, error } = await g.service
    .from('tanques')
    .insert(leido.valores)
    .select('id, nombre, tipo, capacidad_litros, activo, notas')
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 400
    return NextResponse.json({ error: mensajeDeError(error) }, { status })
  }

  logAction({
    actorId: g.id, actorEmail: g.email, actorRole: g.role,
    accion: 'tanque.crear', entidad: 'tanques', entidadId: data.id,
    detalle: { nombre: data.nombre, tipo: data.tipo, capacidad_litros: data.capacidad_litros },
    request,
  })

  return NextResponse.json(data, { status: 201 })
}
