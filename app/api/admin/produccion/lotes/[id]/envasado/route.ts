import { NextResponse } from 'next/server'
import { logAction } from '../../../../../../../src/lib/audit'
import { COLUMNAS_STOCK, type ColumnaStock } from '../../../../../../../src/lib/unidades'
import { guardEscritura, mensajeDeError } from '../../../guard'

/**
 * Registra (o corrige) el envasado de una presentacion.
 *
 * `upsert` sobre (lote_id, producto_id, columna_stock): capturar la misma
 * presentacion otra vez CORRIGE la cantidad, no la suma. Sumar haria que un
 * doble clic inventara producto, y la merma saldria negativa sin que nadie
 * entienda por que.
 *
 * `litros_equivalentes` NO se manda: es columna generada en la DB a partir de
 * la cantidad y la presentacion. Aceptarla del cliente dejaria guardar
 * litros que no corresponden a las cajas, y la merma —que es la resta de las
 * dos— se volveria un numero inventado.
 *
 * Esto NO mueve stock. El stock se mueve al liberar el lote, en
 * `avanzar_lote()`, que es la unica transaccion que escribe
 * `productos.stock_*` y deja su `inventario_movimientos` con el lote_id.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const columna = body.columna_stock as ColumnaStock
  if (!columna || !(COLUMNAS_STOCK as readonly string[]).includes(columna)) {
    return NextResponse.json({ error: 'Presentación inválida' }, { status: 400 })
  }

  const cantidad = typeof body.cantidad === 'number' ? body.cantidad : parseInt(String(body.cantidad), 10)
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    return NextResponse.json({ error: 'La cantidad debe ser un entero mayor que 0' }, { status: 400 })
  }

  const { data: lote } = await actor.service
    .from('lotes').select('id, folio, etapa, producto_id, deleted_at').eq('id', id).single()

  if (!lote || lote.deleted_at) {
    return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
  }

  // Un lote liberado ya sumo estas cantidades a inventario: cambiarlas
  // dejaria el stock sin respaldo. La funcion SQL tambien lo impide por
  // etapa terminal, pero aqui el mensaje explica el por que.
  if (lote.etapa === 'liberado') {
    return NextResponse.json(
      { error: 'El lote ya está liberado: su envasado fue el que entró a inventario y no se edita. Corrige el stock en Inventario si hubo un error.' },
      { status: 409 }
    )
  }
  if (lote.etapa === 'descartado') {
    return NextResponse.json({ error: 'El lote está descartado.' }, { status: 409 })
  }

  // El producto del envasado es el del lote. No se acepta del body: envasar
  // el lote de Brasa dentro del stock de Caliza seria mover inventario de un
  // producto que nunca se produjo.
  const { data, error } = await actor.service
    .from('lote_envasado')
    .upsert(
      {
        lote_id: id,
        producto_id: lote.producto_id,
        columna_stock: columna,
        cantidad,
        created_by: actor.id,
      },
      { onConflict: 'lote_id,producto_id,columna_stock' }
    )
    .select('id, lote_id, producto_id, columna_stock, cantidad, litros_equivalentes')
    .single()

  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })

  logAction({
    actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    accion: 'lote.envasado', entidad: 'lote_envasado', entidadId: data.id,
    detalle: { folio: lote.folio, columna_stock: columna, cantidad, litros: data.litros_equivalentes },
    request,
  })

  return NextResponse.json({ ok: true, envasado: data }, { status: 201 })
}
