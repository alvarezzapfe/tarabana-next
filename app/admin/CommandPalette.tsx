'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { NavItem } from '../../src/lib/admin-nav'

/**
 * Command palette del admin (⌘K / Ctrl+K).
 *
 * Navega a las secciones que el rol puede ver y busca clientes y pedidos
 * contra /api/admin/buscar, que vuelve a validar el rol server-side: los
 * items que llegan aqui ya vienen filtrados, pero eso es solo UI.
 *
 * El sidebar lo abre disparando el evento 'admin-palette-open' en window,
 * asi ninguno de los dos necesita conocer al otro.
 */

type Cliente = { id: string; nombre: string; email: string }
type Pedido = { id: string; folio: string; cliente: string; total: number; saldo: number; status: string; estado_cobro: string }

type Fila =
  | { tipo: 'seccion'; id: string; label: string; href: string }
  | { tipo: 'cliente'; id: string; label: string; sub: string; href: string }
  | { tipo: 'pedido'; id: string; label: string; sub: string; href: string; vencido: boolean }

const DEBOUNCE_MS = 180
const fmt = (n: number) => `$${(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`

export default function CommandPalette({ items, acento }: { items: NavItem[]; acento: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [cursor, setCursor] = useState(0)
  // Los resultados se guardan junto al termino que los produjo, asi `filas`
  // puede descartarlos cuando el input ya cambio sin tener que limpiarlos
  // desde un efecto.
  const [resultados, setResultados] = useState<{ term: string; clientes: Cliente[]; pedidos: Pedido[] }>({ term: '', clientes: [], pedidos: [] })
  const [buscando, setBuscando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const cerrar = useCallback(() => {
    setAbierto(false)
    setQ('')
    setResultados({ term: '', clientes: [], pedidos: [] })
    setCursor(0)
  }, [])

  // El cursor se reinicia aqui y no en un efecto sobre `q`: es el mismo evento
  // que cambia el texto, asi que no hace falta un render extra.
  const onChangeQ = useCallback((valor: string) => {
    setQ(valor)
    setCursor(0)
  }, [])

  // Atajo global + apertura desde el sidebar
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setAbierto(prev => !prev)
      }
    }
    const onOpen = () => setAbierto(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('admin-palette-open', onOpen)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('admin-palette-open', onOpen)
    }
  }, [])

  useEffect(() => {
    if (abierto) inputRef.current?.focus()
  }, [abierto])

  // Busqueda con debounce. Todo el setState vive dentro de callbacks (el
  // timeout y la promesa), nunca en el cuerpo del efecto.
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return
    let vigente = true
    const t = setTimeout(async () => {
      setBuscando(true)
      try {
        const res = await fetch(`/api/admin/buscar?q=${encodeURIComponent(term)}`)
        if (!vigente) return
        if (res.ok) {
          const body = await res.json()
          setResultados({ term, clientes: body.clientes || [], pedidos: body.pedidos || [] })
        }
      } catch {
        // Red caida: se queda con lo que haya; las secciones siguen usables.
      } finally {
        if (vigente) setBuscando(false)
      }
    }, DEBOUNCE_MS)
    return () => {
      vigente = false
      clearTimeout(t)
    }
  }, [q])

  const filas = useMemo<Fila[]>(() => {
    const termRaw = q.trim()
    const term = termRaw.toLowerCase()
    const secciones: Fila[] = items
      .filter(i => !term || i.label.toLowerCase().includes(term))
      .map(i => ({ tipo: 'seccion' as const, id: `s:${i.key}`, label: i.label, href: i.href }))

    // Solo se muestran los resultados del termino actual.
    const frescos = resultados.term === termRaw
    const clientes = frescos ? resultados.clientes : []
    const pedidos = frescos ? resultados.pedidos : []

    const cl: Fila[] = clientes.map(c => ({
      tipo: 'cliente' as const,
      id: `c:${c.id}`,
      label: c.nombre,
      sub: c.email,
      href: `/admin/clientes/edit/${c.id}`,
    }))

    const pe: Fila[] = pedidos.map(p => ({
      tipo: 'pedido' as const,
      id: `p:${p.id}`,
      label: `#${p.folio} · ${p.cliente}`,
      sub: p.saldo > 0 ? `${fmt(p.total)} · saldo ${fmt(p.saldo)}` : `${fmt(p.total)} · pagado`,
      href: `/admin/pedidos/${p.id}/edit`,
      vencido: p.estado_cobro === 'vencido',
    }))

    return [...secciones, ...cl, ...pe]
  }, [items, resultados, q])

  const ir = useCallback(
    (fila: Fila) => {
      cerrar()
      router.push(fila.href)
    },
    [cerrar, router]
  )

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cerrar()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setCursor(c => (filas.length ? (c + 1) % filas.length : 0))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setCursor(c => (filas.length ? (c - 1 + filas.length) % filas.length : 0))
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const f = filas[cursor]
      if (f) ir(f)
    }
  }

  if (!abierto) return null

  const grupos: { titulo: string; tipo: Fila['tipo'] }[] = [
    { titulo: 'Secciones', tipo: 'seccion' },
    { titulo: 'Clientes', tipo: 'cliente' },
    { titulo: 'Pedidos', tipo: 'pedido' },
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar"
      onClick={cerrar}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(5,7,10,0.62)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '12vh 20px 20px',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, background: '#0F1216', border: '1px solid #1C2128',
          borderRadius: 12, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.55)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '13px 15px', borderBottom: '1px solid #1C2128' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8B93A1" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            value={q}
            onChange={e => onChangeQ(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Ir a una seccion, o buscar cliente o folio de pedido"
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: '#fff', fontSize: 14, fontFamily: 'inherit',
            }}
          />
          {buscando && <span className="font-mono" style={{ fontSize: 10, color: '#8B93A1' }}>…</span>}
          <kbd className="font-mono" style={{ fontSize: 10, color: '#8B93A1', border: '1px solid #1C2128', borderRadius: 4, padding: '1px 5px' }}>esc</kbd>
        </div>

        <div style={{ maxHeight: '48vh', overflowY: 'auto', padding: 6 }}>
          {filas.length === 0 && (
            <p style={{ color: '#8B93A1', fontSize: 13, padding: '18px 12px', margin: 0 }}>
              {q.trim().length < 2 ? 'Escribe al menos 2 caracteres para buscar.' : 'Sin resultados.'}
            </p>
          )}

          {grupos.map(g => {
            const delGrupo = filas.filter(f => f.tipo === g.tipo)
            if (!delGrupo.length) return null
            return (
              <div key={g.tipo} style={{ marginBottom: 4 }}>
                <p className="font-mono" style={{ color: '#5C6572', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', padding: '8px 10px 4px', margin: 0 }}>
                  {g.titulo}
                </p>
                {delGrupo.map(f => {
                  const idx = filas.indexOf(f)
                  const sel = idx === cursor
                  return (
                    <button
                      key={f.id}
                      onMouseEnter={() => setCursor(idx)}
                      onClick={() => ir(f)}
                      style={{
                        position: 'relative', width: '100%', textAlign: 'left', display: 'flex',
                        alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7,
                        background: sel ? '#1A1F27' : 'transparent', border: 'none', cursor: 'pointer',
                      }}
                    >
                      {sel && <span aria-hidden style={{ position: 'absolute', left: 0, top: 6, bottom: 6, width: 2, background: acento, borderRadius: 1 }} />}
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', color: sel ? '#fff' : '#C9D1D9', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {f.label}
                        </span>
                        {'sub' in f && f.sub && (
                          <span className="font-mono" style={{ display: 'block', color: '#5C6572', fontSize: 11, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {f.sub}
                          </span>
                        )}
                      </span>
                      {f.tipo === 'pedido' && f.vencido && (
                        <span title="Vencido" style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                      )}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
