import { createServiceClient } from '../../../src/lib/supabase-server'
import InventarioClient from './InventarioClient'
import { canManageInventory } from '../../../src/lib/roles'
import { contextoAdmin } from '../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../src/lib/admin-nav'
import Tabs from '../Tabs'
import { cargarComprometido } from '../../../src/lib/crear-pedido'
import { comprometidoAJSON } from '../../../src/lib/stock-disponible'

export default async function InventarioPage() {
  const { supabase, role, acento } = await contextoAdmin()

  // Guard propio, no solo canEdit. Antes la pagina renderizaba para cualquier
  // rol con acceso al panel y solo desactivaba la edicion, asi que un vendedor
  // que escribiera la URL veia toda la tabla de stock en modo lectura.
  if (!canManageInventory(role)) {
    return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>
  }

  const [{ data: productos }, { data: countRows }, apartado, { data: enCamino }] = await Promise.all([
    supabase.from('productos').select('*').order('nombre'),
    supabase.rpc('pedido_items_count_by_producto'),
    // Lo comprometido en pedidos abiertos, con el service client: tiene que
    // ser global, no lo que la sesion alcance a ver. Aqui quien mira ya pasó
    // el guard de inventario, asi que el detalle de las partidas que no se
    // pudieron clasificar tambien se le muestra — es la pantalla donde se
    // corrigen.
    cargarComprometido(createServiceClient()),
    // Litros proyectados por producto para los proximos 14 dias. El calculo
    // vive en la vista `inventario_en_camino`, que tambien devuelve
    // `lotes_sin_fecha`: los lotes que no se pudieron proyectar NO estan
    // sumados en `litros`, y la pantalla lo dice en vez de esconderlos
    // dentro del total.
    supabase.from('inventario_en_camino').select('*'),
  ])
  const canEdit = canManageInventory(role)

  const pedidoCounts: Record<string, number> = {}
  for (const row of countRows || []) {
    pedidoCounts[row.producto_id] = row.count
  }

  return (
    <>
      {/* Las pestanas de Inventario son rutas, no `?tab=`: cada pagina pinta
          la cabecera con su propia `activa`. Sin titulo, porque
          InventarioClient ya trae el suyo. */}
      <Tabs
        tabs={tabsParaRol('inventario', role)}
        activa="existencias"
        basePath="/admin/inventario"
        acento={acento}
      />
      <InventarioClient
        productos={productos || []}
        canEdit={canEdit}
        pedidoCounts={pedidoCounts}
        comprometido={comprometidoAJSON(apartado.por)}
        sinClasificar={apartado.sinClasificar}
        enCamino={Object.fromEntries(
          (enCamino || []).map(r => [r.producto_id, { litros: Number(r.litros) || 0, lotes: r.lotes || 0, sinFecha: r.lotes_sin_fecha || 0 }])
        )}
      />
    </>
  )
}
