import { NextResponse } from 'next/server'
import { guardEscritura, mensajeDeError } from '../../../guard'

/**
 * Registra una lectura de la bitacora.
 *
 * No escribe en audit_log: una lectura de gravedad no es un cambio de estado
 * del sistema, es un dato de proceso, y su rastro es la propia fila con su
 * `created_by`. Llenar audit_log con una entrada por cada medicion diaria
 * ahogaria la bitacora de acciones que si importa.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await guardEscritura()
  if (!g.ok) return g.respuesta
  const { actor } = g

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })

  const fila: Record<string, unknown> = { lote_id: id, created_by: actor.id }

  // Cadena vacia = no capturado (null), nunca 0: una temperatura de 0 °C y
  // una temperatura sin medir no son lo mismo, y guardar 0 por la segunda
  // mentiria en la bitacora.
  const num = (campo: string, min: number, max: number, etiqueta: string): string | null => {
    const v = body[campo]
    if (v === undefined || v === null || v === '') { fila[campo] = null; return null }
    const n = typeof v === 'number' ? v : parseFloat(String(v))
    if (!Number.isFinite(n)) return `${etiqueta} no es un número`
    if (n < min || n > max) return `${etiqueta} fuera de rango (${min} a ${max})`
    fila[campo] = n
    return null
  }

  for (const [campo, min, max, etiqueta] of [
    ['gravedad', 0, 99.999, 'La gravedad'] as const,
    ['temperatura_c', -99, 999, 'La temperatura'] as const,
    ['ph', 0, 14, 'El pH'] as const,
  ]) {
    const err = num(campo, min, max, etiqueta)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  fila.nota = typeof body.nota === 'string' && body.nota.trim() ? body.nota.trim() : null

  // Mismo criterio que el constraint `lote_lecturas_algo_chk`: una lectura
  // sin ninguna medicion ni nota es ruido en la grafica. Se comprueba aqui
  // para dar un mensaje legible en vez del texto del constraint.
  if (fila.gravedad === null && fila.temperatura_c === null && fila.ph === null && fila.nota === null) {
    return NextResponse.json(
      { error: 'Captura al menos una medición o una nota' },
      { status: 400 }
    )
  }

  // El lote tiene que existir y estar vivo. Sin esto, una lectura puede
  // quedar colgada de un lote borrado y aparecer en una grafica vacia.
  const { data: lote } = await actor.service
    .from('lotes').select('id, deleted_at').eq('id', id).single()

  if (!lote || lote.deleted_at) {
    return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })
  }

  const { data, error } = await actor.service
    .from('lote_lecturas')
    .insert(fila)
    .select('id, lote_id, fecha, gravedad, temperatura_c, ph, nota')
    .single()

  if (error) return NextResponse.json({ error: mensajeDeError(error) }, { status: 400 })

  return NextResponse.json({ ok: true, lectura: data }, { status: 201 })
}
