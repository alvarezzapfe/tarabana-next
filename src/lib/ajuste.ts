/**
 * El ajuste de un pedido: lo que se suma o se resta al final para cuadrar
 * contra la orden de compra del cliente.
 *
 * Existe porque el total del sistema y el de la OC no siempre coinciden —
 * centavos de redondeo, un flete que el cliente ya tenia cotizado, una
 * diferencia pactada por telefono — y sin un campo para eso la unica salida es
 * falsear un precio o inventar un descuento, que ensucia el historial de
 * precios y la base de comision.
 *
 * ── Lo que el ajuste NO es ─────────────────────────────────
 *
 * No es un descuento. Queda FUERA de `base_gravable`, asi que no causa IVA
 * (ver la migracion 20261113000000), y no entra en la comision: el prorrateo
 * de ./comisiones ya lo excluye porque esta en `total_con_envio` y no en
 * `total - descuento`. Eso lo vuelve correcto para cuadrar centavos y
 * peligroso para montos grandes, que es la razon de que el motivo sea
 * obligatorio y de que arriba del 5% se pida confirmacion.
 */

/** Arriba de esto, la UI y el servidor piden confirmacion explicita. */
export const TOLERANCIA_AJUSTE = 0.05

/** A centavos enteros, para no comparar dinero con floats. */
const centavos = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/**
 * El ajuste que hace que el pedido cierre en el total de la OC.
 *
 * Se redondea a centavos a proposito: el campo es `numeric(12,2)` y un ajuste
 * con tres decimales lo redondearia la base de datos, dejando un total que no
 * es el de la OC — justo lo que esto viene a evitar.
 *
 * Si la OC ya coincide, devuelve 0: no hay nada que ajustar, y guardar un
 * ajuste de cero obligaria a capturar un motivo para nada.
 */
export function ajusteParaCuadrar(totalOC: number, totalActual: number): number {
  return (centavos(totalOC) - centavos(totalActual)) / 100
}

/**
 * Si el ajuste pasa del 5% de lo que se cobraria sin el.
 *
 * `totalAntes` es `total - descuento + envio + IVA`. La comparacion va en
 * CENTAVOS ENTEROS (|ajuste| x 100 contra total x 5, que es lo mismo que
 * comparar contra el 5%) porque en float `2134 * 0.05` no siempre da 106.7, y
 * un pedido justo en el borde pediria confirmacion o no segun el bit de
 * redondeo.
 *
 * El limite es ESTRICTO: exactamente 5% no pide confirmacion.
 *
 * Con `totalAntes` en cero —un pedido sin partidas— cualquier ajuste excede.
 * Es lo correcto: ahi el ajuste no esta cuadrando nada, es el pedido entero.
 */
export function excedeTolerancia(ajuste: number, totalAntes: number): boolean {
  const a = Math.abs(centavos(ajuste))
  if (a === 0) return false
  const base = centavos(totalAntes)
  if (base <= 0) return true
  return a * 100 > base * (TOLERANCIA_AJUSTE * 100)
}

/** El motivo es obligatorio cuando hay ajuste. Puros espacios no cuentan. */
export const motivoValido = (motivo: unknown): boolean =>
  typeof motivo === 'string' && motivo.trim().length > 0

/**
 * Por que un ajuste no se puede guardar, en palabras. null si si se puede.
 *
 * Vive aqui y no en la ruta para que la pantalla pueda decir lo mismo antes de
 * mandar: que el servidor sea la autoridad no significa que el usuario tenga
 * que descubrir el error despues de picar Guardar.
 */
export function motivoRechazo(entrada: {
  ajuste: number
  motivo?: string | null
  /** total - descuento + envio + IVA, lo que se cobraria sin ajuste. */
  totalAntes: number
}): string | null {
  const ajuste = Number(entrada.ajuste)
  if (!Number.isFinite(ajuste)) return 'El ajuste tiene que ser un número.'
  if (ajuste !== 0 && !motivoValido(entrada.motivo)) {
    return 'El motivo del ajuste es obligatorio.'
  }
  // Un ajuste que deja el pedido cobrando en negativo es un error de captura.
  // No se clampa a 0: esconderlo seria peor, y el pedido saldria como
  // "pagado" con un saldo negativo que nada explica.
  if (centavos(entrada.totalAntes) + centavos(ajuste) < 0) {
    return 'Con ese ajuste el pedido quedaría en negativo.'
  }
  return null
}
