'use client'
import { botonPrimario } from '../produccion/produccion-ui'

/**
 * Imprimir abre el dialogo del navegador, que es tambien de donde sale el PDF
 * ("Guardar como PDF" es un destino de impresion). Mismo criterio que
 * /admin/reporte: no hay que generar nada en el servidor ni meter una
 * libreria de PDF al bundle.
 */
export default function BotonImprimir() {
  return (
    <button type="button" onClick={() => window.print()} style={botonPrimario()}>
      Imprimir hoja
    </button>
  )
}
