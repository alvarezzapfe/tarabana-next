import { createServerSupabaseClient } from '../../src/lib/supabase-server'
import DashboardClient from './DashboardClient'

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient()

  const [{ data: saldos }, { data: productos }, { data: clientes }, { data: pedidosItems }] = await Promise.all([
    // Fuente unica de las metricas: ya excluye cancelados y trae pagado,
    // saldo, estado_cobro y dias_vencido calculados en SQL.
    supabase
      .from('pedidos_saldo')
      .select('id, cliente_id, total, pagado, saldo, status, estado_cobro, dias_vencido, created_at'),
    // Las columnas van literales y no armadas con COLUMNAS_STOCK porque un
    // select dinamico impide que Supabase infiera el tipo del resultado.
    // La conversion a litros si vive en un solo lugar: src/lib/unidades.ts.
    supabase
      .from('productos')
      .select('id, nombre, stock_latas, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero, stock_barril10_pet, stock_barril10_acero')
      .eq('activo', true),
    // Solo para resolver nombres; los montos salen de la vista.
    supabase.from('profiles').select('id, full_name, email').eq('role', 'comprador'),
    // Detalle a nivel de partida, que la vista no expone. Mismo criterio de
    // exclusion que pedidos_saldo para que los dos cuenten lo mismo.
    supabase
      .from('pedidos')
      .select('id, pedido_items(cantidad, productos(nombre))')
      .neq('status', 'cancelado'),
  ])

  return (
    <DashboardClient
      saldos={saldos || []}
      productos={productos || []}
      clientes={clientes || []}
      pedidosItems={pedidosItems || []}
      ahoraISO={new Date().toISOString()}
    />
  )
}
