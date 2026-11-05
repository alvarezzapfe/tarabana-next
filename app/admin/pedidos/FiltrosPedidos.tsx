'use client'
import { useMemo } from 'react'
import {
  ACENTO, BORDE, CHIPS, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA,
  type ChipKey, type FilaPedido, type Filtros,
  FILTROS_VACIOS, hayFiltros, mesesDe,
} from './pedidos-ui'
import { etiquetaFecha } from '../../../src/lib/fechas'

/**
 * Barra de filtros de Pedidos.
 *
 * Los chips mezclan status del pedido con estado de cobro a proposito: quien
 * mira esta tabla pregunta "que falta por entregar" y "que falta por cobrar"
 * con la misma frecuencia, y separarlos en dos controles obliga a pensar en
 * que categoria cae cada pregunta.
 *
 * Los conteos van en el chip. Un filtro que lleva a cero resultados es una
 * perdida de tiempo, y verlo antes de picar lo evita.
 */

type Props = {
  filtros: Filtros
  onFiltros: (f: Filtros) => void
  /** Todas las filas, sin filtrar: de ahi salen los conteos y los catalogos. */
  filas: FilaPedido[]
  vendedores: { id: string; nombre: string }[]
  /** Cuantas filas pasan el filtro actual. */
  visibles: number
}

export default function FiltrosPedidos({ filtros, onFiltros, filas, vendedores, visibles }: Props) {
  const set = <K extends keyof Filtros>(k: K, v: Filtros[K]) => onFiltros({ ...filtros, [k]: v })

  /** Cuantas filas caerian en cada chip, con los demas filtros aplicados. */
  const conteos = useMemo(() => {
    const cuenta = (chip: ChipKey) => {
      switch (chip) {
        case 'todos': return filas.length
        case 'vencidos': return filas.filter(f => f.saldo > 0 && (f.estado_cobro === 'vencido' || f.dias_vencido > 0)).length
        case 'con_saldo': return filas.filter(f => f.saldo > 0).length
        default: return filas.filter(f => f.status === chip).length
      }
    }
    return Object.fromEntries(CHIPS.map(c => [c.key, cuenta(c.key)])) as Record<ChipKey, number>
  }, [filas])

  const clientes = useMemo(() => {
    const mapa = new Map<string, string>()
    for (const f of filas) if (f.cliente_id) mapa.set(f.cliente_id, f.cliente)
    return [...mapa.entries()]
      .map(([id, nombre]) => ({ id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
  }, [filas])

  const meses = useMemo(() => mesesDe(filas), [filas])

  const campo: React.CSSProperties = {
    padding: '7px 10px', background: '#fff', border: `1px solid ${BORDE}`,
    borderRadius: 7, color: TINTA, fontSize: 12.5, outline: 'none',
  }
  const lbl: React.CSSProperties = {
    display: 'block', color: GRIS_SUAVE, fontSize: 10,
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4,
  }

  /** Pone el rango al mes elegido, sin tocar Date. */
  const aplicarMes = (mes: string) => {
    if (!mes) { onFiltros({ ...filtros, desde: '', hasta: '' }); return }
    const [a, m] = mes.split('-').map(Number)
    const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
    onFiltros({ ...filtros, desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` })
  }

  const mesActivo = meses.find(m => filtros.desde === `${m}-01` && filtros.hasta?.startsWith(m)) || ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14 }}>
      {/* Chips */}
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {CHIPS.map(c => {
          const activo = filtros.chip === c.key
          const n = conteos[c.key]
          return (
            <button
              key={c.key}
              type="button"
              onClick={() => set('chip', c.key)}
              disabled={n === 0 && !activo}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 99, cursor: n === 0 && !activo ? 'default' : 'pointer',
                background: activo ? '#fff7f3' : '#fff',
                border: `1.5px solid ${activo ? ACENTO : BORDE}`,
                color: activo ? TINTA : n === 0 ? '#d1d5db' : GRIS,
                fontSize: 12.5, fontWeight: activo ? 700 : 500,
              }}
            >
              {c.label}
              <span style={{ color: activo ? ACENTO : GRIS_SUAVE, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                {n}
              </span>
            </button>
          )
        })}
      </div>

      {/* Campos */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '1 1 210px', minWidth: 170 }}>
          <label style={lbl}>Buscar</label>
          <input
            value={filtros.busqueda}
            onChange={e => set('busqueda', e.target.value)}
            placeholder="Folio, cliente u OC…"
            style={{ ...campo, width: '100%', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label style={lbl}>Mes</label>
          <select value={mesActivo} onChange={e => aplicarMes(e.target.value)} style={{ ...campo, cursor: 'pointer' }}>
            <option value="">Cualquiera</option>
            {meses.map(m => (
              <option key={m} value={m}>{etiquetaFecha(`${m}-01`).replace(/^\d+ /, '')}</option>
            ))}
          </select>
        </div>

        <div>
          <label style={lbl}>Desde</label>
          <input type="date" value={filtros.desde} onChange={e => set('desde', e.target.value)} style={campo} />
        </div>
        <div>
          <label style={lbl}>Hasta</label>
          <input type="date" value={filtros.hasta} onChange={e => set('hasta', e.target.value)} style={campo} />
        </div>

        {vendedores.length > 0 && (
          <div>
            <label style={lbl}>Vendedor</label>
            <select value={filtros.vendedor} onChange={e => set('vendedor', e.target.value)} style={{ ...campo, cursor: 'pointer' }}>
              <option value="">Todos</option>
              <option value="sin">Sin vendedor</option>
              {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </div>
        )}

        <div>
          <label style={lbl}>Cliente</label>
          <select value={filtros.cliente} onChange={e => set('cliente', e.target.value)} style={{ ...campo, cursor: 'pointer', maxWidth: 190 }}>
            <option value="">Todos</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 1 }}>
          <span style={{ color: GRIS, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            {visibles} de {filas.length}
          </span>
          {hayFiltros(filtros) && (
            <button
              type="button"
              onClick={() => onFiltros(FILTROS_VACIOS)}
              style={{ padding: '6px 11px', background: '#fff', border: `1px solid ${PISTA}`, borderRadius: 7, color: TINTA_MEDIA, fontSize: 12, cursor: 'pointer' }}
            >
              Limpiar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
