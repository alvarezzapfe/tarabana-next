import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import PedidosClient from './PedidosClient'
import { STAFF_ROLES, canManageAsAdmin, canWrite, isVendedor } from '../../../src/lib/roles'
import { nombreLegible } from '../../../src/lib/metricas'

export default async function TodosSection() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user!.id).single()
  const canEdit = canWrite(myProfile?.role)
  // El vendedor levanta pedidos pero no los edita ni registra pagos.
  const canCreate = canEdit || isVendedor(myProfile?.role)
  // Descuento y costo de envio son de admin y super admin, en la carga
  // masiva igual que en el formulario de un pedido.
  const puedeDescuento = canManageAsAdmin(myProfile?.role)

  const [{ data: pedidos }, { data: saldos }, { data: pagos }, { data: vendedores }, { data: staff }] = await Promise.all([
    supabase
      .from('pedidos')
      // `select('*')` ya trae las columnas nuevas de la migracion de fechas
      // (fecha_pedido, orden_compra, folio_factura, fecha_entrega_real).
      // `vendedores(nombre)` es nuevo: la tabla tiene columna de vendedor.
      .select('*, profiles!pedidos_cliente_id_fkey(id, full_name, email, razon_social, phone, tipo_consumidor, nivel_precio, calle, num_ext, num_int, colonia, municipio, estado, cp, referencias, direccion_entrega), vendedores(id, nombre), pedido_items(cantidad, precio_unitario, unidad, metadata, productos(nombre, estilo, imagen_url))')
      // Por fecha del PEDIDO, no por fecha de captura.
      .order('fecha_pedido', { ascending: false })
      .order('created_at', { ascending: false }),
    supabase.from('pedidos_saldo').select('*'),
    supabase.from('pagos').select('*').order('fecha_pago', { ascending: false }),
    // Para el filtro por vendedor: la lista completa, no solo los que
    // aparecen en los pedidos cargados.
    supabase.from('vendedores').select('id, nombre').order('nombre'),
    // Para "registrado por" en la pestana de Pagos del panel:
    // `pagos.registrado_por` apunta a auth.users, que no se puede embeber
    // desde `pagos` porque la FK no va a `profiles`. Son pocas filas.
    //
    // La policy `profiles_staff_read` deja leer esto al staff; a un vendedor
    // le llega vacio y la columna muestra un guion, que es la degradacion
    // correcta — un vendedor tampoco registra pagos.
    supabase.from('profiles').select('id, full_name, email, razon_social').in('role', [...STAFF_ROLES]),
  ])

  return (
    <PedidosClient
      pedidos={pedidos || []}
      saldos={saldos || []}
      pagos={pagos || []}
      vendedores={vendedores || []}
      staff={(staff || []).map(p => ({ id: p.id, nombre: nombreLegible(p) }))}
      canEdit={canEdit}
      canCreate={canCreate}
      puedeDescuento={puedeDescuento}
      esVendedor={isVendedor(myProfile?.role)}
    />
  )
}
