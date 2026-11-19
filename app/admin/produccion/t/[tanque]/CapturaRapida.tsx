'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { BORDE, GRIS, GRIS_SUAVE, TINTA } from '../../../dash-ui'
import { botonPrimario, soloDecimal } from '../../produccion-ui'

/**
 * Captura de una lectura, en dos toques.
 *
 * El campo de gravedad es lo unico obligatorio y arranca con el foco, asi que
 * el teclado numerico ya esta arriba cuando la pantalla aparece: teclear el
 * numero es el primer toque y Guardar el segundo. Temperatura, pH y nota
 * estan detras de "Agregar más" para que no haya cuatro campos compitiendo
 * cuando lo normal es capturar uno.
 *
 * `type="text"` con `inputMode="decimal"` y no `type="number"`: es la
 * convencion del proyecto (ver produccion-ui.ts), y en celular el spinner de
 * un number input es un blanco de ocho pixeles al lado del campo.
 */
export default function CapturaRapida({
  loteId, folio, autoFoco,
}: { loteId: string; folio: string | null; autoFoco: boolean }) {
  const router = useRouter()
  const [gravedad, setGravedad] = useState('')
  const [temp, setTemp] = useState('')
  const [ph, setPh] = useState('')
  const [nota, setNota] = useState('')
  const [mas, setMas] = useState(false)
  const [estado, setEstado] = useState<'reposo' | 'guardando' | 'ok'>('reposo')
  const [error, setError] = useState('')
  const campo = useRef<HTMLInputElement>(null)

  const algo = !!(gravedad || temp || ph || nota.trim())

  const guardar = async () => {
    setEstado('guardando'); setError('')
    try {
      const res = await fetch(`/api/admin/produccion/lotes/${loteId}/lecturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gravedad, temperatura_c: temp, ph, nota }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar'); setEstado('reposo'); return }
      setGravedad(''); setTemp(''); setPh(''); setNota('')
      setEstado('ok')
      // Refresca para que la "ultima gravedad" de arriba muestre la que acaba
      // de capturar: sin esto parece que no se guardo.
      router.refresh()
      campo.current?.focus()
    } catch {
      setError('No se pudo guardar')
      setEstado('reposo')
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 10 }}>
          {error}
        </div>
      )}
      {estado === 'ok' && (
        <p role="status" style={{ margin: '0 0 10px', color: '#059669', fontSize: 12.5, fontWeight: 600 }}>
          Lectura guardada{folio ? ` en ${folio}` : ''}.
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
        <input
          ref={campo}
          autoFocus={autoFoco}
          type="text"
          inputMode="decimal"
          value={gravedad}
          onChange={e => { setGravedad(soloDecimal(e.target.value)); setEstado('reposo') }}
          onFocus={e => e.currentTarget.select()}
          placeholder="1.020"
          aria-label="Gravedad"
          style={{
            flex: 1, minWidth: 0, padding: '14px 16px',
            border: `1px solid ${BORDE}`, borderRadius: 10,
            // Grande a proposito: esto se teclea de pie, junto a un tanque,
            // probablemente con guantes.
            fontSize: 26, fontWeight: 600, color: TINTA,
            fontVariantNumeric: 'tabular-nums', textAlign: 'center',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
        <button
          onClick={guardar}
          disabled={estado === 'guardando' || !algo}
          style={{
            ...botonPrimario(),
            padding: '0 20px', fontSize: 15,
            opacity: estado === 'guardando' || !algo ? 0.5 : 1,
            cursor: algo ? 'pointer' : 'not-allowed',
            flexShrink: 0,
          }}
        >
          {estado === 'guardando' ? '…' : 'Guardar'}
        </button>
      </div>

      <p style={{ margin: '6px 0 0', color: GRIS_SUAVE, fontSize: 11.5 }}>Gravedad</p>

      {!mas ? (
        <button
          onClick={() => setMas(true)}
          style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, color: GRIS, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Agregar temperatura, pH o nota
        </button>
      ) : (
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input
              type="text" inputMode="decimal" aria-label="Temperatura en grados Celsius"
              placeholder="Temp. °C" value={temp}
              onChange={e => setTemp(soloDecimal(e.target.value))}
              style={campoChico}
            />
            <input
              type="text" inputMode="decimal" aria-label="pH"
              placeholder="pH" value={ph}
              onChange={e => setPh(soloDecimal(e.target.value))}
              style={campoChico}
            />
          </div>
          <input
            aria-label="Nota" placeholder="Nota" value={nota}
            onChange={e => setNota(e.target.value)}
            style={campoChico}
          />
        </div>
      )}
    </div>
  )
}

const campoChico = {
  width: '100%', padding: '12px 13px', border: `1px solid ${BORDE}`,
  borderRadius: 9, fontSize: 16, color: TINTA, fontFamily: 'inherit',
  boxSizing: 'border-box' as const, background: '#fff',
}
