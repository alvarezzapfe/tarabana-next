import { createServerSupabaseClient } from '../../src/lib/supabase-server'
import { isVendedor } from '../../src/lib/roles'
import { cargarDatosComision } from '../../src/lib/comisiones-datos'
import { comisionesPorVendedor, periodoDeFecha } from '../../src/lib/comisiones'
import DashboardClient from './DashboardClient'
import DashboardVendedor from './DashboardVendedor'

export default async function AdminDashboard() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: yo } = await supabase.from('profiles').select('role, full_name').eq('id', user!.id).single()

  // El vendedor ve su propio Inicio. No se le arma el del staff ni se le
  // consultan productos: nada de inventario. Las filas que recibe ya vienen
  // acotadas por RLS, no hace falta filtrar por vendedor_id aqui.
  if (isVendedor(yo?.role)) {
    const [{ data: misSaldos }, { count: misClientes }, { data: miVendedorId }, datos] = await Promise.all([
      supabase
        .from('pedidos_saldo')
        .select('id, cliente_id, total, pagado, saldo, status, estado_cobro, dias_vencido, created_at'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'comprador'),
      // Su propia ficha por RPC y no con un select: `vendedores` pide
      // is_staff() para leer y el vendedor no lo es. `mi_vendedor_id()` es
      // security definer, esta otorgada a authenticated y ya es fail-closed
      // (devuelve null si le quitaron el rol o desactivaron la ficha).
      supabase.rpc('mi_vendedor_id'),
      cargarDatosComision(supabase),
    ])

    // Sin ficha ligada no hay a quien comisionar — y tampoco tendria pedidos.
    const comision = miVendedorId
      ? comisionesPorVendedor({
          vendedorIds: [miVendedorId],
          pagos: datos.pagos,
          pedidos: datos.pedidos,
          tramos: datos.tramos,
          periodo: periodoDeFecha(new Date()),
          ivaTasa: datos.ivaTasa,
          iepsTasa: datos.iepsTasa,
        })[0]
      : null

    return (
      <DashboardVendedor
        saldos={misSaldos || []}
        clientesEnCartera={misClientes || 0}
        nombre={yo?.full_name || ''}
        comision={comision}
        ahoraISO={new Date().toISOString()}
      />
    )
  }

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
