import { NextResponse } from 'next/server'
import { logAction } from '../../../../../src/lib/audit'
import { guardEscritura, mensajeDeError } from '../guard'

/**
 * Alta de lote.
 *
 * El folio NO viaja en el body: lo pone el trigger `lote_folio_trg` desde el
 * `folio_prefijo` del producto y el año de la cocción. Aceptarlo del cliente
 * dejaria inventar folios y chocar con el consecutivo.
 *
 * La etapa inicial es el default de la columna ('planeado') y tampoco se
 * acepta: un lote que nace en 'liberado' se saltaria los requisitos y la
 * entrada a inventario.
 */
export async function POST(request: Request) {
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  if (!body.producto_id) {
    return NextResponse.json({ error: 'Selecciona el producto' }, { status: 400 })
  }

  const litros = parseFloat(body.litros_objetivo)
  if (!Number.isFinite(litros) || litros <= 0) {
    return NextResponse.json({ error: 'Los litros objetivo deben ser mayores que 0' }, { status: 400 })
  }

  // `fecha_coccion` decide el año del folio, asi que una fecha basura daria
  // un folio basura. Se valida el formato, no solo que venga algo.
  const fecha = typeof body.fecha_coccion === 'string' ? body.fecha_coccion : ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha de cocción inválida' }, { status: 400 })
  }

  const generacion = body.levadura_generacion ? parseInt(body.levadura_generacion, 10) : null
  if (generacion !== null && (!Number.isInteger(generacion) || generacion < 0)) {
    return NextResponse.json({ error: 'La generación de levadura debe ser un entero >= 0' }, { status: 400 })
  }

  const texto = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

  const { data, error } = await actor.service
    .from('lotes')
    .insert({
      producto_id: body.producto_id,
      tanque_id: body.tanque_id || null,
      litros_objetivo: litros,
      fecha_coccion: fecha,
      levadura_cepa: texto(body.levadura_cepa),
      levadura_proveedor: texto(body.levadura_proveedor),
      levadura_generacion: generacion,
      created_by: actor.id,
    })
    .select('id, folio')
    .single()

  if (error) {
    return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })
  }

  logAction({
    actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    accion: 'lote.crear', entidad: 'lotes', entidadId: data.id,
    detalle: { folio: data.folio, producto_id: body.producto_id, litros_objetivo: litros },
    request,
  })

  return NextResponse.json({ ok: true, id: data.id, folio: data.folio }, { status: 201 })
}
