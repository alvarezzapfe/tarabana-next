/**
 * IVA de un pedido.
 *
 * Los precios de lista son SIN IVA. El IEPS de cerveza si va adentro del
 * precio y no se toca aqui (vive en ./comisiones, que es el unico lugar que
 * necesita sacarlo). El IVA, en cambio, es un atributo del PEDIDO: se prende
 * con un switch, se guarda en `pedidos.incluye_iva` y se cobra encima del
 * total.
 *
 * ── Donde NO va el IVA ─────────────────────────────────────
 *
 * `pedidos.total` y `pedido_items.precio_unitario` siguen siendo brutos sin
 * IVA, y `crearPedido` / `set_pedido_items` no saben que existe. Meterlo en
 * las partidas obligaria a reexpresar el historico y romperia la comparacion
 * de totales que hace el RPC. El IVA entra una sola vez, al final, sobre la
 * base gravable.
 *
 * ── El redondeo ────────────────────────────────────────────
 *
 * Tiene que dar EXACTAMENTE lo mismo que `round(base * iva_tasa, 2)` de la
 * vista `pedidos_saldo`, porque el carrito promete un total y la vista cobra
 * otro. Un centavo de diferencia es un pedido que nunca llega a 'pagado'.
 *
 * Por eso no se calcula con floats. `base * tasa` en float da 341.44000000000005
 * para 2134 * 0.16, y el problema no es ese caso sino el medio centavo: con
 * float, que 0.005 caiga para arriba o para abajo depende de la
 * representacion binaria del producto. Aqui los dos factores se vuelven
 * enteros —centavos y diezmilesimas— y el desempate se decide comparando
 * enteros, igual que hace numeric en Postgres: medio centavo SUBE.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Tasa general de IVA. Respaldo si no se puede leer `app_config.impuestos`. */
export const IVA_TASA_DEFAULT = 0.16

/** Los montos de dinero tienen 2 decimales; las tasas, 4 (numeric(6,4)). */
const DECIMALES_MONTO = 100
const DECIMALES_TASA = 10_000

/**
 * El IVA de una base, con el redondeo de la vista.
 *
 * Devuelve 0 para una base o una tasa que no sean un numero util, en vez de
 * NaN: un NaN se propagaria al total y el carrito mostraria "$NaN".
 */
export function ivaDe(base: number, tasa: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(tasa)) return 0
  if (base === 0 || tasa === 0) return 0

  const negativo = base < 0
  const centavos = Math.round(Math.abs(base) * DECIMALES_MONTO)
  const puntos = Math.round(Math.abs(tasa) * DECIMALES_TASA)

  // En diezmilesimas de centavo, exacto: los dos factores son enteros.
  const producto = centavos * puntos
  const entero = Math.floor(producto / DECIMALES_TASA)
  const resto = producto - entero * DECIMALES_TASA
  // Medio centavo sube, como `round(numeric, 2)`.
  const redondeado = resto * 2 >= DECIMALES_TASA ? entero + 1 : entero

  return (negativo ? -redondeado : redondeado) / DECIMALES_MONTO
}

export type EntradaDesglose = {
  /** Bruto de las partidas, sin IVA. Es `pedidos.total`. */
  subtotal: number
  /** Ya calculado (ver `descuentoMonto` en ./editar-partidas). */
  descuento?: number | null
  envio?: number | null
  incluyeIva?: boolean | null
  tasa?: number | null
}

export type Desglose = {
  subtotal: number
  descuento: number
  envio: number
  /** Base gravable: subtotal - descuento + envio. */
  base: number
  iva: number
  /** Lo que se le cobra al cliente. Es `total_con_envio` de la vista. */
  total: number
}

/**
 * Los cinco renglones del documento, en el mismo orden en que se muestran.
 *
 * El IVA se calcula sobre la base DESPUES del descuento y CON el envio, que es
 * como se factura: el descuento baja la contraprestacion y el flete es parte
 * de ella. Hacerlo sobre el subtotal cobraria IVA de un descuento que nadie
 * pago.
 */
export function desglosar(entrada: EntradaDesglose): Desglose {
  const subtotal = numero(entrada.subtotal)
  const descuento = numero(entrada.descuento)
  const envio = numero(entrada.envio)
  const base = subtotal - descuento + envio
  const tasa = entrada.incluyeIva ? numero(entrada.tasa, IVA_TASA_DEFAULT) : 0
  const iva = ivaDe(base, tasa)

  return { subtotal, descuento, envio, base, iva, total: base + iva }
}

/** 0.16 -> "16%". Sin decimales cuando no hacen falta. */
export function etiquetaTasa(tasa: number): string {
  const pct = numero(tasa, IVA_TASA_DEFAULT) * 100
  return `${Number.isInteger(pct) ? pct : Number(pct.toFixed(2))}%`
}

/**
 * La tasa que trae `app_config.impuestos`, validada.
 *
 * Una tasa negativa o >= 1 seria un error de captura cobrado al cliente; una
 * que no se pueda leer cae al default en vez de dejar el pedido sin IVA
 * despues de que alguien prendio el switch.
 */
export function tasaIvaDeConfig(value: unknown): number {
  const crudo = Number((value as { iva_tasa?: unknown } | null)?.iva_tasa)
  if (!Number.isFinite(crudo) || crudo < 0 || crudo >= 1) return IVA_TASA_DEFAULT
  return crudo
}

/**
 * La tasa vigente. Se COPIA dentro del pedido al crearlo: ver el encabezado
 * de la migracion 20261111000000. Esta funcion es para ese momento y para
 * precargar el switch, nunca para recalcular un pedido viejo.
 */
export async function cargarTasaIva(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'impuestos').maybeSingle()
  return tasaIvaDeConfig(data?.value)
}

function numero(v: unknown, porDefecto = 0): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : porDefecto
}
