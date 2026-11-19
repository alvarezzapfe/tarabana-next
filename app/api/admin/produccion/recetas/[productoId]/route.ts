import { NextResponse } from 'next/server'
import { logAction } from '../../../../../../src/lib/audit'
import { guardEscritura, mensajeDeError } from '../../guard'

/**
 * Receta de un producto. Una por producto, asi que la ruta se indexa por
 * `productoId` y no por el id de la receta: no hay que saber si ya existe
 * para guardarla.
 *
 * `PUT` y no POST/PATCH separados, por lo mismo: la operacion es "esta es la
 * receta de este producto", y un upsert expresa eso sin que el cliente tenga
 * que averiguar primero si hay fila.
 */

const NUMEROS: { campo: string; min: number; max: number; etiqueta: string; entero?: boolean }[] = [
  { campo: 'og_obj', min: 0.9, max: 1.2, etiqueta: 'La OG objetivo' },
  { campo: 'fg_obj', min: 0.9, max: 1.2, etiqueta: 'La FG objetivo' },
  { campo: 'temp_ferm_min', min: -5, max: 40, etiqueta: 'La temperatura mínima' },
  { campo: 'temp_ferm_max', min: -5, max: 40, etiqueta: 'La temperatura máxima' },
  { campo: 'dias_coccion', min: 0, max: 365, etiqueta: 'Los días de cocción', entero: true },
  { campo: 'dias_fermentacion', min: 0, max: 365, etiqueta: 'Los días de fermentación', entero: true },
  { campo: 'dias_maduracion', min: 0, max: 365, etiqueta: 'Los días de maduración', entero: true },
  { campo: 'dias_envasado', min: 0, max: 365, etiqueta: 'Los días de envasado', entero: true },
]

export async function PUT(request: Request, { params }: { params: Promise<{ productoId: string }> }) {
  const { productoId } = await params
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const fila: Record<string, unknown> = { producto_id: productoId }

  for (const { campo, min, max, etiqueta, entero } of NUMEROS) {
    const v = body[campo]
    // Cadena vacia = no capturado (null), nunca 0. La diferencia importa: un
    // `dias_maduracion` en null significa "no se sabe" y apaga la
    // proyeccion; un 0 significa "no madura" y la deja correr.
    if (v === undefined || v === null || v === '') { fila[campo] = null; continue }
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!Number.isFinite(n)) return NextResponse.json({ error: `${etiqueta} no es un número` }, { status: 400 })
    if (entero && !Number.isInteger(n)) return NextResponse.json({ error: `${etiqueta} debe ser un entero` }, { status: 400 })
    if (n < min || n > max) return NextResponse.json({ error: `${etiqueta} está fuera de rango (${min} a ${max})` }, { status: 400 })
    fila[campo] = n
  }

  for (const campo of ['levadura_cepa', 'levadura_proveedor', 'notas']) {
    const v = body[campo]
    fila[campo] = typeof v === 'string' && v.trim() ? v.trim() : null
  }

  // Los mismos dos checks que tiene la tabla, comprobados aqui para dar un
  // mensaje legible en vez del texto crudo del constraint.
  const og = fila.og_obj as number | null
  const fg = fila.fg_obj as number | null
  if (og !== null && fg !== null && fg > og) {
    return NextResponse.json({ error: `La FG objetivo (${fg}) no puede ser mayor que la OG (${og}).` }, { status: 400 })
  }
  const tmin = fila.temp_ferm_min as number | null
  const tmax = fila.temp_ferm_max as number | null
  if (tmin !== null && tmax !== null && tmin > tmax) {
    return NextResponse.json({ error: 'La temperatura mínima no puede ser mayor que la máxima.' }, { status: 400 })
  }

  const { data: producto } = await actor.service
    .from('productos').select('nombre').eq('id', productoId).single()
  if (!producto) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })

  const { data: previa } = await actor.service
    .from('recetas').select('id').eq('producto_id', productoId).maybeSingle()

  if (!previa) fila.created_by = actor.id

  const { data, error } = await actor.service
    .from('recetas')
    .upsert(fila, { onConflict: 'producto_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })

  logAction({
    actorId: actor.id, actorEmail: actor.email, actorRole: actor.role,
    accion: previa ? 'receta.actualizar' : 'receta.crear',
    entidad: 'recetas', entidadId: data.id,
    detalle: { producto: producto.nombre, ...fila },
    request,
  })

  return NextResponse.json({ ok: true, receta: data })
}
