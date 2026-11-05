/**
 * El catalogo que necesitan la plantilla y la importacion: productos activos
 * y los clientes que quien sube puede usar.
 *
 * Vive aparte de las dos rutas para que las dos vean exactamente lo mismo: si
 * la plantilla ofreciera un cliente que la importacion no acepta, la gente
 * capturaria pedidos que el sistema va a rechazar.
 *
 * Se usa el service client a proposito. Para el vendedor, RLS sobre
 * `profiles` ya lo acotaria a su cartera, pero el filtro se hace explicito
 * (`vendedor_id = su ficha`) para que la regla se lea aqui en vez de quedar
 * implicita en una policy, y para que la plantilla y la validacion no puedan
 * discrepar.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { nombreLegible } from './metricas'
import type { ClienteCatalogo, ProductoCatalogo } from './pedidos-importar'

export type CatalogoImport = {
  productos: ProductoCatalogo[]
  clientes: ClienteCatalogo[]
  /** La ficha del vendedor, si quien sube es uno. */
  vendedorId: string | null
}

export type ErrorCatalogo = { error: string; status: number }

export async function cargarCatalogoImport(opciones: {
  service: SupabaseClient
  userId: string
  esVendedor: boolean
}): Promise<CatalogoImport | ErrorCatalogo> {
  const { service, userId, esVendedor } = opciones

  let vendedorId: string | null = null
  if (esVendedor) {
    const { data: ficha } = await service
      .from('vendedores').select('id').eq('profile_id', userId).eq('activo', true).maybeSingle()
    if (!ficha) {
      return {
        error: 'Tu usuario no esta ligado a una ficha de vendedor activa. Pide a un super admin que la asigne.',
        status: 403,
      }
    }
    vendedorId = ficha.id
  }

  // `select('*')` porque `precioUnitario` y `columnaStockDe` leen columnas de
  // precio y de stock que varian por presentacion; enumerarlas aqui seria un
  // segundo lugar que mantener cada vez que entre una presentacion nueva.
  const consultaProductos = service.from('productos').select('*').eq('activo', true).order('nombre')

  const consultaClientes = esVendedor
    ? service.from('profiles')
        .select('id, full_name, email, razon_social, nivel_precio')
        .eq('vendedor_id', vendedorId!)
    : service.from('profiles')
        .select('id, full_name, email, razon_social, nivel_precio')
        .eq('role', 'comprador')

  const [{ data: productos }, { data: perfiles }] = await Promise.all([consultaProductos, consultaClientes])

  const clientes: ClienteCatalogo[] = (perfiles || []).map(p => ({
    id: p.id,
    email: p.email,
    // El mismo nombre que ve en el resto del panel: razon social primero.
    nombre: nombreLegible(p),
    nivel_precio: p.nivel_precio,
  }))

  return {
    productos: (productos || []) as ProductoCatalogo[],
    clientes,
    vendedorId,
  }
}
