'use client'
import { useState, useEffect } from 'react'
import { TIPOS_CLIENTE } from '../lib/clientes'
import DireccionForm, { type DireccionData } from './DireccionForm'

export interface ClienteData {
  tipo_persona_registro: 'fisica' | 'moral' | ''
  nombre_pila: string; apellido_paterno: string; apellido_materno: string
  razon_social: string; marca_negocio: string; contacto_nombre: string
  email: string; phone: string; tipo_consumidor: string
  direccion: DireccionData
  requiere_factura: boolean; rfc: string; regimen_fiscal: string; uso_cfdi: string; cp_fiscal: string
}

interface Props {
  initial?: Partial<ClienteData>
  legacyAddress?: string | null
  onSave: (data: ClienteData & { full_name: string }) => Promise<{ error?: string }>
  saving?: boolean
  adminExtras?: React.ReactNode
  submitLabel?: string
}

const emptyDir: DireccionData = { cp: '', colonia: '', municipio: '', estado: '', calle: '', num_ext: '', num_int: '', referencias: '' }

const REGIMENES_FISICA = [
  { codigo: '605', desc: 'Sueldos y salarios' }, { codigo: '606', desc: 'Arrendamiento' },
  { codigo: '612', desc: 'Actividades empresariales' }, { codigo: '621', desc: 'Incorporacion fiscal' }, { codigo: '626', desc: 'RESICO' },
]
const REGIMENES_MORAL = [
  { codigo: '601', desc: 'General de ley' }, { codigo: '603', desc: 'Sin fines de lucro' }, { codigo: '626', desc: 'RESICO' },
]
const USOS_CFDI = [
  { codigo: 'G01', desc: 'Adquisicion de mercancias' }, { codigo: 'G03', desc: 'Gastos en general' }, { codigo: 'P01', desc: 'Por definir' },
]

const IS: React.CSSProperties = { width: '100%', padding: '12px 14px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 9, color: '#1a1a1a', fontSize: 15, boxSizing: 'border-box', outline: 'none', minHeight: 44, fontFamily: 'system-ui' }
const LS: React.CSSProperties = { color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }

function formatPhone(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

export default function ClienteForm({ initial, legacyAddress, onSave, saving, adminExtras, submitLabel }: Props) {
  const [d, setD] = useState<ClienteData>({
    tipo_persona_registro: initial?.tipo_persona_registro || '',
    nombre_pila: initial?.nombre_pila || '', apellido_paterno: initial?.apellido_paterno || '', apellido_materno: initial?.apellido_materno || '',
    razon_social: initial?.razon_social || '', marca_negocio: initial?.marca_negocio || '', contacto_nombre: initial?.contacto_nombre || '',
    email: initial?.email || '', phone: initial?.phone || '', tipo_consumidor: initial?.tipo_consumidor || '',
    direccion: initial?.direccion || emptyDir,
    requiere_factura: initial?.requiere_factura || false, rfc: initial?.rfc || '', regimen_fiscal: initial?.regimen_fiscal || '', uso_cfdi: initial?.uso_cfdi || '', cp_fiscal: initial?.cp_fiscal || '',
  })
  const [emailError, setEmailError] = useState('')

  const set = (k: keyof ClienteData, v: any) => { setD(prev => ({ ...prev, [k]: v })); if (k === 'email') setEmailError('') }
  const tp = d.tipo_persona_registro

  // Compute full_name
  const fullName = tp === 'moral'
    ? (d.marca_negocio || d.razon_social || '')
    : [d.nombre_pila, d.apellido_paterno, d.apellido_materno].filter(Boolean).join(' ')

  // Validation
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)
  const phoneDigits = d.phone.replace(/\D/g, '')
  const rfcLen = tp === 'moral' ? 12 : 13
  const rfcValid = !d.requiere_factura || d.rfc.length === rfcLen

  const missingFields: string[] = []
  if (!tp) missingFields.push('Tipo de persona')
  if (tp === 'fisica' && !d.nombre_pila) missingFields.push('Nombre')
  if (tp === 'fisica' && !d.apellido_paterno) missingFields.push('Apellido paterno')
  if (tp === 'moral' && !d.razon_social) missingFields.push('Razon social')
  if (!d.email) missingFields.push('Correo')
  else if (!emailValid) missingFields.push('Correo invalido')
  if (phoneDigits.length > 0 && phoneDigits.length !== 10) missingFields.push('Telefono (10 digitos)')
  if (!d.tipo_consumidor) missingFields.push('Tipo de cliente')
  if (d.requiere_factura && !d.rfc) missingFields.push('RFC')
  if (d.requiere_factura && !rfcValid) missingFields.push(`RFC (${rfcLen} caracteres)`)
  if (d.requiere_factura && !d.uso_cfdi) missingFields.push('Uso de CFDI')
  const canSubmit = missingFields.length === 0

  const handleSubmit = async () => {
    const result = await onSave({ ...d, full_name: fullName })
    if (result?.error) {
      if (result.error.toLowerCase().includes('correo') || result.error.toLowerCase().includes('email') || result.error.toLowerCase().includes('usuario')) {
        setEmailError(result.error)
      }
    }
  }

  const regimenes = tp === 'moral' ? REGIMENES_MORAL : REGIMENES_FISICA

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      <style>{`@media (max-width: 768px) { .cf-grid-2, .cf-grid-3 { grid-template-columns: 1fr !important; } }`}</style>

      {/* BLOQUE 1: Tipo de persona */}
      <div>
        <p style={{ ...LS, marginBottom: 12, fontSize: 14 }}>Tipo de persona</p>
        <div className="cf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { key: 'fisica', label: 'Persona fisica', desc: 'Compro para mi o para mi negocio a mi nombre', icon: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8' },
            { key: 'moral', label: 'Persona moral', desc: 'Compro a nombre de una empresa', icon: 'M3 21h18M3 7v14M21 7v14M6 7V4a1 1 0 011-1h10a1 1 0 011 1v3M9 21v-4h6v4' },
          ].map(t => (
            <button key={t.key} onClick={() => set('tipo_persona_registro', t.key as any)} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '18px 20px', textAlign: 'left',
              background: tp === t.key ? '#fff8f5' : '#fff', border: `2.5px solid ${tp === t.key ? '#E8531D' : '#e5e7eb'}`,
              borderRadius: 12, cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={tp === t.key ? '#E8531D' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={t.icon}/></svg>
              <div>
                <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>{t.label}</p>
                <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>{t.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* BLOQUE 2: Datos */}
      {tp && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <p style={{ ...LS, marginBottom: 12, fontSize: 14 }}>Datos {tp === 'moral' ? 'de la empresa' : 'personales'}</p>
          {tp === 'fisica' ? (
            <div className="cf-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={LS}>Nombre(s) *</label><input value={d.nombre_pila} onChange={e => set('nombre_pila', e.target.value)} style={IS} placeholder="Luis" /></div>
              <div><label style={LS}>Apellido paterno *</label><input value={d.apellido_paterno} onChange={e => set('apellido_paterno', e.target.value)} style={IS} placeholder="Garcia" /></div>
              <div><label style={LS}>Apellido materno</label><input value={d.apellido_materno} onChange={e => set('apellido_materno', e.target.value)} style={IS} placeholder="Lopez" /></div>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 12 }}><label style={LS}>Razon social *</label><input value={d.razon_social} onChange={e => set('razon_social', e.target.value.toUpperCase())} style={IS} placeholder="EMPRESA S.A. DE C.V." /></div>
              <div className="cf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                <div><label style={LS}>Nombre comercial</label><input value={d.marca_negocio} onChange={e => set('marca_negocio', e.target.value)} style={IS} placeholder="Como se conoce el lugar" /></div>
                <div><label style={LS}>Nombre de quien atiende</label><input value={d.contacto_nombre} onChange={e => set('contacto_nombre', e.target.value)} style={IS} placeholder="Juan Perez" /></div>
              </div>
            </>
          )}
          <div className="cf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LS}>Correo *</label>
              <input type="email" value={d.email} onChange={e => set('email', e.target.value)} style={{ ...IS, borderColor: emailError ? '#ef4444' : '#e5e7eb' }} placeholder="correo@ejemplo.com" />
              {emailError && <p style={{ color: '#ef4444', fontSize: 12, margin: '4px 0 0' }}>{emailError}</p>}
            </div>
            <div>
              <label style={LS}>Telefono</label>
              <input value={d.phone} onChange={e => set('phone', formatPhone(e.target.value))} style={IS} placeholder="55 1234 5678" inputMode="numeric" />
              {phoneDigits.length > 0 && phoneDigits.length !== 10 && <p style={{ color: '#f59e0b', fontSize: 11, margin: '4px 0 0' }}>{phoneDigits.length}/10 digitos</p>}
            </div>
          </div>
        </div>
      )}

      {/* BLOQUE 3: Tipo de cliente */}
      {tp && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <p style={{ ...LS, marginBottom: 12, fontSize: 14 }}>Tipo de cliente *</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {TIPOS_CLIENTE.map(t => {
              const sel = d.tipo_consumidor === t.value
              return (
                <button key={t.value} onClick={() => set('tipo_consumidor', t.value)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
                  background: sel ? '#fff8f5' : '#fff', border: `2px solid ${sel ? '#E8531D' : '#e5e7eb'}`,
                  borderRadius: 99, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sel ? '#E8531D' : '#9ca3af'} strokeWidth="1.8"><path d={t.iconPath}/></svg>
                  <span style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? '#E8531D' : '#374151' }}>{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* BLOQUE 4: Direccion */}
      {tp && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <p style={{ ...LS, marginBottom: 12, fontSize: 14 }}>Direccion de entrega</p>
          <DireccionForm value={d.direccion} onChange={v => set('direccion', v)} legacyAddress={legacyAddress} />
        </div>
      )}

      {/* BLOQUE 5: Facturacion */}
      {tp && (
        <div style={{ animation: 'fadeIn 0.2s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: d.requiere_factura ? 16 : 0 }}>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 15, color: '#1a1a1a' }}>Requiero factura</p>
              <p style={{ margin: '2px 0 0', fontSize: 13, color: '#9ca3af' }}>Datos fiscales para facturacion</p>
            </div>
            <button onClick={() => set('requiere_factura', !d.requiere_factura)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: d.requiere_factura ? '#E8531D' : '#d1d5db', position: 'relative', transition: 'all 0.2s' }}>
              <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: d.requiere_factura ? 23 : 3, transition: 'all 0.2s' }} />
            </button>
          </div>
          {d.requiere_factura && (
            <div className="cf-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={LS}>RFC * ({rfcLen} caracteres)</label>
                <input value={d.rfc} onChange={e => set('rfc', e.target.value.toUpperCase().slice(0, rfcLen))} style={{ ...IS, borderColor: d.rfc && d.rfc.length !== rfcLen ? '#ef4444' : '#e5e7eb' }} placeholder={tp === 'moral' ? 'AAA000000AA0' : 'AAAA000000AA0'} />
                {d.rfc && d.rfc.length !== rfcLen && <p style={{ color: '#ef4444', fontSize: 11, margin: '4px 0 0' }}>{d.rfc.length}/{rfcLen}</p>}
              </div>
              <div>
                <label style={LS}>Regimen fiscal</label>
                <select value={d.regimen_fiscal} onChange={e => set('regimen_fiscal', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
                  <option value="">-- Selecciona --</option>
                  {regimenes.map(r => <option key={r.codigo} value={r.codigo}>{r.codigo} - {r.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>Uso de CFDI *</label>
                <select value={d.uso_cfdi} onChange={e => set('uso_cfdi', e.target.value)} style={{ ...IS, cursor: 'pointer' }}>
                  <option value="">-- Selecciona --</option>
                  {USOS_CFDI.map(u => <option key={u.codigo} value={u.codigo}>{u.codigo} - {u.desc}</option>)}
                </select>
              </div>
              <div>
                <label style={LS}>CP fiscal</label>
                <input value={d.cp_fiscal} onChange={e => set('cp_fiscal', e.target.value.replace(/\D/g, '').slice(0, 5))} style={IS} placeholder="00000" inputMode="numeric" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Admin extras slot */}
      {adminExtras}

      {/* Submit */}
      {tp && (
        <div>
          {!canSubmit && missingFields.length > 0 && (
            <p style={{ color: '#f59e0b', fontSize: 12, marginBottom: 8 }}>Faltan: {missingFields.join(', ')}</p>
          )}
          <button onClick={handleSubmit} disabled={!canSubmit || saving} style={{
            width: '100%', padding: '14px', background: canSubmit ? '#E8531D' : '#e5e7eb', border: 'none', borderRadius: 9,
            color: canSubmit ? '#fff' : '#9ca3af', fontSize: 15, fontWeight: 600,
            cursor: canSubmit && !saving ? 'pointer' : 'not-allowed', opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Guardando...' : submitLabel || 'Guardar'}
          </button>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}
