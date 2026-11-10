import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { isSuperAdmin } from '../../../../../src/lib/roles'
import { logAction } from '../../../../../src/lib/audit'
import { PRECIO_MAX, esColumnaPrecio } from '../../../../../src/lib/precios'

/**
 * Guarda la lista de precios por lote.
 *
 * Escribe EXACTAMENTE las diez columnas que ya lee `precioUnitario` y ninguna
 * otra: `esColumnaPrecio` es una lista blanca derivada de `FILAS_PRECIO`, asi
 * que un body armado a mano no puede colar `stock_latas` ni una columna
 * inventada de caja.
 *
 * Un cero NO se acepta. En todo el sistema significa "sin precio configurado"
 * (`precioUnitario` devuelve 0 y `calcularPedido` rechaza la venta), asi que
 * guardarlo seria vaciar la celda en silencio; para eso tendria que existir una
 * operacion de borrado explicita, que esta pantalla no tiene.
 *
 * Solo PESOS ENTEROS. `precioUnitario` redondea la lata suelta pero no la
 * caja, asi que un precio con centavos se cobraria inconsistente entre las dos
 * presentaciones; con enteros cuadran sin tener que tocar ese redondeo.
 *
 * Permiso `isSuperAdmin`, el mismo que los precios de la ficha del producto:
 * mover un precio cambia lo que se le cobra a todos los clientes.
 *
 * Cada producto se audita con su antes/despues. Va el diff y no el body, para
 * que en Actividad se lea que precio cambio y de cuanto a cuanto, que es la
 * pregunta que alguien le hace a un historial de precios.
 */

/** Tope del lote. Hay once productos en el catalogo; esto es el guard. */
const MAX_PRODUCTOS = 200

type Cambio = { id: string; precios: Record<string, number> }

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isSuperAdmin(profile?.role)) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let body: { cambios?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
  }

  if (!Array.isArray(body.cambios) || body.cambios.length === 0) {
    return NextResponse.json({ error: 'No hay cambios que guardar.' }, { status: 400 })
  }
  if (body.cambios.length > MAX_PRODUCTOS) {
    return NextResponse.json({ error: `Maximo ${MAX_PRODUCTOS} productos por lote.` }, { status: 400 })
  }

  // Se valida TODO antes de escribir nada: un lote a medio aplicar deja la
  // lista de precios en un estado que nadie pidio.
  const cambios: Cambio[] = []
  const vistos = new Set<string>()

  for (const crudo of body.cambios) {
    if (!crudo || typeof crudo !== 'object') {
      return NextResponse.json({ error: 'Hay un cambio con forma invalida.' }, { status: 400 })
    }
    const { id, precios } = crudo as { id?: unknown; precios?: unknown }

    if (typeof id !== 'string' || !id) {
      return NextResponse.json({ error: 'Hay un cambio sin producto.' }, { status: 400 })
    }
    if (vistos.has(id)) {
      return NextResponse.json({ error: `El producto ${id} viene dos veces en el lote.` }, { status: 400 })
    }
    vistos.add(id)

    if (!precios || typeof precios !== 'object' || Array.isArray(precios)) {
      return NextResponse.json({ error: `Sin precios para el producto ${id}.` }, { status: 400 })
    }

    const limpio: Record<string, number> = {}
    for (const [columna, valor] of Object.entries(precios as Record<string, unknown>)) {
      if (!esColumnaPrecio(columna)) {
        return NextResponse.json({ error: `"${columna}" no es una columna de precio.` }, { status: 400 })
      }
      if (typeof valor !== 'number' || !Number.isFinite(valor)) {
        return NextResponse.json({ error: `El precio de ${columna} no es un numero.` }, { status: 400 })
      }
      if (valor <= 0) {
        return NextResponse.json({ error: `El precio de ${columna} tiene que ser mayor que 0.` }, { status: 400 })
      }
      if (!Number.isInteger(valor)) {
        return NextResponse.json(
          { error: `El precio de ${columna} tiene centavos; solo se aceptan pesos enteros.` },
          { status: 400 }
        )
      }
      if (valor > PRECIO_MAX) {
        return NextResponse.json({ error: `El precio de ${columna} se pasa del tope.` }, { status: 400 })
      }
      limpio[columna] = valor
    }

    if (Object.keys(limpio).length === 0) {
      return NextResponse.json({ error: `Sin precios para el producto ${id}.` }, { status: 400 })
    }
    cambios.push({ id, precios: limpio })
  }

  const service = createServiceClient()

  const ids = cambios.map(c => c.id)
  // Las columnas van literales y no armadas con COLUMNAS_PRECIO porque un
  // select dinamico impide que Supabase infiera el tipo del resultado. Que no
  // se desincronicen lo cuida el test de precios.test.ts, que verifica que
  // COLUMNAS_PRECIO sean exactamente estas diez.
  const { data: previos } = await service
    .from('productos')
    .select('id, nombre, precio_lata_publico, precio_lata_taproom, precio_barril_pet_publico, precio_barril_pet_taproom, precio_barril_acero_publico, precio_barril_acero_taproom, precio_barril10_pet_publico, precio_barril10_pet_taproom, precio_barril10_acero_publico, precio_barril10_acero_taproom')
    .in('id', ids)

  // `createServiceClient` devuelve un cliente sin tipar, asi que la fila se
  // anota aqui en vez de dejar un `any` implicito.
  const porId = new Map<string, Record<string, unknown>>(
    ((previos || []) as Record<string, unknown>[]).map(p => [String(p.id), p])
  )
  const faltantes = ids.filter(id => !porId.has(id))
  if (faltantes.length) {
    return NextResponse.json(
      { error: `Un producto del lote ya no esta en el catalogo (${faltantes[0]}).` },
      { status: 400 }
    )
  }

  let celdas = 0

  for (const cambio of cambios) {
    const previo = porId.get(cambio.id)!

    // Solo las columnas que de verdad cambian: reescribir el mismo precio
    // ensuciaria el audit_log con entradas que no dicen nada.
    const diff: Record<string, { from: number | null; to: number }> = {}
    const update: Record<string, number> = {}
    for (const [columna, valor] of Object.entries(cambio.precios)) {
      const antes = previo[columna] === null || previo[columna] === undefined ? null : Number(previo[columna])
      if (antes === valor) continue
      diff[columna] = { from: antes, to: valor }
      update[columna] = valor
    }
    if (Object.keys(update).length === 0) continue

    const { error } = await service.from('productos').update(update).eq('id', cambio.id)
    if (error) {
      return NextResponse.json(
        { error: `No se pudo guardar ${previo.nombre as string}: ${error.message}` },
        { status: 400 }
      )
    }
    celdas += Object.keys(update).length

    logAction({
      actorId: user.id, actorEmail: user.email!, actorRole: profile!.role,
      accion: 'producto.precios', entidad: 'productos', entidadId: cambio.id,
      detalle: { nombre: previo.nombre, changes: diff },
      request,
    })
  }

  return NextResponse.json({ ok: true, celdas, productos: cambios.length })
}
