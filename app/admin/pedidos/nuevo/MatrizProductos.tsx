'use client'
import { useCallback, useMemo, useRef } from 'react'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type Presentacion, type Producto,
  claveCelda, moneda, motivoBloqueo, precioDe, stockDe, tabular,
} from './pos-ui'

/**
 * Matriz de captura: un renglon por producto, una columna por presentacion.
 *
 * Cada celda es un stepper que tambien acepta teclado. El input es
 * `type="text"` con `inputMode="numeric"` y no `type="number"` a proposito:
 * en un number input las flechas arriba y abajo incrementan el valor, y aqui
 * tienen que mover el foco entre renglones.
 *
 * En movil la matriz no se encoge: se cambia por tarjetas, porque siete
 * columnas en 390 px no se leen ni se pican.
 */

type Props = {
  productos: Producto[]
  presentaciones: Presentacion[]
  sufijo: 'publico' | 'taproom'
  /** Cantidad por clave de celda ("<uuid>-<presentacion>"). */
  cantidades: Record<string, number>
  onCantidad: (productoId: string, presentacion: string, cantidad: number) => void
  /** Un cliente sin elegir deja la matriz en modo lectura. */
  habilitada: boolean
}

export default function MatrizProductos({
  productos, presentaciones, sufijo, cantidades, onCantidad, habilitada,
}: Props) {
  // Un ref por celda, para mover el foco con las flechas.
  const refs = useRef(new Map<string, HTMLInputElement | null>())
  const clave = (f: number, c: number) => `${f}:${c}`

  const mover = useCallback((fila: number, col: number, df: number, dc: number) => {
    // Avanza en la direccion pedida hasta encontrar una celda enfocable.
    let f = fila + df
    let c = col + dc
    for (let i = 0; i < productos.length * presentaciones.length; i++) {
      if (f < 0 || f >= productos.length || c < 0 || c >= presentaciones.length) return
      const el = refs.current.get(clave(f, c))
      if (el && !el.disabled) {
        el.focus()
        el.select()
        return
      }
      f += df
      c += dc
    }
  }, [productos.length, presentaciones.length])

  const th: React.CSSProperties = {
    position: 'sticky', top: 0, zIndex: 2, background: '#fff',
    padding: '10px 8px', fontSize: 10.5, fontWeight: 600, color: GRIS_SUAVE,
    textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'center',
    borderBottom: `1px solid ${BORDE}`, whiteSpace: 'nowrap',
  }

  const filas = useMemo(() => productos, [productos])

  if (filas.length === 0) {
    return (
      <div style={{ padding: '40px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
        Ningún producto coincide con la búsqueda.
      </div>
    )
  }

  return (
    <div className="pos-matriz-scroll" style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left', left: 0, zIndex: 3, minWidth: 148, paddingLeft: 2 }}>
              Producto
            </th>
            {presentaciones.map(p => (
              <th key={p.key} style={th} title={p.largo}>{p.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((producto, fila) => (
            <tr key={producto.id}>
              <td
                style={{
                  position: 'sticky', left: 0, zIndex: 1, background: '#fff',
                  padding: '8px 10px 8px 2px', borderBottom: `1px solid ${PISTA}`, minWidth: 148,
                }}
              >
                <span style={{ display: 'block', color: TINTA, fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>
                  {producto.nombre}
                </span>
                {producto.estilo && (
                  <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10.5 }}>{producto.estilo}</span>
                )}
              </td>

              {presentaciones.map((pres, col) => {
                const k = claveCelda(producto.id, pres.key)
                const cantidad = cantidades[k] || 0
                const motivo = motivoBloqueo(producto, pres.key, sufijo)
                const precio = precioDe(producto, pres.key, sufijo)
                const stock = stockDe(producto, pres.key)
                const excede = cantidad > stock
                const bloqueada = !habilitada || !!motivo

                return (
                  <td
                    key={pres.key}
                    style={{
                      padding: '6px 5px', borderBottom: `1px solid ${PISTA}`, textAlign: 'center',
                      background: excede ? '#fef2f2' : cantidad > 0 ? '#fff7f3' : 'transparent',
                    }}
                  >
                    <div
                      title={
                        !habilitada ? 'Elige un cliente para capturar.'
                          : motivo ? motivo
                          : excede ? `Solo quedan ${stock}.`
                          : `${moneda(precio)} · quedan ${stock}`
                      }
                      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3, opacity: bloqueada ? 0.4 : 1 }}
                    >
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <Boton
                          onClick={() => onCantidad(producto.id, pres.key, Math.max(0, cantidad - 1))}
                          disabled={bloqueada || cantidad === 0}
                          label="−"
                        />
                        <input
                          ref={el => { refs.current.set(clave(fila, col), el) }}
                          data-fila={fila}
                          data-col={col}
                          type="text"
                          inputMode="numeric"
                          disabled={bloqueada}
                          value={cantidad === 0 ? '' : String(cantidad)}
                          placeholder="0"
                          onFocus={e => e.currentTarget.select()}
                          onChange={e => {
                            const limpio = e.target.value.replace(/\D/g, '').slice(0, 5)
                            onCantidad(producto.id, pres.key, limpio === '' ? 0 : Number(limpio))
                          }}
                          onKeyDown={e => {
                            // Las flechas navegan; en un `type="number"`
                            // arriba y abajo cambiarian el valor.
                            if (e.key === 'ArrowUp') { e.preventDefault(); mover(fila, col, -1, 0) }
                            else if (e.key === 'ArrowDown') { e.preventDefault(); mover(fila, col, 1, 0) }
                            else if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === e.currentTarget.value.length) { e.preventDefault(); mover(fila, col, 0, 1) }
                            else if (e.key === 'ArrowLeft' && e.currentTarget.selectionStart === 0) { e.preventDefault(); mover(fila, col, 0, -1) }
                            else if (e.key === 'Enter') { e.preventDefault(); onCantidad(producto.id, pres.key, cantidad + 1) }
                          }}
                          style={{
                            width: 38, padding: '5px 2px', textAlign: 'center',
                            border: `1px solid ${excede ? ROJO : cantidad > 0 ? ACENTO : BORDE}`,
                            borderRadius: 6, background: '#fff',
                            color: excede ? ROJO : cantidad > 0 ? TINTA : TINTA_MEDIA,
                            fontSize: 13, fontWeight: cantidad > 0 ? 700 : 400,
                            outline: 'none', ...tabular,
                            cursor: bloqueada ? 'not-allowed' : 'text',
                          }}
                        />
                        <Boton
                          onClick={() => onCantidad(producto.id, pres.key, cantidad + 1)}
                          disabled={bloqueada}
                          label="+"
                        />
                      </div>

                      <span style={{ ...tabular, fontSize: 10, color: motivo ? GRIS_SUAVE : GRIS, lineHeight: 1.2 }}>
                        {precio > 0 ? moneda(precio) : 'sin precio'}
                      </span>
                      <span style={{ ...tabular, fontSize: 9.5, color: excede ? ROJO : GRIS_SUAVE, lineHeight: 1 }}>
                        {excede ? `solo ${stock}` : `${stock} disp.`}
                      </span>
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Boton({ onClick, disabled, label }: { onClick: () => void; disabled: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
      style={{
        width: 20, height: 24, padding: 0, lineHeight: 1,
        background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 5,
        color: disabled ? '#d1d5db' : GRIS, fontSize: 13,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      {label}
    </button>
  )
}
