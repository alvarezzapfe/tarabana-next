/**
 * Shared order calculation logic.
 * Used by both portal and admin pedido creation endpoints.
 * Recalculates prices server-side — never trusts body prices.
 *
 * PRICE MODEL:
 * - Latas (caja12, caja24, mix24): derived from precio_lata_* × quantity
 * - Barriles: use their own price columns directly
 */
// La extension .ts no es un descuido: `node --test` corre este archivo sin
// bundler y su resolucion de ESM exige el especificador completo. Turbopack y
// tsc lo resuelven igual (allowImportingTsExtensions en tsconfig). Quitarla
// rompe los tests.
import { columnaStockDe } from './unidades.ts'
import { disponibleDe } from './stock-disponible.ts'

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
  /**
   * Lo ya comprometido por pedidos abiertos, por producto y columna (ver
   * stock-disponible.ts). El stock se valida contra el DISPONIBLE —fisico
   * menos comprometido—, no contra el fisico: el inventario solo se descuenta
   * al entregar, asi que validar contra la columna dejaba vender dos veces lo
   * mismo mientras ninguno de los dos pedidos se entregaba.
   *
   * Vacio por default, y entonces equivale a validar contra el fisico. Lo pasa
   * quien tiene una vista global de los pedidos (ver `cargarComprometido`);
   * nunca se calcula con la sesion de un vendedor, que solo ve los suyos.
   */
  comprometido: Map<string, number> = new Map(),
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
        const latasDisponibles = disponibleDe(estilo.producto_id, 'stock_latas', Number(prod.stock_latas || 0) || 0, comprometido)
        if (latasDisponibles < latasNecesarias) {
          return { error: `Stock de latas insuficiente de ${prod.nombre}. Disponible: ${latasDisponibles}, necesitas ${latasNecesarias}.`, status: 400 }
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

      // El mapeo vive en unidades.ts. Antes se resolvia con
      // `stock_${unidad}` como fallback, que para 'lata' apuntaba a
      // `stock_lata` (la columna es `stock_latas`) y dejaba toda venta de
      // latas sueltas en "stock insuficiente".
      const stockKey = columnaStockDe(unidad)
      if (!stockKey) {
        return { error: `Presentacion no reconocida: ${label}.`, status: 400 }
      }
      const disponible = disponibleDe(productoId, stockKey, Number(prod[stockKey] ?? 0) || 0, comprometido)
      if (disponible < cantidad) {
        return { error: `Stock insuficiente de ${label} para ${prod.nombre}. Disponible: ${disponible}.`, status: 400 }
      }

      const subtotal = cantidad * precio
      pedidoItems.push({ producto_id: productoId, unidad, cantidad, precio_unitario: precio, subtotal, metadata: item.metadata || null })
      totalCalculado += subtotal
    }
  }

  return { items: pedidoItems, total: totalCalculado, sufijo }
}
