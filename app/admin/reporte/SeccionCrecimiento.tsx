import { PRESENTACIONES } from '../../../src/lib/metricas'
import { periodoLegible, type Reporte } from '../../../src/lib/reporte'
import Columnas from './Columnas'
import {
  ACENTO, GRIS, GRISES, ROJO, TINTA_MEDIA, VERDE,
  enteros, litros, moneda, monedaCorta, varTexto,
} from './reporte-ui'

/**
 * Seccion 3: crecimiento.
 *
 * Mira una ventana distinta a las dos secciones de arriba: 12 meses (24 si el
 * periodo elegido ya pasa de 12), termine donde termine el periodo. Un reporte
 * del mes no puede contestar "estamos creciendo" con un solo mes de datos, y
 * cortar la tendencia al periodo seria justamente eso.
 */

/** Las presentaciones que de verdad aparecen en la mezcla, de mayor a menor. */
function presentacionesDeLaMezcla(r: Reporte): { unidad: string; label: string; color: string }[] {
  const totales = new Map<string, number>()
  for (const m of r.mezcla) {
    for (const [u, l] of Object.entries(m.porUnidad)) totales.set(u, (totales.get(u) || 0) + l)
  }
  return [...totales.entries()]
    .filter(([, l]) => l > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([unidad], i) => ({
      unidad,
      label: PRESENTACIONES.find(p => p.unidad === unidad)?.label || unidad,
      // La mas vendida lleva el acento; el resto, grises de oscuro a claro.
      color: i === 0 ? ACENTO : GRISES[Math.min(i - 1, GRISES.length - 1)],
    }))
}

export default function SeccionCrecimiento({ r }: { r: Reporte }) {
  const mezcla = presentacionesDeLaMezcla(r)
  const conDatos = r.crecimiento.filter(p => p.facturado > 0)
  const mejor = [...conDatos].sort((a, b) => b.facturado - a.facturado)[0]

  return (
    <section className="rep-sec">
      <h2 className="rep-sec-titulo"><span>3</span>Crecimiento</h2>

      <h3 className="rep-sub">Tendencia de {r.meses} meses</h3>
      <div className="rep-grafica">
        <Columnas
          puntos={r.crecimiento.map(p => ({ etiqueta: p.etiqueta, valores: [p.facturado] }))}
          series={[{ label: 'Facturado', color: ACENTO }]}
          comparacion={{ label: 'Año anterior', valores: r.crecimiento.map(p => p.anoAnterior) }}
          eje={monedaCorta}
        />
        <div className="rep-leyenda">
          <span><i style={{ background: ACENTO }} />Facturado</span>
          <span>
            <svg width="16" height="8" aria-hidden style={{ verticalAlign: '-1px', marginRight: 4 }}>
              <line x1="0" y1="4" x2="16" y2="4" stroke={TINTA_MEDIA} strokeWidth="1.2" strokeDasharray="4 3" />
            </svg>
            Mismo mes del año anterior
          </span>
        </div>
      </div>

      <table className="rep-tabla" style={{ marginTop: 12 }}>
        <thead>
          <tr>
            <th>Mes</th>
            <th className="num">Facturado</th>
            <th className="num">Año anterior</th>
            <th className="num">Var. anual</th>
            <th className="num">Var. mes</th>
            <th className="num">Pedidos</th>
            <th className="num">Litros</th>
          </tr>
        </thead>
        <tbody>
          {r.crecimiento.map(p => (
            <tr key={p.clave}>
              <td style={{ textTransform: 'capitalize' }}>{p.etiqueta}</td>
              <td className="num">{moneda(p.facturado)}</td>
              <td className="num">{p.anoAnterior > 0 ? moneda(p.anoAnterior) : '—'}</td>
              <td className="num" style={{ color: p.varAnual ? (p.varAnual.dir === 'up' ? VERDE : ROJO) : GRIS }}>
                {varTexto(p.varAnual)}
              </td>
              <td className="num" style={{ color: p.varMes ? (p.varMes.dir === 'up' ? VERDE : ROJO) : GRIS }}>
                {varTexto(p.varMes)}
              </td>
              <td className="num">{p.pedidos}</td>
              <td className="num">{p.litros > 0 ? litros(p.litros) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rep-nota">
        Un guion en una variación significa que no hay base para calcularla: el mes de comparación facturó
        cero. No es un 0%.
      </p>

      <h3 className="rep-sub">Clientes nuevos y recurrentes</h3>
      <div className="rep-grafica">
        <Columnas
          puntos={r.crecimiento.map(p => ({
            etiqueta: p.etiqueta,
            valores: [p.clientesRecurrentes, p.clientesNuevos],
          }))}
          series={[
            { label: 'Recurrentes', color: GRISES[1] },
            { label: 'Nuevos', color: ACENTO },
          ]}
          eje={enteros}
          entero
          alto={130}
        />
        <div className="rep-leyenda">
          <span><i style={{ background: ACENTO }} />Nuevos (su primer pedido cayó en ese mes)</span>
          <span><i style={{ background: GRISES[1] }} />Recurrentes</span>
        </div>
      </div>
      <p className="rep-nota">
        «Nuevo» se mide contra todo el historial, no contra la ventana de la gráfica: un cliente de hace
        tres años que vuelve a comprar cuenta como recurrente.
      </p>

      <h3 className="rep-sub">Mezcla de presentaciones, en litros</h3>
      {mezcla.length === 0 ? (
        <p style={{ color: GRIS, fontSize: 10.5 }}>Sin volumen en la ventana.</p>
      ) : (
        <div className="rep-grafica">
          <Columnas
            puntos={r.mezcla.map(m => ({
              etiqueta: m.etiqueta,
              valores: mezcla.map(p => m.porUnidad[p.unidad] || 0),
            }))}
            series={mezcla.map(p => ({ label: p.label, color: p.color }))}
            eje={enteros}
            normalizar
            alto={130}
          />
          <div className="rep-leyenda">
            {mezcla.map(p => (
              <span key={p.unidad}><i style={{ background: p.color }} />{p.label}</span>
            ))}
          </div>
        </div>
      )}
      <p className="rep-nota">
        Proporción del volumen de cada mes. Un mes sin ventas se dibuja vacío en vez de repartido en partes
        iguales.
      </p>

      <h3 className="rep-sub">Ritmo</h3>
      <dl className="rep-kpis-3">
        <div className="rep-kpi">
          <dt>Ritmo anualizado</dt>
          <dd>{moneda(r.ritmo)}</dd>
          <small>el paso del periodo, por 365 días</small>
        </div>
        <div className="rep-kpi">
          <dt>Mejor mes de la ventana</dt>
          <dd>{mejor ? moneda(mejor.facturado) : '—'}</dd>
          <small style={{ textTransform: 'capitalize' }}>{mejor ? mejor.rotulo : 'sin ventas'}</small>
        </div>
        <div className="rep-kpi">
          <dt>Meses con ventas</dt>
          <dd>{conDatos.length} de {r.meses}</dd>
          <small>en la ventana de la tendencia</small>
        </div>
      </dl>
      <p className="rep-nota">
        El ritmo es una extrapolación lineal del periodo ({periodoLegible(r.rango)}): no sabe de
        temporadas. Con periodos cortos exagera.
      </p>
    </section>
  )
}
