import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { construirPlantillaClientes, nombrePlantillaClientes } from '../../../../../src/lib/plantilla-clientes'
import { hoyMx } from '../../../../../src/lib/fechas'

/**
 * Entrega la plantilla .xlsx de carga masiva de clientes.
 *
 * Mismo guard que la carga: quien no puede crear clientes no necesita la
 * plantilla, y la plantilla trae los nombres de los vendedores.
 *
 * A un vendedor se le entrega sin el desplegable de vendedor —sus clientes
 * quedan en su cartera— pero CON todas las columnas: el formato tiene que
 * seguir siendo el del export para que el round-trip funcione igual para
 * todos.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  const role = profile?.role
  const esVendedor = isVendedor(role)
  if (!canWrite(role) && !esVendedor)
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  // `vendedores` pide is_staff() por RLS, asi que a un vendedor le llegaria
  // vacio de todos modos; se salta la consulta porque ni la usa.
  const vendedores = esVendedor
    ? []
    : ((await createServiceClient()
        .from('vendedores').select('id, nombre').eq('activo', true).order('nombre')
      ).data || []) as { id: string; nombre: string }[]

  const bytes = await construirPlantillaClientes({ vendedores, esVendedor })
  const nombre = nombrePlantillaClientes(hoyMx())

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      // Lleva la lista de vendedores del momento: no se cachea.
      'Cache-Control': 'no-store, must-revalidate',
      'Content-Length': String(bytes.byteLength),
    },
  })
}
