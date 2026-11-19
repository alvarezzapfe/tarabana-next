'use client'
import { useState } from 'react'

/**
 * Prefijo de folio de lote del producto.
 *
 * Guarda APARTE, con su propio boton y su propia ruta
 * (/api/admin/inventario/[id]/folio-prefijo), y no con el Guardar grande de
 * la pantalla: ese escribe `productos` con la anon key desde el browser —la
 * deuda que marca docs/RLS.md— y el prefijo es unico, asi que necesita un
 * error que diga quien lo tiene ya.
 *
 * Componente propio y no un campo mas del formulario por lo mismo: asi el
 * estado de guardado y el mensaje de choque viven junto al campo y no se
 * mezclan con la validacion de precios.
 */
export default function CampoPrefijo({
  productoId, inicial,
}: { productoId: string; inicial: string | null }) {
  const [valor, setValor] = useState(inicial ?? '')
  const [guardado, setGuardado] = useState(inicial ?? '')
  const [estado, setEstado] = useState<'reposo' | 'guardando' | 'ok'>('reposo')
  const [error, setError] = useState('')

  const sucio = valor.trim().toUpperCase() !== guardado
  const valido = valor === '' || /^[A-Z]{3}$/.test(valor.trim().toUpperCase())

  const guardar = async () => {
    setEstado('guardando'); setError('')
    try {
      const res = await fetch(`/api/admin/inventario/${productoId}/folio-prefijo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folio_prefijo: valor }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar'); setEstado('reposo'); return }
      setGuardado(data.folio_prefijo ?? '')
      setValor(data.folio_prefijo ?? '')
      setEstado('ok')
    } catch {
      setError('No se pudo guardar')
      setEstado('reposo')
    }
  }

  return (
    <div>
      <label
        htmlFor="folio-prefijo"
        style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}
      >
        Prefijo de folio
      </label>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <input
          id="folio-prefijo"
          value={valor}
          onChange={e => {
            // Mayusculas y maximo 3 letras mientras se escribe: asi el campo
            // no deja teclear algo que la ruta va a rechazar.
            setValor(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3))
            setEstado('reposo')
            setError('')
          }}
          placeholder="BRA"
          maxLength={3}
          style={{
            width: 96, padding: '10px 12px', background: '#f9fafb',
            border: `1px solid ${error ? '#fecaca' : '#e5e7eb'}`, borderRadius: 8,
            color: '#1a1a1a', fontSize: 14, minHeight: 44, outline: 'none',
            letterSpacing: '0.12em', fontWeight: 600, textAlign: 'center',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={guardar}
          disabled={!sucio || !valido || estado === 'guardando'}
          style={{
            padding: '10px 14px', minHeight: 44, borderRadius: 8, fontSize: 13.5,
            fontWeight: 600, fontFamily: 'inherit',
            border: '1px solid #e5e7eb', background: '#fff',
            color: !sucio || !valido ? '#9ca3af' : '#374151',
            cursor: !sucio || !valido || estado === 'guardando' ? 'not-allowed' : 'pointer',
          }}
        >
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
      </div>

      {error ? (
        <p role="alert" style={{ margin: '6px 0 0', color: '#b91c1c', fontSize: 12, lineHeight: 1.45 }}>{error}</p>
      ) : estado === 'ok' ? (
        <p style={{ margin: '6px 0 0', color: '#059669', fontSize: 12 }}>Prefijo guardado.</p>
      ) : (
        <p style={{ margin: '6px 0 0', color: '#9ca3af', fontSize: 12, lineHeight: 1.45 }}>
          Tres letras para el folio de lote (BRA-26-014). Único entre
          productos; vacío = este producto no se cocina en casa. Se guarda
          aparte del botón de abajo.
        </p>
      )}
    </div>
  )
}
