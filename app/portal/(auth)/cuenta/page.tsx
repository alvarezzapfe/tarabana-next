'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { tipoLabel as getTipoLabel, nivelLabel } from '../../../../src/lib/clientes'
import DireccionForm, { type DireccionData } from '../../../../src/components/DireccionForm'

const regimenesMap: Record<string, { codigo: string; desc: string }[]> = {
  fisica: [
    { codigo: '605', desc: 'Sueldos y salarios e ingresos asimilados a salarios' },
    { codigo: '606', desc: 'Arrendamiento y en general por otorgar el uso o goce temporal de bienes inmuebles' },
    { codigo: '612', desc: 'Personas físicas con actividades empresariales y profesionales' },
    { codigo: '621', desc: 'Incorporación fiscal' },
    { codigo: '626', desc: 'Régimen simplificado de confianza' },
  ],
  moral: [
    { codigo: '601', desc: 'General de ley personas morales' },
    { codigo: '603', desc: 'Personas morales con fines no lucrativos' },
    { codigo: '626', desc: 'Régimen simplificado de confianza' },
  ],
}

const usosCfdi = [
  { codigo: 'G01', desc: 'Adquisición de mercancías' },
  { codigo: 'G03', desc: 'Gastos en general' },
  { codigo: 'P01', desc: 'Por definir' },
]

export default function CuentaPage() {
  const supabase = createClient()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)

  const [requiereFactura, setRequiereFactura] = useState(false)
  const [tipoPersona, setTipoPersona] = useState<'fisica' | 'moral'>('fisica')
  const [rfc, setRfc] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [regimenFiscal, setRegimenFiscal] = useState('')
  const [usoCfdi, setUsoCfdi] = useState('')
  const [cpFiscal, setCpFiscal] = useState('')

  const [rfcTouched, setRfcTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Address
  const [direccion, setDireccion] = useState<DireccionData>({ cp: '', colonia: '', municipio: '', estado: '', calle: '', num_ext: '', num_int: '', referencias: '' })
  const [savingDir, setSavingDir] = useState(false)
  const [savedDir, setSavedDir] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data: { user: u } } = await supabase.auth.getUser()
      if (!u) return
      setUser(u)
      const { data: p } = await supabase.from('profiles').select('*').eq('id', u.id).single()
      if (p) {
        setProfile(p)
        setRequiereFactura(!!p.requiere_factura)
        setTipoPersona(p.tipo_persona || 'fisica')
        setRfc(p.rfc || '')
        setRazonSocial(p.razon_social || '')
        setRegimenFiscal(p.regimen_fiscal || '')
        setUsoCfdi(p.uso_cfdi || '')
        setCpFiscal(p.cp_fiscal || '')
        setDireccion({
          cp: p.cp || '', colonia: p.colonia || '', municipio: p.municipio || '',
          estado: p.estado || '', calle: p.calle || '', num_ext: p.num_ext || '',
          num_int: p.num_int || '', referencias: p.referencias || '',
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  const expectedRfcLength = tipoPersona === 'fisica' ? 13 : 12
  const rfcError = rfcTouched && rfc.length > 0 && rfc.length !== expectedRfcLength
    ? `El RFC de persona ${tipoPersona === 'fisica' ? 'física' : 'moral'} debe tener ${expectedRfcLength} caracteres`
    : ''

  const handleSave = async () => {
    if (!user) return
    setSaving(true)
    const payload = requiereFactura
      ? { requiere_factura: true, tipo_persona: tipoPersona, rfc, razon_social: razonSocial, regimen_fiscal: regimenFiscal, uso_cfdi: usoCfdi, cp_fiscal: cpFiscal }
      : { requiere_factura: false, tipo_persona: null, rfc: null, razon_social: null, regimen_fiscal: null, uso_cfdi: null, cp_fiscal: null }
    await supabase.from('profiles').update(payload).eq('id', user.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // When tipoPersona changes, reset regimen if it's no longer valid
  const handleTipoPersonaChange = (tipo: 'fisica' | 'moral') => {
    setTipoPersona(tipo)
    const validCodes = regimenesMap[tipo].map(r => r.codigo)
    if (!validCodes.includes(regimenFiscal)) {
      setRegimenFiscal('')
    }
  }

  if (loading) {
    return (
      <div className="portal-page" style={{ padding: '40px 48px', maxWidth: 1200, margin: '0 auto' }}>
        <p style={{ fontSize: 15, color: '#888' }}>Cargando...</p>
      </div>
    )
  }

  const labelStyle: React.CSSProperties = {
    margin: '0 0 6px',
    color: '#6b7280',
    fontSize: 13,
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    fontWeight: 500,
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    fontSize: 15,
    padding: '12px 14px',
    minHeight: 44,
    background: '#f7f7f7',
    border: '1px solid #e8e8e8',
    borderRadius: 9,
    outline: 'none',
    boxSizing: 'border-box',
  }

  const profileFields = [
    { label: 'Nombre', value: profile?.full_name || '\u2014' },
    { label: 'Email', value: user?.email || '\u2014' },
    { label: 'Teléfono', value: profile?.phone || '\u2014' },
    { label: 'Tipo de cliente', value: getTipoLabel(profile?.tipo_consumidor) },
    { label: 'Nivel de precio', value: nivelLabel(profile?.nivel_precio) },
    { label: 'Dirección de entrega', value: profile?.direccion_entrega || '\u2014' },
    { label: 'Ciudad / CP', value: [profile?.ciudad, profile?.cp].filter(Boolean).join(' \u00b7 ') || '\u2014' },
  ]

  return (
    <div className="portal-page" style={{ padding: '40px 48px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <h1 style={{ fontSize: 34, fontWeight: 800, color: '#111', marginBottom: 6 }}>Mi cuenta</h1>
      <p style={{ color: '#888', fontSize: 15, marginBottom: 48 }}>Tus datos y preferencias</p>

      {/* Profile info cards */}
      <h2 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 }}>Información personal</h2>
      <div className="portal-profile-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {profileFields.map(f => (
          <div key={f.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', padding: '18px 20px' }}>
            <p style={{ ...labelStyle, margin: '0 0 4px' }}>{f.label}</p>
            <p style={{ margin: 0, color: '#111', fontSize: 15, fontWeight: 500 }}>{f.value}</p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <a href="/portal/cuenta/editar" style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '10px 20px', background: '#fff', color: '#6b7280',
          border: '1px solid #e5e7eb', borderRadius: 9, textDecoration: 'none', fontSize: 14, fontWeight: 500,
        }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7 M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Editar datos personales
        </a>
      </div>

      {/* Address section */}
      <h2 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24, marginTop: 48 }}>Dirección de entrega</h2>
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #ebebeb', padding: '24px' }}>
        <DireccionForm value={direccion} onChange={setDireccion} legacyAddress={profile?.direccion_entrega} />
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={async () => {
            if (!user) return
            setSavingDir(true)
            await supabase.from('profiles').update({
              cp: direccion.cp || null, colonia: direccion.colonia || null,
              municipio: direccion.municipio || null, estado: direccion.estado || null,
              calle: direccion.calle || null, num_ext: direccion.num_ext || null,
              num_int: direccion.num_int || null, referencias: direccion.referencias || null,
            }).eq('id', user.id)
            setSavingDir(false); setSavedDir(true)
            setTimeout(() => setSavedDir(false), 3000)
          }} disabled={savingDir} style={{
            padding: '12px 24px', background: '#E8531D', border: 'none', borderRadius: 9,
            color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: savingDir ? 0.6 : 1,
          }}>
            {savingDir ? 'Guardando...' : 'Guardar dirección'}
          </button>
          {savedDir && <span style={{ color: '#10b981', fontSize: 14 }}>Guardado</span>}
        </div>
      </div>

      {/* Billing section */}
      <div style={{ marginTop: 48 }}>
        <h2 style={{ fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 24 }}>Datos de facturación</h2>

        {/* Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: requiereFactura ? 24 : 0 }}>
          <button
            type="button"
            onClick={() => setRequiereFactura(!requiereFactura)}
            style={{
              width: 48,
              height: 26,
              borderRadius: 13,
              border: 'none',
              background: requiereFactura ? '#E8531D' : '#d1d5db',
              position: 'relative',
              cursor: 'pointer',
              transition: 'background 0.2s',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <span style={{
              position: 'absolute',
              top: 3,
              left: requiereFactura ? 24 : 3,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: '#fff',
              transition: 'left 0.2s',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }} />
          </button>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>Requiero factura</span>
        </div>

        {requiereFactura && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Tipo de persona */}
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#111', margin: '0 0 12px' }}>Tipo de persona</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Persona física */}
                <button
                  type="button"
                  onClick={() => handleTipoPersonaChange('fisica')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '16px 20px',
                    background: tipoPersona === 'fisica' ? '#FFF4F0' : '#fff',
                    border: tipoPersona === 'fisica' ? '2px solid #E8531D' : '1px solid #e8e8e8',
                    borderRadius: 9,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 15,
                    fontWeight: tipoPersona === 'fisica' ? 600 : 400,
                    color: '#111',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tipoPersona === 'fisica' ? '#E8531D' : '#6b7280'} strokeWidth="1.8">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                  Persona física
                </button>

                {/* Persona moral */}
                <button
                  type="button"
                  onClick={() => handleTipoPersonaChange('moral')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '16px 20px',
                    background: tipoPersona === 'moral' ? '#FFF4F0' : '#fff',
                    border: tipoPersona === 'moral' ? '2px solid #E8531D' : '1px solid #e8e8e8',
                    borderRadius: 9,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontSize: 15,
                    fontWeight: tipoPersona === 'moral' ? 600 : 400,
                    color: '#111',
                  }}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={tipoPersona === 'moral' ? '#E8531D' : '#6b7280'} strokeWidth="1.8">
                    <rect x="3" y="9" width="18" height="13" rx="1" />
                    <path d="M9 22V12M15 22V12M3 12l9-7 9 7" />
                  </svg>
                  Persona moral
                </button>
              </div>
            </div>

            {/* RFC */}
            <div>
              <label style={labelStyle}>RFC</label>
              <input
                type="text"
                value={rfc}
                onChange={e => { setRfc(e.target.value.toUpperCase()); setRfcTouched(true) }}
                maxLength={13}
                placeholder={tipoPersona === 'fisica' ? 'XXXX000000XXX' : 'XXX000000XX0'}
                style={inputStyle}
              />
              {rfcError && (
                <p style={{ margin: '6px 0 0', fontSize: 13, color: '#ef4444' }}>{rfcError}</p>
              )}
            </div>

            {/* Razón social */}
            <div>
              <label style={labelStyle}>
                {tipoPersona === 'moral' ? 'Razón social' : 'Nombre completo fiscal'}
              </label>
              <input
                type="text"
                value={razonSocial}
                onChange={e => setRazonSocial(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Régimen fiscal */}
            <div>
              <label style={labelStyle}>Régimen fiscal</label>
              <select
                value={regimenFiscal}
                onChange={e => setRegimenFiscal(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' as any }}
              >
                <option value="">Seleccionar...</option>
                {regimenesMap[tipoPersona].map(r => (
                  <option key={r.codigo} value={r.codigo}>
                    {r.codigo} — {r.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* Uso de CFDI */}
            <div>
              <label style={labelStyle}>Uso de CFDI</label>
              <select
                value={usoCfdi}
                onChange={e => setUsoCfdi(e.target.value)}
                style={{ ...inputStyle, appearance: 'none' as any }}
              >
                <option value="">Seleccionar...</option>
                {usosCfdi.map(u => (
                  <option key={u.codigo} value={u.codigo}>
                    {u.codigo} — {u.desc}
                  </option>
                ))}
              </select>
            </div>

            {/* CP fiscal */}
            <div>
              <label style={labelStyle}>CP fiscal</label>
              <input
                type="text"
                value={cpFiscal}
                onChange={e => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 5)
                  setCpFiscal(v)
                }}
                maxLength={5}
                placeholder="00000"
                style={inputStyle}
              />
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#6b7280' }}>
                Domicilio fiscal registrado ante el SAT
              </p>
            </div>

            {/* Save button */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 8 }}>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  padding: '12px 24px',
                  background: '#E8531D',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 9,
                  cursor: saving ? 'default' : 'pointer',
                  opacity: saving ? 0.7 : 1,
                }}
              >
                {saving ? 'Guardando...' : 'Guardar datos fiscales'}
              </button>
              {saved && (
                <span style={{ fontSize: 15, color: '#10b981', fontWeight: 600, transition: 'opacity 0.3s' }}>
                  Guardado
                </span>
              )}
            </div>
          </div>
        )}

        {/* Save button when toggle is off (to persist the off state) */}
        {!requiereFactura && profile?.requiere_factura && (
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                fontSize: 15,
                fontWeight: 600,
                padding: '12px 24px',
                background: '#E8531D',
                color: '#fff',
                border: 'none',
                borderRadius: 9,
                cursor: saving ? 'default' : 'pointer',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Guardando...' : 'Guardar cambios'}
            </button>
            {saved && (
              <span style={{ fontSize: 15, color: '#10b981', fontWeight: 600 }}>
                Guardado
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
