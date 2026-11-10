import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { isStaffSinVentas } from '../../../src/lib/roles'
import type { SearchParams } from '../../../src/lib/admin-contexto'
import { queryPeriodo, resolverPeriodo } from '../../../src/lib/metricas'
import { cargarDatosReporte } from '../../../src/lib/reporte-datos'
import { armarReporte, periodoLegible } from '../../../src/lib/reporte'
import BarraAcciones from './BarraAcciones'
import SeccionResumen from './SeccionResumen'
import SeccionVentas from './SeccionVentas'
import SeccionCrecimiento from './SeccionCrecimiento'
import { CSS_REPORTE, GRIS_SUAVE } from './reporte-ui'

/**
 * Reporte imprimible del periodo.
 *
 * Server component de punta a punta, salvo los dos botones: una pagina pensada
 * para salir en papel no deberia depender de que el navegador ejecute nada
 * para mostrar sus numeros. Tambien por eso las graficas son SVG servido y no
 * una libreria que mide el contenedor en el cliente.
 *
 * El periodo llega por la URL y lo resuelve `resolverPeriodo`, el mismo que
 * usa el Inicio: el boton "Imprimir reporte" de alla trae el periodo puesto, y
 * los dos tienen que entenderlo igual.
 *
 * Permiso: `isStaffSinVentas`, el mismo predicado que Finanzas (ver
 * src/lib/admin-nav.ts). El vendedor y ventas no entran. El guard esta aqui y
 * no solo en el sidebar porque esta ruta no se alcanza desde ahi.
 */
/**
 * El titulo va al encabezado que el navegador imprime en cada hoja (y al
 * nombre propuesto al guardar como PDF). Sin esto, las hojas salen rotuladas
 * "Tarabaña — Fábrica de Cervezas Artesanales", que es el titulo del sitio.
 */
export const metadata = { title: 'Reporte de operación — Tarabaña' }

export default async function ReportePage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: yo } = await supabase.from('profiles').select('role').eq('id', user!.id).single()

  if (!isStaffSinVentas(yo?.role)) {
    return <p style={{ color: '#6b7280', fontSize: 14 }}>Sin acceso a esta sección.</p>
  }

  const params = await searchParams
  // Una sola marca de tiempo para todo el reporte: si cada seccion llamara a
  // `new Date()`, un reporte generado a las 23:59:59 podria mezclar dos dias.
  const ahora = new Date()
  const { clave, rango } = resolverPeriodo(params, ahora)

  const fuente = await cargarDatosReporte(supabase)
  const r = armarReporte(fuente, rango, ahora)

  const query = queryPeriodo(clave, rango)
  const sufijo = query ? `?${query}` : ''

  return (
    <>
      <style>{CSS_REPORTE}</style>

      <div className="rep-fondo">
        <BarraAcciones
          urlExcel={`/api/admin/reporte/exportar${sufijo}`}
          urlInicio={`/admin${sufijo}`}
        />

        <article className="rep-hoja">
          <header className="rep-head">
            <div>
              <p className="rep-marca">Tarabaña</p>
              <p className="rep-nombre">Reporte de operación</p>
            </div>
            <div className="rep-meta">
              <p>{periodoLegible(r.rango)}</p>
              <p style={{ color: GRIS_SUAVE }}>Generado {r.generado} (hora de México)</p>
            </div>
          </header>

          <SeccionResumen r={r} />
          <SeccionVentas r={r} />
          <SeccionCrecimiento r={r} />

          <footer className="rep-pie">
            <span>Tarabaña · Reporte de operación · {periodoLegible(r.rango)}</span>
            <span>
              Montos netos de descuento y envío. Generado {r.generado}.
            </span>
          </footer>
        </article>
      </div>
    </>
  )
}
