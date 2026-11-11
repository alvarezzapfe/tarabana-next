/**
 * Que descontar del inventario al entregar un pedido.
 *
 * Puro y aparte de la ruta para poder probarlo: el descuento de stock es la
 * operacion que corrompe datos en silencio si se equivoca, porque nadie
 * revisa el inventario renglon por renglon despues de cada entrega.
 *
 * Dos reglas que no son obvias:
 *
 *   - `stock_latas` son latas SUELTAS, un contador independiente de las cajas
 *     (ver docs/SCHEMA_NOTES.md: no coincide con caja12*12 + caja24*24 en 7
 *     de 10 productos). Entregar una caja NO descuenta latas sueltas: la caja
 *     ya es su propio inventario. Lo unico que toca `stock_latas` es vender
 *     latas sueltas o armar un mix.
 *
 *   - Los movimientos se CONSOLIDAN por producto y columna. Si no, dos
 *     partidas del mismo producto en el mismo pedido se pisan: cada una
 *     calcula el nuevo stock desde el mismo valor original y la segunda
 *     escritura borra la primera, asi que solo se descuenta una.
 */
import { ETIQUETA_COLUMNA, columnaStockDe, type ColumnaStock } from './unidades.ts'

/** Un estilo dentro de una caja mixta. */
export type EstiloMix = {
  producto_id: string
  nombre?: string | null
  latas?: number | null
  cantidad_latas?: number | null
}

export type ItemEntrega = {
  producto_id: string
  unidad: string | null
  cantidad: number | null
  metadata?: { estilos?: EstiloMix[] | null } | null
  /** Solo para los mensajes de error. */
  nombre?: string | null
}

export type Movimiento = {
  producto_id: string
  columna: ColumnaStock
  /** Unidades a descontar, siempre positivo. */
  cantidad: number
  /** Como nombrar esto en un mensaje de error. */
  etiqueta: string
}

export type ErrorEntrega = { error: string }

/**
 * Latas por estilo cuando el mix no las trae.
 *
 * Es el default que ya tenia la ruta: cuatro estilos de 6 completan la caja
 * de 24. Se conserva el comportamiento, solo deja de ser un numero magico.
 */
export const LATAS_POR_ESTILO_DEFAULT = 6

/**
 * Los movimientos de stock de una entrega, ya consolidados.
 *
 * Devuelve un error en vez de adivinar si alguna partida trae una
 * presentacion que no mapea a una columna: descontar de la columna
 * equivocada es peor que no descontar.
 */
export function movimientosDeEntrega(items: ItemEntrega[]): Movimiento[] | ErrorEntrega {
  const acum = new Map<string, Movimiento>()

  const sumar = (producto_id: string, columna: ColumnaStock, cantidad: number, etiqueta: string) => {
    if (cantidad <= 0) return
    const clave = `${producto_id}|${columna}`
    const previo = acum.get(clave)
    if (previo) previo.cantidad += cantidad
    else acum.set(clave, { producto_id, columna, cantidad, etiqueta })
  }

  for (const item of items) {
    const cantidad = Number(item.cantidad) || 0
    if (cantidad <= 0) continue

    // ── Caja mixta ──────────────────────────────────────────
    // Se arma con latas sueltas de varios estilos, asi que descuenta
    // `stock_latas` de cada estilo y nunca la columna de cajas.
    if (item.unidad === 'mix24' && item.metadata?.estilos?.length) {
      for (const estilo of item.metadata.estilos) {
        if (!estilo?.producto_id) {
          return { error: 'Una caja mixta del pedido trae un estilo sin producto.' }
        }
        const porCaja = Number(estilo.latas ?? estilo.cantidad_latas ?? LATAS_POR_ESTILO_DEFAULT) || 0
        sumar(estilo.producto_id, 'stock_latas', cantidad * porCaja, `latas de ${estilo.nombre || 'la caja mixta'}`)
      }
      continue
    }

    // ── Presentacion normal ─────────────────────────────────
    const columna = columnaStockDe(item.unidad)
    if (!columna) {
      return {
        error: `No se puede descontar stock: presentacion no reconocida (${item.unidad ?? 'vacia'}) en ${item.nombre || 'un producto'}.`,
      }
    }

    // A proposito NO se toca `stock_latas` aqui aunque la presentacion sea
    // una caja. Ver la nota de arriba: las latas sueltas son otro inventario.
    sumar(item.producto_id, columna, cantidad, ETIQUETA_COLUMNA[columna])
  }

  return [...acum.values()]
}

/**
 * Agrupa los movimientos por producto, para escribir UNA vez por producto.
 *
 * Es lo que evita que dos columnas del mismo producto se pisen entre si.
 */
export function porProducto(movimientos: Movimiento[]): Map<string, Movimiento[]> {
  const mapa = new Map<string, Movimiento[]>()
  for (const m of movimientos) {
    const lista = mapa.get(m.producto_id)
    if (lista) lista.push(m)
    else mapa.set(m.producto_id, [m])
  }
  return mapa
}
