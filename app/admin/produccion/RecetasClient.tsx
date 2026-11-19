'use client'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { diasObjetivoTotal, fmtDias, fmtGravedad } from '../../../src/lib/produccion'
import { BORDE, GRIS, GRIS_SUAVE, MOVIL_MAX, PISTA, TINTA, TINTA_MEDIA } from '../dash-ui'
import {
  botonNeutro, botonPrimario, inputBase, labelBase, soloDecimal, soloEntero, vacio,
  type ProductoFila, type RecetaFila,
} from './produccion-ui'

/**
 * Recetas por producto.
 *
 * Los dias objetivo son lo que hace funcionar el calendario y dos de las
 * cuatro alertas, asi que la pantalla dice en voz alta cuando una receta esta
 * incompleta: con una sola etapa en blanco no hay proyeccion, y eso se ve
 * mejor aqui que descubriendolo en un Gantt vacio.
 */

const CSS = `
  .rc-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
  .rc-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .rc-wrap { overflow-x: auto; border: 1px solid ${BORDE}; border-radius: 11px; }
  .rc-tabla { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 760px; }
  .rc-fila:hover { background: #f9fafb; }
  @media screen and (max-width: ${MOVIL_MAX}px) {
    .rc-grid { grid-template-columns: repeat(2, 1fr); }
    .rc-grid-2 { grid-template-columns: 1fr; }
  }
`

const VACIO = {
  og_obj: '', fg_obj: '', temp_ferm_min: '', temp_ferm_max: '',
  dias_coccion: '', dias_fermentacion: '', dias_maduracion: '', dias_envasado: '',
  levadura_cepa: '', levadura_proveedor: '', notas: '',
}

type Form = typeof VACIO

const aForm = (r: RecetaFila | undefined): Form => ({
  og_obj: r?.og_obj?.toString() ?? '',
  fg_obj: r?.fg_obj?.toString() ?? '',
  temp_ferm_min: r?.temp_ferm_min?.toString() ?? '',
  temp_ferm_max: r?.temp_ferm_max?.toString() ?? '',
  dias_coccion: r?.dias_coccion?.toString() ?? '',
  dias_fermentacion: r?.dias_fermentacion?.toString() ?? '',
  dias_maduracion: r?.dias_maduracion?.toString() ?? '',
  dias_envasado: r?.dias_envasado?.toString() ?? '',
  levadura_cepa: r?.levadura_cepa ?? '',
  levadura_proveedor: r?.levadura_proveedor ?? '',
  notas: r?.notas ?? '',
})

type Props = {
  productos: ProductoFila[]
  recetas: RecetaFila[]
  canEdit: boolean
}

export default function RecetasClient({ productos, recetas, canEdit }: Props) {
  const router = useRouter()
  const [editando, setEditando] = useState<string | null>(null)
  const [form, setForm] = useState<Form>(VACIO)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const porProducto = useMemo(() => {
    const m = new Map<string, RecetaFila>()
    for (const r of recetas) m.set(r.producto_id, r)
    return m
  }, [recetas])

  const set = (k: keyof Form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const abrir = (p: ProductoFila) => {
    setEditando(p.id)
    setForm(aForm(porProducto.get(p.id)))
    setError('')
  }

  const guardar = async () => {
    if (!editando) return
    setGuardando(true); setError('')
    try {
      const res = await fetch(`/api/admin/produccion/recetas/${editando}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar'); return }
      setEditando(null)
      router.refresh()
    } finally {
      setGuardando(false)
    }
  }

  const sinReceta = productos.filter(p => !porProducto.has(p.id)).length

  return (
    <>
      <style>{CSS}</style>

      <p style={{ margin: '0 0 14px', color: GRIS, fontSize: 12.5 }}>
        {recetas.length} de {productos.length} productos con receta.
        {sinReceta > 0 && (
          <span style={{ color: GRIS_SUAVE }}>
            {' '}Los {sinReceta} sin receta no se proyectan en el calendario ni disparan
            alertas de etapa o de FG.
          </span>
        )}
      </p>

      {error && (
        <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 13px', fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {productos.length === 0 ? (
        <div style={vacio}>No hay productos activos.</div>
      ) : (
        <div className="rc-wrap">
          <table className="rc-tabla">
            <thead>
              <tr style={{ background: PISTA }}>
                {['Producto', 'OG → FG', 'Temp.', 'Cocción', 'Ferm.', 'Madur.', 'Envas.', 'Total', 'Levadura', ''].map((h, i) => (
                  <th
                    key={h || i}
                    style={{
                      color: GRIS, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.06em', textAlign: i >= 3 && i <= 7 ? 'right' : 'left',
                      padding: '9px 11px', whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {productos.map(p => {
                const r = porProducto.get(p.id)
                const total = r ? diasObjetivoTotal(r) : null
                const num = (v: number | null) => (v === null || v === undefined ? '—' : String(v))
                return (
                  <tr key={p.id} className="rc-fila" style={{ borderTop: `1px solid ${BORDE}` }}>
                    <td style={{ padding: '9px 11px', color: TINTA, fontWeight: 600 }}>
                      {p.nombre}
                      <span style={{ color: GRIS_SUAVE, fontWeight: 400 }}> · {p.estilo}</span>
                    </td>
                    <td style={{ padding: '9px 11px', color: TINTA_MEDIA, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {r && (r.og_obj !== null || r.fg_obj !== null)
                        ? `${fmtGravedad(r.og_obj)} → ${fmtGravedad(r.fg_obj)}`
                        : '—'}
                    </td>
                    <td style={{ padding: '9px 11px', color: TINTA_MEDIA, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {r && r.temp_ferm_min !== null && r.temp_ferm_max !== null
                        ? `${r.temp_ferm_min}–${r.temp_ferm_max} °C`
                        : '—'}
                    </td>
                    {([r?.dias_coccion, r?.dias_fermentacion, r?.dias_maduracion, r?.dias_envasado] as (number | null | undefined)[]).map((d, i) => (
                      <td key={i} style={{ padding: '9px 11px', textAlign: 'right', color: d === null || d === undefined ? GRIS_SUAVE : TINTA_MEDIA, fontVariantNumeric: 'tabular-nums' }}>
                        {num(d ?? null)}
                      </td>
                    ))}
                    <td
                      style={{
                        padding: '9px 11px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                        fontWeight: 600, color: total === null ? GRIS_SUAVE : TINTA_MEDIA,
                      }}
                      title={total === null ? 'Falta alguna etapa: sin las cuatro no hay proyección' : undefined}
                    >
                      {total === null ? '—' : fmtDias(total)}
                    </td>
                    <td style={{ padding: '9px 11px', color: r?.levadura_cepa ? TINTA_MEDIA : GRIS_SUAVE }}>
                      {r?.levadura_cepa || '—'}
                    </td>
                    <td style={{ padding: '9px 11px', textAlign: 'right' }}>
                      {canEdit && (
                        <button
                          onClick={() => abrir(p)}
                          style={{ ...botonNeutro, padding: '5px 11px', fontSize: 12.5 }}
                        >
                          {r ? 'Editar' : 'Capturar'}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <Editor
          producto={productos.find(p => p.id === editando)!}
          form={form}
          set={set}
          guardando={guardando}
          onGuardar={guardar}
          onCerrar={() => setEditando(null)}
        />
      )}
    </>
  )
}

function Editor({
  producto, form, set, guardando, onGuardar, onCerrar,
}: {
  producto: ProductoFila
  form: Form
  set: (k: keyof Form, v: string) => void
  guardando: boolean
  onGuardar: () => void
  onCerrar: () => void
}) {
  const faltan = (['dias_coccion', 'dias_fermentacion', 'dias_maduracion', 'dias_envasado'] as const)
    .filter(k => form[k] === '').length

  return (
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(17,24,39,.32)', zIndex: 70,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Receta de ${producto.nombre}`}
        style={{
          background: '#fff', borderRadius: 12, width: 'min(560px, 100%)',
          maxHeight: '100%', overflowY: 'auto', boxShadow: '0 12px 32px rgba(0,0,0,.14)',
        }}
      >
        <div style={{ padding: '18px 22px 14px', borderBottom: `1px solid ${BORDE}` }}>
          <h2 style={{ margin: 0, color: TINTA, fontSize: 17, fontWeight: 700 }}>
            Receta de {producto.nombre}
          </h2>
          <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 12.5 }}>{producto.estilo}</p>
        </div>

        <div style={{ padding: '18px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="rc-grid-2">
            <label>
              <span style={labelBase}>OG objetivo</span>
              <input style={inputBase} type="text" inputMode="decimal" placeholder="1.048"
                value={form.og_obj} onChange={e => set('og_obj', soloDecimal(e.target.value))} />
            </label>
            <label>
              <span style={labelBase}>FG objetivo</span>
              <input style={inputBase} type="text" inputMode="decimal" placeholder="1.010"
                value={form.fg_obj} onChange={e => set('fg_obj', soloDecimal(e.target.value))} />
            </label>
          </div>

          <div className="rc-grid-2">
            <label>
              <span style={labelBase}>Temp. mínima °C</span>
              <input style={inputBase} type="text" inputMode="decimal" placeholder="18"
                value={form.temp_ferm_min} onChange={e => set('temp_ferm_min', soloDecimal(e.target.value))} />
            </label>
            <label>
              <span style={labelBase}>Temp. máxima °C</span>
              <input style={inputBase} type="text" inputMode="decimal" placeholder="21"
                value={form.temp_ferm_max} onChange={e => set('temp_ferm_max', soloDecimal(e.target.value))} />
            </label>
          </div>

          <div>
            <span style={labelBase}>Días objetivo por etapa</span>
            <div className="rc-grid">
              {([
                ['dias_coccion', 'Cocción'],
                ['dias_fermentacion', 'Fermentación'],
                ['dias_maduracion', 'Maduración'],
                ['dias_envasado', 'Envasado'],
              ] as const).map(([k, label]) => (
                <label key={k}>
                  <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 11, marginBottom: 4 }}>{label}</span>
                  <input style={inputBase} type="text" inputMode="numeric"
                    value={form[k]} onChange={e => set(k, soloEntero(e.target.value))} />
                </label>
              ))}
            </div>
            <p style={{ margin: '8px 0 0', color: faltan > 0 ? '#b45309' : GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
              {faltan > 0
                ? `Faltan ${faltan} de las cuatro etapas. Sin las cuatro no hay fecha estimada de fin, así que este producto no aparece proyectado en el calendario ni en "en camino".`
                : 'Las cuatro capturadas: este producto ya se proyecta en el calendario.'}
            </p>
            <p style={{ margin: '4px 0 0', color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
              Un 0 es un cero («no madura»); dejarlo vacío es «no se sabe» y apaga la proyección.
            </p>
          </div>

          <div className="rc-grid-2">
            <label>
              <span style={labelBase}>Cepa</span>
              <input style={inputBase} placeholder="W-34/70"
                value={form.levadura_cepa} onChange={e => set('levadura_cepa', e.target.value)} />
            </label>
            <label>
              <span style={labelBase}>Proveedor</span>
              <input style={inputBase}
                value={form.levadura_proveedor} onChange={e => set('levadura_proveedor', e.target.value)} />
            </label>
          </div>

          <label>
            <span style={labelBase}>Notas</span>
            <textarea style={{ ...inputBase, minHeight: 64, resize: 'vertical' }}
              value={form.notas} onChange={e => set('notas', e.target.value)} />
          </label>
        </div>

        <div style={{ padding: '14px 22px 18px', borderTop: `1px solid ${BORDE}`, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onCerrar} style={botonNeutro}>Cancelar</button>
          <button onClick={onGuardar} disabled={guardando}
            style={{ ...botonPrimario(), opacity: guardando ? 0.6 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar receta'}
          </button>
        </div>
      </div>
    </div>
  )
}
