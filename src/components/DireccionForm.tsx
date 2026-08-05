'use client'
import { useState, useEffect, useRef } from 'react'
import { createClient } from '../lib/supabase'

export interface DireccionData {
  cp: string
  colonia: string
  municipio: string
  estado: string
  calle: string
  num_ext: string
  num_int: string
  referencias: string
}

interface Props {
  value: DireccionData
  onChange: (data: DireccionData) => void
  legacyAddress?: string | null  // old direccion_entrega for reference
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '12px 14px', background: '#f7f7f7',
  border: '1px solid #e8e8e8', borderRadius: 9, color: '#111',
  fontSize: 15, boxSizing: 'border-box', outline: 'none',
  fontFamily: 'system-ui, sans-serif', minHeight: 44,
}
const readonlyStyle: React.CSSProperties = { ...inputStyle, background: '#f0f0f0', color: '#6b7280', cursor: 'default' }
const labelStyle: React.CSSProperties = { color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }

export default function DireccionForm({ value, onChange, legacyAddress }: Props) {
  const supabase = createClient()
  const [colonias, setColonias] = useState<string[]>([])
  const [cpLoading, setCpLoading] = useState(false)
  const [cpNotFound, setCpNotFound] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  const set = (field: keyof DireccionData, v: string) => {
    onChange({ ...value, [field]: v })
  }

  const lookupCP = async (cp: string) => {
    if (cp.length !== 5) {
      setColonias([])
      setCpNotFound(false)
      if (cp.length > 0 && cp.length < 5) {
        onChange({ ...value, cp, municipio: '', estado: '', colonia: '' })
      }
      return
    }
    setCpLoading(true)
    setCpNotFound(false)
    const { data } = await supabase
      .from('codigos_postales')
      .select('colonia, municipio, estado')
      .eq('cp', cp)
    setCpLoading(false)

    if (!data || data.length === 0) {
      setCpNotFound(true)
      setColonias([])
      onChange({ ...value, cp, municipio: '', estado: '', colonia: '' })
      return
    }

    const cols = [...new Set(data.map(d => d.colonia))].sort()
    setColonias(cols)
    onChange({
      ...value,
      cp,
      municipio: data[0].municipio,
      estado: data[0].estado,
      colonia: cols.length === 1 ? cols[0] : value.colonia,
    })
  }

  const handleCPChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 5)
    set('cp', digits)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => lookupCP(digits), 300)
  }

  // Initial lookup if CP is pre-filled
  useEffect(() => {
    if (value.cp?.length === 5) lookupCP(value.cp)
  }, [])

  const cpResolved = colonias.length > 0

  return (
    <div>
      {legacyAddress && !value.calle && (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <p style={{ margin: 0, color: '#92400e', fontSize: 13, lineHeight: 1.5 }}>
            Direccion anterior: <strong>{legacyAddress}</strong>
          </p>
          <p style={{ margin: '4px 0 0', color: '#92400e', fontSize: 12, opacity: 0.7 }}>Recaptura los datos en los campos de abajo.</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 100px', gap: 14, marginBottom: 16 }}>
        {/* CP */}
        <div>
          <label style={labelStyle}>Codigo postal</label>
          <div style={{ position: 'relative' }}>
            <input
              value={value.cp}
              onChange={e => handleCPChange(e.target.value)}
              placeholder="06600"
              maxLength={5}
              inputMode="numeric"
              style={{ ...inputStyle, fontFamily: 'monospace', fontWeight: 600 }}
            />
            {cpLoading && (
              <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 14, height: 14, border: '2px solid #e5e7eb', borderTop: '2px solid #6b7280', borderRadius: '50%', animation: 'spin 0.6s linear infinite' }} />
            )}
          </div>
          {cpNotFound && <p style={{ color: '#E8531D', fontSize: 11, margin: '4px 0 0' }}>CP no encontrado</p>}
        </div>

        {/* Colonia */}
        <div>
          <label style={labelStyle}>Colonia</label>
          {cpResolved ? (
            <select
              value={value.colonia}
              onChange={e => set('colonia', e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">-- Selecciona colonia --</option>
              {colonias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          ) : (
            <input value={value.colonia} onChange={e => set('colonia', e.target.value)} placeholder="Colonia" style={inputStyle} />
          )}
        </div>

        {/* Estado */}
        <div>
          <label style={labelStyle}>Estado</label>
          <input value={value.estado} readOnly={cpResolved} onChange={e => !cpResolved && set('estado', e.target.value)} style={cpResolved ? readonlyStyle : inputStyle} />
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Municipio / Alcaldia</label>
        <input value={value.municipio} readOnly={cpResolved} onChange={e => !cpResolved && set('municipio', e.target.value)} style={cpResolved ? readonlyStyle : inputStyle} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px', gap: 14, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Calle</label>
          <input value={value.calle} onChange={e => set('calle', e.target.value)} placeholder="Av. Amsterdam" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Num. ext.</label>
          <input value={value.num_ext} onChange={e => set('num_ext', e.target.value)} placeholder="123" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>Num. int.</label>
          <input value={value.num_int} onChange={e => set('num_int', e.target.value)} placeholder="4B" style={inputStyle} />
        </div>
      </div>

      <div>
        <label style={labelStyle}>Referencias</label>
        <textarea
          value={value.referencias}
          onChange={e => set('referencias', e.target.value)}
          rows={2}
          placeholder="Entre calles, color del porton, indicaciones..."
          style={{ ...inputStyle, resize: 'none' as const }}
        />
      </div>

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg) } }`}</style>
    </div>
  )
}
