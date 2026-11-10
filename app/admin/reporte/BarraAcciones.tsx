'use client'
import Link from 'next/link'
import { BORDE, TINTA, TINTA_MEDIA } from './reporte-ui'

/**
 * Los botones del reporte. Lo unico de esta pantalla que necesita JS, y por
 * eso lo unico que es cliente.
 *
 * Imprimir abre el dialogo del navegador, que es tambien de donde sale el PDF
 * ("Guardar como PDF" es un destino de impresion): no hay que generar nada del
 * lado del servidor ni meter una libreria de PDF al bundle.
 *
 * El Excel es un <a> y no un fetch: el navegador sigue el
 * Content-Disposition y guarda el archivo solo, sin blobs ni URLs temporales
 * que luego hay que revocar.
 *
 * Toda la barra lleva .no-print: los botones no se imprimen.
 */

type Props = {
  /** /api/admin/reporte/exportar con el periodo en la query. */
  urlExcel: string
  /** De vuelta al Inicio, con el mismo periodo. */
  urlInicio: string
}

const boton: React.CSSProperties = {
  appearance: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: '#fff',
  border: `1px solid ${BORDE}`,
  borderRadius: 7,
  color: TINTA_MEDIA,
  font: 'inherit',
  fontSize: 12.5,
  fontWeight: 500,
  padding: '7px 13px',
  cursor: 'pointer',
  textDecoration: 'none',
  whiteSpace: 'nowrap',
}

export default function BarraAcciones({ urlExcel, urlInicio }: Props) {
  return (
    <div
      className="no-print"
      style={{
        width: 700,
        maxWidth: 'calc(100vw - 32px)',
        margin: '0 auto 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        flexWrap: 'wrap',
      }}
    >
      <Link href={urlInicio} style={{ ...boton, border: 'none', background: 'transparent', padding: '7px 0' }}>
        ← Inicio
      </Link>

      <button
        type="button"
        onClick={() => window.print()}
        style={{ ...boton, marginLeft: 'auto', borderColor: TINTA, color: TINTA, fontWeight: 600 }}
      >
        Imprimir reporte
      </button>

      {/* `download` no basta por si solo: el nombre lo manda la ruta en el
          Content-Disposition, que es quien sabe el periodo. */}
      <a href={urlExcel} style={boton}>
        Exportar Excel
      </a>
    </div>
  )
}
