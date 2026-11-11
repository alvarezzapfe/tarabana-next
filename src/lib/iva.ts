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
 * IVA. Lo que decide cada partida es `pedido_items.incluye_iva`, una bandera:
 * el importe no cambia. El IVA entra una sola vez, al final, sobre la base
 * gravable, y por eso la comparacion de totales de `set_pedido_items` sigue
 * cuadrando.
 *
 * ── La base gravable ───────────────────────────────────────
 *
 *   gravable  = suma de los importes de las partidas marcadas
 *   base      = round( gravable x (total - descuento) / total  +  envio?, 2 )
 *   iva       = round( base x tasa, 2 )
 *
 * El descuento se PRORRATEA: baja el pedido completo, asi que la parte
 * gravada baja en la misma proporcion. Cobrar el IVA sobre el gravable sin
 * prorratear le cobraria al cliente impuesto de un descuento que recibio.
 *
 * El envio tiene su propia bandera (`pedidos.envio_incluye_iva`): se puede
 * facturar mercancia gravada con flete exento y al reves.
 *
 * ── El redondeo ────────────────────────────────────────────
 *
 * Tiene que dar lo mismo que la vista `pedidos_saldo`, porque el carrito
 * promete un total y la vista cobra otro. Un centavo de diferencia es un
 * pedido que nunca llega a 'pagado'.
 *
 * Por eso nada se calcula con floats. `base * tasa` en float da
 * 341.44000000000005 para 2134 * 0.16, y el problema no es ese caso sino el
 * medio centavo: con float, que 0.005 caiga para arriba o para abajo depende
 * de la representacion binaria del producto. Aqui todo se vuelve entero
 * —centavos y diezmilesimas, con BigInt— y el desempate se decide comparando
 * enteros, igual que hace `numeric` en Postgres: medio centavo SUBE.
 *
 * Una honestidad sobre el prorrateo: la vista calcula
 * `gravable * (1 - descuento/total)`, o sea divide primero y multiplica
 * despues, con la division truncada a ~20 digitos. Aqui se hace la aritmetica
 * racional EXACTA (multiplicar y luego dividir una sola vez). Los dos
 * coinciden salvo que el valor exacto caiga a menos de 1e-14 de un medio
 * centavo, que con importes de dinero reales no pasa — y aun asi la autoridad
 * es la vista: esto es la promesa del carrito, no el cobro.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Tasa general de IVA. Respaldo si no se puede leer `app_config.impuestos`. */
export const IVA_TASA_DEFAULT = 0.16

/** Los montos de dinero tienen 2 decimales; las tasas, 4 (numeric(6,4)). */
const DECIMALES_MONTO = 100
const DECIMALES_TASA = 10_000

/** Pesos a centavos enteros. Lo que no es un numero util vale 0. */
function centavos(v: unknown): bigint {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0n
  return BigInt(Math.round(n * DECIMALES_MONTO))
}

/**
 * Division entera con medio hacia ARRIBA en valor absoluto, que es como
 * redondea `numeric` en Postgres. La misma regla que usa ./comisiones.
 */
function divRedondeada(num: bigint, den: bigint): bigint {
  if (den === 0n) return 0n
  const negativo = (num < 0n) !== (den < 0n)
  const a = num < 0n ? -num : num
  const b = den < 0n ? -den : den
  const q = a / b
  const r = a % b
  const subio = r * 2n >= b ? q + 1n : q
  return negativo ? -subio : subio
}

/**
 * El IVA de una base, con el redondeo de la vista.
 *
 * Devuelve 0 para una base o una tasa que no sean un numero util, en vez de
 * NaN: un NaN se propagaria al total y el carrito mostraria "$NaN".
 */
export function ivaDe(base: number, tasa: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(tasa)) return 0
  if (base === 0 || tasa === 0) return 0

  // En diezmilesimas de centavo, exacto: los dos factores son enteros.
  const puntos = BigInt(Math.round(tasa * DECIMALES_TASA))
  return Number(divRedondeada(centavos(base) * puntos, BigInt(DECIMALES_TASA))) / DECIMALES_MONTO
}

export type EntradaBase = {
  /** Bruto de TODAS las partidas, sin IVA. Es `pedidos.total`. */
  subtotal: number
  /** Bruto de las partidas marcadas con IVA. */
  gravable?: number | null
  /** Ya calculado (ver `descuentoMonto` en ./editar-partidas). */
  descuento?: number | null
  envio?: number | null
  /** El flete decide por su cuenta: `pedidos.envio_incluye_iva`. */
  envioConIva?: boolean | null
}

/**
 * La base gravable del pedido, con el redondeo de la vista.
 *
 * El descuento se prorratea sobre la parte gravada: si el pedido completo
 * bajo 10%, lo gravado bajo 10%. Un descuento mayor que el subtotal deja la
 * base en 0 y no en negativo — `crearPedido` lo rechaza, pero la ruta de
 * edicion no lo revalida, y la vista tiene el mismo clamp.
 */
export function baseGravableDe(entrada: EntradaBase): number {
  const total = centavos(entrada.subtotal)
  const gravable = centavos(entrada.gravable)
  const descuento = centavos(entrada.descuento)
  const envio = centavos(entrada.envio)

  // gravable * (total - descuento) / total, en una sola division exacta.
  const neto = total - descuento > 0n ? total - descuento : 0n
  const prorrateado = total > 0n ? divRedondeada(gravable * neto, total) : gravable

  const base = prorrateado + (entrada.envioConIva ? envio : 0n)
  return Number(base < 0n ? 0n : base) / DECIMALES_MONTO
}

export type EntradaDesglose = EntradaBase & {
  tasa?: number | null
}

export type Desglose = {
  subtotal: number
  descuento: number
  envio: number
  /** Lo que de verdad causa IVA, ya prorrateado el descuento. */
  baseGravable: number
  iva: number
  /** Lo que se le cobra al cliente. Es `total_con_envio` de la vista. */
  total: number
}

/**
 * Los seis renglones del documento, en el mismo orden en que se muestran.
 *
 * `total` NO sale de la base gravable: sale del subtotal completo. Son dos
 * cosas distintas y confundirlas es el error facil — un pedido con una sola
 * partida gravada de cinco tiene una base chica y un total grande.
 */
export function desglosar(entrada: EntradaDesglose): Desglose {
  const subtotal = numero(entrada.subtotal)
  const descuento = numero(entrada.descuento)
  const envio = numero(entrada.envio)
  const baseGravable = baseGravableDe(entrada)
  const iva = ivaDe(baseGravable, numero(entrada.tasa, IVA_TASA_DEFAULT))

  return {
    subtotal,
    descuento,
    envio,
    baseGravable,
    iva,
    total: subtotal - descuento + envio + iva,
  }
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
