/**
 * Tokens y reglas compartidas de la captura de pedidos.
 *
 * Los dos imports llevan extension .ts a proposito: asi este modulo se puede
 * cargar con `node --test`, que no usa bundler y exige el especificador
 * completo. Turbopack y tsc lo resuelven igual.
 *
 * Las presentaciones, los precios y el stock NO se calculan aqui: salen de
 * `precioUnitario` (calcular-pedido.ts) y `columnaStockDe` (unidades.ts), que
 * son las mismas primitivas que usa el servidor al crear el pedido y la
 * importacion de Excel. Antes esta pantalla tenia su propio `getPrecio` con
 * un `if` por presentacion, incompleto: no conocia las latas sueltas ni los
 * barriles de 10 L.
 */
import { precioUnitario } from '../../../../src/lib/calcular-pedido.ts'
import { columnaStockDe, litrosDeItem } from '../../../../src/lib/unidades.ts'
import { claveStock, type Disponibilidad } from '../../../../src/lib/stock-disponible.ts'

export const ACENTO = '#D95F2E'
export const ROJO = '#dc2626'
export const AMBAR = '#b45309'
export const TINTA = '#111827'
export const TINTA_MEDIA = '#374151'
export const GRIS = '#6b7280'
export const GRIS_SUAVE = '#9ca3af'
export const BORDE = '#e5e7eb'
export const PISTA = '#f3f4f6'
export const FONDO = '#fafafa'

export const tabular = { fontVariantNumeric: 'tabular-nums' } as const
export const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`

// Los formateadores con centavos se reexportan de dash-ui en vez de copiarse:
// `moneda` de arriba ya es una copia del de alla, y una tercera version de
// "como se escribe el dinero" es como se llega a que dos pantallas muestren
// totales distintos.
export { monedaExacta, monedaFirmada } from '../../dash-ui.ts'
export const card = {
  background: '#fff',
  border: `1px solid ${BORDE}`,
  borderRadius: 12,
} as const

export type Producto = Record<string, unknown> & { id: string; nombre: string; estilo?: string | null }

export type Presentacion = {
  key: string
  /** Encabezado de la columna. */
  label: string
  /** Nombre completo, para el carrito y los tooltips. */
  largo: string
  /**
   * Las cinco de siempre se muestran aunque ningun producto las tenga: son
   * el catalogo base y su ausencia es informacion (falta capturar precio).
   * Las de 10 L solo aparecen si algun producto activo trae precio o stock,
   * para no cargar la matriz con dos columnas muertas.
   */
  condicional?: boolean
}

export const PRESENTACIONES: Presentacion[] = [
  { key: 'lata', label: 'Lata', largo: 'Lata suelta' },
  { key: 'caja12', label: 'Caja 12', largo: 'Caja 12 latas' },
  { key: 'caja24', label: 'Caja 24', largo: 'Caja 24 latas' },
  { key: 'barril_pet', label: 'Barril PET', largo: 'Barril 20L PET' },
  { key: 'barril_acero', label: 'Barril acero', largo: 'Barril 20L Acero' },
  { key: 'barril10_pet', label: 'Barril 10L PET', largo: 'Barril 10L PET', condicional: true },
  { key: 'barril10_acero', label: 'Barril 10L acero', largo: 'Barril 10L Acero', condicional: true },
]

export const etiquetaDe = (key: string) =>
  PRESENTACIONES.find(p => p.key === key)?.largo ?? key

/**
 * Stock FISICO de un producto en una presentacion: la columna tal cual.
 *
 * Casi nunca es lo que hay que mostrar ni contra lo que hay que validar — para
 * eso esta `celdaStock`, que resta lo comprometido. Esto sirve para decidir si
 * una columna de la matriz existe (`presentacionesVisibles`), que no debe
 * depender de los pedidos abiertos: una presentacion con todo el stock
 * apartado sigue siendo parte del catalogo.
 */
export function stockDe(producto: Producto, presentacion: string): number {
  const col = columnaStockDe(presentacion)
  if (!col) return 0
  return Number(producto[col] ?? 0) || 0
}

/**
 * Los tres numeros de una celda: fisico, comprometido y disponible.
 *
 * Es lo que el POS muestra y contra lo que valida. El fisico solo baja al
 * ENTREGAR, asi que ofrecer el fisico significaba ofrecer producto que ya
 * tenia dueno (ver src/lib/stock-disponible.ts).
 *
 * `comprometido` llega de /api/admin/pedidos/comprometido, no de un select del
 * navegador: con la sesion de un vendedor solo se ven sus propios pedidos.
 * Mientras ese fetch no responde el mapa esta vacio, asi que la celda muestra
 * el fisico; es un estado transitorio y el servidor revalida al confirmar.
 */
export function celdaStock(
  producto: Producto,
  presentacion: string,
  comprometido: Map<string, number>
): Disponibilidad {
  const col = columnaStockDe(presentacion)
  if (!col) return { fisico: 0, comprometido: 0, disponible: 0 }
  const fisico = Number(producto[col] ?? 0) || 0
  const comp = comprometido.get(claveStock(producto.id, col)) || 0
  return { fisico, comprometido: comp, disponible: fisico - comp }
}

/** Lo que se puede vender de una celda. */
export const disponibleEn = (
  producto: Producto,
  presentacion: string,
  comprometido: Map<string, number>
): number => celdaStock(producto, presentacion, comprometido).disponible

/** "físico 200 · comprometido 47", para el tooltip de la celda. */
export const detalleStock = (d: Disponibilidad): string =>
  `físico ${d.fisico} · comprometido ${d.comprometido}`

/**
 * Todo lo que una celda tiene que mostrar, decidido en un solo lugar.
 *
 * Existe porque el POS pinta la misma celda de DOS maneras —la matriz en
 * escritorio y una tarjeta en movil— y cada una resolvia por su cuenta que
 * mostrar. La de movil hacia
 *
 *   precio > 0 ? `${moneda(precio)} · ${stock} disp.` : 'sin precio'
 *
 * o sea que cuando el cliente no tenia precio para esa presentacion el
 * DISPONIBLE desaparecia. Y como que presentaciones tienen precio depende del
 * nivel del cliente, cambiar de cliente cambiaba en que celdas habia numero:
 * medido contra produccion, 15 celdas perdian el disponible al pasar de un
 * cliente publico a El Caracol Tap (distribuidor).
 *
 * La regla es: el disponible depende SOLO del inventario y del comprometido
 * global, asi que sale igual para todos los clientes y se muestra siempre. El
 * nivel del cliente decide el precio y si se puede capturar, nada mas.
 *
 * `enCarrito` NO se resta del disponible: se reporta aparte. Restarlo haria
 * que el mismo inventario se viera distinto segun lo que uno lleve capturado,
 * que es la otra forma del mismo error.
 */
export type VistaCelda = {
  /** Los tres numeros del inventario. Independientes del cliente. */
  stock: Disponibilidad
  /** "físico X · comprometido Y". Independiente del cliente. */
  detalle: string
  /** Unidades de esta celda ya capturadas. Independiente del cliente. */
  enCarrito: number
  /** Precio del nivel del cliente. 0 si no hay. */
  precio: number
  /** Por que no se puede capturar en este nivel, o null. */
  motivo: string | null
  /** Se capturo mas de lo disponible. */
  excede: boolean
}

export function vistaCelda(
  producto: Producto,
  presentacion: string,
  sufijo: 'publico' | 'taproom',
  comprometido: Map<string, number>,
  enCarrito = 0
): VistaCelda {
  const stock = celdaStock(producto, presentacion, comprometido)
  return {
    stock,
    detalle: detalleStock(stock),
    enCarrito,
    precio: precioDe(producto, presentacion, sufijo),
    motivo: motivoBloqueo(producto, presentacion, sufijo, comprometido),
    excede: enCarrito > stock.disponible,
  }
}

/**
 * Si la celda merece un renglon en la vista de movil.
 *
 * Mira los DOS niveles de precio, igual que `presentacionesVisibles`: si
 * dependiera del nivel del cliente, los renglones aparecerian y desaparecerian
 * al cambiar de cliente. Una presentacion sin precio en ningun nivel y sin
 * stock no tiene nada que decir.
 */
export function celdaVale(producto: Producto, presentacion: string, comprometido: Map<string, number>): boolean {
  if (celdaStock(producto, presentacion, comprometido).fisico > 0) return true
  return precioDe(producto, presentacion, 'publico') > 0 || precioDe(producto, presentacion, 'taproom') > 0
}

/** Precio de un producto en una presentacion, para el nivel del cliente. */
export function precioDe(producto: Producto, presentacion: string, sufijo: 'publico' | 'taproom'): number {
  return precioUnitario(producto, presentacion, sufijo)
}

/**
 * Las columnas que se muestran.
 *
 * Una presentacion condicional entra si ALGUN producto activo tiene precio
 * (en cualquiera de los dos niveles) o stock. Se mira el precio de los dos
 * niveles y no solo el del cliente actual para que la matriz no cambie de
 * ancho al cambiar de cliente.
 */
export function presentacionesVisibles(productos: Producto[]): Presentacion[] {
  return PRESENTACIONES.filter(pres => {
    if (!pres.condicional) return true
    return productos.some(
      p =>
        stockDe(p, pres.key) > 0 ||
        precioDe(p, pres.key, 'publico') > 0 ||
        precioDe(p, pres.key, 'taproom') > 0
    )
  })
}

// ── Partidas del carrito ────────────────────────────────────

export type Partida = {
  /** "<uuid>-<presentacion>", que es lo que espera crearPedido. */
  producto_id: string
  nombre: string
  unidad: string
  cantidad: number
  precio: number
  metadata?: unknown
  /**
   * Si esta partida causa IVA. Es una bandera: no cambia el importe, solo
   * decide si entra en la base gravable (ver src/lib/iva.ts).
   */
  incluyeIva?: boolean
}

/** Lo que vale una partida, sin IVA. */
export const importeDe = (p: Partida) => p.precio * p.cantidad

/** El bruto de las partidas marcadas con IVA. */
export const gravableDe = (partidas: Partida[]) =>
  partidas.reduce((s, p) => s + (p.incluyeIva ? importeDe(p) : 0), 0)

/**
 * El estado del switch general: todas, ninguna o mezcla.
 *
 * 'mezcla' es un estado real y no un limbo: el pedido puede tener partidas
 * gravadas y exentas a la vez, y el switch tiene que decirlo en vez de
 * mentir con un true o un false.
 */
export function estadoIva(partidas: Partida[]): 'todas' | 'ninguna' | 'mezcla' {
  if (partidas.length === 0) return 'ninguna'
  const conIva = partidas.filter(p => p.incluyeIva).length
  if (conIva === 0) return 'ninguna'
  return conIva === partidas.length ? 'todas' : 'mezcla'
}

/** La clave de celda de una partida normal. */
export const claveCelda = (productoId: string, presentacion: string) => `${productoId}-${presentacion}`

/** El id real del producto a partir de la clave de celda. */
export const productoDeClave = (clave: string) => clave.split('-').slice(0, -1).join('-')

/**
 * Litros de una partida. Un mix se mide por sus latas.
 *
 * Devuelve 0 si la presentacion no se reconoce, en vez de romper el total.
 */
export function litrosDePartida(partida: Partida): number {
  if (partida.unidad === 'mix24') {
    const estilos = (partida.metadata as { estilos?: { latas?: number }[] } | undefined)?.estilos
    const latas = (estilos || []).reduce((s, e) => s + (Number(e.latas) || 0), 0)
    return (litrosDeItem('lata', latas) ?? 0) * partida.cantidad
  }
  return litrosDeItem(partida.unidad, partida.cantidad) ?? 0
}

export const litrosTotalesDe = (partidas: Partida[]) =>
  partidas.reduce((s, p) => s + litrosDePartida(p), 0)

/**
 * Por que una celda esta deshabilitada, o null si se puede capturar.
 *
 * Se distingue el motivo a proposito: "no tiene precio mayorista" y "no hay
 * stock" se arreglan en lugares distintos, y en este catalogo el primero es
 * frecuentisimo (casi ningun barril tiene precio mayorista).
 */
export function motivoBloqueo(
  producto: Producto,
  presentacion: string,
  sufijo: 'publico' | 'taproom',
  comprometido: Map<string, number>
): string | null {
  const precio = precioDe(producto, presentacion, sufijo)
  if (precio <= 0) {
    return `${producto.nombre} no tiene precio ${sufijo === 'taproom' ? 'mayorista' : 'al público'} para ${etiquetaDe(presentacion)}.`
  }
  // Contra el DISPONIBLE, no el fisico: lo que esta apartado en otro pedido no
  // se puede vender otra vez, aunque siga en la bodega.
  const celda = celdaStock(producto, presentacion, comprometido)
  if (celda.disponible <= 0) {
    return celda.fisico > 0
      ? `Sin disponible de ${etiquetaDe(presentacion)} para ${producto.nombre}: las ${celda.fisico} que hay están comprometidas en pedidos abiertos.`
      : `Sin stock de ${etiquetaDe(presentacion)} para ${producto.nombre}.`
  }
  return null
}
