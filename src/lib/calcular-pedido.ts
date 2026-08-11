/**
 * Shared order calculation logic.
 * Used by both portal and admin pedido creation endpoints.
 * Recalculates prices server-side — never trusts body prices.
 *
 * PRICE MODEL:
 * - Latas (caja12, caja24, mix24): derived from precio_lata_* × quantity
 * - Barriles: use their own price columns directly
 */

const STOCK_COL: Record<string, string> = {
  caja12: 'stock_caja12',
  caja24: 'stock_caja24',
  barril_pet: 'stock_barril_pet',
  barril_acero: 'stock_barril_acero',
  barril10_pet: 'stock_barril10_pet',
  barril10_acero: 'stock_barril10_acero',
}

const UNIDAD_LABEL: Record<string, string> = {
  caja12: 'Caja 12',
  caja24: 'Caja 24',
  barril_pet: 'Barril 20L PET',
  barril_acero: 'Barril 20L Acero',
  barril10_pet: 'Barril 10L PET',
  barril10_acero: 'Barril 10L Acero',
  lata: 'Lata',
  mix24: 'Mix 24',
}

/**
 * Returns the unit price for a product + presentation + price level.
 * Lata-based presentations derive from precio_lata_*.
 * Barriles use their own columns.
 * Returns 0 if the base price is missing.
 */
export function precioUnitario(prod: Record<string, any>, unidad: string, sufijo: 'taproom' | 'publico'): number {
  const precioLata = prod[`precio_lata_${sufijo}`] as number || 0

  switch (unidad) {
    case 'caja12': return Math.round(precioLata * 12)
    case 'caja24': return Math.round(precioLata * 24)
    case 'lata':   return Math.round(precioLata)
    case 'barril_pet':    return (prod[`precio_barril_pet_${sufijo}`] as number) || 0
    case 'barril_acero':  return (prod[`precio_barril_acero_${sufijo}`] as number) || 0
    case 'barril10_pet':  return (prod[`precio_barril10_pet_${sufijo}`] as number) || 0
    case 'barril10_acero': return (prod[`precio_barril10_acero_${sufijo}`] as number) || 0
    default: return Math.round(precioLata * 24) // fallback to caja24
  }
}

/** Price per lata for mix prorrateo */
export function precioLata(prod: Record<string, any>, sufijo: 'taproom' | 'publico'): number {
  return Math.round(prod[`precio_lata_${sufijo}`] as number || 0)
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

      for (const estilo of estilos) {
        const prod = stockMap.get(estilo.producto_id)
        if (!prod) return { error: `Producto ${estilo.nombre || estilo.producto_id} no encontrado.`, status: 400 }
        const latasNecesarias = estilo.latas * cantidad
        if ((prod.stock_latas || 0) < latasNecesarias) {
          return { error: `Stock de latas insuficiente de ${prod.nombre}. Disponible: ${prod.stock_latas || 0}, necesitas ${latasNecesarias}.`, status: 400 }
        }
        if (precioLata(prod, sufijo) <= 0) {
          return { error: `${prod.nombre} no tiene precio por lata configurado.`, status: 400 }
        }
      }

      // Price: prorrateo por lata using precio_lata_*
      const precioMix = Math.round(estilos.reduce((s, e) => {
        const prod = stockMap.get(e.producto_id)!
        return s + precioLata(prod, sufijo) * e.latas
      }, 0))

      const subtotal = cantidad * precioMix
      pedidoItems.push({ producto_id: estilos[0].producto_id, unidad: 'mix24', cantidad, precio_unitario: precioMix, subtotal, metadata: item.metadata })
      totalCalculado += subtotal

    } else {
      // ── ITEM NORMAL ──
      if (!productoId) return { error: 'Item sin producto_id', status: 400 }

      const prod = stockMap.get(productoId)
      if (!prod) return { error: 'Producto no encontrado', status: 400 }

      const label = UNIDAD_LABEL[unidad] || unidad
      const precio = precioUnitario(prod, unidad, sufijo)
      if (precio <= 0) {
        return { error: `${prod.nombre} no tiene precio ${sufijo === 'taproom' ? 'mayorista' : 'publico'} configurado para ${label}.`, status: 400 }
      }

      const stockKey = STOCK_COL[unidad] || `stock_${unidad}`
      const stockDisponible = (prod[stockKey] as number) ?? 0
      if (stockDisponible < cantidad) {
        return { error: `Stock insuficiente de ${label} para ${prod.nombre}. Disponible: ${stockDisponible}.`, status: 400 }
      }

      const subtotal = cantidad * precio
      pedidoItems.push({ producto_id: productoId, unidad, cantidad, precio_unitario: precio, subtotal, metadata: item.metadata || null })
      totalCalculado += subtotal
    }
  }

  return { items: pedidoItems, total: totalCalculado, sufijo }
}
