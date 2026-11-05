'use client'
import type { FilaAtencion } from '../../src/lib/metricas'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA, moneda, tabular } from './dash-ui'

/**
 * Pedidos que piden cobranza, lo mas atrasado primero.
 *
 * Tope de seis filas: esto es una cola de trabajo, no el reporte de cobranza.
 * Si hay mas, el link manda a Pedidos -> Por cobrar, que es la pantalla hecha
 * para trabajarlos en serie.
 */

const LIMITE = 6

type Props = {
  filas: FilaAtencion[]
  /** cliente_id -> nombre ya normalizado. */
  nombres: Map<string, string>
}

export default function RequiereAtencion({ filas, nombres }: Props) {
  if (filas.length === 0) {
    return (
      <div style={{ height: 230, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <span style={{ color: '#059669', fontSize: 20 }}>✓</span>
        <p style={{ margin: 0, color: TINTA_MEDIA, fontSize: 13, fontWeight: 600 }}>Todo al corriente</p>
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5 }}>
          Ningún pedido vencido ni con saldo de más de 30 días
        </p>
      </div>
    )
  }

  const visibles = filas.slice(0, LIMITE)
  const restantes = filas.length - visibles.length

  const th = {
    color: GRIS_SUAVE,
    fontSize: 10.5,
    fontWeight: 600 as const,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    padding: '0 0 8px',
    textAlign: 'left' as const,
  }
  const td = { padding: '9px 0', fontSize: 12.5, borderTop: `1px solid ${PISTA}` }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Folio</th>
            <th style={th}>Cliente</th>
            <th style={{ ...th, textAlign: 'right' }}>Atraso</th>
            <th style={{ ...th, textAlign: 'right' }}>Saldo</th>
            <th style={{ ...th, width: 48 }} />
          </tr>
        </thead>
        <tbody>
          {visibles.map(f => {
            // Un pedido sin vencer pero con saldo viejo se reporta por
            // antiguedad: decir "0 dias" seria enganoso cuando es justo la
            // razon por la que esta en la lista.
            const dias = f.diasVencido > 0 ? f.diasVencido : f.diasAbierto
            const porVencimiento = f.diasVencido > 0
            const grave = dias >= 90
            return (
              <tr key={f.id}>
                <td style={{ ...td, ...tabular }}>
                  <span className="font-mono" style={{ color: GRIS }}>#{f.id.slice(-6).toUpperCase()}</span>
                </td>
                <td style={{ ...td, maxWidth: 0 }}>
                  <span
                    className="dash-elipsis"
                    title={f.cliente_id ? nombres.get(f.cliente_id) || '' : ''}
                    style={{ color: TINTA_MEDIA }}
                  >
                    {(f.cliente_id && nombres.get(f.cliente_id)) || '—'}
                  </span>
                </td>
                <td style={{ ...td, ...tabular, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <span style={{ color: grave ? ROJO : porVencimiento ? '#b45309' : GRIS, fontWeight: 600 }}>
                    {dias} d
                  </span>
                  {!porVencimiento && (
                    <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10 }}>sin vencer</span>
                  )}
                </td>
                <td style={{ ...td, ...tabular, textAlign: 'right', color: TINTA, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  {moneda(f.saldo)}
                </td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <a
                    href={`/admin/pedidos/${f.id}/edit`}
                    style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      border: `1px solid ${BORDE}`,
                      borderRadius: 6,
                      color: TINTA_MEDIA,
                      fontSize: 11.5,
                      fontWeight: 600,
                      textDecoration: 'none',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Ver
                  </a>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${BORDE}`, display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ color: GRIS_SUAVE, fontSize: 11.5 }}>
          {filas.length} {filas.length === 1 ? 'pedido' : 'pedidos'} en total
        </span>
        <a
          href="/admin/pedidos?tab=por-cobrar"
          style={{ marginLeft: 'auto', color: ACENTO, fontSize: 12, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          {restantes > 0 ? `Ver los ${restantes} restantes` : 'Ir a cobranza'} →
        </a>
      </div>
    </div>
  )
}
