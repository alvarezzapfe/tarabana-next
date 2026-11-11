/**
 * Stock disponible: fisico menos lo ya comprometido en pedidos abiertos.
 *
 * El problema que resuelve. El inventario (`productos.stock_*`) solo se
 * descuenta al marcar un pedido como ENTREGADO (ver la ruta de status). Entre
 * que se levanta un pedido y que se entrega, esas cajas ya estan vendidas pero
 * siguen contadas como existencias, asi que el POS ofrecia —y dejaba vender—
 * producto que ya tenia dueno. Medido contra produccion el 2026-11-10: 16
 * combinaciones producto/presentacion con cantidades comprometidas invisibles,
 * la peor con 47 de 200 latas.
 *
 * El modelo, entonces, son tres numeros por celda de inventario:
 *
 *   fisico       lo que dice la columna stock_*
 *   comprometido partidas de pedidos ni entregados ni cancelados
 *   disponible   fisico - comprometido
 *
 * Y la propiedad que lo hace consistente: al entregar, el pedido deja de
 * comprometer Y el fisico baja en la misma cantidad, asi que `disponible` no
 * se mueve. No hay doble descuento porque el comprometido no es un registro
 * propio, es una consulta sobre los pedidos abiertos.
 *
 * OJO con quien pregunta: el comprometido tiene que calcularse con una vista
 * GLOBAL de los pedidos. La policy `pedidos_vendedor_read` acota al vendedor a
 * los suyos, asi que si esto se calculara con su sesion veria menos
 * comprometido del que hay y por lo tanto mas disponible — justo la sobreventa
 * que se quiere cerrar. Por eso lo sirve una ruta con el service client
 * (app/api/admin/pedidos/comprometido) y no un select desde el navegador.
 */
import { movimientosDeEntrega, type ItemEntrega } from './stock-entrega.ts'
import { COLUMNAS_STOCK, type ColumnaStock, type FilaStock } from './unidades.ts'

/**
 * Status en los que un pedido YA NO compromete inventario.
 *
 * 'entregado' porque ya se descontó del fisico, y 'cancelado' porque no va a
 * salir. Todo lo demas —pendiente, confirmado, enviado— si compromete: en
 * ninguno de esos el fisico se ha movido todavia. Por eso la regla se escribe
 * como una lista de EXCLUSION y no de inclusion: un status nuevo compromete
 * por default, que es el lado seguro.
 */
export const STATUS_SIN_COMPROMISO: readonly string[] = ['entregado', 'cancelado']

export const comprometePedido = (status: string | null | undefined): boolean =>
  !!status && !STATUS_SIN_COMPROMISO.includes(status)

/** Clave de una celda de inventario: un producto en una columna de stock. */
export const claveStock = (producto_id: string, columna: ColumnaStock): string =>
  `${producto_id}|${columna}`

export type PedidoAbierto = {
  id: string
  status: string
  pedido_items?: ItemEntrega[] | null
}

/**
 * Una partida que no se pudo mapear a ninguna columna de inventario.
 *
 * Se reporta en vez de adivinar. En produccion existe una: el pedido #0E1B76
 * tiene una partida de Brisa con `unidad` en null.
 */
export type PartidaSinClasificar = {
  pedido_id: string
  producto_id: string
  unidad: string | null
  cantidad: number
  nombre: string | null
  motivo: string
}

export type Comprometido = {
  /** claveStock -> unidades comprometidas. */
  por: Map<string, number>
  sinClasificar: PartidaSinClasificar[]
}

/**
 * Lo comprometido por los pedidos abiertos, por producto y columna.
 *
 * Reusa `movimientosDeEntrega` —la misma funcion que decide que descontar al
 * entregar— para que "comprometido" y "lo que se va a descontar" no puedan
 * divergir: si una caja mixta se desglosa en latas por estilo al entregar,
 * tiene que comprometer latas por estilo tambien.
 *
 * Se la llama UNA PARTIDA A LA VEZ, a proposito. Esa funcion aborta el lote
 * completo cuando una partida trae una presentacion que no reconoce, que es lo
 * correcto al entregar (mejor no descontar que descontar mal) pero inaceptable
 * aqui: una sola fila mala dejaria toda la matriz del POS sin numeros. Partida
 * por partida, el fallo queda aislado y se reporta en `sinClasificar`.
 */
export type OpcionesComprometido = {
  /**
   * Pedido a dejar FUERA del conteo.
   *
   * Lo usa la edicion de partidas: al revisar si un cambio cabe en el
   * inventario, lo que ese mismo pedido ya tenia apartado tiene que volver a
   * estar disponible. Sin esto, un pedido de 10 cajas no se podria editar a 11
   * aunque hubiera 40 libres, porque sus propias 10 lo bloquearian.
   */
  excepto?: string
}

export function comprometidoDe(pedidos: PedidoAbierto[], opciones: OpcionesComprometido = {}): Comprometido {
  const por = new Map<string, number>()
  const sinClasificar: PartidaSinClasificar[] = []

  for (const pedido of pedidos) {
    if (opciones.excepto && pedido.id === opciones.excepto) continue
    if (!comprometePedido(pedido.status)) continue

    for (const item of pedido.pedido_items || []) {
      const cantidad = Number(item.cantidad) || 0
      if (cantidad <= 0) continue

      const movimientos = movimientosDeEntrega([item])
      if ('error' in movimientos) {
        sinClasificar.push({
          pedido_id: pedido.id,
          producto_id: item.producto_id,
          unidad: item.unidad,
          cantidad,
          nombre: item.nombre ?? null,
          motivo: movimientos.error,
        })
        continue
      }

      for (const m of movimientos) {
        const clave = claveStock(m.producto_id, m.columna)
        por.set(clave, (por.get(clave) || 0) + m.cantidad)
      }
    }
  }

  return { por, sinClasificar }
}

export type Disponibilidad = {
  fisico: number
  comprometido: number
  /**
   * fisico - comprometido. PUEDE SER NEGATIVO y no se recorta a cero: si
   * alguien bajo el fisico a mano por debajo de lo ya vendido, el numero en
   * rojo es la senal de que hay que reponer o renegociar. Recortarlo
   * esconderia justo eso.
   */
  disponible: number
}

export type ProductoStock = { id: string } & FilaStock

/** Los tres numeros de una celda. `comprometido` ausente cuenta como cero. */
export function disponibilidadDe(
  producto: ProductoStock,
  columna: ColumnaStock,
  comprometido: Map<string, number>
): Disponibilidad {
  const fisico = Number(producto[columna] ?? 0) || 0
  const comp = comprometido.get(claveStock(producto.id, columna)) || 0
  return { fisico, comprometido: comp, disponible: fisico - comp }
}

/**
 * La tabla completa: una entrada por producto y columna de stock.
 *
 * Incluye las celdas en cero para que quien consulte no tenga que distinguir
 * "no hay entrada" de "no hay stock".
 */
export function stockDisponible(
  productos: ProductoStock[],
  comprometido: Map<string, number>
): Map<string, Disponibilidad> {
  const mapa = new Map<string, Disponibilidad>()
  for (const p of productos) {
    for (const col of COLUMNAS_STOCK) {
      mapa.set(claveStock(p.id, col), disponibilidadDe(p, col, comprometido))
    }
  }
  return mapa
}

/**
 * Lo disponible de una celda, para validar. Si el producto no esta en el
 * catalogo que se paso, da 0: no se puede vender lo que no se conoce.
 */
export function disponibleDe(
  productoId: string,
  columna: ColumnaStock,
  fisico: number,
  comprometido: Map<string, number>
): number {
  return fisico - (comprometido.get(claveStock(productoId, columna)) || 0)
}

// ── Serializacion ───────────────────────────────────────────
//
// El comprometido viaja del servidor al navegador como JSON, y un Map no
// sobrevive a JSON.stringify.

export const comprometidoAJSON = (por: Map<string, number>): Record<string, number> =>
  Object.fromEntries(por)

export const comprometidoDeJSON = (plano: Record<string, number> | null | undefined): Map<string, number> =>
  new Map(Object.entries(plano || {}))
