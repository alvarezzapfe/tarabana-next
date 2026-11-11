import { variacion, type Variacion } from '../../../src/lib/metricas'
import { periodoLegible, type Reporte } from '../../../src/lib/reporte'
import {
  GRIS, ROJO, VERDE, enteros, litros, moneda, pct, varTexto,
} from './reporte-ui'

/**
 * Seccion 1: el resumen.
 *
 * Los KPIs del periodo arriba y los tres de "al dia de hoy" abajo, en su
 * propio bloque con fondo. La separacion no es estetica: un saldo por cobrar
 * no pertenece al periodo en que se facturo —es el que existe hoy—, y quien
 * lea el reporte tres meses despues tiene que poder distinguir que numeros
 * dependian del periodo elegido y cuales eran la foto del dia en que se
 * imprimio.
 */

/** La variacion de un porcentaje va en PUNTOS: de 40% a 50% "+25%" se lee como 65%. */
function enPuntos(actual: number | null, previo: number | null): Variacion | null {
  if (actual === null || previo === null) return null
  return {
    pct: Math.abs(Math.round(actual - previo)),
    dir: actual >= previo ? 'up' : 'down',
  }
}

export default function SeccionResumen({ r }: { r: Reporte }) {
  const kpis: { label: string; valor: string; v: Variacion | null; sufijo?: string; nota?: string }[] = [
    // Sin IVA, como todo lo analitico. El IVA entra como KPI propio y solo
    // cuando lo hay, para que el reporte de un periodo sin pedidos
    // facturados con IVA se vea exactamente como antes.
    { label: 'Facturado', valor: moneda(r.resumen.facturado), v: variacion(r.resumen.facturado, r.previo.facturado), nota: 'sin IVA' },
    { label: 'Cobrado', valor: moneda(r.resumen.cobrado), v: variacion(r.resumen.cobrado, r.previo.cobrado) },
    {
      label: '% cobrado',
      valor: r.resumen.pctCobrado === null ? '—' : pct(r.resumen.pctCobrado),
      v: enPuntos(r.resumen.pctCobrado, r.previo.pctCobrado),
      sufijo: ' pp',
    },
    { label: 'Pedidos', valor: enteros(r.resumen.pedidos), v: variacion(r.resumen.pedidos, r.previo.pedidos) },
    { label: 'Litros vendidos', valor: litros(r.resumen.litros), v: variacion(r.resumen.litros, r.previo.litros) },
    {
      label: 'Ticket promedio',
      valor: r.resumen.ticket === null ? '—' : moneda(r.resumen.ticket),
      v: variacion(r.resumen.ticket || 0, r.previo.ticket || 0),
    },
    { label: 'Clientes', valor: enteros(r.resumen.clientes), v: variacion(r.resumen.clientes, r.previo.clientes) },
    { label: 'Ritmo anualizado', valor: moneda(r.ritmo), v: null },
  ]

  if (r.resumen.iva > 0 || r.previo.iva > 0) {
    kpis.splice(1, 0, {
      label: 'IVA facturado',
      valor: moneda(r.resumen.iva),
      v: variacion(r.resumen.iva, r.previo.iva),
      nota: 'aparte de Facturado',
    })
  }

  return (
    <section className="rep-sec">
      <h2 className="rep-sec-titulo"><span>1</span>Resumen</h2>

      <dl className="rep-kpis">
        {kpis.map(k => (
          <div key={k.label} className="rep-kpi">
            <dt>{k.label}</dt>
            <dd>{k.valor}</dd>
            <small style={{ color: k.v ? (k.v.dir === 'up' ? VERDE : ROJO) : GRIS }}>
              {k.label === 'Ritmo anualizado'
                ? 'si el paso se mantiene'
                : `${varTexto(k.v)}${k.v && k.sufijo ? k.sufijo : ''} vs anterior`}
            </small>
            {k.nota && <small style={{ color: GRIS }}>{k.nota}</small>}
          </div>
        ))}
      </dl>

      <p className="rep-nota">
        El periodo anterior es {periodoLegible(r.anterior)}, de la misma duración. Cobrado va por fecha de
        pago; el resto, por fecha del pedido. «% cobrado» es la parte de lo facturado EN EL PERIODO que ya
        entró, no el cociente de los dos KPIs. Las ventas van SIN IVA —el IVA no es ingreso, se cobra para
        enterarlo— y la cobranza de abajo CON IVA, que es lo que el cliente debe.
      </p>

      <h3 className="rep-sub">Al día de hoy</h3>
      <dl className="rep-kpis-3">
        <div className="rep-kpi rep-kpi-hoy">
          <dt>Por cobrar</dt>
          <dd>{moneda(r.hoy.porCobrar)}</dd>
          <small>saldo abierto total</small>
        </div>
        <div className="rep-kpi rep-kpi-hoy">
          <dt>Vencido</dt>
          <dd style={{ color: r.hoy.vencido > 0 ? ROJO : undefined }}>{moneda(r.hoy.vencido)}</dd>
          <small>{r.hoy.vencido > 0 ? 'ya pasó su vencimiento' : 'nada vencido'}</small>
        </div>
        <div className="rep-kpi rep-kpi-hoy">
          <dt>Litros en stock</dt>
          <dd>{litros(r.hoy.litrosStock)}</dd>
          <small>productos activos</small>
        </div>
      </dl>
      <p className="rep-nota">
        Estos tres no cambian con el periodo: son la foto del {r.generado}.
      </p>

      {r.hallazgos.length > 0 && (
        <>
          <h3 className="rep-sub">Hallazgos</h3>
          <ul className="rep-hallazgos">
            {r.hallazgos.map(h => (
              <li key={h.clave} className={h.tono}>
                {h.texto}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}
