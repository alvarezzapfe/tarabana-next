'use client'
import { useMemo, useState } from 'react'
import { validarTramos, type Tramo } from '../../../src/lib/comisiones'

/**
 * Editor de una escalera de comision marginal.
 *
 * El `desde` no se captura: el del primer tramo es siempre 0 y el de cada
 * tramo siguiente ES el `hasta` del anterior. Asi la contiguidad es
 * estructural y no una regla que el usuario pueda romper — lo unico que se
 * edita es donde cierra cada tramo y con que porcentaje. El ultimo puede
 * quedar sin cierre, y entonces es el tramo abierto.
 *
 * `validarTramos` es el mismo predicado que impone el constraint trigger de
 * la DB, asi que lo que aqui se ve en verde es lo que alla va a pasar.
 */

export type Renglon = { hasta: string; porcentaje: string }

/** Filas de la DB -> renglones del formulario. */
export function aRenglones(tramos: Tramo[]): Renglon[] {
  return [...tramos]
    .sort((a, b) => a.desde - b.desde)
    .map(t => ({ hasta: t.hasta === null ? '' : String(t.hasta), porcentaje: String(t.porcentaje) }))
}

/** Renglones del formulario -> tramos, reponiendo los `desde`. */
export function aTramos(renglones: Renglon[]): Tramo[] {
  let desde = 0
  return renglones.map(r => {
    const hasta = r.hasta.trim() === '' ? null : Number(r.hasta)
    const tramo: Tramo = { desde, hasta, porcentaje: Number(r.porcentaje) }
    desde = hasta ?? desde
    return tramo
  })
}

const moneda0 = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

type Props = {
  /** Escalera guardada, para saber si hay cambios sin guardar. */
  inicial: Tramo[]
  /** Nombre del esquema, para los textos. */
  etiqueta: string
  acento: string
  guardando: boolean
  onGuardar: (tramos: Tramo[]) => void
  /** Solo lectura si el rol no puede editar. */
  puedeEditar: boolean
}

export default function TramosEditor({ inicial, etiqueta, acento, guardando, onGuardar, puedeEditar }: Props) {
  const [renglones, setRenglones] = useState<Renglon[]>(() => aRenglones(inicial))

  const tramos = useMemo(() => aTramos(renglones), [renglones])
  const errores = useMemo(() => validarTramos(tramos), [tramos])

  const guardado = useMemo(() => JSON.stringify(aRenglones(inicial)), [inicial])
  const sucio = JSON.stringify(renglones) !== guardado

  const set = (i: number, campo: keyof Renglon, valor: string) =>
    setRenglones(prev => prev.map((r, j) => (j === i ? { ...r, [campo]: valor } : r)))

  const agregar = () =>
    setRenglones(prev => {
      if (prev.length === 0) return [{ hasta: '', porcentaje: '' }]
      // El que era el ultimo tiene que cerrar para que el nuevo tenga donde
      // empezar. Si estaba abierto se le propone un cierre editable.
      const ultimo = prev[prev.length - 1]
      const cerrado = ultimo.hasta.trim() === ''
        ? { ...ultimo, hasta: String(sugerirCierre(prev)) }
        : ultimo
      return [...prev.slice(0, -1), cerrado, { hasta: '', porcentaje: '' }]
    })

  const quitar = (i: number) =>
    setRenglones(prev => {
      const siguiente = prev.filter((_, j) => j !== i)
      // Quitar el ultimo deja abierto al que queda al final: es lo normal, y
      // si no se quiere, se le pone un cierre.
      if (i === prev.length - 1 && siguiente.length) {
        siguiente[siguiente.length - 1] = { ...siguiente[siguiente.length - 1], hasta: '' }
      }
      return siguiente
    })

  const limpiar = () => setRenglones([])

  const input = {
    width: '100%', padding: '7px 10px', background: '#fff', border: '1px solid #d1d5db',
    borderRadius: 6, color: '#1a1a1a', fontSize: 13, outline: 'none',
    fontVariantNumeric: 'tabular-nums' as const,
  }
  const th = {
    color: '#9ca3af', fontSize: 11, textAlign: 'left' as const, padding: '0 10px 8px',
    textTransform: 'uppercase' as const, letterSpacing: '0.07em', fontWeight: 600 as const,
  }
  const celdaFija = { ...input, background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb' }

  if (renglones.length === 0) {
    return (
      <div style={{ padding: '28px 0 8px', textAlign: 'center' }}>
        <p style={{ color: '#6b7280', fontSize: 13, margin: '0 0 4px' }}>
          {etiqueta} no tiene escalera de comisión.
        </p>
        <p style={{ color: '#9ca3af', fontSize: 12, margin: '0 0 16px' }}>
          Sin tramos la comisión es cero y el mes no se puede cerrar.
        </p>
        {puedeEditar && (
          <button
            onClick={agregar}
            style={{ padding: '8px 16px', background: acento, border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            Crear escalera
          </button>
        )}
      </div>
    )
  }

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '26%' }}>Desde</th>
            <th style={{ ...th, width: '26%' }}>Hasta</th>
            <th style={{ ...th, width: '20%' }}>%</th>
            <th style={{ ...th, width: '22%' }}>Paga en el tramo</th>
            <th style={{ ...th, width: 40 }} />
          </tr>
        </thead>
        <tbody>
          {renglones.map((r, i) => {
            const t = tramos[i]
            const esUltimo = i === renglones.length - 1
            const ancho = t.hasta === null ? null : t.hasta - t.desde
            return (
              <tr key={i}>
                {/* El `desde` es derivado: lo pinta, no lo captura. */}
                <td style={{ padding: '0 10px 8px' }}>
                  <div style={celdaFija}>{moneda0(t.desde)}</div>
                </td>
                <td style={{ padding: '0 10px 8px' }}>
                  <input
                    type="number" min="0" step="1000" inputMode="numeric"
                    value={r.hasta}
                    disabled={!puedeEditar}
                    placeholder={esUltimo ? 'sin límite' : 'requerido'}
                    onChange={e => set(i, 'hasta', e.target.value)}
                    style={input}
                  />
                </td>
                <td style={{ padding: '0 10px 8px' }}>
                  <input
                    type="number" min="0" max="100" step="0.1" inputMode="decimal"
                    value={r.porcentaje}
                    disabled={!puedeEditar}
                    placeholder="0"
                    onChange={e => set(i, 'porcentaje', e.target.value)}
                    style={input}
                  />
                </td>
                <td style={{ padding: '0 10px 8px', color: '#6b7280', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {ancho !== null && ancho > 0 && Number.isFinite(t.porcentaje)
                    ? moneda0((ancho * t.porcentaje) / 100)
                    : ancho === null
                      ? 'de ahí en adelante'
                      : '—'}
                </td>
                <td style={{ padding: '0 0 8px' }}>
                  {puedeEditar && (
                    <button
                      onClick={() => quitar(i)}
                      title="Quitar tramo"
                      style={{ padding: '6px 9px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, color: '#9ca3af', fontSize: 13, cursor: 'pointer', lineHeight: 1 }}
                    >
                      ×
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      {errores.length > 0 && (
        <ul style={{ margin: '6px 0 0', padding: '10px 14px 10px 30px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8 }}>
          {errores.map((e, i) => (
            <li key={i} style={{ color: '#b91c1c', fontSize: 12.5 }}>{e}</li>
          ))}
        </ul>
      )}

      {puedeEditar && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 14 }}>
          <button
            onClick={agregar}
            style={{ padding: '7px 14px', background: '#fff', border: '1px solid #d1d5db', borderRadius: 8, color: '#374151', fontSize: 13, cursor: 'pointer' }}
          >
            + Tramo
          </button>
          <button
            onClick={limpiar}
            style={{ padding: '7px 14px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}
          >
            Quitar todos
          </button>

          <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
            {sucio && <span style={{ color: '#9ca3af', fontSize: 12 }}>Sin guardar</span>}
            <button
              onClick={() => onGuardar(tramos)}
              disabled={guardando || !!errores.length || !sucio}
              style={{
                padding: '8px 18px',
                background: errores.length || !sucio ? '#e5e7eb' : acento,
                border: 'none', borderRadius: 8,
                color: errores.length || !sucio ? '#9ca3af' : '#fff',
                fontSize: 13, fontWeight: 600,
                cursor: guardando || errores.length || !sucio ? 'default' : 'pointer',
                opacity: guardando ? 0.6 : 1,
              }}
            >
              {guardando ? 'Guardando…' : 'Guardar escalera'}
            </button>
          </span>
        </div>
      )}
    </div>
  )
}

/** Un cierre propuesto para el tramo que estaba abierto al agregar otro. */
function sugerirCierre(renglones: Renglon[]): number {
  const previos = aTramos(renglones)
  const ultimo = previos[previos.length - 1]
  const anchoPrevio =
    previos.length > 1 && previos[previos.length - 2].hasta !== null
      ? ultimo.desde - previos[previos.length - 2].desde
      : 50_000
  return ultimo.desde + (anchoPrevio > 0 ? anchoPrevio : 50_000)
}
