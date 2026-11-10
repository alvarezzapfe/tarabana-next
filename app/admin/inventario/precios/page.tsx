import { createServiceClient } from '../../../../src/lib/supabase-server'
import { isSuperAdmin } from '../../../../src/lib/roles'
import { contextoAdmin } from '../../../../src/lib/admin-contexto'
import { tabsParaRol } from '../../../../src/lib/admin-nav'
import Tabs from '../../Tabs'
import { cargarComprometido } from '../../../../src/lib/crear-pedido'
import { comprometidoAJSON } from '../../../../src/lib/stock-disponible'
import PreciosClient from './PreciosClient'

/**
 * Lista de precios, editable como una hoja de calculo.
 *
 * Permiso `isSuperAdmin`, el mismo que los precios de la ficha del producto
 * (`/admin/inventario/edit/[id]`) y el mismo guard de la ruta que guarda:
 * mover un precio cambia lo que se le cobra a todos los clientes.
 *
 * El stock que se muestra de referencia es el DISPONIBLE (fisico menos lo
 * comprometido en pedidos abiertos), igual que el POS: poner un precio mirando
 * existencias que ya tienen dueno es justo el error que esa distincion evita.
 */
export const metadata = { title: 'Lista de precios — Tarabaña' }

export default async function PreciosPage() {
  const { supabase, role, acento } = await contextoAdmin()

  if (!isSuperAdmin(role)) {
    return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>
  }

  const [{ data: productos }, apartado] = await Promise.all([
    // Las columnas van literales: un select dinamico impide que Supabase
    // infiera el tipo del resultado.
    supabase
      .from('productos')
      .select('id, nombre, estilo, activo, precio_lata_publico, precio_lata_taproom, precio_barril_pet_publico, precio_barril_pet_taproom, precio_barril_acero_publico, precio_barril_acero_taproom, precio_barril10_pet_publico, precio_barril10_pet_taproom, precio_barril10_acero_publico, precio_barril10_acero_taproom, stock_latas, stock_caja12, stock_caja24, stock_barril_pet, stock_barril_acero, stock_barril10_pet, stock_barril10_acero')
      .order('nombre'),
    // Con el service client: el comprometido tiene que ser global, no lo que
    // la sesion alcance a ver (ver src/lib/stock-disponible.ts).
    cargarComprometido(createServiceClient()),
  ])

  return (
    <>
      <Tabs
        tabs={tabsParaRol('inventario', role)}
        activa="precios"
        basePath="/admin/inventario"
        acento={acento}
      />
      <PreciosClient
        productos={productos || []}
        comprometido={comprometidoAJSON(apartado.por)}
        acento={acento}
      />
    </>
  )
}
