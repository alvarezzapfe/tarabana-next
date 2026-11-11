/**
 * Lectura de lo que necesita el reporte imprimible.
 *
 * Lo comparten la pagina (`/admin/reporte`) y el export a Excel, para que las
 * dos salidas se armen sobre exactamente las mismas filas: un PDF y un .xlsx
 * del mismo periodo que no cuadraran entre si serian peores que no tener
 * ninguno.
 *
 * Aqui no hay ni una operacion: todo el calculo vive en ./metricas y la
 * composicion en ./reporte. El cliente de Supabase lo recibe de quien llama,
 * asi que RLS hace el recorte con el rol de quien pidio el reporte.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { DatosCliente, DatosPeriodo } from './metricas.ts'
import { COLUMNAS_STOCK, type FilaStock } from './unidades.ts'

export type DatosReporte = {
  datos: DatosPeriodo
  /** Solo los productos activos: el stock de un descontinuado no es inventario. */
  stock: FilaStock[]
  clientes: DatosCliente[]
  /** producto_id -> estilo. Resuelve los estilos de una caja mixta. */
  estiloDeProducto: Map<string, string | null>
}

export async function cargarDatosReporte(supabase: SupabaseClient): Promise<DatosReporte> {
  const [{ data: saldos }, { data: pedidos }, { data: pagosRaw }, { data: productos }] = await Promise.all([
    // `fecha_vencimiento` ademas de lo de siempre: la tabla de cobranza la
    // muestra. El atraso sigue saliendo de `dias_vencido`, que la vista ya
    // calcula contra CURRENT_DATE.
    supabase
      .from('pedidos_saldo')
      .select('id, cliente_id, total, pagado, saldo, iva_monto, status, estado_cobro, dias_vencido, fecha_pedido, fecha_vencimiento, created_at'),

    // `precio_unitario` y `metadata` ademas de cantidad y unidad: el primero
    // es la base con la que se reparte el neto del pedido entre sus partidas
    // (ver `partidasValuadas`), y el segundo trae el desglose por estilo de
    // las cajas mixtas, sin el cual una caja de cuatro estilos se le
    // atribuiria entera al primero.
    supabase
      .from('pedidos')
      .select('id, fecha_pedido, pedido_items(cantidad, unidad, precio_unitario, metadata, productos(id, nombre, estilo))')
      .neq('status', 'cancelado'),

    supabase
      .from('pagos')
      .select('monto, fecha_pago, pedidos!inner(status)')
      .is('cancelado_at', null)
      .neq('pedidos.status', 'cancelado'),

    // TODOS los productos, activos o no: un pedido viejo puede traer un
    // producto ya descontinuado, y sin su estilo esa venta caeria en "Sin
    // estilo". El filtro de activos solo aplica al stock, mas abajo.
    supabase
      .from('productos')
      .select('id, nombre, estilo, activo, stock_latas, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero, stock_barril10_pet, stock_barril10_acero'),
  ])

  const filas = saldos || []

  // Los nombres se piden por los cliente_id que REALMENTE aparecen en la
  // vista y no por `role = 'comprador'`: en produccion hay pedidos a nombre de
  // perfiles con rol interno, y filtrar por rol los dejaba como "Cliente sin
  // nombre" en el reporte.
  const clienteIds = [...new Set(filas.map(f => f.cliente_id).filter(Boolean) as string[])]
  const { data: clientes } = clienteIds.length
    ? await supabase.from('profiles').select('id, full_name, email, razon_social, marca_negocio').in('id', clienteIds)
    : { data: [] }

  const lista = productos || []

  return {
    datos: {
      saldos: filas,
      pedidos: pedidos || [],
      pagos: (pagosRaw || []).map(p => ({ monto: p.monto, fecha_pago: p.fecha_pago })),
    },
    stock: lista
      .filter(p => p.activo)
      .map(p => Object.fromEntries(COLUMNAS_STOCK.map(c => [c, p[c]])) as FilaStock),
    clientes: clientes || [],
    estiloDeProducto: new Map(lista.map(p => [p.id as string, (p.estilo as string | null) ?? null])),
  }
}
