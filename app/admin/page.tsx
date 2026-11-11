import { createServerSupabaseClient } from '../../src/lib/supabase-server'
import { isStaffSinVentas, isVendedor } from '../../src/lib/roles'
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
        .select('id, cliente_id, total, pagado, saldo, iva_monto, status, estado_cobro, dias_vencido, fecha_pedido, created_at'),
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

  const [{ data: saldos }, { data: productos }, { data: pedidosItems }, { data: pagosRaw }] = await Promise.all([
    // Fuente unica de las metricas: ya excluye cancelados y trae pagado,
    // saldo, estado_cobro y dias_vencido calculados en SQL.
    supabase
      .from('pedidos_saldo')
      .select('id, cliente_id, total, pagado, saldo, iva_monto, status, estado_cobro, dias_vencido, fecha_pedido, created_at'),
    // Las columnas van literales y no armadas con COLUMNAS_STOCK porque un
    // select dinamico impide que Supabase infiera el tipo del resultado.
    // La conversion a litros si vive en un solo lugar: src/lib/unidades.ts.
    supabase
      .from('productos')
      .select('id, nombre, stock_latas, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero, stock_barril10_pet, stock_barril10_acero')
      .eq('activo', true),
    // Detalle a nivel de partida, que la vista no expone. Mismo criterio de
    // exclusion que pedidos_saldo para que los dos cuenten lo mismo.
    // `unidad` es imprescindible: sin ella no se puede convertir la partida a
    // litros y el top de productos tendria que contar piezas, que mezcla una
    // caja de 24 con un barril de 20 L como si fueran lo mismo.
    //
    // `fecha_pedido` tambien: es la que ubica la partida en el periodo. Sin
    // ella los litros vendidos y el top de productos serian historicos
    // mientras el resto del tablero se mueve con el selector.
    supabase
      .from('pedidos')
      .select('id, fecha_pedido, pedido_items(cantidad, unidad, productos(nombre))')
      .neq('status', 'cancelado'),
    // Los pagos, para medir Cobrado por FECHA DE PAGO.
    //
    // `pedidos_saldo.pagado` no sirve para eso: es la suma de los pagos de un
    // pedido, sin fecha, asi que un pedido de agosto cobrado en noviembre
    // contaria como cobro de agosto. La pregunta "cuanto entro este mes" solo
    // se puede contestar desde `pagos`.
    //
    // Se descartan los cancelados (`cancelado_at`, que es como se corrige un
    // pago: nunca se borran) y, con `pedidos!inner`, los de pedidos
    // cancelados, para contar lo mismo que la vista. SELECT sobre `pagos` es
    // is_staff(), y aqui ya estamos en la rama de staff.
    supabase
      .from('pagos')
      .select('monto, fecha_pago, pedidos!inner(status)')
      .is('cancelado_at', null)
      .neq('pedidos.status', 'cancelado'),
  ])

  // El embed de `pedidos` existe nada mas para filtrar del lado del servidor;
  // no tiene por que viajar al navegador.
  const pagos = (pagosRaw || []).map(p => ({ monto: p.monto, fecha_pago: p.fecha_pago }))

  // Los nombres se piden por los cliente_id que REALMENTE aparecen en la
  // vista, no con `role = 'comprador'`.
  //
  // Filtrar por rol dejaba sin nombre a todo pedido levantado a nombre de
  // alguien que no es comprador, y en produccion son 3 de 12: dos perfiles
  // con rol `produccion` y uno `super_admin`, personas reales con pedidos
  // reales. En el top de clientes salian como "Cliente sin nombre" y en
  // cobranza como un guion, que es justo lo que no debe pasar.
  //
  // Va en una segunda consulta porque depende de los ids de la primera; a
  // cambio trae exactamente los perfiles que se van a pintar y ninguno mas.
  const clienteIds = [...new Set((saldos || []).map(f => f.cliente_id).filter(Boolean) as string[])]
  const { data: clientes } = clienteIds.length
    ? await supabase.from('profiles').select('id, full_name, email, razon_social, marca_negocio').in('id', clienteIds)
    : { data: [] }

  return (
    <DashboardClient
      saldos={saldos || []}
      productos={productos || []}
      clientes={clientes || []}
      pedidosItems={pedidosItems || []}
      pagos={pagos}
      // El reporte imprimible vive detras del mismo permiso que Finanzas, asi
      // que ventas ve el tablero pero no el boton. El guard de verdad esta en
      // /admin/reporte y en su ruta de export; esto solo decide si se pinta.
      puedeReporte={isStaffSinVentas(yo?.role)}
      ahoraISO={new Date().toISOString()}
    />
  )
}
