'use client'
import { etiquetaTasa } from '../../../../src/lib/iva'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE } from './pos-ui'

/**
 * El control de IVA, en todos los lugares donde se decide: cada renglon del
 * carrito, el switch general de arriba y el del envio.
 *
 * Por que un chip con la palabra "IVA" y no una casilla: la casilla suelta que
 * habia antes no decia que prendia. Una palomita a la izquierda de un producto
 * puede ser cualquier cosa —"seleccionado", "revisado", "entregado"— y el
 * usuario tiene que adivinar o probar. El chip dice su propio estado en
 * palabras ("Sin IVA" / "IVA 16%"), asi que no hay nada que aprender ni
 * recordar.
 *
 * Los tres estados se distinguen por COLOR y por TEXTO, no solo por color:
 * apagado es gris y dice "Sin IVA", prendido es naranja y dice la tasa, y la
 * mezcla es naranja de contorno y dice "IVA parcial". Quien no distinga el
 * gris del naranja igual lo lee.
 */
export default function ChipIva({
  puesto, indeterminado = false, tasa, deshabilitado = false, onCambio, etiquetaApagado = 'Sin IVA', titulo,
}: {
  puesto: boolean
  /** Mezcla: unas partidas gravadas y otras no. Solo el switch general. */
  indeterminado?: boolean
  tasa: number
  deshabilitado?: boolean
  onCambio: (valor: boolean) => void
  /** "Sin IVA" por default; el switch general usa otra. */
  etiquetaApagado?: string
  titulo?: string
}) {
  const texto = indeterminado ? 'IVA parcial' : puesto ? `IVA ${etiquetaTasa(tasa)}` : etiquetaApagado

  const colores = indeterminado
    ? { background: '#fff', border: `1px solid ${ACENTO}`, color: ACENTO }
    : puesto
      ? { background: ACENTO, border: `1px solid ${ACENTO}`, color: '#fff' }
      : { background: '#f3f4f6', border: `1px solid ${BORDE}`, color: deshabilitado ? GRIS_SUAVE : GRIS }

  return (
    <button
      type="button"
      // `checkbox` y no `switch` porque un switch no admite aria-checked
      // "mixed", y la mezcla es justo el estado que hay que anunciar.
      role="checkbox"
      aria-checked={indeterminado ? 'mixed' : puesto}
      disabled={deshabilitado}
      // Prender desde la mezcla: se prende todo. Es lo que espera quien ve
      // "parcial" y pica una vez.
      onClick={() => onCambio(indeterminado ? true : !puesto)}
      title={titulo ?? (puesto ? 'Quitar el IVA' : 'Cobrar IVA')}
      style={{
        ...colores,
        padding: '3px 8px',
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: '0.01em',
        whiteSpace: 'nowrap',
        cursor: deshabilitado ? 'default' : 'pointer',
        opacity: deshabilitado ? 0.6 : 1,
        transition: 'background 120ms ease, color 120ms ease, border-color 120ms ease',
      }}
    >
      {texto}
    </button>
  )
}
