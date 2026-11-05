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

/** Stock de un producto en una presentacion. */
export function stockDe(producto: Producto, presentacion: string): number {
  const col = columnaStockDe(presentacion)
  if (!col) return 0
  return Number(producto[col] ?? 0) || 0
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
  sufijo: 'publico' | 'taproom'
): string | null {
  const precio = precioDe(producto, presentacion, sufijo)
  if (precio <= 0) {
    return `${producto.nombre} no tiene precio ${sufijo === 'taproom' ? 'mayorista' : 'al público'} para ${etiquetaDe(presentacion)}.`
  }
  if (stockDe(producto, presentacion) <= 0) {
    return `Sin stock de ${etiquetaDe(presentacion)} para ${producto.nombre}.`
  }
  return null
}
