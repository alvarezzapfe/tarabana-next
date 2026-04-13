'use client'
import { useState } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'

const tipos = [
  { value: 'ocasional', label: 'Consumidor ocasional', desc: 'Compro para casa o reuniones', icon: '🏠' },
  { value: 'tiene_tap', label: 'Tengo un Tap Room', desc: 'Cuento con líneas de barril', icon: '🍺' },
  { value: 'tiene_bar', label: 'Tengo un bar', desc: 'Bar o cantina con carta de cervezas', icon: '🍻' },
  { value: 'restaurante', label: 'Restaurante', desc: 'Cocina con carta de bebidas', icon: '🍽️' },
]

const usosCFDI = [
  { clave: 'G01', desc: 'Adquisición de mercancias' },
  { clave: 'G02', desc: 'Devoluciones, descuentos o bonificaciones' },
  { clave: 'G03', desc: 'Gastos en general' },
  { clave: 'I01', desc: 'Construcciones' },
  { clave: 'I02', desc: 'Mobilario y equipo de oficina por inversiones' },
  { clave: 'I03', desc: 'Equipo de transporte' },
  { clave: 'I04', desc: 'Equipo de computo y accesorios' },
  { clave: 'I05', desc: 'Dados, troqueles, moldes, matrices y herramental' },
  { clave: 'I06', desc: 'Comunicaciones telefónicas' },
  { clave: 'I07', desc: 'Comunicaciones satelitales' },
  { clave: 'I08', desc: 'Otra maquinaria y equipo' },
  { clave: 'D01', desc: 'Honorarios médicos, dentales y gastos hospitalarios' },
  { clave: 'D02', desc: 'Gastos médicos por incapacidad o discapacidad' },
  { clave: 'D03', desc: 'Gastos funerales' },
  { clave: 'D04', desc: 'Donativos' },
  { clave: 'D05', desc: 'Intereses reales efectivamente pagados por créditos hipotecarios' },
  { clave: 'D06', desc: 'Aportaciones voluntarias al SAR' },
  { clave: 'D07', desc: 'Primas por seguros de gastos médicos' },
  { clave: 'D08', desc: 'Gastos de transportación escolar obligatoria' },
  { clave: 'D09', desc: 'Depósitos en cuentas para el ahorro, primas que tengan como base planes de pensiones' },
  { clave: 'D10', desc: 'Pagos por servicios educativos (colegiaturas)' },
  { clave: 'S01', desc: 'Sin efectos fiscales' },
  { clave: 'CP01', desc: 'Pagos' },
  { clave: 'CN01', desc: 'Nómina' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [tipo, setTipo] = useState('')
  const [nombre, setNombre] = useState('')
  const [marcaNegocio, setMarcaNegocio] = useState('')
  const [telefono, setTelefono] = useState('')
  const [direccion, setDireccion] = useState('')
  const [ciudad, setCiudad] = useState('')
  const [cp, setCp] = useState('')
  const [requiereFactura, setRequiereFactura] = useState(false)
  const [rfc, setRfc] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [usoCfdi, setUsoCfdi] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleFinish = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    await supabase.from('profiles').update({
      full_name: nombre,
      marca_negocio: marcaNegocio || null,
      phone: telefono,
      tipo_consumidor: tipo,
      direccion_entrega: direccion,
      ciudad,
      cp,
      requiere_factura: requiereFactura,
      rfc: requiereFactura ? rfc : null,
      razon_social: requiereFactura ? razonSocial : null,
      uso_cfdi: requiereFactura ? usoCfdi : null,
      onboarding_completo: true,
    }).eq('id', user.id)

    router.push('/portal/catalogo')
    router.refresh()
  }

  const inputStyle = {
    width: '100%', padding: '11px 14px', background: '#f8f8f8',
    border: '1px solid #e8e8e8', borderRadius: 8, color: '#111',
    fontSize: 14, boxSizing: 'border-box' as const, outline: 'none',
    fontFamily: 'system-ui, sans-serif'
  }

  const labelStyle = {
    color: '#666', fontSize: 12, display: 'block' as const, marginBottom: 6,
    textTransform: 'uppercase' as const, letterSpacing: '0.07em'
  }

  const canContinueStep2 = nombre && telefono && (!requiereFactura || (rfc && razonSocial && usoCfdi))

  return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{
        width: 380, background: '#0a0a0a', display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between', padding: '48px 40px', position: 'fixed', height: '100vh'
      }}>
        <div>
          <img src="/tarabanalogo.png" alt="Tarabaña" style={{ height: 52, marginBottom: 40, filter: 'brightness(0) invert(1)' }} />
          <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>Bienvenido al club 🍺</h2>
          <p style={{ color: '#555', fontSize: 14, lineHeight: 1.7 }}>Cuéntanos un poco sobre ti para personalizar tu experiencia.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[{ n: 1, label: 'Tipo de consumidor' }, { n: 2, label: 'Tus datos' }, { n: 3, label: 'Dirección de entrega' }].map(s => (
            <div key={s.n} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: step >= s.n ? '#E8531D' : '#1a1a1a', color: step >= s.n ? '#fff' : '#444', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{s.n}</div>
              <p style={{ color: step >= s.n ? '#fff' : '#444', fontSize: 13, margin: 0 }}>{s.label}</p>
            </div>
          ))}
        </div>
        <p style={{ color: '#333', fontSize: 12 }}>Solo toma 1 minuto ⚡</p>
      </div>

      <div style={{ marginLeft: 380, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 40px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {step === 1 && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0a0a', marginBottom: 6 }}>¿Qué tipo de consumidor eres?</h1>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 28 }}>Esto nos ayuda a darte el mejor servicio y precios.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {tipos.map(t => (
                  <button key={t.value} onClick={() => setTipo(t.value)} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px', background: tipo === t.value ? '#fff5f2' : '#f8f8f8', border: `2px solid ${tipo === t.value ? '#E8531D' : '#ebebeb'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                    <span style={{ fontSize: 24 }}>{t.icon}</span>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#111' }}>{t.label}</p>
                      <p style={{ margin: 0, fontSize: 12, color: '#888', marginTop: 2 }}>{t.desc}</p>
                    </div>
                    {tipo === t.value && (
                      <div style={{ marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%', background: '#E8531D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              <button onClick={() => tipo && setStep(2)} style={{ marginTop: 24, width: '100%', padding: '13px', background: tipo ? '#E8531D' : '#ebebeb', border: 'none', borderRadius: 8, color: tipo ? '#fff' : '#aaa', fontSize: 15, fontWeight: 600, cursor: tipo ? 'pointer' : 'not-allowed' }}>Continuar →</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0a0a', marginBottom: 6 }}>Tus datos</h1>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 28 }}>Para contactarte y gestionar tus pedidos.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Nombre <span style={{ color: '#E8531D' }}>*</span></label>
                  <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Tu nombre" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Marca / Negocio <span style={{ color: '#aaa', fontWeight: 400, textTransform: 'none' as const, fontSize: 11 }}>(opcional)</span></label>
                  <input value={marcaNegocio} onChange={e => setMarcaNegocio(e.target.value)} placeholder="El Caracol, Bar La Paloma..." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Teléfono (WhatsApp) <span style={{ color: '#E8531D' }}>*</span></label>
                  <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="+52 55 0000 0000" style={inputStyle} />
                </div>
                <div style={{ background: '#f8f8f8', borderRadius: 10, padding: 16, border: '1px solid #ebebeb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: '#111' }}>¿Requieres factura?</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#888' }}>Activa para agregar datos fiscales</p>
                    </div>
                    <button onClick={() => setRequiereFactura(!requiereFactura)} style={{ width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: requiereFactura ? '#E8531D' : '#ddd', position: 'relative', transition: 'all 0.2s' }}>
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: requiereFactura ? 23 : 3, transition: 'all 0.2s' }} />
                    </button>
                  </div>
                  {requiereFactura && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 14 }}>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 5 }}>RFC <span style={{ color: '#E8531D' }}>*</span></label>
                        <input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 5 }}>Razón Social <span style={{ color: '#E8531D' }}>*</span></label>
                        <input value={razonSocial} onChange={e => setRazonSocial(e.target.value.toUpperCase())} placeholder="EMPRESA S.A. DE C.V." style={inputStyle} />
                      </div>
                      <div>
                        <label style={{ ...labelStyle, marginBottom: 5 }}>Uso de CFDI <span style={{ color: '#E8531D' }}>*</span></label>
                        <select value={usoCfdi} onChange={e => setUsoCfdi(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                          <option value="">— Selecciona uso —</option>
                          {usosCFDI.map(u => (
                            <option key={u.clave} value={u.clave}>{u.clave} – {u.desc}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '13px', background: '#f5f5f5', border: 'none', borderRadius: 8, color: '#666', fontSize: 15, cursor: 'pointer' }}>← Atrás</button>
                <button onClick={() => canContinueStep2 && setStep(3)} style={{ flex: 2, padding: '13px', background: canContinueStep2 ? '#E8531D' : '#ebebeb', border: 'none', borderRadius: 8, color: canContinueStep2 ? '#fff' : '#aaa', fontSize: 15, fontWeight: 600, cursor: canContinueStep2 ? 'pointer' : 'not-allowed' }}>Continuar →</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0a0a0a', marginBottom: 6 }}>Dirección de entrega</h1>
              <p style={{ color: '#888', fontSize: 14, marginBottom: 28 }}>¿Dónde te mandamos tus pedidos?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Calle y número</label>
                  <input value={direccion} onChange={e => setDireccion(e.target.value)} placeholder="Av. Ámsterdam 123" style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div>
                    <label style={labelStyle}>Ciudad / Alcaldía</label>
                    <input value={ciudad} onChange={e => setCiudad(e.target.value)} placeholder="Condesa, CDMX" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>CP</label>
                    <input value={cp} onChange={e => setCp(e.target.value)} placeholder="06600" style={inputStyle} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: '13px', background: '#f5f5f5', border: 'none', borderRadius: 8, color: '#666', fontSize: 15, cursor: 'pointer' }}>← Atrás</button>
                <button onClick={handleFinish} disabled={loading} style={{ flex: 2, padding: '13px', background: '#E8531D', border: 'none', borderRadius: 8, color: '#fff', fontSize: 15, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>{loading ? 'Guardando...' : '¡Listo, entrar al portal!'}</button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
