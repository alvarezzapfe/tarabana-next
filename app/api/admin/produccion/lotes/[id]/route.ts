import { NextResponse } from 'next/server'
import { logAction } from '../../../../../../src/lib/audit'
import { guardEscritura, guardLectura, mensajeDeError } from '../../guard'

/**
 * GET: detalle del lote para la ficha (lecturas, envasado, eventos).
 *
 * No viaja con el tablero: son tres tablas por lote, y precargarlas para
 * veinte lotes para mirar uno traeria veinte veces lo que no se va a ver.
 *
 * PATCH: las medidas y la levadura. El folio, la etapa y las fechas de
 * etapa NO se aceptan aqui — la etapa se mueve por /avanzar, que es lo que
 * valida requisitos y deja el evento con su actor.
 */

/** Campos de texto que PATCH acepta. */
const TEXTO = ['levadura_cepa', 'levadura_proveedor', 'notas'] as const

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardLectura()
  if (!g.ok) return g.respuesta

  // Con el service client, pero el rol ya se valido arriba. Es lo mismo que
  // hacen las rutas de inventario: el guard de la ruta es la autorizacion y
  // las policies son la red debajo.
  const [{ data: lecturas }, { data: envasado }, { data: eventos }] = await Promise.all([
    g.actor.service
      .from('lote_lecturas')
      .select('id, lote_id, fecha, gravedad, temperatura_c, ph, nota')
      .eq('lote_id', id)
      .order('fecha', { ascending: false }),
    g.actor.service
      .from('lote_envasado')
      .select('id, lote_id, producto_id, columna_stock, cantidad, litros_equivalentes')
      .eq('lote_id', id)
      .order('columna_stock'),
    g.actor.service
      .from('lote_eventos')
      .select('id, lote_id, etapa_de, etapa_a, actor_id, nota, created_at')
      .eq('lote_id', id)
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({
    lecturas: lecturas || [],
    envasado: envasado || [],
    eventos: eventos || [],
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const update: Record<string, unknown> = {}

  // ── Numeros ──
  // Cadena vacia = borrar el dato (null), no 0. `parseFloat('') || 0` daria
  // 0, y un FG de 0 desbloquearia el envasado de un lote sin medir.
  const numero = (campo: string, valor: unknown, min: number, max: number): string | null => {
    if (valor === undefined) return null
    if (valor === '' || valor === null) { update[campo] = null; return null }
    const n = typeof valor === 'number' ? valor : parseFloat(String(valor))
    if (!Number.isFinite(n)) return `${campo} no es un número`
    if (n < min || n > max) return `${campo} fuera de rango (${min} a ${max})`
    update[campo] = n
    return null
  }

  for (const [campo, min, max] of [
    ['litros_objetivo', 0.01, 99_999_999] as const,
    ['litros_reales', 0, 99_999_999] as const,
    // numeric(5,3): la densidad de una cerveza vive entre 0.9 y 1.2. El tope
    // es el de la columna, no el de la fisica, para que el error lo de la
    // validacion y no la DB.
    ['og', 0, 99.999] as const,
    ['fg', 0, 99.999] as const,
  ]) {
    const err = numero(campo, body[campo], min, max)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  if (body.levadura_generacion !== undefined) {
    if (body.levadura_generacion === '' || body.levadura_generacion === null) {
      update.levadura_generacion = null
    } else {
      const n = parseInt(String(body.levadura_generacion), 10)
      if (!Number.isInteger(n) || n < 0) {
        return NextResponse.json({ error: 'La generación debe ser un entero >= 0' }, { status: 400 })
      }
      update.levadura_generacion = n
    }
  }

  // ── Texto ──
  for (const campo of TEXTO) {
    if (body[campo] === undefined) continue
    const v = typeof body[campo] === 'string' ? body[campo].trim() : ''
    update[campo] = v || null
  }

  // ── Tanque ──
  if (body.tanque_id !== undefined) {
    update.tanque_id = body.tanque_id || null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
  }

  // El constraint `lotes_gravedades_chk` ya impide fg > og en la DB, pero
  // comprobarlo aqui da un mensaje que se entiende. Hay que mirar el valor
  // GUARDADO de lo que no venga en este PATCH: capturar solo FG tiene que
  // validarse contra la OG que ya estaba.
  const { data: previo } = await actor.service
    .from('lotes')
    .select('og, fg, etapa, folio, deleted_at')
    .eq('id', id)
    .single()

  if (!previo || previo.deleted_at) {
    return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
  }

  const ogFinal = 'og' in update ? (update.og as number | null) : previo.og
  const fgFinal = 'fg' in update ? (update.fg as number | null) : previo.fg
  if (ogFinal !== null && fgFinal !== null && fgFinal > ogFinal) {
    return NextResponse.json(
      { error: `La FG (${fgFinal}) no puede ser mayor que la OG (${ogFinal}).` },
      { status: 400 }
    )
  }

  const { error } = await actor.service.from('lotes').update(update).eq('id', id)
  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })

  logAction({
    actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    accion: 'lote.actualizar', entidad: 'lotes', entidadId: id,
    detalle: { folio: previo.folio, campos: update },
    request,
  })

  return NextResponse.json({ ok: true })
}

/**
 * DELETE: soft-delete.
 *
 * `deleted_at`, nunca un borrado fisico: un lote liberado ya movio inventario
 * y su rastro es la explicacion de por que el stock subio. Un lote liberado
 * no se borra ni en suave.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const { data: lote } = await actor.service
    .from('lotes').select('folio, etapa, deleted_at').eq('id', id).single()

  if (!lote || lote.deleted_at) {
    return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
  }

  if (lote.etapa === 'liberado') {
    return NextResponse.json(
      { error: 'Un lote liberado ya subió a inventario y no se puede borrar. Si fue un error, ajusta el stock en Inventario.' },
      { status: 409 }
    )
  }

  const { error } = await actor.service
    .from('lotes').update({ deleted_at: new Date().toISOString() }).eq('id', id)

  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })

  logAction({
    actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    accion: 'lote.borrar', entidad: 'lotes', entidadId: id,
    detalle: { folio: lote.folio, etapa: lote.etapa },
    request,
  })

  return NextResponse.json({ ok: true })
}
