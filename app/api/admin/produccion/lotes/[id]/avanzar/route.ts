import { NextResponse } from 'next/server'
import { logAction } from '../../../../../../../src/lib/audit'
import { ETAPAS, type Etapa } from '../../../../../../../src/lib/produccion'
import { guardEscritura, mensajeDeError } from '../../../guard'

/**
 * Mueve la etapa del lote.
 *
 * Toda la validacion de verdad vive en `public.avanzar_lote()`: los
 * requisitos (no envasar sin FG, no liberar sin envasado), el orden de las
 * etapas y —cuando la etapa destino es 'liberado'— la entrada a inventario,
 * en UNA transaccion. Si la entrada falla, la etapa tampoco se movio.
 *
 * Esta ruta no reimplementa nada de eso. Solo valida que la etapa pedida sea
 * una de las del enum (asi un typo da 400 y no un error de Postgres) y pasa
 * el actor, que es lo que la funcion no puede sacar de auth.uid() al ser
 * llamada con service_role.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const body = await request.json().catch(() => null)
  const etapa = body?.etapa as Etapa | undefined

  if (!etapa || !(ETAPAS as readonly string[]).includes(etapa)) {
    return NextResponse.json({ error: 'Etapa inválida' }, { status: 400 })
  }

  const nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim() : null

  const { data, error } = await actor.service.rpc('avanzar_lote', {
    p_lote_id: id,
    p_etapa: etapa,
    p_actor: actor.id,
    p_nota: nota,
  })

  if (error) {
    // Los `raise` de la funcion son reglas de negocio con mensaje escrito
    // para una persona ("No se puede envasar el lote BRA-26-014 sin FG
    // registrada"). Van tal cual al cliente.
    const status = error.code === 'P0002' ? 404 : 409
    return NextResponse.json({ error: mensajeDeError(error) }, { status })
  }

  const lote = Array.isArray(data) ? data[0] : data

  logAction({
    actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    accion: etapa === 'liberado' ? 'lote.liberar' : 'lote.avanzar',
    entidad: 'lotes', entidadId: id,
    detalle: { folio: lote?.folio ?? null, etapa, nota },
    request,
  })

  return NextResponse.json({ ok: true, lote })
}
