'use client'
import { useState, useMemo } from 'react'
import PuntoVentaCard from '../components/PuntoVentaCard'
import { TIPO_LABELS } from '../../src/lib/types/puntoVenta'
import type { PuntoVenta, TipoPuntoVenta } from '../../src/lib/types/puntoVenta'

export default function EncuentranosClient({ puntos }: { puntos: PuntoVenta[] }) {
  const [ciudad, setCiudad] = useState<string>('todas')
  const [tipo, setTipo] = useState<string>('todos')
  const [zona, setZona] = useState<string>('todas')

  const ciudades = useMemo(() => {
    const counts: Record<string, number> = {}
    puntos.forEach(p => { counts[p.ciudad] = (counts[p.ciudad] || 0) + 1 })
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [puntos])

  const zonas = useMemo(() => {
    if (ciudad === 'todas') return []
    const unique = new Set<string>()
    puntos.filter(p => p.ciudad === ciudad && p.zona).forEach(p => unique.add(p.zona!))
    return Array.from(unique).sort()
  }, [puntos, ciudad])

  const filtered = useMemo(() => {
    return puntos.filter(p => {
      if (ciudad !== 'todas' && p.ciudad !== ciudad) return false
      if (tipo !== 'todos' && p.tipo !== tipo) return false
      if (zona !== 'todas' && p.zona !== zona) return false
      return true
    })
  }, [puntos, ciudad, tipo, zona])

  const pillStyle = (active: boolean) => ({
    fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em',
    textTransform: 'uppercase' as const, padding: '8px 18px', border: 'none',
    borderRadius: 100, cursor: 'pointer' as const, transition: 'all 0.15s',
    fontWeight: 500,
    background: active ? 'var(--amber)' : `rgba(var(--ink-rgb),0.06)`,
    color: active ? '#fff' : `rgba(var(--ink-rgb),0.5)`,
  })

  return (
    <>
      {/* Hero */}
      <section style={{
        padding: 'clamp(120px,15vh,180px) clamp(20px,5vw,64px) clamp(40px,6vh,80px)',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--amber)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 20,
        }}>
          <span style={{ display: 'block', width: 28, height: 1, background: 'var(--amber)' }} />
          Dónde encontrarnos
          <span style={{ display: 'block', width: 28, height: 1, background: 'var(--amber)' }} />
        </div>
        <h1 style={{
          fontFamily: 'var(--font-serif)', fontSize: 'clamp(40px, 5vw, 64px)',
          fontWeight: 900, lineHeight: 1.05, letterSpacing: '-1.5px', marginBottom: 16,
        }}>
          Encuéntranos.
        </h1>
        <p style={{
          fontFamily: 'var(--font-sans)', fontSize: 16, fontWeight: 300,
          color: `rgba(var(--ink-rgb),0.6)`, lineHeight: 1.7, maxWidth: 480,
          margin: '0 auto',
        }}>
          Bares, restaurantes y tiendas donde puedes encontrar Tarabaña de barril y en lata.
        </p>
      </section>

      {/* Filters */}
      <section style={{
        padding: '0 clamp(20px,5vw,64px) 48px',
        display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center',
      }}>
        {/* Ciudad pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => { setCiudad('todas'); setZona('todas') }} style={pillStyle(ciudad === 'todas')}>
            Todas ({puntos.length})
          </button>
          {ciudades.map(([c, count]) => (
            <button key={c} onClick={() => { setCiudad(c); setZona('todas') }} style={pillStyle(ciudad === c)}>
              {c} ({count})
            </button>
          ))}
        </div>

        {/* Tipo pills */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button onClick={() => setTipo('todos')} style={pillStyle(tipo === 'todos')}>Todos</button>
          {(Object.entries(TIPO_LABELS) as [TipoPuntoVenta, string][]).map(([k, v]) => (
            <button key={k} onClick={() => setTipo(k)} style={pillStyle(tipo === k)}>{v}s</button>
          ))}
        </div>

        {/* Zona pills (only when ciudad selected) */}
        {zonas.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
            <button onClick={() => setZona('todas')} style={pillStyle(zona === 'todas')}>Todas las zonas</button>
            {zonas.map(z => (
              <button key={z} onClick={() => setZona(z)} style={pillStyle(zona === z)}>{z}</button>
            ))}
          </div>
        )}
      </section>

      {/* Grid */}
      <section style={{ padding: '0 clamp(20px,5vw,64px) clamp(60px,8vh,100px)' }}>
        {filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '80px 0',
            fontFamily: 'var(--font-mono)', fontSize: 13,
            color: `rgba(var(--ink-rgb),0.35)`, letterSpacing: '0.05em',
          }}>
            No encontramos puntos con esos filtros
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
            gap: 20,
          }}>
            {filtered.map(p => <PuntoVentaCard key={p.id} punto={p} />)}
          </div>
        )}
      </section>
    </>
  )
}
