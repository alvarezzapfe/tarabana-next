'use client'
import { useState } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'

const tipos = [
  { value: 'ocasional', label: 'Ocasional', icon: '🏠' },
  { value: 'tiene_tap', label: 'Tap Room', icon: '🍺' },
  { value: 'tiene_bar', label: 'Bar', icon: '🍻' },
  { value: 'restaurante', label: 'Restaurante', icon: '🍽️' },
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
  { clave: 'D09', desc: 'Depósitos en cuentas para el ahorro, planes de pensiones' },
  { clave: 'D10', desc: 'Pagos por servicios educativos (colegiaturas)' },
  { clave: 'S01', desc: 'Sin efectos fiscales' },
  { clave: 'CP01', desc: 'Pagos' },
  { clave: 'CN01', desc: 'Nómina' },
]

export default function NuevoClientePage() {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    nombre: '', marca_negocio: '',
    email: '', phone: '', tipo: 'ocasional',
    razon_social: '', rfc: '', uso_cfdi: '', requiere_factura: false,
    direccion_entrega: '', ciudad: '', cp: '', notas: ''
  })
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleSave = async () => {
    if (!form.nombre || !form.email) { setError('Nombre y email son requeridos'); return }
    if (form.requiere_factura && (!form.rfc || !form.razon_social || !form.uso_cfdi)) {
      setError('RFC, Razón Social y Uso CFDI son requeridos para facturación'); return
    }
    setLoading(true); setError('')
    const res = await fetch('/api/admin/clientes/crear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, full_name: form.nombre })
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error || 'Error'); setLoading(false); return }
    router.push('/admin/clientes'); router.refresh()
  }

  const inp = (label: string, key: string, placeholder = '', type = 'text') => (
    <div>
      <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</label>
      <input type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none' }} />
    </div>
  )

  const Section = ({ title }: { title: string }) => (
    <p style={{ color: '#E8531D', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', margin: '20px 0 10px', paddingBottom: 6, borderBottom: '1px solid #1a1a1a' }}>{title}</p>
  )

  return (
    <div style={{ padding: '36px 40px', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <a href="/admin/clientes" style={{ color: '#444', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Clientes
        </a>
        <span style={{ color: '#2a2a2a' }}>/</span>
        <h1 style={{ color: '#fff', fontSize: 18, fontWeight: 700, margin: 0 }}>Nuevo cliente</h1>
      </div>

      <Section title="Datos personales" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {inp('Nombre *', 'nombre', 'Juan')}
        {inp('Marca / Negocio', 'marca_negocio', 'El Caracol, Bar La Paloma...')}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
        {inp('Email *', 'email', 'juan@ejemplo.com', 'email')}
        <div>
          <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Celular</label>
          <div style={{ display: 'flex' }}>
            <div style={{ background: '#141414', border: '1px solid #252525', borderRight: 'none', borderRadius: '8px 0 0 8px', padding: '10px 12px', color: '#555', fontSize: 13, whiteSpace: 'nowrap' }}>🇲🇽 +52</div>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="55 1234 5678"
              style={{ flex: 1, padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: '0 8px 8px 0', color: '#fff', fontSize: 14, outline: 'none' }} />
          </div>
        </div>
      </div>

      <Section title="Tipo de cliente" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 14 }}>
        {tipos.map(t => (
          <button key={t.value} onClick={() => set('tipo', t.value)} style={{
            padding: '10px 8px', background: form.tipo === t.value ? '#1e1e1e' : '#111',
            border: `1.5px solid ${form.tipo === t.value ? '#E8531D' : '#1e1e1e'}`,
            borderRadius: 8, cursor: 'pointer', textAlign: 'center'
          }}>
            <p style={{ margin: '0 0 3px', fontSize: 20 }}>{t.icon}</p>
            <p style={{ margin: 0, color: form.tipo === t.value ? '#fff' : '#555', fontSize: 11, fontWeight: form.tipo === t.value ? 600 : 400 }}>{t.label}</p>
          </button>
        ))}
      </div>

      <Section title="Facturación" />
      <div style={{ background: '#111', border: '1px solid #1e1e1e', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: form.requiere_factura ? 16 : 0 }}>
          <div>
            <p style={{ margin: 0, color: '#ddd', fontSize: 13.5, fontWeight: 500 }}>¿Requiere factura?</p>
            <p style={{ margin: '2px 0 0', color: '#555', fontSize: 12 }}>Activa para agregar datos fiscales</p>
          </div>
          <button onClick={() => set('requiere_factura', !form.requiere_factura)} style={{
            width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
            background: form.requiere_factura ? '#E8531D' : '#2a2a2a', position: 'relative', transition: 'all 0.2s'
          }}>
            <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.requiere_factura ? 23 : 3, transition: 'all 0.2s' }} />
          </button>
        </div>
        {form.requiere_factura && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {inp('RFC *', 'rfc', 'XAXX010101000')}
              {inp('Razón Social *', 'razon_social', 'EMPRESA S.A. DE C.V.')}
            </div>
            <div>
              <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Uso de CFDI *</label>
              <select value={form.uso_cfdi} onChange={e => set('uso_cfdi', e.target.value)}
                style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: form.uso_cfdi ? '#fff' : '#555', fontSize: 14, boxSizing: 'border-box' as const, outline: 'none', cursor: 'pointer' }}>
                <option value="">— Selecciona uso —</option>
                {usosCFDI.map(u => <option key={u.clave} value={u.clave}>{u.clave} – {u.desc}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      <Section title="Entrega" />
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
        {inp('Dirección', 'direccion_entrega', 'Calle y número')}
        {inp('Ciudad / Alcaldía', 'ciudad', 'Condesa, CDMX')}
        {inp('CP', 'cp', '06600')}
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ color: '#555', fontSize: 11, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Notas internas</label>
        <textarea value={form.notas} onChange={e => set('notas', e.target.value)} rows={2} placeholder="Horarios de entrega, contacto en sitio, observaciones..."
          style={{ width: '100%', padding: '10px 13px', background: '#1a1a1a', border: '1px solid #252525', borderRadius: 8, color: '#fff', fontSize: 14, boxSizing: 'border-box' as const, resize: 'none', outline: 'none' }} />
      </div>

      {error && <div style={{ background: '#2a1010', border: '1px solid #ef444440', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
        <p style={{ color: '#ef4444', fontSize: 13, margin: 0 }}>{error}</p>
      </div>}

      <div style={{ display: 'flex', gap: 10 }}>
        <a href="/admin/clientes" style={{ padding: '11px 20px', background: '#1a1a1a', color: '#555', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>Cancelar</a>
        <button onClick={handleSave} disabled={loading} style={{
          flex: 1, padding: '11px', background: '#E8531D', border: 'none', borderRadius: 8,
          color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.7 : 1
        }}>{loading ? 'Guardando...' : 'Guardar cliente'}</button>
      </div>
    </div>
  )
}
