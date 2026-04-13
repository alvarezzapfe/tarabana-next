'use client'
import { useState } from 'react'
import { createClient } from '../../../src/lib/supabase'

const diasDefault = [
  { dia: 'Lunes', abierto: false, apertura: '', cierre: '' },
  { dia: 'Martes', abierto: true, apertura: '13:00', cierre: '23:00' },
  { dia: 'Miércoles', abierto: true, apertura: '13:00', cierre: '23:00' },
  { dia: 'Jueves', abierto: true, apertura: '13:00', cierre: '23:00' },
  { dia: 'Viernes', abierto: true, apertura: '13:00', cierre: '23:00' },
  { dia: 'Sábado', abierto: true, apertura: '13:00', cierre: '23:00' },
  { dia: 'Domingo', abierto: false, apertura: '', cierre: '' },
]

export default function TaproomConfigClient({ config }: { config: any }) {
  const [horarios, setHorarios] = useState<any[]>(config?.horarios || diasDefault)
  const [mensaje, setMensaje] = useState(config?.mensaje_especial || '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createClient()

  const toggleDia = (i: number) => {
    setHorarios(prev => prev.map((h, idx) => idx === i ? { ...h, abierto: !h.abierto } : h))
  }

  const setHora = (i: number, field: 'apertura' | 'cierre', val: string) => {
    setHorarios(prev => prev.map((h, idx) => idx === i ? { ...h, [field]: val } : h))
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('taproom_config').update({
      horarios,
      mensaje_especial: mensaje || null,
      updated_at: new Date().toISOString(),
    }).eq('id', config.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const inputStyle = { padding: '8px 10px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 6, color: '#fff', fontSize: 13, outline: 'none', fontFamily: 'system-ui' }

  return (
    <div style={{ padding: '36px 40px', maxWidth: 760, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Taproom — Configuración</h1>
      <p style={{ color: '#555', fontSize: 13, marginBottom: 32 }}>Horarios y mensajes que se muestran en tarabana.mx/taproom</p>

      {/* Horarios */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24, marginBottom: 20 }}>
        <p style={{ color: '#E8531D', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 20 }}>Horarios por día</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {horarios.map((h, i) => (
            <div key={h.dia} style={{ display: 'grid', gridTemplateColumns: '120px 60px 1fr', gap: 16, alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #141414' }}>
              <span style={{ color: '#ddd', fontSize: 14 }}>{h.dia}</span>
              <button onClick={() => toggleDia(i)} style={{
                width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
                background: h.abierto ? '#E8531D' : '#2a2a2a',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: h.abierto ? 23 : 3, transition: 'all 0.2s' }} />
              </button>
              {h.abierto ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="time" value={h.apertura} onChange={e => setHora(i, 'apertura', e.target.value)} style={inputStyle} />
                  <span style={{ color: '#555', fontSize: 12 }}>–</span>
                  <input type="time" value={h.cierre} onChange={e => setHora(i, 'cierre', e.target.value)} style={inputStyle} />
                </div>
              ) : (
                <span style={{ color: '#333', fontSize: 12, fontFamily: 'monospace' }}>Cerrado</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mensaje especial */}
      <div style={{ background: '#111', border: '1px solid #1a1a1a', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <p style={{ color: '#E8531D', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Mensaje especial</p>
        <p style={{ color: '#555', fontSize: 12, marginBottom: 14 }}>Aparece en banner naranja en la página. Déjalo vacío para no mostrar nada.</p>
        <input value={mensaje} onChange={e => setMensaje(e.target.value)} placeholder="Ej: Cerrado el 25 de dic · Reabrimos el 2 de enero 🍺"
          style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' as const, padding: '12px 14px', fontSize: 14 }} />
      </div>

      <button onClick={handleSave} disabled={saving} style={{
        width: '100%', padding: '13px', background: '#E8531D', border: 'none', borderRadius: 8,
        color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1,
        transition: 'background 0.2s',
      }}>
        {saving ? 'Guardando...' : saved ? '✓ Guardado' : 'Guardar cambios'}
      </button>

      {saved && (
        <p style={{ textAlign: 'center', color: '#10b981', fontSize: 13, marginTop: 12 }}>
          ✓ Cambios guardados — se reflejan en tarabana.mx/taproom al instante
        </p>
      )}
    </div>
  )
}
