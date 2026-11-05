import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { NextResponse } from 'next/server'
import { canWrite, isVendedor } from '../../../../../src/lib/roles'
import { construirLibro, validarHojas } from '../../../../../src/lib/libro-xlsx'

/**
 * Convierte en .xlsx las hojas que le manda la pantalla de Pedidos.
 *
 * El contenido lo arma el cliente, igual que cuando el export se generaba
 * ahi mismo con `xlsx`: son los renglones que ya tiene en pantalla, que ya
 * pasaron por RLS cuando se cargaron. Esta ruta no agrega datos ni consulta
 * la DB, solo escribe el archivo, asi que no abre ninguna via para sacar algo
 * que quien exporta no pudiera ver.
 *
 * Existe para que exceljs no viaje al navegador.
 */
export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!canWrite(profile?.role) && !isVendedor(profile?.role))
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  let body: { hojas?: unknown; archivo?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido.' }, { status: 400 })
  }

  const hojas = validarHojas(body.hojas)
  if ('error' in hojas) return NextResponse.json({ error: hojas.error }, { status: 400 })

  const bytes = await construirLibro(hojas)

  const nombre = typeof body.archivo === 'string' && body.archivo.trim()
    // Solo lo que puede ir en un nombre de archivo, y sin rutas.
    ? body.archivo.replace(/[^\w.\-]+/g, '-').slice(0, 80)
    : 'Export-Tarabana.xlsx'

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.byteLength),
    },
  })
}
