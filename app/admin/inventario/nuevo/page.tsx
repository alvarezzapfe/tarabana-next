'use client'
import { useState, useEffect, useMemo } from 'react'
import { createClient } from '../../../../src/lib/supabase'
import { useRouter } from 'next/navigation'

interface Estilo { id: string; nombre: string; familia: string | null; orden: number }

const STEPS = ['Identidad', 'Presentaciones', 'Stock inicial']

const PRESENTACIONES = [
  { key: 'latas', label: 'Latas (sueltas / caja 12 / caja 24)', icon: '🥫' },
  { key: 'barril_pet_20', label: 'Barril 20L PET', icon: '🛢' },
  { key: 'barril_acero_20', label: 'Barril 20L Acero', icon: '🛢' },
  { key: 'barril_pet_10', label: 'Barril 10L PET', icon: '🛢' },
  { key: 'barril_acero_10', label: 'Barril 10L Acero', icon: '🛢' },
] as const

type PresKey = typeof PRESENTACIONES[number]['key']

export default function NuevoProductoPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Estilos from DB
  const [estilos, setEstilos] = useState<Estilo[]>([])
  const [estilosLoading, setEstilosLoading] = useState(true)
  const [otroEstilo, setOtroEstilo] = useState(false)
  const [nuevoEstilo, setNuevoEstilo] = useState('')
  const [creandoEstilo, setCreandoEstilo] = useState(false)

  // Image
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)

  // Step 1: Identity
  const [form, setForm] = useState({
    nombre: '', estilo: '', abv: '', ibu: '', descripcion: '', descripcion_larga: '',
  })

  // Step 2: Presentations
  const [pres, setPres] = useState<Record<PresKey, boolean>>({
    latas: false, barril_pet_20: false, barril_acero_20: false, barril_pet_10: false, barril_acero_10: false,
  })
  const [precios, setPrecios] = useState({
    precio_lata_publico: '', precio_lata_taproom: '',
    precio_barril_pet_publico: '', precio_barril_pet_taproom: '',
    precio_barril_acero_publico: '', precio_barril_acero_taproom: '',
    precio_barril10_pet_publico: '', precio_barril10_pet_taproom: '',
    precio_barril10_acero_publico: '', precio_barril10_acero_taproom: '',
  })

  // Step 3: Stock
  const [stock, setStock] = useState({
    stock_latas: '0', stock_caja12: '0', stock_caja24: '0',
    stock_barril_pet: '0', stock_barril_acero: '0',
    stock_barril10_pet: '0', stock_barril10_acero: '0',
  })

  useEffect(() => {
    fetch('/api/admin/inventario/estilos')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEstilos(data) })
      .finally(() => setEstilosLoading(false))
  }, [])

  const estilosByFamilia = useMemo(() => {
    const groups: Record<string, Estilo[]> = {}
    for (const e of estilos) {
      const fam = e.familia || 'Otros'
      if (!groups[fam]) groups[fam] = []
      groups[fam].push(e)
    }
    return groups
  }, [estilos])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const setP = (k: string, v: string) => setPrecios(p => ({ ...p, [k]: v }))
  const setS = (k: string, v: string) => setStock(s => ({ ...s, [k]: v }))
  const togglePres = (k: PresKey) => setPres(p => ({ ...p, [k]: !p[k] }))

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleEstiloChange = (v: string) => {
    if (v === '__otro__') {
      setOtroEstilo(true)
      set('estilo', '')
    } else {
      setOtroEstilo(false)
      set('estilo', v)
    }
  }

  const crearEstilo = async () => {
    const nombre = nuevoEstilo.trim()
    if (!nombre) return
    setCreandoEstilo(true)
    const res = await fetch('/api/admin/inventario/estilos', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre }),
    })
    const data = await res.json()
    setCreandoEstilo(false)
    if (!res.ok) { setError(data.error || 'Error al crear estilo'); return }
    setEstilos(prev => [...prev, data])
    set('estilo', data.nombre)
    setOtroEstilo(false)
    setNuevoEstilo('')
  }

  // Validation
  const step1Valid = form.nombre.trim().length > 0 && form.estilo.trim().length > 0
  const anyPres = Object.values(pres).some(Boolean)
  const step2Valid = anyPres && (!pres.latas || parseFloat(precios.precio_lata_publico) > 0)
  const canSubmit = step1Valid && step2Valid

  // Navigate
  const next = () => { setError(''); setStep(s => Math.min(s + 1, 2)) }
  const prev = () => { setError(''); setStep(s => Math.max(s - 1, 0)) }

  const handleSubmit = async () => {
    setSaving(true)
    setError('')

    // 1. Upload image if present
    let imagen_url: string | null = null
    let uploadedPath: string | null = null
    if (imgFile) {
      const ext = imgFile.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('productos').upload(path, imgFile, { contentType: imgFile.type })
      if (uploadError) { setError('Error subiendo imagen: ' + uploadError.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
      imagen_url = publicUrl
      uploadedPath = path
    }

    // 2. Create product
    const body: Record<string, any> = {
      ...form, imagen_url,
      ...(pres.latas ? { precio_lata_publico: precios.precio_lata_publico, precio_lata_taproom: precios.precio_lata_taproom } : {}),
      ...(pres.barril_pet_20 ? { precio_barril_pet_publico: precios.precio_barril_pet_publico, precio_barril_pet_taproom: precios.precio_barril_pet_taproom } : {}),
      ...(pres.barril_acero_20 ? { precio_barril_acero_publico: precios.precio_barril_acero_publico, precio_barril_acero_taproom: precios.precio_barril_acero_taproom } : {}),
      ...(pres.barril_pet_10 ? { precio_barril10_pet_publico: precios.precio_barril10_pet_publico, precio_barril10_pet_taproom: precios.precio_barril10_pet_taproom } : {}),
      ...(pres.barril_acero_10 ? { precio_barril10_acero_publico: precios.precio_barril10_acero_publico, precio_barril10_acero_taproom: precios.precio_barril10_acero_taproom } : {}),
      ...(pres.latas ? { stock_latas: stock.stock_latas, stock_caja12: stock.stock_caja12, stock_caja24: stock.stock_caja24 } : {}),
      ...(pres.barril_pet_20 ? { stock_barril_pet: stock.stock_barril_pet } : {}),
      ...(pres.barril_acero_20 ? { stock_barril_acero: stock.stock_barril_acero } : {}),
      ...(pres.barril_pet_10 ? { stock_barril10_pet: stock.stock_barril10_pet } : {}),
      ...(pres.barril_acero_10 ? { stock_barril10_acero: stock.stock_barril10_acero } : {}),
    }

    const res = await fetch('/api/admin/inventario/crear', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const d = await res.json()
    setSaving(false)

    if (!res.ok) {
      // 3. Clean up orphan image if insert failed
      if (uploadedPath) {
        supabase.storage.from('productos').remove([uploadedPath])
      }
      setError(d.error || 'Error al guardar')
      return
    }

    router.push('/admin/inventario')
    router.refresh()
  }

  // Shared input style
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb',
    borderRadius: 8, color: '#1a1a1a', fontSize: 14, boxSizing: 'border-box', minHeight: 44, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em',
  }

  return (
    <div style={{ padding: '36px 40px', maxWidth: 720, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <a href="/admin/inventario" style={{ color: '#9ca3af', textDecoration: 'none', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Inventario
        </a>
        <span style={{ color: '#d1d5db' }}>/</span>
        <h1 style={{ color: '#1a1a1a', fontSize: 18, fontWeight: 700, margin: 0 }}>Nuevo producto</h1>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32 }}>
        {STEPS.map((label, i) => (
          <div key={label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              {i > 0 && <div style={{ flex: 1, height: 2, background: i <= step ? 'var(--brand-primary, #E8531D)' : '#e5e7eb' }} />}
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, flexShrink: 0,
                background: i <= step ? 'var(--brand-primary, #E8531D)' : '#f3f4f6',
                color: i <= step ? '#fff' : '#9ca3af',
              }}>{i + 1}</div>
              {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: i < step ? 'var(--brand-primary, #E8531D)' : '#e5e7eb' }} />}
            </div>
            <span style={{ fontSize: 11, color: i <= step ? '#1a1a1a' : '#9ca3af', fontWeight: i === step ? 600 : 400, textAlign: 'center' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: '#b91c1c', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* ==================== STEP 1: IDENTIDAD ==================== */}
      {step === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <style>{`@media (max-width: 640px) { .wizard-identity-grid { grid-template-columns: 1fr !important; } }`}</style>
          <div className="wizard-identity-grid" style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 20 }}>
            {/* Photo */}
            <div>
              <label style={labelStyle}>Foto</label>
              <div
                onClick={() => document.getElementById('img-upload')?.click()}
                style={{
                  width: '100%', aspectRatio: '1', background: '#fff', border: '2px dashed #d1d5db',
                  borderRadius: 12, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', overflow: 'hidden',
                }}
              >
                {imgPreview
                  ? <img src={imgPreview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <>
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4 M17 8l-5-5-5 5 M12 3v12"/></svg>
                      <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 6 }}>JPG o PNG</p>
                    </>
                }
              </div>
              <input id="img-upload" type="file" accept="image/jpg,image/jpeg,image/png" onChange={handleImage} style={{ display: 'none' }} />
            </div>

            {/* Main fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Nombre *</label>
                <input value={form.nombre} onChange={e => set('nombre', e.target.value)} placeholder="Brisa IPA" style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Estilo *</label>
                {estilosLoading ? (
                  <p style={{ color: '#9ca3af', fontSize: 13 }}>Cargando estilos...</p>
                ) : otroEstilo ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input value={nuevoEstilo} onChange={e => setNuevoEstilo(e.target.value)} placeholder="Nombre del nuevo estilo"
                      style={{ ...inputStyle, flex: 1 }}
                      onKeyDown={e => e.key === 'Enter' && crearEstilo()} />
                    <button onClick={crearEstilo} disabled={creandoEstilo || !nuevoEstilo.trim()}
                      style={{ padding: '10px 16px', background: 'var(--brand-primary, #E8531D)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: creandoEstilo ? 0.7 : 1 }}>
                      {creandoEstilo ? '...' : 'Crear'}
                    </button>
                    <button onClick={() => { setOtroEstilo(false); setNuevoEstilo('') }}
                      style={{ padding: '10px 12px', background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <select value={form.estilo} onChange={e => handleEstiloChange(e.target.value)}
                    style={{ ...inputStyle, color: form.estilo ? '#1a1a1a' : '#9ca3af' }}>
                    <option value="">Selecciona estilo</option>
                    {Object.entries(estilosByFamilia).map(([familia, items]) => (
                      <optgroup key={familia} label={familia}>
                        {items.map(e => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                      </optgroup>
                    ))}
                    <option value="__otro__">+ Otro...</option>
                  </select>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={labelStyle}>ABV %</label>
                  <input type="number" step="0.1" value={form.abv} onChange={e => set('abv', e.target.value)} placeholder="5.5" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>IBU</label>
                  <input type="number" value={form.ibu} onChange={e => set('ibu', e.target.value)} placeholder="45" style={inputStyle} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label style={labelStyle}>Descripcion corta</label>
            <input value={form.descripcion} onChange={e => set('descripcion', e.target.value)} placeholder="Una IPA lupulada y refrescante..." style={inputStyle} />
          </div>

          <div>
            <label style={labelStyle}>Descripcion larga</label>
            <textarea value={form.descripcion_larga} onChange={e => set('descripcion_larga', e.target.value)} rows={3} placeholder="Notas de cata, maridajes, historia..."
              style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }} />
          </div>
        </div>
      )}

      {/* ==================== STEP 2: PRESENTACIONES ==================== */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <p style={{ color: '#6b7280', fontSize: 13, margin: 0 }}>Selecciona las presentaciones que maneja este producto y define sus precios.</p>

          {PRESENTACIONES.map(({ key, label }) => {
            const active = pres[key]
            return (
              <div key={key} style={{ border: `1px solid ${active ? 'var(--brand-primary, #E8531D)' : '#e5e7eb'}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>
                {/* Toggle header */}
                <button onClick={() => togglePres(key)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
                  background: active ? '#fef7f4' : '#f9fafb', border: 'none', cursor: 'pointer', textAlign: 'left',
                }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: 4, border: `2px solid ${active ? 'var(--brand-primary, #E8531D)' : '#d1d5db'}`,
                    background: active ? 'var(--brand-primary, #E8531D)' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {active && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M20 6L9 17l-5-5"/></svg>}
                  </div>
                  <span style={{ color: '#1a1a1a', fontSize: 14, fontWeight: active ? 600 : 400 }}>{label}</span>
                </button>

                {/* Price fields */}
                {active && (
                  <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
                    {key === 'latas' ? (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                          <div>
                            <label style={{ ...labelStyle, fontSize: 12 }}>Precio por lata (publico) *</label>
                            <input type="number" step="0.01" value={precios.precio_lata_publico} onChange={e => setP('precio_lata_publico', e.target.value)}
                              placeholder="0.00" style={{ ...inputStyle, fontSize: 15, fontWeight: 700 }} />
                          </div>
                          <div>
                            <label style={{ ...labelStyle, fontSize: 12, color: '#f59e0b' }}>Precio por lata (taproom)</label>
                            <input type="number" step="0.01" value={precios.precio_lata_taproom} onChange={e => setP('precio_lata_taproom', e.target.value)}
                              placeholder="0.00" style={{ ...inputStyle, color: '#f59e0b', fontSize: 15, fontWeight: 700 }} />
                          </div>
                        </div>
                        {/* Derived prices */}
                        {(parseFloat(precios.precio_lata_publico) > 0 || parseFloat(precios.precio_lata_taproom) > 0) && (
                          <div style={{ background: '#f3f4f6', borderRadius: 8, padding: '8px 14px', marginTop: 10, fontSize: 13 }}>
                            {[{ label: 'Caja 12', mult: 12 }, { label: 'Caja 24', mult: 24 }].map(d => {
                              const pub = Math.round((parseFloat(precios.precio_lata_publico) || 0) * d.mult)
                              const tap = Math.round((parseFloat(precios.precio_lata_taproom) || 0) * d.mult)
                              return (
                                <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0' }}>
                                  <span style={{ color: '#6b7280' }}>{d.label}</span>
                                  <span>
                                    <span style={{ color: '#1a1a1a' }}>${pub.toLocaleString('es-MX')}</span>
                                    {tap > 0 && <><span style={{ color: '#d1d5db', margin: '0 6px' }}>/</span><span style={{ color: '#f59e0b' }}>${tap.toLocaleString('es-MX')}</span></>}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 12 }}>Precio publico</label>
                          <input type="number" step="0.01"
                            value={(precios as any)[key === 'barril_pet_20' ? 'precio_barril_pet_publico' : key === 'barril_acero_20' ? 'precio_barril_acero_publico' : key === 'barril_pet_10' ? 'precio_barril10_pet_publico' : 'precio_barril10_acero_publico']}
                            onChange={e => setP(key === 'barril_pet_20' ? 'precio_barril_pet_publico' : key === 'barril_acero_20' ? 'precio_barril_acero_publico' : key === 'barril_pet_10' ? 'precio_barril10_pet_publico' : 'precio_barril10_acero_publico', e.target.value)}
                            placeholder="0.00" style={inputStyle} />
                        </div>
                        <div>
                          <label style={{ ...labelStyle, fontSize: 12, color: '#f59e0b' }}>Precio mayorista</label>
                          <input type="number" step="0.01"
                            value={(precios as any)[key === 'barril_pet_20' ? 'precio_barril_pet_taproom' : key === 'barril_acero_20' ? 'precio_barril_acero_taproom' : key === 'barril_pet_10' ? 'precio_barril10_pet_taproom' : 'precio_barril10_acero_taproom']}
                            onChange={e => setP(key === 'barril_pet_20' ? 'precio_barril_pet_taproom' : key === 'barril_acero_20' ? 'precio_barril_acero_taproom' : key === 'barril_pet_10' ? 'precio_barril10_pet_taproom' : 'precio_barril10_acero_taproom', e.target.value)}
                            placeholder="0.00" style={{ ...inputStyle, color: '#f59e0b' }} />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}

          {pres.latas && !parseFloat(precios.precio_lata_publico) && (
            <p style={{ color: '#dc2626', fontSize: 12, margin: 0 }}>El precio por lata (publico) es obligatorio cuando se manejan latas.</p>
          )}
        </div>
      )}

      {/* ==================== STEP 3: STOCK INICIAL + RESUMEN ==================== */}
      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <style>{`@media (max-width: 640px) { .stock-grid-3, .stock-grid-2 { grid-template-columns: 1fr !important; } }`}</style>

          {/* Stock fields for selected presentations */}
          {pres.latas && (
            <div>
              <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Latas</p>
              <div className="stock-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'Sueltas', key: 'stock_latas', hint: 'Para armar mix' },
                  { label: 'Caja 12', key: 'stock_caja12' },
                  { label: 'Caja 24', key: 'stock_caja24' },
                ].map((s: any) => (
                  <div key={s.key}>
                    <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>{s.label}</label>
                    <input type="number" value={(stock as any)[s.key]} onChange={e => setS(s.key, e.target.value)}
                      style={{ ...inputStyle, color: '#10b981', fontWeight: 600 }} />
                    {s.hint && <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 10 }}>{s.hint}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(pres.barril_pet_20 || pres.barril_acero_20) && (
            <div>
              <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Barriles 20L</p>
              <div className="stock-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {pres.barril_pet_20 && (
                  <div>
                    <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>PET</label>
                    <input type="number" value={stock.stock_barril_pet} onChange={e => setS('stock_barril_pet', e.target.value)}
                      style={{ ...inputStyle, color: '#10b981', fontWeight: 600 }} />
                  </div>
                )}
                {pres.barril_acero_20 && (
                  <div>
                    <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>Acero</label>
                    <input type="number" value={stock.stock_barril_acero} onChange={e => setS('stock_barril_acero', e.target.value)}
                      style={{ ...inputStyle, color: '#10b981', fontWeight: 600 }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {(pres.barril_pet_10 || pres.barril_acero_10) && (
            <div>
              <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Barriles 10L</p>
              <div className="stock-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {pres.barril_pet_10 && (
                  <div>
                    <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>PET</label>
                    <input type="number" value={stock.stock_barril10_pet} onChange={e => setS('stock_barril10_pet', e.target.value)}
                      style={{ ...inputStyle, color: '#10b981', fontWeight: 600 }} />
                  </div>
                )}
                {pres.barril_acero_10 && (
                  <div>
                    <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>Acero</label>
                    <input type="number" value={stock.stock_barril10_acero} onChange={e => setS('stock_barril10_acero', e.target.value)}
                      style={{ ...inputStyle, color: '#10b981', fontWeight: 600 }} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Resumen */}
          <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: '16px 20px' }}>
            <p style={{ color: '#1a1a1a', fontSize: 14, fontWeight: 700, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resumen</p>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '6px 16px', fontSize: 13 }}>
              <span style={{ color: '#9ca3af' }}>Nombre</span>
              <span style={{ color: '#1a1a1a', fontWeight: 600 }}>{form.nombre || '—'}</span>

              <span style={{ color: '#9ca3af' }}>Estilo</span>
              <span style={{ color: '#1a1a1a' }}>{form.estilo || '—'}</span>

              {form.abv && <>
                <span style={{ color: '#9ca3af' }}>ABV</span>
                <span style={{ color: '#1a1a1a' }}>{form.abv}%</span>
              </>}

              {form.ibu && <>
                <span style={{ color: '#9ca3af' }}>IBU</span>
                <span style={{ color: '#1a1a1a' }}>{form.ibu}</span>
              </>}

              <span style={{ color: '#9ca3af' }}>Presentaciones</span>
              <span style={{ color: '#1a1a1a' }}>
                {PRESENTACIONES.filter(p => pres[p.key]).map(p => p.label).join(', ') || '—'}
              </span>
            </div>

            {/* Price summary */}
            <div style={{ marginTop: 12, borderTop: '1px solid #e5e7eb', paddingTop: 10 }}>
              <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Precios</p>
              <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 3 }}>
                {pres.latas && parseFloat(precios.precio_lata_publico) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Lata</span>
                    <span>
                      <span style={{ color: '#1a1a1a' }}>${Math.round(parseFloat(precios.precio_lata_publico)).toLocaleString('es-MX')}</span>
                      {parseFloat(precios.precio_lata_taproom) > 0 && (
                        <><span style={{ color: '#d1d5db' }}> / </span><span style={{ color: '#f59e0b' }}>${Math.round(parseFloat(precios.precio_lata_taproom)).toLocaleString('es-MX')}</span></>
                      )}
                    </span>
                  </div>
                )}
                {pres.barril_pet_20 && parseFloat(precios.precio_barril_pet_publico) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Barril 20L PET</span>
                    <span style={{ color: '#1a1a1a' }}>${Math.round(parseFloat(precios.precio_barril_pet_publico)).toLocaleString('es-MX')}</span>
                  </div>
                )}
                {pres.barril_acero_20 && parseFloat(precios.precio_barril_acero_publico) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Barril 20L Acero</span>
                    <span style={{ color: '#1a1a1a' }}>${Math.round(parseFloat(precios.precio_barril_acero_publico)).toLocaleString('es-MX')}</span>
                  </div>
                )}
                {pres.barril_pet_10 && parseFloat(precios.precio_barril10_pet_publico) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Barril 10L PET</span>
                    <span style={{ color: '#1a1a1a' }}>${Math.round(parseFloat(precios.precio_barril10_pet_publico)).toLocaleString('es-MX')}</span>
                  </div>
                )}
                {pres.barril_acero_10 && parseFloat(precios.precio_barril10_acero_publico) > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#6b7280' }}>Barril 10L Acero</span>
                    <span style={{ color: '#1a1a1a' }}>${Math.round(parseFloat(precios.precio_barril10_acero_publico)).toLocaleString('es-MX')}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, paddingTop: 20, borderTop: '1px solid #e5e7eb' }}>
        <div>
          {step > 0 && (
            <button onClick={prev} style={{ padding: '11px 20px', background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, fontSize: 14, cursor: 'pointer' }}>
              Anterior
            </button>
          )}
          {step === 0 && (
            <a href="/admin/inventario" style={{ padding: '11px 20px', background: '#f3f4f6', color: '#6b7280', borderRadius: 8, textDecoration: 'none', fontSize: 14, display: 'inline-block' }}>Cancelar</a>
          )}
        </div>

        <div>
          {step < 2 && (
            <button onClick={next}
              disabled={step === 0 ? !step1Valid : !step2Valid}
              style={{
                padding: '11px 28px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: (step === 0 ? step1Valid : step2Valid) ? 'var(--brand-primary, #E8531D)' : '#e5e7eb',
                color: (step === 0 ? step1Valid : step2Valid) ? '#fff' : '#9ca3af',
              }}>
              Siguiente
            </button>
          )}
          {step === 2 && (
            <button onClick={handleSubmit} disabled={saving || !canSubmit}
              style={{
                padding: '11px 28px', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                background: canSubmit ? 'var(--brand-primary, #E8531D)' : '#e5e7eb',
                color: canSubmit ? '#fff' : '#9ca3af',
                opacity: saving ? 0.7 : 1,
              }}>
              {saving ? 'Guardando...' : 'Crear producto'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
