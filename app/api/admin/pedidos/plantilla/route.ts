import { createServerSupabaseClient, createServiceClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canManageAsAdmin, canWrite, isVendedor } from '../../../../../src/lib/roles'
import { construirPlantilla } from '../../../../../src/lib/plantilla-pedidos'
import { cargarCatalogoImport } from '../../../../../src/lib/catalogo-import'

/**
 * Entrega la plantilla .xlsx de carga masiva, armada con el catalogo vivo.
 *
 * El contenido depende de quien la pide:
 *   - admin / super admin: trae las columnas de costo de envio y descuento.
 *   - vendedor: la hoja Clientes solo trae su cartera.
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

  const service = createServiceClient()
  const catalogo = await cargarCatalogoImport({ service, userId: user.id, esVendedor })
  if ('error' in catalogo)
    return NextResponse.json({ error: catalogo.error }, { status: catalogo.status })

  const bytes = await construirPlantilla({
    productos: catalogo.productos,
    clientes: catalogo.clientes,
    puedeDescuento: canManageAsAdmin(role),
    esVendedor,
  })

  const fecha = new Date().toISOString().slice(0, 10)
  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="Plantilla-pedidos-Tarabana-${fecha}.xlsx"`,
      // La plantilla lleva el catalogo y los precios del momento: no se
      // cachea ni en el navegador ni en un proxy.
      'Cache-Control': 'no-store, must-revalidate',
      'Content-Length': String(bytes.byteLength),
    },
  })
}
