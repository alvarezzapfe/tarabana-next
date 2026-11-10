'use client'
import { useEffect, useId, useRef, useState } from 'react'
import { PERIODOS, type ClavePeriodo, type Rango } from '../../src/lib/metricas'
import { BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA, rangoLegible } from './dash-ui'

/**
 * Selector de periodo del Inicio.
 *
 * El rango resuelto va SIEMPRE visible debajo del nombre del periodo, no solo
 * dentro del menu: "12 meses" sin fechas obliga a adivinar si el mes en curso
 * entra o no, y ese es justo el dato que hace que dos personas lean el mismo
 * tablero distinto.
 *
 * Lo que se emite es la clave y, para 'personalizado', el rango. Quien recibe
 * decide como se guarda; aqui no se toca la URL.
 */

type Props = {
  clave: ClavePeriodo
  /** El rango ya resuelto (y ya recortado, si venia absurdo desde la URL). */
  rango: Rango
  onElegir: (clave: ClavePeriodo, rango?: Rango) => void
}

export default function SelectorPeriodo({ clave, rango, onElegir }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [desde, setDesde] = useState(rango.desde)
  const [hasta, setHasta] = useState(rango.hasta)
  const caja = useRef<HTMLDivElement>(null)
  const idPop = useId()

  /** Clic fuera y Escape cierran. Sin esto el menu se queda pegado. */
  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
    }
  }, [abierto])

  /**
   * Los inputs arrancan en el rango vigente: editar desde lo que ya se esta
   * viendo es mas rapido que desde dos campos vacios.
   *
   * Se sincronizan al ABRIR y no en un efecto sobre `abierto`: un setState
   * dentro de un efecto encadena un render extra por cada apertura, y aqui no
   * hay ningun sistema externo con el que sincronizarse — el evento del clic
   * ya es el momento exacto.
   */
  const abrir = () => {
    setDesde(rango.desde)
    setHasta(rango.hasta)
    setAbierto(true)
  }

  const elegir = (c: ClavePeriodo) => {
    setAbierto(false)
    onElegir(c)
  }

  const aplicarRango = () => {
    if (!desde || !hasta) return
    setAbierto(false)
    onElegir('personalizado', { desde, hasta })
  }

  const actual = PERIODOS.find(p => p.clave === clave)

  const campo: React.CSSProperties = {
    width: '100%',
    padding: '6px 8px',
    background: '#fff',
    border: `1px solid ${BORDE}`,
    borderRadius: 7,
    color: TINTA,
    fontSize: 12.5,
    fontFamily: 'inherit',
    outline: 'none',
  }

  return (
    <div ref={caja} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        className="dash-btn"
        aria-haspopup="dialog"
        aria-expanded={abierto}
        aria-controls={abierto ? idPop : undefined}
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        style={{ alignItems: 'flex-start', padding: '7px 12px', textAlign: 'left' }}
      >
        <span style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <span style={{ color: TINTA, fontWeight: 600, fontSize: 12.5 }}>{actual?.label}</span>
          <span style={{ color: GRIS_SUAVE, fontSize: 10.5, fontVariantNumeric: 'tabular-nums' }}>
            {rangoLegible(rango)}
          </span>
        </span>
        <span aria-hidden style={{ color: GRIS_SUAVE, fontSize: 9, marginTop: 4 }}>▾</span>
      </button>

      {abierto && (
        <div id={idPop} role="dialog" aria-label="Periodo" className="dash-pop">
          {PERIODOS.filter(p => p.clave !== 'personalizado').map(p => (
            <button
              key={p.clave}
              type="button"
              className="dash-pop-op"
              aria-current={p.clave === clave}
              onClick={() => elegir(p.clave)}
            >
              {p.label}
              {p.clave === clave && <span aria-hidden style={{ color: TINTA_MEDIA }}>✓</span>}
            </button>
          ))}

          <div style={{ borderTop: `1px solid ${PISTA}`, margin: '6px 0 0', padding: '10px 9px 4px' }}>
            <p
              style={{
                margin: '0 0 8px',
                color: clave === 'personalizado' ? TINTA : GRIS,
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Personalizado
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
              <label style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10, marginBottom: 3 }}>Desde</span>
                <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)} style={campo} />
              </label>
              <label style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10, marginBottom: 3 }}>Hasta</span>
                <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)} style={campo} />
              </label>
            </div>

            <button
              type="button"
              className="dash-btn"
              onClick={aplicarRango}
              disabled={!desde || !hasta}
              style={{ width: '100%', justifyContent: 'center', opacity: desde && hasta ? 1 : 0.5 }}
            >
              Aplicar rango
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
