import Link from 'next/link'
import { TIPO_LABELS, TIPO_COLORS } from '../../src/lib/types/puntoVenta'
import type { PuntoVenta } from '../../src/lib/types/puntoVenta'

function formatEventDates(inicio: string | null, fin: string | null) {
  if (!inicio) return null
  const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const d1 = new Date(inicio + 'T00:00:00')
  const d2 = fin ? new Date(fin + 'T00:00:00') : null
  const m1 = months[d1.getMonth()]
  if (!d2 || d1.toDateString() === d2.toDateString()) return `${d1.getDate()} ${m1}`
  if (d1.getMonth() === d2.getMonth()) return `${d1.getDate()}–${d2.getDate()} ${m1}`
  return `${d1.getDate()} ${m1} – ${d2.getDate()} ${months[d2.getMonth()]}`
}

export default function PuntoVentaCard({ punto }: { punto: PuntoVenta }) {
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(punto.direccion + ', ' + punto.ciudad)}`
  const eventDates = punto.tipo === 'evento' ? formatEventDates(punto.fecha_inicio, punto.fecha_fin) : null

  return (
    <article style={{
      background: '#fff', border: `0.5px solid rgba(var(--ink-rgb),0.1)`,
      borderRadius: 12, overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Image */}
      <div style={{
        width: '100%', height: 180, position: 'relative',
        background: punto.imagen_url ? undefined : `linear-gradient(135deg, rgba(var(--amber-rgb),0.15) 0%, rgba(var(--ink-rgb),0.05) 100%)`,
        overflow: 'hidden',
      }}>
        {punto.imagen_url ? (
          <img src={punto.imagen_url} alt={punto.nombre} style={{
            width: '100%', height: '100%', objectFit: 'cover',
          }} />
        ) : (
          <div style={{
            width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, opacity: 0.3,
          }}>📍</div>
        )}
        {/* Tipo tag */}
        <span style={{
          position: 'absolute', top: 12, right: 12,
          fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
          padding: '4px 10px', borderRadius: 6,
          background: TIPO_COLORS[punto.tipo], color: '#fff',
        }}>{TIPO_LABELS[punto.tipo]}</span>
        {/* Event dates */}
        {eventDates && (
          <div style={{
            position: 'absolute', bottom: 12, left: 12,
            fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
            color: 'var(--amber-light)', background: 'rgba(0,0,0,0.7)',
            padding: '4px 10px', borderRadius: 6,
          }}>{eventDates}</div>
        )}
      </div>

      {/* Content */}
      <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h3 style={{
          fontFamily: 'var(--font-serif)', fontSize: 20, fontWeight: 700, fontStyle: 'italic',
          color: 'var(--ink)', lineHeight: 1.2, margin: 0,
        }}>{punto.nombre}</h3>
        <p style={{
          fontFamily: 'var(--font-sans)', fontSize: 13, color: `rgba(var(--ink-rgb),0.6)`,
          margin: 0, lineHeight: 1.4,
        }}>{punto.direccion}, {punto.ciudad}</p>
        {punto.horario && (
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: `rgba(var(--ink-rgb),0.45)`,
            margin: 0,
          }}>{punto.horario}</p>
        )}
        {punto.notas && (
          <p style={{
            fontFamily: 'var(--font-sans)', fontSize: 13, color: `rgba(var(--ink-rgb),0.5)`,
            margin: 0, lineHeight: 1.5,
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>{punto.notas}</p>
        )}

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, marginTop: 8, paddingTop: 10,
          borderTop: `1px solid rgba(var(--ink-rgb),0.06)`,
        }}>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em',
            textTransform: 'uppercase', padding: '8px 16px',
            background: 'var(--amber)', color: '#fff', textDecoration: 'none',
            borderRadius: 6, fontWeight: 500,
          }}>Cómo llegar</a>
          {punto.instagram && (
            <a href={`https://instagram.com/${punto.instagram.replace('@', '')}`} target="_blank" rel="noopener noreferrer" style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.05em',
              textTransform: 'uppercase', padding: '8px 16px',
              background: 'transparent', color: `rgba(var(--ink-rgb),0.5)`, textDecoration: 'none',
              border: `1px solid rgba(var(--ink-rgb),0.12)`, borderRadius: 6,
            }}>Instagram</a>
          )}
        </div>
      </div>
    </article>
  )
}
