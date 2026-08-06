/**
 * Shared order calculation logic.
 * Used by both portal and admin pedido creation endpoints.
 * Recalculates prices server-side — never trusts body prices.
 */

const PRECIO_COL: Record<string, string> = {
  caja12: 'precio_caja12',
  caja24: 'precio_caja24',
  barril_pet: 'precio_barril_pet',
  barril_acero: 'precio_barril_acero',
  pieza: 'precio',
}

const STOCK_COL: Record<string, string> = {
  caja12: 'stock_caja12',
  caja24: 'stock_caja24',
  barril_pet: 'stock_barril_pet',
  barril_acero: 'stock_barril_acero',
}

const MAYORISTA_ONLY = new Set(['barril_pet', 'barril_acero'])

function precioColumn(unidad: string, sufijo: 'taproom' | 'publico'): string {
  const base = PRECIO_COL[unidad]
  if (!base) return `precio_caja24_${sufijo}`
  return base === 'precio' ? `precio_${sufijo}` : `${base}_${sufijo}`
}

export interface PedidoItem {
  producto_id: string
  unidad: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  metadata: any
}

export interface CalcResult {
  items: PedidoItem[]
  total: number
  sufijo: 'taproom' | 'publico'
}

export interface CalcError {
  error: string
  status: number
}

/**
 * Validates and calculates order items server-side.
 *
 * @param rawItems - items from the request body
 * @param stockMap - Map<producto_id, producto_row> loaded with service_role
 * @param sufijo - 'taproom' | 'publico', derived from client's nivel_precio
 * @param esMayorista - whether the client has taproom/distribuidor nivel
 * @param parseProductoId - function to extract (producto_id, unidad) from the raw item.
 *   Portal sends { tipo, producto_id }, admin sends { producto_id: "uuid-unidad" }.
 */
export function calcularPedido(
  rawItems: any[],
  stockMap: Map<string, Record<string, any>>,
  sufijo: 'taproom' | 'publico',
  esMayorista: boolean,
  parseProductoId: (item: any) => { productoId: string; unidad: string },
): CalcResult | CalcError {

  const pedidoItems: PedidoItem[] = []
  let totalCalculado = 0

  for (const item of rawItems) {
    const { productoId, unidad } = parseProductoId(item)
    const cantidad: number = item.cantidad || 1

    if (unidad === 'mix24' && item.metadata?.estilos) {
      // ── MIX FLEXIBLE ──
      const estilos: Array<{ producto_id: string; nombre: string; latas: number }> = item.metadata.estilos
      const totalLatas = estilos.reduce((s, e) => s + (e.latas || 0), 0)
      if (totalLatas !== 24) {
        return { error: `El mix debe sumar exactamente 24 latas, tiene ${totalLatas}.`, status: 400 }
      }

      const col = precioColumn('caja24', sufijo)
      for (const estilo of estilos) {
        const prod = stockMap.get(estilo.producto_id)
        if (!prod) return { error: `Producto ${estilo.nombre || estilo.producto_id} no encontrado.`, status: 400 }
        const latasNecesarias = estilo.latas * cantidad
        if ((prod.stock_latas || 0) < latasNecesarias) {
          return { error: `Stock de latas insuficiente de ${prod.nombre}. Disponible: ${prod.stock_latas || 0}, necesitas ${latasNecesarias}.`, status: 400 }
        }
      }

      const precioUnitario = Math.round(estilos.reduce((s, e) => {
        const prod = stockMap.get(e.producto_id)
        const precioCaja = prod ? (prod[col] as number || 0) : 0
        return s + (precioCaja / 24) * e.latas
      }, 0))

      const subtotal = cantidad * precioUnitario
      pedidoItems.push({ producto_id: estilos[0].producto_id, unidad: 'mix24', cantidad, precio_unitario: precioUnitario, subtotal, metadata: item.metadata })
      totalCalculado += subtotal

    } else {
      // ── ITEM NORMAL ──
      if (!productoId) return { error: 'Item sin producto_id', status: 400 }

      if (MAYORISTA_ONLY.has(unidad) && !esMayorista) {
        return { error: `La presentacion ${unidad} no esta disponible para este nivel de precio.`, status: 403 }
      }

      const prod = stockMap.get(productoId)
      if (!prod) return { error: 'Producto no encontrado', status: 400 }

      const stockKey = STOCK_COL[unidad] || `stock_${unidad}`
      const stockDisponible = (prod[stockKey] as number) ?? 0
      if (stockDisponible < cantidad) {
        return { error: `Stock insuficiente para ${prod.nombre}. Disponible: ${stockDisponible}.`, status: 400 }
      }

      const colPrecio = precioColumn(unidad, sufijo)
      const precioUnitario = (prod[colPrecio] as number) ?? 0
      if (precioUnitario <= 0) {
        return { error: `${prod.nombre} no tiene precio configurado para ${unidad}.`, status: 400 }
      }

      const subtotal = cantidad * precioUnitario
      pedidoItems.push({ producto_id: productoId, unidad, cantidad, precio_unitario: precioUnitario, subtotal, metadata: item.metadata || null })
      totalCalculado += subtotal
    }
  }

  return { items: pedidoItems, total: totalCalculado, sufijo }
}
