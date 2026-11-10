import { etiquetaFecha } from '../../../src/lib/fechas'
import { TOPE_TABLA, etiquetaCobranza, folioDe, type Reporte } from '../../../src/lib/reporte'
import BarrasH from './BarrasH'
import { ACENTO, GRIS, GRISES, enteros, litros, litrosCorto, moneda, pct } from './reporte-ui'

/**
 * Seccion 2: las ventas del periodo.
 *
 * Cuatro cortes de los mismos pedidos: quien compro, en que presentacion, de
 * que estilo y que falta por cobrar. Los tres primeros suman exactamente el
 * Facturado del resumen —de eso se encarga el reparto de `partidasValuadas`—;
 * el cuarto es al dia de hoy y se rotula como tal.
 */

/** Las tablas largas se recortan: un reporte de 400 renglones no se lee. */
const tope = <T,>(filas: T[]) => filas.slice(0, TOPE_TABLA)

export default function SeccionVentas({ r }: { r: Reporte }) {
  const recortados = r.clientes.length - tope(r.clientes).length

  return (
    <section className="rep-sec">
      <h2 className="rep-sec-titulo"><span>2</span>Ventas del periodo</h2>

      {/* ── a) Por cliente ───────────────────────────────── */}

      <h3 className="rep-sub">a. Por cliente</h3>
      {r.clientes.length === 0 ? (
        <p style={{ color: GRIS, fontSize: 10.5 }}>Sin pedidos en el periodo.</p>
      ) : (
        <table className="rep-tabla">
          <thead>
            <tr>
              <th>Cliente</th>
              <th className="num">Pedidos</th>
              <th className="num">Litros</th>
              <th className="num">Facturado</th>
              <th className="num">Cobrado</th>
              <th className="num">Saldo</th>
              <th>Cobranza</th>
            </tr>
          </thead>
          <tbody>
            {tope(r.clientes).map(c => (
              <tr key={c.cliente_id || c.nombre}>
                <td className="nombre" title={c.nombre}>{c.nombre}</td>
                <td className="num">{c.pedidos}</td>
                <td className="num">{litros(c.litros)}</td>
                <td className="num">{moneda(c.facturado)}</td>
                <td className="num">{moneda(c.cobrado)}</td>
                <td className="num">{c.saldo > 0 ? moneda(c.saldo) : '—'}</td>
                <td>
                  <span className={`rep-badge ${c.estado.clave}`}>{etiquetaCobranza(c.estado)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>TOTAL{recortados > 0 ? ` (${r.clientes.length} clientes)` : ''}</td>
              <td className="num">{r.totales.pedidos}</td>
              <td className="num">{litros(r.totales.litros)}</td>
              <td className="num">{moneda(r.totales.facturado)}</td>
              <td className="num">{moneda(r.totales.cobrado)}</td>
              <td className="num">{moneda(r.totales.saldo)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}
      {recortados > 0 && (
        <p className="rep-nota">
          Se listan los {TOPE_TABLA} clientes de mayor facturación; los {recortados} restantes sí están en
          el total y en el Excel.
        </p>
      )}
      <p className="rep-nota">
        «Cobrado» es lo que ya se pagó DE ESTOS PEDIDOS, no los pagos recibidos en el periodo.
      </p>

      {/* ── b) Por presentacion ──────────────────────────── */}

      <h3 className="rep-sub">b. Por presentación</h3>
      <table className="rep-tabla">
        <thead>
          <tr>
            <th>Presentación</th>
            <th className="num">Unidades</th>
            <th className="num">Litros</th>
            <th className="num">Importe</th>
            <th className="num">% del total</th>
          </tr>
        </thead>
        <tbody>
          {r.presentaciones.map(p => (
            <tr key={p.unidad}>
              <td>{p.label}</td>
              <td className="num">{enteros(p.unidades)}</td>
              <td className="num">{p.litros > 0 ? litros(p.litros) : '—'}</td>
              <td className="num">{moneda(p.importe)}</td>
              <td className="num">{pct(p.pct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rep-grafica">
        <BarrasH
          filas={r.presentaciones.map(p => ({ label: p.label, valor: p.litros }))}
          formato={litrosCorto}
        />
      </div>
      <p className="rep-nota">
        El importe es neto: el descuento y el envío viven en el pedido, así que se reparten entre sus
        partidas en proporción al precio de cada una. Las cajas mixtas van aparte de las de 24 porque se
        venden como otra cosa.
        {r.sinReparto !== 0 && ` ${moneda(r.sinReparto)} no se pudieron repartir (pedidos sin precio en sus partidas) y quedan fuera de esta tabla.`}
      </p>

      {/* ── c) Por estilo ────────────────────────────────── */}

      <h3 className="rep-sub">c. Por estilo</h3>
      {r.estilos.length === 0 ? (
        <p style={{ color: GRIS, fontSize: 10.5 }}>Sin partidas en el periodo.</p>
      ) : (
        <div className="rep-dos">
          <table className="rep-tabla">
            <thead>
              <tr>
                <th>Estilo</th>
                <th className="num">Litros</th>
                <th className="num">Importe</th>
                <th className="num">%</th>
              </tr>
            </thead>
            <tbody>
              {r.estilos.map(e => (
                <tr key={e.estilo}>
                  <td className="nombre">{e.estilo}</td>
                  <td className="num">{litros(e.litros)}</td>
                  <td className="num">{moneda(e.importe)}</td>
                  <td className="num">{pct(e.pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="rep-grafica">
            <BarrasH
              filas={r.estilos.map(e => ({ label: e.estilo, valor: e.litros }))}
              formato={litrosCorto}
              color={GRISES[0]}
            />
          </div>
        </div>
      )}
      <p className="rep-nota">
        Las cajas mixtas se desglosan por las latas de cada estilo que llevan dentro; sin eso, una caja de
        cuatro estilos contaría entera para uno solo.
        {r.partidasSinUnidad > 0 && ` ${r.partidasSinUnidad} ${r.partidasSinUnidad === 1 ? 'partida' : 'partidas'} sin presentación registrada no suman litros.`}
      </p>

      {/* ── d) Cobranza ──────────────────────────────────── */}

      <h3 className="rep-sub">d. Cobranza, al día de hoy</h3>
      <div className="rep-grafica">
        <BarrasH
          filas={r.cartera.map(b => ({
            label: b.etiqueta,
            valor: b.monto,
            nota: b.pedidos > 0 ? `${b.pedidos} ${b.pedidos === 1 ? 'pedido' : 'pedidos'}` : undefined,
          }))}
          formato={moneda}
          color={ACENTO}
        />
      </div>

      {r.cobranza.length === 0 ? (
        <p style={{ color: GRIS, fontSize: 10.5, marginTop: 10 }}>
          Ningún pedido con saldo abierto.
        </p>
      ) : (
        <table className="rep-tabla" style={{ marginTop: 12 }}>
          <thead>
            <tr>
              <th>Folio</th>
              <th>Cliente</th>
              <th>Fecha</th>
              <th>Vencimiento</th>
              <th className="num">Atraso</th>
              <th className="num">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {tope(r.cobranza).map(c => (
              <tr key={c.id}>
                <td>{folioDe(c.id)}</td>
                <td className="nombre" title={c.nombre}>{c.nombre}</td>
                <td>{etiquetaFecha(c.fecha_pedido)}</td>
                <td>{etiquetaFecha(c.fecha_vencimiento)}</td>
                <td className="num">{c.dias > 0 ? `${c.dias} d` : 'sin vencer'}</td>
                <td className="num">{moneda(c.saldo)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5}>TOTAL POR COBRAR</td>
              <td className="num">{moneda(r.hoy.porCobrar)}</td>
            </tr>
          </tfoot>
        </table>
      )}
      <p className="rep-nota">
        El atraso se mide contra la fecha de vencimiento del pedido. Un pedido atrasado con un abono cuenta
        como vencido, aunque el sistema lo liste como pago parcial.
      </p>
    </section>
  )
}
