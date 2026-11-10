import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '../../../../../src/lib/supabase-server'
import { isStaffSinVentas } from '../../../../../src/lib/roles'
import { resolverPeriodo } from '../../../../../src/lib/metricas'
import { construirLibro, validarHojas } from '../../../../../src/lib/libro-xlsx'
import { cargarDatosReporte } from '../../../../../src/lib/reporte-datos'
import { armarReporte, hojasDeReporte, nombreArchivo } from '../../../../../src/lib/reporte'

/**
 * El mismo reporte del periodo, en .xlsx. Una hoja por seccion.
 *
 * A diferencia del export de Pedidos, aqui el contenido NO lo manda el
 * navegador: la ruta vuelve a leer los datos y vuelve a armar el reporte con
 * las mismas funciones que la pagina. Dos razones:
 *
 *   - El reporte son ocho tablas y varias series; mandarlas por POST para que
 *     el servidor solo las escriba seria mover medio megabyte de JSON para no
 *     ahorrar nada.
 *   - Asi el boton es un <a href> y funciona sin JS, incluso desde la vista de
 *     impresion.
 *
 * Que el archivo cuadre con lo impreso no depende de disciplina: las dos
 * salidas llaman a `armarReporte`, y `hojasDeReporte` solo traduce ese objeto.
 *
 * El permiso es `isStaffSinVentas`, el mismo de la pagina y de Finanzas. Las
 * consultas van con el cliente de la sesion, asi que RLS vuelve a acotar lo
 * que el rol puede leer.
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (!isStaffSinVentas(profile?.role)) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const q = new URL(request.url).searchParams
  const ahora = new Date()
  const { rango } = resolverPeriodo(
    {
      periodo: q.get('periodo') ?? undefined,
      desde: q.get('desde') ?? undefined,
      hasta: q.get('hasta') ?? undefined,
    },
    ahora
  )

  const fuente = await cargarDatosReporte(supabase)
  const reporte = armarReporte(fuente, rango, ahora)

  // `validarHojas` es el mismo guard del otro export: aqui las hojas las arma
  // el servidor, asi que no deberia disparar nunca, pero un periodo de dos
  // anios con mucha cartera si puede pasarse del tope de renglones, y es mejor
  // decirlo que mandar un archivo truncado.
  const hojas = validarHojas(hojasDeReporte(reporte))
  if ('error' in hojas) return NextResponse.json({ error: hojas.error }, { status: 400 })

  const bytes = await construirLibro(hojas)
  const nombre = nombreArchivo(rango).replace(/[^\w.\-]+/g, '-')

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(bytes.byteLength),
    },
  })
}
