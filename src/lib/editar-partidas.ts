/**
 * Recalculo de las partidas de un pedido que ya existe.
 *
 * Editar no es crear otra vez, y las diferencias son todas de negocio:
 *
 *   - El PRECIO de una partida que ya estaba NO se vuelve a cotizar. El
 *     cliente ya acepto ese precio; si la lista subio entre que se levanto el
 *     pedido y que se corrige una cantidad, cambiarselo seria re-facturarle
 *     por la espalda. Las partidas NUEVAS si toman el precio vigente de su
 *     nivel.
 *
 *   - El STOCK se valida contra el disponible SIN contar este pedido. Lo que
 *     el pedido ya tenia apartado vuelve a estar libre para el: si no, un
 *     pedido de 10 cajas no se podria editar a 11 aunque hubiera 40 sueltas.
 *     Quien llama pasa el comprometido ya calculado con
 *     `comprometidoDe(pedidos, { excepto: pedidoId })`.
 *
 *   - El stock se revisa sobre el TOTAL consolidado por columna, con
 *     `movimientosDeEntrega`, y no partida por partida. Es lo mismo que se va
 *     a descontar al entregar, asi que una caja mixta cuenta latas por estilo
 *     y dos partidas del mismo producto suman en vez de validarse cada una
 *     contra el inventario completo.
 *
 * Todo aqui es puro. Quien escribe es la ruta, via el RPC `set_pedido_items`.
 */
import { precioLata, precioUnitario } from './calcular-pedido.ts'
import { ivaDe } from './iva.ts'
import { movimientosDeEntrega, type EstiloMix, type ItemEntrega } from './stock-entrega.ts'
import { disponibleDe } from './stock-disponible.ts'
import { ETIQUETA_COLUMNA } from './unidades.ts'

/** Una partida tal como esta guardada hoy. */
export type PartidaActual = {
  id: string
  producto_id: string
  unidad: string | null
  cantidad: number
  precio_unitario: number
  metadata?: { estilos?: EstiloMix[] | null } | null
}

/** Una linea como la deja la pantalla: sin precio, el precio lo resuelve esto. */
export type LineaDeseada = {
  producto_id: string
  unidad: string
  cantidad: number
  metadata?: { estilos?: EstiloMix[] | null } | null
}

/** Una partida lista para escribirse. Misma forma que la de `calcularPedido`. */
export type PartidaFinal = {
  producto_id: string
  unidad: string
  cantidad: number
  precio_unitario: number
  subtotal: number
  metadata: unknown
  /** true si conservo el precio de la partida que ya existia. */
  conservada: boolean
}

export type ResultadoEdicion =
  | {
      ok: true
      partidas: PartidaFinal[]
      total: number
      conservadas: number
      nuevas: number
      /** Partidas que estaban y ya no van. */
      quitadas: number
    }
  | { ok: false; error: string }

const LATAS_POR_MIX = 24

/**
 * La identidad de una linea, para saber si ya existia.
 *
 * Producto y presentacion no bastan para una caja MIXTA: dos mixes del mismo
 * producto con estilos distintos son partidas distintas y no deben heredar el
 * precio uno del otro. Por eso la clave de un mix incluye la firma de sus
 * estilos, normalizada y ordenada para que el orden en que se armo no cambie
 * la identidad.
 */
export function claveLinea(
  producto_id: string,
  unidad: string | null,
  metadata?: { estilos?: EstiloMix[] | null } | null
): string {
  const base = `${producto_id}|${unidad ?? ''}`
  const estilos = metadata?.estilos
  if (unidad !== 'mix24' || !estilos?.length) return base

  const firma = estilos
    .map(e => `${e.producto_id ?? ''}:${Number(e.latas ?? e.cantidad_latas ?? 0) || 0}`)
    .sort()
    .join(',')
  return `${base}|${firma}`
}

/** El precio de una caja mixta nueva: prorrateo por lata, como `calcularPedido`. */
function precioDeMix(
  estilos: EstiloMix[],
  catalogo: Map<string, Record<string, unknown>>,
  sufijo: 'publico' | 'taproom'
): { precio: number } | { error: string } {
  const totalLatas = estilos.reduce((s, e) => s + (Number(e.latas ?? e.cantidad_latas ?? 0) || 0), 0)
  if (totalLatas !== LATAS_POR_MIX) {
    return { error: `Una caja mixta tiene que sumar ${LATAS_POR_MIX} latas, trae ${totalLatas}.` }
  }

  let precio = 0
  for (const e of estilos) {
    if (!e.producto_id) return { error: 'Una caja mixta trae un estilo sin producto.' }
    const prod = catalogo.get(e.producto_id)
    if (!prod) return { error: `El producto ${e.nombre || e.producto_id} de la caja mixta ya no esta en el catalogo.` }
    const porLata = precioLata(prod, sufijo)
    if (porLata <= 0) return { error: `${prod.nombre} no tiene precio por lata configurado.` }
    precio += porLata * (Number(e.latas ?? e.cantidad_latas ?? 0) || 0)
  }
  return { precio: Math.round(precio) }
}

export type EntradaEdicion = {
  actuales: PartidaActual[]
  deseadas: LineaDeseada[]
  /** Catalogo activo indexado por id, el mismo `stockMap` de `crearPedido`. */
  catalogo: Map<string, Record<string, unknown>>
  sufijo: 'publico' | 'taproom'
  /** Comprometido SIN este pedido. */
  comprometido: Map<string, number>
}

/**
 * Las partidas que deben quedar, con sus precios y su total.
 *
 * Las lineas repetidas se CONSOLIDAN por identidad antes de nada: dos
 * renglones del mismo producto y presentacion son uno con la suma, igual que
 * en la importacion masiva. Si no, cada uno se validaria contra el inventario
 * completo y pasarian 5 + 5 cajas habiendo 6.
 */
export function recalcularPartidas(entrada: EntradaEdicion): ResultadoEdicion {
  const { actuales, deseadas, catalogo, sufijo, comprometido } = entrada

  // ── Consolidar lo pedido ──────────────────────────────────
  const consolidadas = new Map<string, LineaDeseada>()
  for (const linea of deseadas) {
    const cantidad = Number(linea.cantidad) || 0
    if (cantidad <= 0) continue
    if (!linea.producto_id) return { ok: false, error: 'Hay una partida sin producto.' }

    const clave = claveLinea(linea.producto_id, linea.unidad, linea.metadata)
    const previa = consolidadas.get(clave)
    if (previa) previa.cantidad += cantidad
    else consolidadas.set(clave, { ...linea, cantidad })
  }

  if (consolidadas.size === 0) {
    return { ok: false, error: 'El pedido no puede quedarse sin partidas. Para dejarlo en cero, cancélalo.' }
  }

  // ── Resolver precios ──────────────────────────────────────
  const porClave = new Map<string, PartidaActual>()
  for (const p of actuales) {
    const clave = claveLinea(p.producto_id, p.unidad, p.metadata)
    // La primera gana: si el pedido traia dos partidas de la misma celda con
    // precios distintos, al consolidarse hay que quedarse con uno y el mas
    // viejo es el que el cliente vio primero.
    if (!porClave.has(clave)) porClave.set(clave, p)
  }

  const partidas: PartidaFinal[] = []
  let conservadas = 0
  let nuevas = 0

  for (const [clave, linea] of consolidadas) {
    const previa = porClave.get(clave)

    let precio: number
    if (previa) {
      // El precio pactado se respeta aunque la lista haya cambiado, y aunque
      // esa presentacion ya no tenga precio en este nivel.
      precio = Number(previa.precio_unitario) || 0
      conservadas += 1
    } else {
      const prod = catalogo.get(linea.producto_id)
      if (!prod) return { ok: false, error: `El producto de una partida nueva ya no esta en el catalogo.` }

      if (linea.unidad === 'mix24') {
        const r = precioDeMix(linea.metadata?.estilos || [], catalogo, sufijo)
        if ('error' in r) return { ok: false, error: r.error }
        precio = r.precio
      } else {
        precio = precioUnitario(prod, linea.unidad, sufijo)
        if (precio <= 0) {
          return {
            ok: false,
            error: `${prod.nombre} no tiene precio ${sufijo === 'taproom' ? 'mayorista' : 'al público'} para esa presentación.`,
          }
        }
      }
      nuevas += 1
    }

    partidas.push({
      producto_id: linea.producto_id,
      unidad: linea.unidad,
      cantidad: linea.cantidad,
      precio_unitario: precio,
      subtotal: linea.cantidad * precio,
      metadata: linea.metadata ?? null,
      conservada: !!previa,
    })
  }

  // ── Stock, sobre el total consolidado por columna ─────────
  const items: ItemEntrega[] = partidas.map(p => ({
    producto_id: p.producto_id,
    unidad: p.unidad,
    cantidad: p.cantidad,
    metadata: p.metadata as { estilos?: EstiloMix[] | null } | null,
    nombre: (catalogo.get(p.producto_id)?.nombre as string) || null,
  }))

  const movimientos = movimientosDeEntrega(items)
  if ('error' in movimientos) return { ok: false, error: movimientos.error }

  for (const m of movimientos) {
    const prod = catalogo.get(m.producto_id)
    const nombre = (prod?.nombre as string) || 'un producto'
    const fisico = Number(prod?.[m.columna] ?? 0) || 0
    const disponible = disponibleDe(m.producto_id, m.columna, fisico, comprometido)
    if (disponible < m.cantidad) {
      // La etiqueta sale de la COLUMNA y no del movimiento: la de un mix ya
      // trae el nombre del estilo adentro ("latas de Brisa") y el mensaje
      // quedaba "el latas de Brisa de Brisa".
      return {
        ok: false,
        error: `No alcanzan las ${ETIQUETA_COLUMNA[m.columna]} de ${nombre}: se necesitan ${m.cantidad} y hay ${disponible} disponibles.`,
      }
    }
  }

  const total = partidas.reduce((s, p) => s + p.subtotal, 0)
  const clavesFinales = new Set(consolidadas.keys())
  const quitadas = [...porClave.keys()].filter(k => !clavesFinales.has(k)).length

  return { ok: true, partidas, total, conservadas, nuevas, quitadas }
}

// ── Lo que el cliente termina debiendo ──────────────────────

/**
 * El descuento en pesos, con la MISMA formula de la vista `pedidos_saldo`.
 *
 * El porcentaje se redondea a dos decimales ahi (ver docs/SCHEMA_NOTES.md);
 * reimplementarlo sin el `round` da diferencias de centavos contra lo que la
 * vista va a cobrar, y entonces el aviso de sobrepago mentiria por un peso.
 */
export function descuentoMonto(
  total: number,
  tipo: string | null | undefined,
  valor: number | null | undefined
): number {
  const v = Number(valor) || 0
  if (tipo === 'porcentaje') return Math.round(total * v) / 100
  if (tipo === 'monto') return v
  return 0
}

export type Sobrepago = {
  /** Lo que el cliente deberia pagar con las partidas nuevas. */
  aCobrar: number
  pagado: number
  /** Cuanto sobra. Siempre > 0 cuando hay sobrepago. */
  sobra: number
}

/**
 * Si el nuevo total deja al cliente con mas pagado de lo que debe.
 *
 * Pasa al quitar partidas de un pedido que ya tiene pagos. No se bloquea
 * —puede ser legitimo, con una devolucion de por medio— pero no puede
 * guardarse sin que alguien lo vea y lo confirme: un saldo negativo descuadra
 * la cobranza y no hay nada en la pantalla que lo explique despues.
 */
export function sobrepagoDe(entrada: {
  total: number
  descuento_tipo?: string | null
  descuento_valor?: number | null
  costo_envio?: number | null
  /**
   * El IVA del pedido. Va aqui porque `pedidos_saldo` lo suma al saldo: sin
   * el, un pedido con IVA pagado completo se veria como sobrepagado por el
   * 16%, y la pantalla pediria confirmar un sobrepago que no existe.
   */
  incluye_iva?: boolean | null
  iva_tasa?: number | null
  pagado: number
}): Sobrepago | null {
  const base =
    entrada.total -
    descuentoMonto(entrada.total, entrada.descuento_tipo, entrada.descuento_valor) +
    (Number(entrada.costo_envio) || 0)
  const aCobrar = base + (entrada.incluye_iva ? ivaDe(base, Number(entrada.iva_tasa) || 0) : 0)

  const pagado = Number(entrada.pagado) || 0
  const sobra = Math.round((pagado - aCobrar) * 100) / 100
  if (sobra <= 0) return null
  return { aCobrar, pagado, sobra }
}

/** Status en los que las partidas ya no se tocan. Lo repite el RPC. */
export const STATUS_NO_EDITABLES: readonly string[] = ['entregado', 'cancelado']

export const puedeEditarPartidas = (status: string | null | undefined): boolean =>
  !!status && !STATUS_NO_EDITABLES.includes(status)

/**
 * Por que no se puede editar, en palabras. null si si se puede.
 *
 * Existe para que la opcion no se ESCONDA en los pedidos que no se pueden
 * editar: esconderla deja a quien la busca sin saber si no existe, si no tiene
 * permiso o si el pedido no califica. Mostrarla apagada con el motivo contesta
 * las tres, y de paso ofrece la salida real —levantar otro pedido—, que es lo
 * que la persona iba a terminar haciendo de todos modos.
 */
export function motivoNoEditable(status: string | null | undefined): string | null {
  if (puedeEditarPartidas(status)) return null
  if (status === 'entregado') {
    return 'Ya entregado: descontó inventario. Crea un pedido nuevo para agregar producto.'
  }
  if (status === 'cancelado') {
    return 'Pedido cancelado: no va a salir. Crea un pedido nuevo si hace falta.'
  }
  return 'Este pedido no se puede editar.'
}

/** El POS con el cliente precargado: `?cliente=` lo lee al montar. */
export const urlNuevoPedido = (clienteId: string | null | undefined): string =>
  clienteId ? `/admin/pedidos/nuevo?cliente=${encodeURIComponent(clienteId)}` : '/admin/pedidos/nuevo'
