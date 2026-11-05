/**
 * Lectura de lo que necesita el calculo de comisiones.
 *
 * Lo comparten Comercial -> Comisiones (super admin, ve a todos) y el Inicio
 * del vendedor (se ve a si mismo). La misma funcion sirve para los dos porque
 * recibe el cliente de Supabase del llamador y RLS hace el recorte: el
 * vendedor solo tiene policy de SELECT sobre sus pedidos y sus pagos, asi que
 * las mismas consultas le devuelven solo lo suyo.
 *
 * Aqui no hay ni una operacion de dinero: todo eso vive en ./comisiones.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  IEPS_TASA_DEFAULT,
  IVA_TASA_DEFAULT,
  type PagoParaComision,
  type PedidoParaComision,
  type TramoFila,
} from './comisiones'

export type DatosComision = {
  pagos: PagoParaComision[]
  pedidos: PedidoParaComision[]
  tramos: TramoFila[]
  ivaTasa: number
  iepsTasa: number
}

/** Las tasas vigentes, o los defaults si la fila no esta o no se puede leer. */
export async function cargarTasas(supabase: SupabaseClient): Promise<{ ivaTasa: number; iepsTasa: number }> {
  const { data } = await supabase.from('app_config').select('value').eq('key', 'impuestos').maybeSingle()

  const iva = Number(data?.value?.iva_tasa)
  const ieps = Number(data?.value?.ieps_tasa)

  return {
    ivaTasa: Number.isFinite(iva) && iva >= 0 ? iva : IVA_TASA_DEFAULT,
    iepsTasa: Number.isFinite(ieps) && ieps >= 0 ? ieps : IEPS_TASA_DEFAULT,
  }
}

/**
 * Pagos, pedidos y escalera para calcular comisiones.
 *
 * Trae los pagos de TODOS los meses, no solo los del periodo que se va a
 * calcular: el tope de sobrepago es por pedido y acumulado en el tiempo, asi
 * que `calcularComision` necesita el historial completo del pedido para saber
 * cuanto de un pago ya no es venta. El filtro del mes lo aplica el calculo.
 */
export async function cargarDatosComision(supabase: SupabaseClient): Promise<DatosComision> {
  const [{ ivaTasa, iepsTasa }, { data: tramos }, { data: pagosRaw }] = await Promise.all([
    cargarTasas(supabase),
    supabase.from('comision_tramos').select('vendedor_id, desde, hasta, porcentaje').order('desde'),

    // `pedidos!inner` filtra del lado del servidor a los pagos de pedidos que
    // tienen vendedor: un pedido sin vendedor_id no comisiona a nadie y no
    // tiene por que viajar. Tambien se descartan aqui los pagos cancelados;
    // el calculo igual los filtra, por si esta consulta cambia.
    supabase
      .from('pagos')
      .select('id, pedido_id, monto, fecha_pago, cancelado_at, pedidos!inner(vendedor_id)')
      .is('cancelado_at', null)
      .not('pedidos.vendedor_id', 'is', null)
      .order('fecha_pago'),
  ])

  const pagos: PagoParaComision[] = (pagosRaw || []).map(p => ({
    pago_id: p.id,
    pedido_id: p.pedido_id,
    monto: p.monto,
    fecha_pago: p.fecha_pago,
    cancelado_at: p.cancelado_at,
  }))

  /** vendedor_id del pedido, que `pedidos_saldo` no expone. */
  const vendedorDe = new Map<string, string | null>()
  for (const p of pagosRaw || []) {
    // El embed de un to-one en PostgREST llega como objeto; segun la version
    // del cliente puede venir tipado como arreglo.
    const rel = (p as { pedidos?: { vendedor_id: string | null } | { vendedor_id: string | null }[] }).pedidos
    const ped = Array.isArray(rel) ? rel[0] : rel
    vendedorDe.set(p.pedido_id, ped?.vendedor_id ?? null)
  }

  const ids = [...vendedorDe.keys()]

  // Los montos salen de `pedidos_saldo` y no de `pedidos` para no
  // reimplementar su redondeo del descuento porcentual (ver
  // docs/SCHEMA_NOTES.md). De paso, la vista excluye los cancelados: el pago
  // de un pedido cancelado se queda sin montos y el calculo lo descarta.
  const { data: saldos } = ids.length
    ? await supabase
        .from('pedidos_saldo')
        .select('id, total, descuento_monto, total_con_envio')
        .in('id', ids)
    : { data: [] }

  const pedidos: PedidoParaComision[] = (saldos || []).map(s => ({
    id: s.id,
    vendedor_id: vendedorDe.get(s.id) ?? null,
    total: s.total,
    descuento_monto: s.descuento_monto,
    total_con_envio: s.total_con_envio,
  }))

  return { pagos, pedidos, tramos: tramos || [], ivaTasa, iepsTasa }
}
