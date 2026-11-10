'use client'
import { useCallback, useMemo, useRef } from 'react'
import {
  ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA,
  type Presentacion, type Producto,
  claveCelda, moneda, tabular, vistaCelda,
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
 *
 * El numero de cada celda es el DISPONIBLE —fisico menos lo comprometido en
 * pedidos abiertos—, no la columna de stock. El fisico solo baja al entregar,
 * asi que la matriz ofrecia producto que ya tenia dueno; el desglose va en el
 * tooltip para que no se pierda de donde sale el numero.
 *
 * Que mostrar lo decide `vistaCelda`, compartido con la vista de movil: el
 * disponible depende solo del inventario y del comprometido global, asi que
 * sale igual para todos los clientes. Lo que atenua la falta de precio es el
 * STEPPER, no el dato: antes se le ponia opacity al bloque completo y el
 * numero quedaba al 40%, ilegible, en las 12 celdas de barril que un cliente
 * mayorista no tiene cotizadas.
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
  /** claveStock -> unidades comprometidas, de /api/admin/pedidos/comprometido. */
  comprometido: Map<string, number>
}

export default function MatrizProductos({
  productos, presentaciones, sufijo, cantidades, onCantidad, habilitada, comprometido,
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
                const v = vistaCelda(producto, pres.key, sufijo, comprometido, cantidad)
                const { motivo, precio, excede } = v
                const stock = v.stock.disponible
                const bloqueada = !habilitada || !!motivo
                const apartado = v.stock.comprometido > 0

                return (
                  <td
                    key={pres.key}
                    style={{
                      padding: '6px 5px', borderBottom: `1px solid ${PISTA}`, textAlign: 'center',
                      background: excede ? '#fef2f2' : cantidad > 0 ? '#fff7f3' : 'transparent',
                    }}
                  >
                    <div
                      // El desglose va SIEMPRE, incluso cuando hay motivo:
                      // antes el motivo lo reemplazaba y la celda perdia de
                      // donde salia su numero justo en las que mas dudas dan.
                      title={[
                        !habilitada ? 'Elige un cliente para capturar.' : motivo,
                        `${stock} disponibles — ${v.detalle}`,
                        cantidad > 0 ? `${cantidad} en el carrito` : null,
                        precio > 0 ? moneda(precio) : null,
                      ].filter(Boolean).join(' · ')}
                      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}
                    >
                      {/* Solo el control se atenua. El dato de abajo no: es
                          valido para cualquier cliente. */}
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2, opacity: bloqueada ? 0.4 : 1 }}>
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
                      {/* El disponible SIEMPRE, con o sin precio: es el mismo
                          inventario para cualquier cliente. El asterisco marca
                          que hay unidades apartadas, o sea que este numero no
                          es la columna de inventario. */}
                      <span style={{ ...tabular, fontSize: 9.5, color: excede || stock < 0 ? ROJO : GRIS_SUAVE, lineHeight: 1 }}>
                        {excede ? `solo ${stock}` : `${stock} disp.`}
                        {apartado && <span title={v.detalle}>*</span>}
                      </span>
                      {/* En carrito aparte, nunca restado del disponible. */}
                      {cantidad > 0 && (
                        <span style={{ ...tabular, fontSize: 9, color: ACENTO, lineHeight: 1 }}>
                          en carrito: {cantidad}
                        </span>
                      )}
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
