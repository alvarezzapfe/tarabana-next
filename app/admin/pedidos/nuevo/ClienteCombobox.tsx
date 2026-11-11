'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA } from './pos-ui'

/**
 * Selector de cliente: busqueda, mas sus clientes mas recientes arriba.
 *
 * "Reciente" es por ultimo pedido, no por fecha de alta ni por `last_seen_at`:
 * la pregunta que contesta esta pantalla es "a quien le vendi hace poco", no
 * "quien se registro hace poco".
 */

export type Cliente = {
  id: string
  nombre: string
  email: string | null
  nivel_precio: string | null
  /** Default del switch de IVA del pedido. */
  requiere_factura: boolean
}

type Props = {
  clientes: Cliente[]
  /** Ids ordenados por su ultimo pedido, los mas recientes primero. */
  recientes: string[]
  valor: string
  onElegir: (id: string) => void
}

const MAX_RECIENTES = 5

export default function ClienteCombobox({ clientes, recientes, valor, onElegir }: Props) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const caja = useRef<HTMLDivElement>(null)

  const elegido = clientes.find(c => c.id === valor) || null

  useEffect(() => {
    if (!abierto) return
    const fuera = (e: MouseEvent) => {
      if (caja.current && !caja.current.contains(e.target as Node)) setAbierto(false)
    }
    document.addEventListener('mousedown', fuera)
    return () => document.removeEventListener('mousedown', fuera)
  }, [abierto])

  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

  const { listaRecientes, listaResto } = useMemo(() => {
    const q = norm(busqueda.trim())
    const coincide = (c: Cliente) => !q || norm(c.nombre).includes(q) || norm(c.email || '').includes(q)

    const porId = new Map(clientes.map(c => [c.id, c]))
    const rec = recientes
      .slice(0, MAX_RECIENTES)
      .map(id => porId.get(id))
      .filter((c): c is Cliente => !!c && coincide(c))
    const recIds = new Set(rec.map(c => c.id))

    return {
      listaRecientes: rec,
      listaResto: clientes.filter(c => !recIds.has(c.id) && coincide(c)),
    }
  }, [clientes, recientes, busqueda])

  const nivelTexto = (n: string | null) =>
    n === 'taproom' ? 'Mayorista' : n === 'distribuidor' ? 'Distribuidor' : 'Público'

  const fila = (c: Cliente) => (
    <button
      key={c.id}
      type="button"
      onClick={() => { onElegir(c.id); setAbierto(false); setBusqueda('') }}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 11px',
        background: c.id === valor ? '#fff7f3' : 'none', border: 'none',
        borderBottom: `1px solid ${PISTA}`, cursor: 'pointer',
      }}
    >
      <span style={{ display: 'block', color: TINTA, fontSize: 12.5, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {c.nombre}
      </span>
      <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 10.5 }}>
        {c.email || 'sin correo'} · {nivelTexto(c.nivel_precio)}
      </span>
    </button>
  )

  return (
    <div ref={caja} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAbierto(a => !a)}
        style={{
          width: '100%', textAlign: 'left', padding: '9px 12px', background: '#fff',
          border: `1px solid ${elegido ? ACENTO : BORDE}`, borderRadius: 8, cursor: 'pointer',
        }}
      >
        {elegido ? (
          <>
            <span style={{ display: 'block', color: TINTA, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {elegido.nombre}
            </span>
            <span style={{ display: 'block', color: GRIS, fontSize: 11 }}>
              {nivelTexto(elegido.nivel_precio)} · {elegido.email || 'sin correo'}
            </span>
          </>
        ) : (
          <span style={{ color: GRIS_SUAVE, fontSize: 13 }}>Elegir cliente…</span>
        )}
      </button>

      {abierto && (
        <div
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 40,
            background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 10,
            boxShadow: '0 10px 28px rgba(17,24,39,0.12)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: 8, borderBottom: `1px solid ${PISTA}` }}>
            <input
              autoFocus
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre o correo…"
              style={{
                width: '100%', padding: '7px 9px', background: '#fff',
                border: `1px solid ${BORDE}`, borderRadius: 7, color: TINTA,
                fontSize: 12.5, outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {listaRecientes.length > 0 && (
              <>
                <p style={{ margin: 0, padding: '7px 11px 5px', color: GRIS_SUAVE, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#fafafa' }}>
                  Recientes
                </p>
                {listaRecientes.map(fila)}
              </>
            )}
            {listaResto.length > 0 && (
              <>
                {listaRecientes.length > 0 && (
                  <p style={{ margin: 0, padding: '7px 11px 5px', color: GRIS_SUAVE, fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', background: '#fafafa' }}>
                    Todos
                  </p>
                )}
                {listaResto.map(fila)}
              </>
            )}
            {listaRecientes.length === 0 && listaResto.length === 0 && (
              <p style={{ margin: 0, padding: '18px 11px', textAlign: 'center', color: GRIS_SUAVE, fontSize: 12.5 }}>
                Ningún cliente coincide.
              </p>
            )}
          </div>

          <a
            href="/admin/clientes/nuevo"
            style={{ display: 'block', padding: '9px 11px', borderTop: `1px solid ${BORDE}`, color: ACENTO, fontSize: 12, fontWeight: 600, textDecoration: 'none', background: '#fafafa' }}
          >
            + Dar de alta un cliente
          </a>
        </div>
      )}

      {elegido && (
        <p style={{ margin: '6px 0 0', color: TINTA_MEDIA, fontSize: 11 }}>
          Los precios de la matriz ya son los de <strong>{nivelTexto(elegido.nivel_precio).toLowerCase()}</strong>.
        </p>
      )}
    </div>
  )
}
