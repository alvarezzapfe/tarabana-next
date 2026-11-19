import { NextResponse } from 'next/server'
import { logAction } from '../../../../../../src/lib/audit'
import { mensajeDeError } from '../../guard'
import { guardTanques, leerTanque } from '../../tanques-lib'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTanques()
  if (!g.ok) return g.respuesta

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const leido = leerTanque(body, true)
  if ('error' in leido) return NextResponse.json({ error: leido.error }, { status: 400 })
  if (Object.keys(leido.valores).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  // Dar de baja un tanque con un lote vivo adentro lo sacaria del grid de
  // activos mientras todavia tiene cerveza. El lote no desaparece, pero deja
  // de contarse en "tanques ocupados" y nadie se enteraria.
  if (leido.valores.activo === false) {
    const { data: ocupantes } = await g.service
      .from('lotes')
      .select('folio')
      .eq('tanque_id', id)
      .is('deleted_at', null)
      .not('etapa', 'in', '(liberado,descartado)')

    if (ocupantes && ocupantes.length > 0) {
      // `createServiceClient` devuelve un cliente sin tipos (usa `require`),
      // asi que la fila se anota aqui.
      const folios = (ocupantes as { folio: string | null }[])
        .map(o => o.folio).filter(Boolean).join(', ')
      return NextResponse.json(
        {
          error: `El tanque tiene ${ocupantes.length === 1 ? 'el lote' : 'los lotes'} ${folios} adentro. Libéralo o reasigna antes de darlo de baja.`,
        },
        { status: 409 }
      )
    }
  }

  const { data, error } = await g.service
    .from('tanques')
    .update(leido.valores)
    .eq('id', id)
    .select('id, nombre, tipo, capacidad_litros, activo, notas')
    .single()

  if (error) {
    const status = error.code === '23505' ? 409 : 400
    return NextResponse.json({ error: mensajeDeError(error) }, { status })
  }
  if (!data) return NextResponse.json({ error: 'Tanque no encontrado' }, { status: 404 })

  logAction({
    actorId: g.id, actorEmail: g.email, actorRole: g.role,
    accion: 'tanque.actualizar', entidad: 'tanques', entidadId: id,
    detalle: { campos: leido.valores },
    request,
  })

  return NextResponse.json(data)
}

/**
 * Borra el tanque.
 *
 * Borrado fisico y no soft-delete, a diferencia de los lotes: un tanque es
 * un catalogo de equipo, no un hecho historico. Para "ya no lo uso" existe
 * `activo = false`, que es lo que conserva el historial — `lotes.tanque_id`
 * tiene `on delete set null`, asi que borrarlo DE VERDAD deja a los lotes
 * viejos sin decir en que tanque se hicieron.
 *
 * Por eso solo se permite si ningun lote lo referencia, ni vivo ni cerrado.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardTanques()
  if (!g.ok) return g.respuesta

  const { data: tanque } = await g.service
    .from('tanques').select('nombre').eq('id', id).single()
  if (!tanque) return NextResponse.json({ error: 'Tanque no encontrado' }, { status: 404 })

  const { count } = await g.service
    .from('lotes')
    .select('id', { count: 'exact', head: true })
    .eq('tanque_id', id)

  if (count && count > 0) {
    return NextResponse.json(
      {
        error: `${count} lote${count === 1 ? '' : 's'} se hicieron en este tanque. Borrarlo les quitaría ese dato del historial; desactívalo en vez de borrarlo.`,
      },
      { status: 409 }
    )
  }

  const { error } = await g.service.from('tanques').delete().eq('id', id)
  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })

  logAction({
    actorId: g.id, actorEmail: g.email, actorRole: g.role,
    accion: 'tanque.borrar', entidad: 'tanques', entidadId: id,
    detalle: { nombre: tanque.nombre },
    request,
  })

  return NextResponse.json({ ok: true })
}
