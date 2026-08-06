'use client'
import { useState, useEffect } from 'react'
import { createClient } from '../../../../../src/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { canManageInventory, isSuperAdmin as checkSuperAdmin } from '../../../../../src/lib/roles'

const estilos = ['IPA', 'Double IPA', 'Session IPA', 'New England IPA', 'West Coast IPA', 'Red IPA', 'Lager', 'Lager Mexicana', 'Czech Pale Lager', 'Stout', 'Porter', 'Wheat', 'Sour', 'Pale Ale', 'Amber Ale', 'Otro']

export default function EditProductoPage() {
  const router = useRouter()
  const params = useParams()
  const id = params.id as string
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [imgFile, setImgFile] = useState<File | null>(null)
  const [imgPreview, setImgPreview] = useState<string | null>(null)
  const [userRole, setUserRole] = useState<string>('')
  const [form, setForm] = useState({
    nombre: '', estilo: '', abv: '', ibu: '', descripcion: '', descripcion_larga: '',
    precio_lata_publico: '', precio_lata_taproom: '',
    precio_barril_pet_publico: '', precio_barril_pet_taproom: '',
    precio_barril_acero_publico: '', precio_barril_acero_taproom: '',
    precio_barril10_pet_publico: '', precio_barril10_pet_taproom: '',
    precio_barril10_acero_publico: '', precio_barril10_acero_taproom: '',
    stock_latas: '0', stock_caja12: '0', stock_caja24: '0', stock_barril_pet: '0', stock_barril_acero: '0',
    stock_barril10_pet: '0', stock_barril10_acero: '0',
    activo: true, imagen_url: '',
  })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/admin'); return }
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
      setUserRole(profile?.role || '')
      if (!canManageInventory(profile?.role)) { router.push('/admin/inventario'); return }

      const { data: p } = await supabase.from('productos').select('*').eq('id', id).single()
      if (!p) { router.push('/admin/inventario'); return }

      setImgPreview(p.imagen_url || null)
      setForm({
        nombre: p.nombre || '', estilo: p.estilo || '',
        abv: p.abv?.toString() || '', ibu: p.ibu?.toString() || '',
        descripcion: p.descripcion || '', descripcion_larga: p.descripcion_larga || '',
        precio_lata_publico: p.precio_lata_publico?.toString() || '',
        precio_lata_taproom: p.precio_lata_taproom?.toString() || '',
        precio_barril_pet_publico: p.precio_barril_pet_publico?.toString() || '',
        precio_barril_pet_taproom: p.precio_barril_pet_taproom?.toString() || '',
        precio_barril_acero_publico: p.precio_barril_acero_publico?.toString() || '',
        precio_barril_acero_taproom: p.precio_barril_acero_taproom?.toString() || '',
        precio_barril10_pet_publico: p.precio_barril10_pet_publico?.toString() || '',
        precio_barril10_pet_taproom: p.precio_barril10_pet_taproom?.toString() || '',
        precio_barril10_acero_publico: p.precio_barril10_acero_publico?.toString() || '',
        precio_barril10_acero_taproom: p.precio_barril10_acero_taproom?.toString() || '',
        stock_latas: p.stock_latas?.toString() || '0',
        stock_caja12: p.stock_caja12?.toString() || '0',
        stock_caja24: p.stock_caja24?.toString() || '0',
        stock_barril_pet: p.stock_barril_pet?.toString() || '0',
        stock_barril_acero: p.stock_barril_acero?.toString() || '0',
        stock_barril10_pet: p.stock_barril10_pet?.toString() || '0',
        stock_barril10_acero: p.stock_barril10_acero?.toString() || '0',
        activo: p.activo ?? true, imagen_url: p.imagen_url || '',
      })
      setLoading(false)
    }
    load()
  }, [id])

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }))

  const handleImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    setSaving(true)
    let imagen_url = form.imagen_url

    if (imgFile) {
      const ext = imgFile.name.split('.').pop()
      const path = `${Date.now()}.${ext}`
      const { error: uploadError } = await supabase.storage.from('productos').upload(path, imgFile, { contentType: imgFile.type })
      if (uploadError) { alert('Error subiendo imagen: ' + uploadError.message); setSaving(false); return }
      const { data: { publicUrl } } = supabase.storage.from('productos').getPublicUrl(path)
      imagen_url = publicUrl
    }

    const isSuperAdmin = checkSuperAdmin(userRole)

    const updateData: any = {
      stock_caja12: parseInt(form.stock_caja12) || 0,
      stock_caja24: parseInt(form.stock_caja24) || 0,
      stock_barril_pet: parseInt(form.stock_barril_pet) || 0,
      stock_barril_acero: parseInt(form.stock_barril_acero) || 0,
      stock_barril10_pet: parseInt(form.stock_barril10_pet) || 0,
      stock_barril10_acero: parseInt(form.stock_barril10_acero) || 0,
      stock_latas: parseInt(form.stock_latas) || 0,
      stock_barriles: (parseInt(form.stock_barril_pet) || 0) + (parseInt(form.stock_barril_acero) || 0),
    }

    if (isSuperAdmin) {
      Object.assign(updateData, {
        nombre: form.nombre, estilo: form.estilo,
        abv: form.abv ? parseFloat(form.abv) : null,
        ibu: form.ibu ? parseInt(form.ibu) : null,
        descripcion: form.descripcion, descripcion_larga: form.descripcion_larga,
        imagen_url,
        precio_lata_publico: parseFloat(form.precio_lata_publico) || null,
        precio_lata_taproom: parseFloat(form.precio_lata_taproom) || null,
        precio_barril_pet_publico: parseFloat(form.precio_barril_pet_publico) || null,
        precio_barril_pet_taproom: parseFloat(form.precio_barril_pet_taproom) || null,
        precio_barril_acero_publico: parseFloat(form.precio_barril_acero_publico) || null,
        precio_barril_acero_taproom: parseFloat(form.precio_barril_acero_taproom) || null,
        precio_barril10_pet_publico: parseFloat(form.precio_barril10_pet_publico) || null,
        precio_barril10_pet_taproom: parseFloat(form.precio_barril10_pet_taproom) || null,
        precio_barril10_acero_publico: parseFloat(form.precio_barril10_acero_publico) || null,
        precio_barril10_acero_taproom: parseFloat(form.precio_barril10_acero_taproom) || null,
        activo: form.activo,
      })
    }

    const { error } = await supabase.from('productos').update(updateData).eq('id', id)
    if (error) { alert('Error: ' + error.message); setSaving(false); return }
    router.push('/admin/inventario')
    router.refresh()
  }

  const inp = (label: string, key: string, placeholder = '', type = 'text', disabled = false) => (
    <div>
      <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</label>
      <input type={type} value={(form as any)[key]} onChange={e => set(key, e.target.value)}
        placeholder={placeholder} disabled={disabled}
        style={{ width: '100%', padding: '10px 12px', background: disabled ? '#f3f4f6' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: disabled ? '#9ca3af' : '#1a1a1a', fontSize: 14, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }}
      />
    </div>
  )

  const priceRow = (label: string, pubKey: string, tapKey: string, disabled = false) => (
    <div>
      <p style={{ color: '#6b7280', fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{label}</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>Precio público</label>
          <input type="number" value={(form as any)[pubKey]} onChange={e => set(pubKey, e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '9px 12px', background: disabled ? '#141414' : '#1a1a1a', border: '1px solid #d1d5db', borderRadius: 7, color: disabled ? '#444' : '#fff', fontSize: 13.5, boxSizing: 'border-box' as const }} />
        </div>
        <div>
          <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>Precio taproom</label>
          <input type="number" value={(form as any)[tapKey]} onChange={e => set(tapKey, e.target.value)}
            disabled={disabled}
            style={{ width: '100%', padding: '9px 12px', background: disabled ? '#141414' : '#1a1a1a', border: '1px solid #d1d5db', borderRadius: 7, color: disabled ? '#444' : '#f59e0b', fontSize: 13.5, boxSizing: 'border-box' as const }} />
        </div>
      </div>
    </div>
  )

  const isSuperAdmin = userRole === 'super_admin'
  const isProduccion = userRole === 'produccion'

  if (loading) return <div style={{ padding: 60, color: '#6b7280', textAlign: 'center' }}>Cargando...</div>

  return (
    <div style={{ padding: '36px 40px', maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <a href="/admin/inventario" style={{ color: '#6b7280', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
          Inventario
        </a>
        <h1 style={{ color: '#1a1a1a', fontSize: 20, fontWeight: 700, margin: 0 }}>Editar producto</h1>
        {isProduccion && (
          <span style={{ background: '#f59e0b22', color: '#f59e0b', fontSize: 13, padding: '3px 10px', borderRadius: 99 }}>Solo puedes editar stock</span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 24 }}>
        {/* Columna izq */}
        <div>
          <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Foto</label>
          <div onClick={() => isSuperAdmin && document.getElementById('img-upload')?.click()}
            style={{
              width: '100%', aspectRatio: '1', background: '#fff', border: '2px dashed #2a2a2a',
              borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: isSuperAdmin ? 'pointer' : 'default', overflow: 'hidden'
            }}>
            {imgPreview
              ? <img src={imgPreview} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <p style={{ color: '#9ca3af', fontSize: 12 }}>Sin foto</p>
            }
          </div>
          {isSuperAdmin && <input id="img-upload" type="file" accept="image/*" onChange={handleImage} style={{ display: 'none' }} />}

          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {inp('ABV %', 'abv', '5.5', 'number', !isSuperAdmin)}
            {inp('IBU', 'ibu', '45', 'number', !isSuperAdmin)}
          </div>

          {isSuperAdmin && (
            <div style={{ marginTop: 12 }}>
              <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Status</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button onClick={() => set('activo', !form.activo)} style={{
                  width: 44, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
                  background: form.activo ? '#10b981' : '#333', position: 'relative', transition: 'all 0.2s'
                }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: form.activo ? 23 : 3, transition: 'all 0.2s' }} />
                </button>
                <span style={{ color: form.activo ? '#10b981' : '#555', fontSize: 13 }}>{form.activo ? 'Activo' : 'Inactivo'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Columna der */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {inp('Nombre', 'nombre', '', 'text', !isSuperAdmin)}

          <div>
            <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Estilo</label>
            <select value={form.estilo} onChange={e => set('estilo', e.target.value)} disabled={!isSuperAdmin}
              style={{ width: '100%', padding: '10px 12px', background: !isSuperAdmin ? '#f3f4f6' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: form.estilo ? '#1a1a1a' : '#9ca3af', fontSize: 14, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }}>
              {estilos.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          {inp('Descripción corta', 'descripcion', '', 'text', !isSuperAdmin)}
          
          {isSuperAdmin && (
            <div>
              <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.07em' }}>Descripción larga</label>
              <textarea value={form.descripcion_larga} onChange={e => set('descripcion_larga', e.target.value)} rows={3}
                style={{ width: '100%', padding: '10px 12px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 7, color: '#1a1a1a', fontSize: 13.5, boxSizing: 'border-box' as const, resize: 'vertical' }} />
            </div>
          )}

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
            <p style={{ color: '#E8531D', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12 }}>Precios</p>

            {/* Precio por lata (editable) */}
            <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Precio por lata</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
              <div>
                <label style={{ color: '#6b7280', fontSize: 12, display: 'block', marginBottom: 4 }}>Publico</label>
                <input type="number" step="0.01" value={form.precio_lata_publico} onChange={e => set('precio_lata_publico', e.target.value)} disabled={!isSuperAdmin}
                  placeholder="0.00" style={{ width: '100%', padding: '10px 12px', background: !isSuperAdmin ? '#f3f4f6' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#1a1a1a', fontSize: 15, fontWeight: 700, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }} />
              </div>
              <div>
                <label style={{ color: '#f59e0b', fontSize: 12, display: 'block', marginBottom: 4 }}>Mayorista</label>
                <input type="number" step="0.01" value={form.precio_lata_taproom} onChange={e => set('precio_lata_taproom', e.target.value)} disabled={!isSuperAdmin}
                  placeholder="0.00" style={{ width: '100%', padding: '10px 12px', background: !isSuperAdmin ? '#f3f4f6' : '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#f59e0b', fontSize: 15, fontWeight: 700, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }} />
              </div>
            </div>

            {/* Derivados (solo lectura) */}
            {(parseFloat(form.precio_lata_publico) > 0 || parseFloat(form.precio_lata_taproom) > 0) && (
              <>
                <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Derivados <span style={{ fontWeight: 400, textTransform: 'none' }}>(calculados)</span></p>
                <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
                  {[
                    { label: 'Caja 12', mult: 12 },
                    { label: 'Caja 24', mult: 24 },
                  ].map(d => {
                    const pub = Math.round((parseFloat(form.precio_lata_publico) || 0) * d.mult)
                    const tap = Math.round((parseFloat(form.precio_lata_taproom) || 0) * d.mult)
                    return (
                      <div key={d.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}>
                        <span style={{ color: '#6b7280', fontSize: 13 }}>{d.label}</span>
                        <span style={{ fontSize: 13 }}>
                          <span style={{ color: '#1a1a1a' }}>${pub.toLocaleString('es-MX')}</span>
                          <span style={{ color: '#9ca3af', margin: '0 6px' }}>/</span>
                          <span style={{ color: '#f59e0b' }}>${tap.toLocaleString('es-MX')}</span>
                        </span>
                      </div>
                    )
                  })}
                </div>
              </>
            )}

            {/* Barriles (editables, precio propio) */}
            <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Barriles</p>
            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                    <th style={{ padding: '8px 14px', textAlign: 'left', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Presentacion</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', color: '#6b7280', fontSize: 11, textTransform: 'uppercase' }}>Publico</th>
                    <th style={{ padding: '8px 10px', textAlign: 'center', color: '#f59e0b', fontSize: 11, textTransform: 'uppercase' }}>Mayorista</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    ['20L PET', 'precio_barril_pet_publico', 'precio_barril_pet_taproom'],
                    ['20L Acero', 'precio_barril_acero_publico', 'precio_barril_acero_taproom'],
                    ['10L PET', 'precio_barril10_pet_publico', 'precio_barril10_pet_taproom'],
                    ['10L Acero', 'precio_barril10_acero_publico', 'precio_barril10_acero_taproom'],
                  ] as const).map(([label, pubKey, tapKey]) => (
                    <tr key={pubKey} style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <td style={{ padding: '8px 14px', color: '#374151', fontSize: 13 }}>{label}</td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <input type="number" value={(form as any)[pubKey]} onChange={e => set(pubKey, e.target.value)} disabled={!isSuperAdmin}
                          placeholder="—" style={{ width: 90, padding: '6px 8px', background: !isSuperAdmin ? '#f3f4f6' : '#fff', border: '1px solid #d1d5db', borderRadius: 6, color: '#1a1a1a', fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      </td>
                      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
                        <input type="number" value={(form as any)[tapKey]} onChange={e => set(tapKey, e.target.value)} disabled={!isSuperAdmin}
                          placeholder="—" style={{ width: 90, padding: '6px 8px', background: !isSuperAdmin ? '#f3f4f6' : '#fff', border: '1px solid #d1d5db', borderRadius: 6, color: '#f59e0b', fontSize: 13, textAlign: 'right', outline: 'none' }} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 14 }}>
            <style>{`@media (max-width: 768px) { .stock-grid-3, .stock-grid-2 { grid-template-columns: 1fr !important; } }`}</style>
            <p style={{ color: '#1a1a1a', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 16 }}>
              Stock {isProduccion && <span style={{ color: '#f59e0b', fontWeight: 400 }}>— editable</span>}
            </p>

            <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Latas</p>
            <div className="stock-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'Sueltas', key: 'stock_latas', hint: 'Para armar mix' },
                { label: 'Caja 12', key: 'stock_caja12' },
                { label: 'Caja 24', key: 'stock_caja24' },
              ].map((s: any) => (
                <div key={s.key}>
                  <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>{s.label}</label>
                  <input type="number" value={(form as any)[s.key]} onChange={e => set(s.key, e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#10b981', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }} />
                  {s.hint && <p style={{ margin: '2px 0 0', color: '#9ca3af', fontSize: 10 }}>{s.hint}</p>}
                </div>
              ))}
            </div>

            <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Barriles 20L</p>
            <div className="stock-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
              {[
                { label: 'PET', key: 'stock_barril_pet' },
                { label: 'Acero', key: 'stock_barril_acero' },
              ].map(s => (
                <div key={s.key}>
                  <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>{s.label}</label>
                  <input type="number" value={(form as any)[s.key]} onChange={e => set(s.key, e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#10b981', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }} />
                </div>
              ))}
            </div>

            <p style={{ color: '#9ca3af', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Barriles 10L</p>
            <div className="stock-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { label: 'PET', key: 'stock_barril10_pet' },
                { label: 'Acero', key: 'stock_barril10_acero' },
              ].map(s => (
                <div key={s.key}>
                  <label style={{ color: '#6b7280', fontSize: 13, display: 'block', marginBottom: 4 }}>{s.label}</label>
                  <input type="number" value={(form as any)[s.key]} onChange={e => set(s.key, e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, color: '#10b981', fontSize: 14, fontWeight: 600, boxSizing: 'border-box' as const, minHeight: 44, outline: 'none' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, marginTop: 28, paddingTop: 20, borderTop: '1px solid #1a1a1a' }}>
        <a href="/admin/inventario" style={{ padding: '11px 20px', background: '#f3f4f6', color: '#6b7280', borderRadius: 7, textDecoration: 'none', fontSize: 14 }}>Cancelar</a>
        <button onClick={handleSave} disabled={saving} style={{
          padding: '11px 28px', background: '#E8531D', border: 'none', borderRadius: 7,
          color: '#1a1a1a', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.7 : 1
        }}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>
    </div>
  )
}
