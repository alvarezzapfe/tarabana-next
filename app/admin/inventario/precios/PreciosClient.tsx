'use client'
import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  DESCUENTO_DEFAULT, FILAS_EDITABLES, FILAS_PRECIO, NIVELES,
  armarLote, claveCelda, faltantesDe, leerPrecio, mayoristaSugerido,
  precioGuardado, precioMostrado, redondeoLata,
  type FilaPrecio, type NivelPrecio, type ProductoPrecios,
} from '../../../../src/lib/precios'
import { comprometidoDeJSON, claveStock } from '../../../../src/lib/stock-disponible'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA, tabular } from '../../dash-ui'

/**
 * Lista de precios, editable como una hoja de calculo.
 *
 * Filas = producto x presentacion, columnas = Publico y Mayorista. El renglon
 * de CAJA 12 y CAJA 24 es de solo lectura a proposito: en `productos` no hay
 * columnas de precio para cajas, `precioUnitario` las deriva del precio por
 * lata (x12 y x24), y darles una celda editable obligaria a inventar columnas
 * — con lo que habria dos verdades sobre el precio de una caja, la de esta
 * lista y la que cobra el pedido. Se muestran porque quien consulta la lista
 * quiere ver a cuanto sale la caja; se editan en el renglon de la lata.
 *
 * Nada se guarda al teclear: se junta todo y se manda en un lote con el boton,
 * que dice cuantas celdas cambiaron. Las sugerencias de "mayorista = publico
 * menos X%" se escriben en la celda como texto editable, asi que se pueden
 * corregir una por una antes de guardar.
 *
 * Solo PESOS ENTEROS: `precioUnitario` redondea la lata suelta pero no la
 * caja, asi que un precio con centavos se cobraria inconsistente entre las dos
 * presentaciones. La celda lo rechaza con ese motivo en vez de redondear por su
 * cuenta.
 */

type Props = {
  productos: ProductoPrecios[]
  /** claveStock -> unidades apartadas en pedidos abiertos. */
  comprometido: Record<string, number>
  acento: string
}

const CSS = `
  .pre-tabla { width: 100%; border-collapse: collapse; }
  .pre-tabla th { position: sticky; top: 0; z-index: 2; background: #f9fafb; }
  .pre-celda { width: 104px; padding: 5px 4px; text-align: center; border-radius: 6px; font-size: 13px; }
  .pre-celda:focus { outline: 2px solid ${ACENTO}; outline-offset: -1px; }
  .pre-btn {
    appearance: none; background: #fff; border: 1px solid ${BORDE}; border-radius: 7px;
    color: ${TINTA_MEDIA}; font: inherit; font-size: 12px; font-weight: 500;
    padding: 6px 11px; cursor: pointer; white-space: nowrap;
  }
  .pre-btn:hover { background: #fafafa; }
  .pre-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  @media (max-width: 900px) {
    .pre-scroll { overflow-x: auto; }
  }
`

export default function PreciosClient({ productos, comprometido, acento }: Props) {
  const router = useRouter()

  const [editados, setEditados] = useState<Record<string, string>>({})
  const [busqueda, setBusqueda] = useState('')
  const [soloFaltantes, setSoloFaltantes] = useState(false)
  const [soloActivos, setSoloActivos] = useState(true)
  const [descuento, setDescuento] = useState(String(DESCUENTO_DEFAULT))
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  const apartado = useMemo(() => comprometidoDeJSON(comprometido), [comprometido])

  /** El texto que muestra una celda: lo editado si se toco, si no lo guardado. */
  const textoDe = (p: ProductoPrecios, columna: string) => {
    const k = claveCelda(p.id, columna)
    if (k in editados) return editados[k]
    const guardado = precioGuardado(p, columna)
    return guardado === null ? '' : String(guardado)
  }

  /** El numero de una celda, contando lo que todavia no se guarda. */
  const numeroDe = (p: ProductoPrecios, columna: string): number | null => {
    const leido = leerPrecio(textoDe(p, columna))
    return 'valor' in leido ? leido.valor : null
  }

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    return productos.filter(p => {
      if (soloActivos && !p.activo) return false
      if (soloFaltantes && faltantesDe(p) === 0) return false
      if (!q) return true
      const estilo = typeof p.estilo === 'string' ? p.estilo : ''
      return p.nombre.toLowerCase().includes(q) || estilo.toLowerCase().includes(q)
    })
  }, [productos, busqueda, soloActivos, soloFaltantes])

  const lote = useMemo(() => armarLote(productos, editados), [productos, editados])
  const totalFaltantes = useMemo(
    () => productos.filter(p => soloActivos ? p.activo : true).reduce((s, p) => s + faltantesDe(p), 0),
    [productos, soloActivos]
  )

  // ── Navegacion con teclado ────────────────────────────────
  //
  // Las celdas editables, en el orden en que se ven. Enter baja a la misma
  // columna del siguiente renglon; Tab lo hace el navegador, en orden de
  // lectura. Un `type="number"` no sirve: sus flechas cambiarian el valor.
  const refs = useRef(new Map<string, HTMLInputElement | null>())
  const visibles = useMemo(
    () => filtrados.flatMap(p => FILAS_EDITABLES.map(f => ({ producto: p, fila: f }))),
    [filtrados]
  )
  const refKey = (i: number, nivel: NivelPrecio) => `${i}|${nivel}`

  /** producto|unidad -> indice en `visibles`, para el salto con Enter. */
  const indiceEditable = useMemo(
    () => new Map(visibles.map((v, i) => [`${v.producto.id}|${v.fila.unidad}`, i])),
    [visibles]
  )

  const bajar = (i: number, nivel: NivelPrecio, paso: number) => {
    const destino = refs.current.get(refKey(i + paso, nivel))
    if (destino) { destino.focus(); destino.select() }
  }

  const setCelda = (p: ProductoPrecios, columna: string, texto: string) => {
    setEditados(prev => ({ ...prev, [claveCelda(p.id, columna)]: texto }))
    setError('')
  }

  // ── Sugerencia de mayorista ───────────────────────────────

  const pctDescuento = Number(descuento)
  const pctValido = Number.isFinite(pctDescuento) && pctDescuento >= 0 && pctDescuento < 100

  /**
   * Escribe el mayorista sugerido en las celdas de los productos dados.
   *
   * Se escribe como TEXTO en la celda, no se guarda: queda igual que si
   * alguien lo hubiera teclado, se puede corregir, y entra al lote con todo lo
   * demas al picar Guardar.
   */
  const aplicarDescuento = (lista: ProductoPrecios[], rotulo: string) => {
    if (!pctValido) { setError('El descuento tiene que estar entre 0 y 99.'); return }

    const nuevos = { ...editados }
    let aplicadas = 0
    let sinBase = 0

    for (const p of lista) {
      for (const f of FILAS_EDITABLES) {
        const sugerido = mayoristaSugerido(numeroDe(p, f.columna!.publico), pctDescuento)
        if (sugerido === null) { sinBase += 1; continue }
        nuevos[claveCelda(p.id, f.columna!.taproom)] = String(sugerido)
        aplicadas += 1
      }
    }

    setEditados(nuevos)
    setError('')
    setAviso(
      aplicadas === 0
        ? `No se pudo sugerir nada en ${rotulo}: falta el precio público del que partir.`
        : `Se sugirieron ${aplicadas} precios mayoristas en ${rotulo}, a −${pctDescuento}% del público.` +
          (sinBase > 0 ? ` ${sinBase} se quedaron sin sugerencia porque no tienen público.` : '') +
          ' Revísalos y pica Guardar.'
    )
  }

  // ── Guardar ───────────────────────────────────────────────

  const conErrores = Object.keys(lote.errores).length

  const guardar = async () => {
    if (conErrores > 0) {
      setError(`Hay ${conErrores} ${conErrores === 1 ? 'celda' : 'celdas'} con un valor que no se puede guardar. Están marcadas en rojo.`)
      return
    }
    if (lote.celdas === 0) return

    setGuardando(true); setError(''); setAviso('')
    try {
      const res = await fetch('/api/admin/inventario/precios', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cambios: lote.cambios }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudieron guardar los precios.'); return }

      setEditados({})
      setSeleccion(new Set())
      setAviso(`Se guardaron ${data.celdas} ${data.celdas === 1 ? 'celda' : 'celdas'} en ${data.productos} ${data.productos === 1 ? 'producto' : 'productos'}.`)
      // Vuelve a pedir la pagina para que lo guardado sea la nueva base de
      // comparacion; si no, el boton seguiria contando los mismos cambios.
      router.refresh()
    } catch {
      setError('Se cayó la conexión al guardar.')
    } finally {
      setGuardando(false)
    }
  }

  // ── Celdas ────────────────────────────────────────────────

  /**
   * Una celda de la hoja.
   *
   * Es una FUNCION que devuelve JSX, no un componente declarado aqui dentro.
   * Un componente definido en el cuerpo del render cambia de identidad en cada
   * render, asi que React desmontaria y volveria a montar el <input> con cada
   * tecla y el foco se perderia a la primera letra. Devolviendo los elementos
   * directos, el tipo de cada nodo es estable.
   */
  const celda = (p: ProductoPrecios, fila: FilaPrecio, nivel: NivelPrecio, i: number) => {
    // Derivada: se muestra el precio que cobraria el pedido, sin poder editar.
    if (!fila.columna) {
      const valor = precioMostrado({ ...p, ...numerosEditados(p) }, fila, nivel)
      return (
        <td key={nivel} style={{ padding: '4px 6px', textAlign: 'center' }}>
          <span
            title={`Se calcula del precio por lata × ${fila.latas}. Para cambiarlo, edita el renglón de Lata.`}
            style={{ ...tabular, color: valor === null ? GRIS_SUAVE : GRIS, fontSize: 12.5 }}
          >
            {valor === null ? '—' : `$${valor.toLocaleString('es-MX')}`}
          </span>
        </td>
      )
    }

    const columna = fila.columna[nivel]
    const clave = claveCelda(p.id, columna)
    const texto = textoDe(p, columna)
    const errorCelda = lote.errores[clave]
    const vacia = texto.trim() === ''
    const tocada = clave in editados && texto !== (precioGuardado(p, columna)?.toString() ?? '')

    // La lata suelta con centavos se cobra redondeada (ver `redondeoLata`): la
    // lista no puede mostrar 37.45 como si fuera lo que se cobra por una lata.
    const cobraRedondeado = fila.unidad === 'lata' ? redondeoLata(numeroDe(p, columna)) : null

    return (
      <td key={nivel} style={{ padding: '4px 6px', textAlign: 'center' }}>
        <input
          ref={el => { refs.current.set(refKey(i, nivel), el) }}
          className="pre-celda"
          type="text"
          inputMode="numeric"
          value={texto}
          placeholder="—"
          aria-label={`${p.nombre} · ${fila.label} · ${nivel === 'publico' ? 'Público' : 'Mayorista'}`}
          aria-invalid={!!errorCelda || vacia}
          title={errorCelda ? `No se puede guardar: ${errorCelda}` : vacia ? 'Falta capturar este precio' : undefined}
          onFocus={e => e.currentTarget.select()}
          onChange={e => setCelda(p, columna, e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); bajar(i, nivel, 1) }
            else if (e.key === 'ArrowDown') { e.preventDefault(); bajar(i, nivel, 1) }
            else if (e.key === 'ArrowUp') { e.preventDefault(); bajar(i, nivel, -1) }
          }}
          style={{
            border: `1px solid ${errorCelda || vacia ? ROJO : tocada ? ACENTO : BORDE}`,
            background: errorCelda ? '#fef2f2' : vacia ? '#fff5f5' : tocada ? '#fff7f3' : '#fff',
            color: errorCelda ? ROJO : TINTA,
            fontWeight: tocada ? 700 : 400,
            ...tabular,
          }}
        />
        {cobraRedondeado !== null && (
          <span
            title="El pedido redondea el precio de la lata suelta. La caja sí usa los centavos."
            style={{ display: 'block', color: '#b45309', fontSize: 9.5, marginTop: 1, ...tabular }}
          >
            cobra ${cobraRedondeado}
          </span>
        )}
      </td>
    )
  }

  /**
   * Los precios por lata que todavia no se guardan, para que el renglon de la
   * caja refleje lo que se esta escribiendo en el de la lata.
   */
  const numerosEditados = (p: ProductoPrecios): Record<string, number | null> => {
    const salida: Record<string, number | null> = {}
    for (const nivel of ['publico', 'taproom'] as NivelPrecio[]) {
      const columna = `precio_lata_${nivel}`
      if (claveCelda(p.id, columna) in editados) salida[columna] = numeroDe(p, columna)
    }
    return salida
  }

  const th: React.CSSProperties = {
    padding: '8px 6px', color: GRIS, fontSize: 10.5, fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.06em',
    borderBottom: `1px solid ${BORDE}`,
  }

  return (
    <div>
      <style>{CSS}</style>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: '0 0 3px', color: TINTA, fontSize: 21, fontWeight: 700, letterSpacing: '-0.01em' }}>
            Lista de precios
          </h1>
          <p style={{ margin: 0, color: GRIS, fontSize: 12.5 }}>
            {filtrados.length} de {productos.length} productos ·{' '}
            {totalFaltantes === 0
              ? 'sin precios faltantes'
              : `${totalFaltantes} ${totalFaltantes === 1 ? 'celda' : 'celdas'} sin capturar`}
          </p>
        </div>

        <button
          type="button"
          onClick={guardar}
          disabled={guardando || lote.celdas === 0}
          style={{
            padding: '9px 16px', borderRadius: 8, border: 'none',
            background: lote.celdas > 0 ? acento : '#e5e7eb',
            color: lote.celdas > 0 ? '#fff' : GRIS_SUAVE,
            fontSize: 13, fontWeight: 700,
            cursor: lote.celdas > 0 && !guardando ? 'pointer' : 'not-allowed',
          }}
        >
          {guardando
            ? 'Guardando…'
            : lote.celdas === 0
              ? 'Guardar cambios'
              : `Guardar cambios (${lote.celdas} ${lote.celdas === 1 ? 'celda' : 'celdas'})`}
        </button>
      </div>

      {/* ── Barra de herramientas ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar producto o estilo…"
          style={{ padding: '7px 11px', border: `1px solid ${BORDE}`, borderRadius: 8, fontSize: 12.5, color: TINTA, outline: 'none', minWidth: 210 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: TINTA_MEDIA, fontSize: 12.5 }}>
          <input type="checkbox" checked={soloFaltantes} onChange={e => setSoloFaltantes(e.target.checked)} />
          Solo faltantes
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: TINTA_MEDIA, fontSize: 12.5 }}>
          <input type="checkbox" checked={soloActivos} onChange={e => setSoloActivos(e.target.checked)} />
          Solo activos
        </label>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginLeft: 'auto', flexWrap: 'wrap' }}>
          <span style={{ color: GRIS, fontSize: 12.5 }} title="La sugerencia se redondea a pesos enteros">
            Mayorista = Público −
          </span>
          <input
            value={descuento}
            onChange={e => setDescuento(e.target.value.replace(/[^\d.]/g, ''))}
            aria-label="Descuento sobre el precio público, en porcentaje"
            style={{ width: 54, padding: '7px 8px', border: `1px solid ${pctValido ? BORDE : ROJO}`, borderRadius: 8, fontSize: 12.5, textAlign: 'center', color: TINTA, outline: 'none', ...tabular }}
          />
          <span style={{ color: GRIS, fontSize: 12.5 }}>%</span>
          <button type="button" className="pre-btn" disabled={!pctValido} onClick={() => aplicarDescuento(filtrados, 'la columna')}>
            Aplicar a la columna
          </button>
          <button
            type="button"
            className="pre-btn"
            disabled={!pctValido || seleccion.size === 0}
            onClick={() => aplicarDescuento(filtrados.filter(p => seleccion.has(p.id)), 'la selección')}
          >
            A la selección ({seleccion.size})
          </button>
        </div>
      </div>

      {error && (
        <p style={{ margin: '0 0 12px', padding: '9px 12px', background: '#fef2f2', border: `1px solid #fecaca`, borderRadius: 8, color: ROJO, fontSize: 12.5 }}>
          {error}
        </p>
      )}
      {aviso && (
        <p style={{ margin: '0 0 12px', padding: '9px 12px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, color: '#047857', fontSize: 12.5 }}>
          {aviso}
        </p>
      )}

      {/* ── La hoja ───────────────────────────────────────── */}
      <div className="pre-scroll" style={{ background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 12, padding: '4px 14px 14px' }}>
        <table className="pre-tabla">
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left', minWidth: 190 }}>Producto · presentación</th>
              {NIVELES.map(n => (
                <th key={n.nivel} style={{ ...th, width: 116 }}>{n.label}</th>
              ))}
              <th style={{ ...th, width: 108, textAlign: 'right' }}>Disponible</th>
            </tr>
          </thead>

          {filtrados.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={4} style={{ padding: 50, textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
                  Ningún producto coincide con el filtro.
                </td>
              </tr>
            </tbody>
          ) : (
            filtrados.map((p, iProducto) => {
              const faltan = faltantesDe(p)
              return (
                <tbody key={p.id}>
                  <tr style={{ background: '#fafafa' }}>
                    <td colSpan={4} style={{ padding: '9px 6px', borderTop: iProducto === 0 ? 'none' : `1px solid ${BORDE}` }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={seleccion.has(p.id)}
                            onChange={e => {
                              const s = new Set(seleccion)
                              if (e.target.checked) s.add(p.id)
                              else s.delete(p.id)
                              setSeleccion(s)
                            }}
                            aria-label={`Seleccionar ${p.nombre}`}
                          />
                          <span style={{ color: TINTA, fontSize: 13, fontWeight: 700 }}>{p.nombre}</span>
                        </label>
                        {typeof p.estilo === 'string' && p.estilo && (
                          <span style={{ color: GRIS_SUAVE, fontSize: 11.5 }}>{p.estilo}</span>
                        )}
                        {!p.activo && (
                          <span style={{ padding: '1px 7px', borderRadius: 99, background: PISTA, color: GRIS, fontSize: 10, fontWeight: 600 }}>
                            Descontinuado
                          </span>
                        )}
                        {faltan > 0 && (
                          <span style={{ padding: '1px 7px', borderRadius: 99, background: '#fef2f2', border: '1px solid #fecaca', color: ROJO, fontSize: 10, fontWeight: 600 }}>
                            faltan {faltan}
                          </span>
                        )}
                        <button
                          type="button"
                          className="pre-btn"
                          disabled={!pctValido}
                          onClick={() => aplicarDescuento([p], p.nombre)}
                          style={{ marginLeft: 'auto', padding: '4px 9px', fontSize: 11 }}
                          title={`Sugerir el mayorista de ${p.nombre} a −${descuento}% del público`}
                        >
                          Mayorista −{descuento || '?'}%
                        </button>
                      </div>
                    </td>
                  </tr>

                  {FILAS_PRECIO.map(fila => {
                    // El indice en la lista de celdas editables, para el salto
                    // con Enter. Las filas derivadas no tienen input.
                    const iEditable = indiceEditable.get(`${p.id}|${fila.unidad}`) ?? -1
                    const fisico = Number(p[fila.stock] ?? 0) || 0
                    const comp = apartado.get(claveStock(p.id, fila.stock)) || 0
                    const disponible = fisico - comp

                    return (
                      <tr key={fila.unidad}>
                        <td style={{ padding: '4px 6px', borderTop: `1px solid ${PISTA}` }}>
                          <span style={{ color: fila.columna ? TINTA_MEDIA : GRIS_SUAVE, fontSize: 12.5 }}>
                            {fila.label}
                          </span>
                          {!fila.columna && (
                            <span
                              title={`Se calcula del precio por lata × ${fila.latas}. Para cambiarlo, edita el renglón de Lata.`}
                              style={{ marginLeft: 7, color: GRIS_SUAVE, fontSize: 10 }}
                            >
                              derivado de la lata
                            </span>
                          )}
                        </td>
                        {NIVELES.map(n => celda(p, fila, n.nivel, iEditable))}
                        <td
                          style={{ padding: '4px 6px', borderTop: `1px solid ${PISTA}`, textAlign: 'right', ...tabular }}
                          title={`físico ${fisico} · comprometido ${comp}`}
                        >
                          <span style={{ color: disponible <= 0 ? GRIS_SUAVE : TINTA_MEDIA, fontSize: 12 }}>
                            {disponible}
                          </span>
                          {comp > 0 && <span style={{ color: GRIS_SUAVE, fontSize: 10 }}> /{fisico}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              )
            })
          )}
        </table>
      </div>

      <p style={{ margin: '12px 0 0', color: GRIS_SUAVE, fontSize: 11, lineHeight: 1.6 }}>
        Caja 12 y Caja 24 no se capturan: su precio sale del de la lata (×12 y ×24), que es como lo calcula
        el pedido. Un precio en cero no se guarda — en este sistema significa «sin precio» y bloquea la
        venta. Los precios van en pesos enteros: el pedido redondea la lata suelta pero no la caja, así que
        con centavos las dos presentaciones cobrarían distinto. El disponible es el stock menos lo
        comprometido en pedidos abiertos.
      </p>
    </div>
  )
}
