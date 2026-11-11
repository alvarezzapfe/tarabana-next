import { NextResponse } from 'next/server'
import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { cargarComprometido } from '../../../../../src/lib/crear-pedido'
import { comprometidoAJSON } from '../../../../../src/lib/stock-disponible'

/**
 * Lo que los pedidos abiertos ya tienen comprometido, por producto y columna
 * de stock.
 *
 * Existe porque el POS es una pantalla de cliente y el comprometido NO se
 * puede calcular desde el navegador: la policy `pedidos_vendedor_read` acota
 * al vendedor a sus propios pedidos, asi que un vendedor sumando partidas con
 * su sesion veria menos comprometido del que hay —y por lo tanto mas
 * disponible— y podria vender producto que ya tiene dueno. Aqui se calcula con
 * el service client, que ve todos.
 *
 * Lo que devuelve son CANTIDADES AGREGADAS por producto y columna. No sale ni
 * un id de pedido ni un nombre de cliente, asi que un vendedor no se enterade
 * nada de los pedidos de los demas mas alla de que ese producto esta apartado,
 * que es justo lo que necesita saber para no sobrevender.
 *
 * `sinClasificar` va como CONTEO y no como detalle por la misma razon: el
 * detalle (que pedido, de que cliente) lo arma Inventario del lado del
 * servidor, donde quien lo ve ya es staff.
 *
 * `?excepto=<pedido_id>` deja ese pedido fuera del conteo. Lo usa la edicion
 * de partidas: lo que el pedido que se esta editando ya tenia apartado tiene
 * que volver a estar disponible para el, o no se podria subir de 10 a 11
 * cajas aunque hubiera 40 sueltas.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  // El mismo permiso que levantar un pedido: quien puede vender tiene que
  // poder ver contra que se valida.
  if (!canWrite(profile?.role) && !isVendedor(profile?.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const excepto = new URL(request.url).searchParams.get('excepto') || undefined
  const { por, sinClasificar } = await cargarComprometido(createServiceClient(), { excepto })

  return NextResponse.json(
    { comprometido: comprometidoAJSON(por), sinClasificar: sinClasificar.length },
    // Sin cache: es justo el numero que cambia cada vez que alguien vende.
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
