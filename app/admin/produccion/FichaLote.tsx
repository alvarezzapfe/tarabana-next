'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import Icono from './Icono'
import { etiquetaFecha } from '../../../src/lib/fechas'
import {
  PRESENTACIONES_ENVASADO, litrosDeEnvasado,
  fmtAbv, fmtDias, fmtGravedad, fmtLitros, fmtPct,
} from '../../../src/lib/produccion'
import type { ColumnaStock } from '../../../src/lib/unidades'
import { ACENTO, BORDE, GRIS, GRIS_SUAVE, PISTA, ROJO, TINTA, TINTA_MEDIA } from '../dash-ui'
import {
  AMBAR, ICONOS, botonNeutro, botonPrimario, etiquetaEtapa, inputBase, labelBase,
  type EnvasadoFila, type EventoFila, type LecturaFila, type LoteFila,
  soloDecimal, soloEntero,} from './produccion-ui'

/**
 * Ficha del lote: panel lateral con todo lo del lote y sus capturas.
 *
 * Panel y no modal por lo mismo que PanelPedido: deja el tablero visible
 * detras, da ancho fijo para el detalle y no empuja nada al abrirse.
 *
 * El detalle (lecturas, envasado, eventos) se pide al abrir y no viaja con
 * el tablero: son tres tablas por lote, y precargarlas para veinte lotes
 * para mirar uno seria traer veinte veces lo que no se va a ver.
 */

const ANCHO = 560

const CSS = `
  .fl-overlay { position: fixed; inset: 0; background: rgba(17,24,39,.32); z-index: 60; display: flex; justify-content: flex-end; }
  .fl-panel { width: ${ANCHO}px; max-width: 100%; background: #fff; height: 100%; overflow-y: auto; box-shadow: -8px 0 24px rgba(0,0,0,.08); }
  .fl-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 18px; }
  .fl-cerrar:hover { background: #f3f4f6; color: #111827; }
  @media (max-width: 767px) { .fl-grid { grid-template-columns: 1fr; } }
`

type Pestana = 'general' | 'lecturas' | 'envasado' | 'eventos'

const PESTANAS: { key: Pestana; label: string }[] = [
  { key: 'general', label: 'General' },
  { key: 'lecturas', label: 'Lecturas' },
  { key: 'envasado', label: 'Envasado' },
  { key: 'eventos', label: 'Eventos' },
]

type Detalle = {
  lecturas: LecturaFila[]
  envasado: EnvasadoFila[]
  eventos: EventoFila[]
}

type Props = {
  lote: LoteFila
  canEdit: boolean
  onCerrar: () => void
  onCambio: () => void
}

export default function FichaLote({ lote, canEdit, onCerrar, onCambio }: Props) {
  const [tab, setTab] = useState<Pestana>('general')
  const [detalle, setDetalle] = useState<Detalle | null>(null)
  // Arranca en true y NO se resetea dentro del efecto: quien pinta este
  // panel le pasa `key={lote.id}`, asi que cambiar de lote lo remonta y el
  // estado nace limpio. Un `setCargando(true)` en el cuerpo del efecto
  // provocaria un render en cascada (react-hooks/set-state-in-effect).
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  const recargar = async () => {
    const res = await fetch(`/api/admin/produccion/lotes/${lote.id}`)
    const data = await res.json().catch(() => ({}))
    if (!res.ok) { setError(data.error || 'No se pudo cargar el detalle'); return }
    setDetalle(data)
  }

  useEffect(() => {
    // `vivo` evita escribir estado despues de desmontar: el panel se cierra
    // con Esc o con un clic afuera, y la respuesta puede llegar despues.
    let vivo = true
    fetch(`/api/admin/produccion/lotes/${lote.id}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) setError(data.error || 'No se pudo cargar el detalle')
        else setDetalle(data)
      })
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [lote.id])

  // Esc cierra. Sin esto, un panel sin raton se queda abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCerrar])

  return (
    <div
      className="fl-overlay"
      onClick={e => { if (e.target === e.currentTarget) onCerrar() }}
    >
      <style>{CSS}</style>
      <div className="fl-panel" role="dialog" aria-modal="true" aria-label={`Lote ${lote.folio || ''}`}>
        {/* Cabecera */}
        <div style={{ padding: '18px 22px 0', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
            <div>
              <h2
                style={{
                  margin: 0, color: TINTA, fontSize: 19, fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {lote.folio || 'Lote sin folio'}
              </h2>
              <p style={{ margin: '3px 0 0', color: GRIS, fontSize: 13 }}>
                {lote.producto_nombre || '—'}
                {lote.producto_estilo && <span style={{ color: GRIS_SUAVE }}> · {lote.producto_estilo}</span>}
              </p>
            </div>
            <button
              className="fl-cerrar"
              onClick={onCerrar}
              aria-label="Cerrar"
              style={{
                background: 'none', border: 'none', borderRadius: 7, padding: 6,
                color: GRIS, cursor: 'pointer', display: 'flex', flexShrink: 0,
              }}
            >
              <Icono d={ICONOS.cerrar} size={18} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <Pastilla texto={etiquetaEtapa(lote.etapa)} />
            <span style={{ color: GRIS_SUAVE, fontSize: 12 }}>
              {fmtDias(lote.dias_en_etapa)} en etapa
            </span>
          </div>

          <div role="tablist" style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${BORDE}`, marginTop: 14 }}>
            {PESTANAS.map(p => (
              <button
                key={p.key}
                role="tab"
                aria-selected={tab === p.key}
                onClick={() => setTab(p.key)}
                style={{
                  position: 'relative', background: 'none', border: 'none',
                  padding: '8px 12px 10px', fontSize: 13, fontFamily: 'inherit',
                  fontWeight: tab === p.key ? 600 : 500,
                  color: tab === p.key ? TINTA : GRIS,
                  cursor: 'pointer',
                }}
              >
                {p.label}
                {tab === p.key && (
                  <span aria-hidden style={{ position: 'absolute', left: 6, right: 6, bottom: -1, height: 2, background: ACENTO, borderRadius: 1 }} />
                )}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding: '18px 22px 28px' }}>
          {error && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 13px', fontSize: 13, marginBottom: 14 }}>
              {error}
            </div>
          )}

          {tab === 'general' && (
            <General lote={lote} canEdit={canEdit} onGuardado={onCambio} />
          )}

          {tab === 'lecturas' && (
            cargando ? <Cargando /> : (
              <Lecturas
                loteId={lote.id}
                lecturas={detalle?.lecturas || []}
                canEdit={canEdit}
                onGuardado={async () => { await recargar(); onCambio() }}
              />
            )
          )}

          {tab === 'envasado' && (
            cargando ? <Cargando /> : (
              <Envasado
                lote={lote}
                envasado={detalle?.envasado || []}
                canEdit={canEdit}
                onGuardado={async () => { await recargar(); onCambio() }}
              />
            )
          )}

          {tab === 'eventos' && (
            cargando ? <Cargando /> : <Eventos eventos={detalle?.eventos || []} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Piezas ──────────────────────────────────────────────────

const Cargando = () => (
  <p style={{ color: GRIS_SUAVE, fontSize: 13, padding: '20px 0' }}>Cargando…</p>
)

function Pastilla({ texto }: { texto: string }) {
  return (
    <span
      style={{
        background: PISTA, color: TINTA_MEDIA, borderRadius: 99,
        padding: '3px 10px', fontSize: 11.5, fontWeight: 600,
      }}
    >
      {texto}
    </span>
  )
}

function Dato({ label, valor, tono }: { label: string; valor: string; tono?: 'alerta' }) {
  return (
    <div>
      <dt style={{ color: GRIS_SUAVE, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </dt>
      <dd
        style={{
          margin: '3px 0 0', fontSize: 13.5, fontVariantNumeric: 'tabular-nums',
          color: tono === 'alerta' ? AMBAR : TINTA_MEDIA,
          fontWeight: tono === 'alerta' ? 600 : 400,
        }}
      >
        {valor}
      </dd>
    </div>
  )
}

// ── General: datos y captura de medidas ─────────────────────

function General({
  lote, canEdit, onGuardado,
}: { lote: LoteFila; canEdit: boolean; onGuardado: () => void }) {
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    litros_reales: lote.litros_reales?.toString() ?? '',
    og: lote.og?.toString() ?? '',
    fg: lote.fg?.toString() ?? '',
    levadura_cepa: lote.levadura_cepa ?? '',
    levadura_proveedor: lote.levadura_proveedor ?? '',
    levadura_generacion: lote.levadura_generacion?.toString() ?? '',
    notas: lote.notas ?? '',
  })

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))

  const guardar = async () => {
    setGuardando(true); setError('')
    try {
      const res = await fetch(`/api/admin/produccion/lotes/${lote.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar'); return }
      setEditando(false)
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  if (editando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {error && (
          <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 13px', fontSize: 13 }}>
            {error}
          </div>
        )}
        <div className="fl-grid">
          <label>
            <span style={labelBase}>Litros reales</span>
            <input style={inputBase} type="text" inputMode="decimal" min="0" value={form.litros_reales} onChange={e => set('litros_reales', soloDecimal(e.target.value))} />
          </label>
          <div />
          <label>
            <span style={labelBase}>OG</span>
            <input style={inputBase} type="text" inputMode="decimal" value={form.og} onChange={e => set('og', soloDecimal(e.target.value))} placeholder="1.048" />
          </label>
          <label>
            <span style={labelBase}>FG</span>
            <input style={inputBase} type="text" inputMode="decimal" value={form.fg} onChange={e => set('fg', soloDecimal(e.target.value))} placeholder="1.010" />
          </label>
          <label>
            <span style={labelBase}>Cepa</span>
            <input style={inputBase} value={form.levadura_cepa} onChange={e => set('levadura_cepa', e.target.value)} placeholder="W-34/70" />
          </label>
          <label>
            <span style={labelBase}>Proveedor</span>
            <input style={inputBase} value={form.levadura_proveedor} onChange={e => set('levadura_proveedor', e.target.value)} />
          </label>
          <label>
            <span style={labelBase}>Generación</span>
            <input style={inputBase} type="text" inputMode="numeric" min="0" value={form.levadura_generacion} onChange={e => set('levadura_generacion', soloEntero(e.target.value))} />
          </label>
        </div>
        <label>
          <span style={labelBase}>Notas</span>
          <textarea style={{ ...inputBase, minHeight: 72, resize: 'vertical' }} value={form.notas} onChange={e => set('notas', e.target.value)} />
        </label>
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
          El ABV lo calcula la base de datos a partir de OG y FG; no se captura.
        </p>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={guardar} disabled={guardando} style={{ ...botonPrimario(), opacity: guardando ? 0.6 : 1 }}>
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={() => setEditando(false)} style={botonNeutro}>Cancelar</button>
        </div>
      </div>
    )
  }

  const mermaTono = lote.merma_pct !== null && lote.merma_pct > 10 ? 'alerta' : undefined

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <dl className="fl-grid" style={{ margin: 0 }}>
        <Dato label="Tanque" valor={lote.tanque_nombre || 'sin asignar'} />
        <Dato label="Cocción" valor={etiquetaFecha(lote.fecha_coccion)} />
        <Dato label="Litros objetivo" valor={fmtLitros(lote.litros_objetivo)} />
        <Dato label="Litros reales" valor={fmtLitros(lote.litros_reales)} />
        <Dato label="OG" valor={fmtGravedad(lote.og)} />
        <Dato label="FG" valor={fmtGravedad(lote.fg)} />
        <Dato label="ABV" valor={fmtAbv(lote.abv)} />
        <Dato label="Levadura" valor={
          lote.levadura_cepa
            ? `${lote.levadura_cepa}${lote.levadura_generacion !== null ? ` · gen ${lote.levadura_generacion}` : ''}`
            : '—'
        } />
        <Dato label="Envasado" valor={etiquetaFecha(lote.fecha_envasado)} />
        <Dato label="Liberado" valor={lote.fecha_liberado ? etiquetaFecha(lote.fecha_liberado.slice(0, 10)) : '—'} />
        <Dato label="Litros envasados" valor={fmtLitros(lote.litros_envasados)} />
        <Dato
          label="Merma"
          tono={mermaTono}
          valor={
            lote.merma_litros === null
              ? '—'
              : `${fmtLitros(lote.merma_litros)} · ${fmtPct(lote.merma_pct)}`
          }
        />
      </dl>

      {lote.merma_litros === null && (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
          La merma necesita litros reales y envasado capturados. Sin los dos no
          es cero: es desconocida.
        </p>
      )}

      {lote.notas && (
        <div>
          <p style={{ ...labelBase, marginBottom: 4 }}>Notas</p>
          <p style={{ margin: 0, color: TINTA_MEDIA, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
            {lote.notas}
          </p>
        </div>
      )}

      {canEdit && (
        <div>
          <button onClick={() => setEditando(true)} style={botonNeutro}>Editar datos</button>
        </div>
      )}
    </div>
  )
}

// ── Lecturas: bitacora y grafica ────────────────────────────

function Lecturas({
  loteId, lecturas, canEdit, onGuardado,
}: {
  loteId: string
  lecturas: LecturaFila[]
  canEdit: boolean
  onGuardado: () => void
}) {
  const [form, setForm] = useState({ gravedad: '', temperatura_c: '', ph: '', nota: '' })
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const set = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }))
  const vacio = !form.gravedad && !form.temperatura_c && !form.ph && !form.nota.trim()

  // Gravedad vs tiempo. Solo las lecturas CON gravedad: un punto sin valor
  // no se puede dibujar, y rellenarlo con 0 pintaria una caida que no pasó.
  const serie = useMemo(
    () =>
      lecturas
        .filter(l => l.gravedad !== null)
        .map(l => ({ t: l.fecha.slice(0, 10), gravedad: l.gravedad as number }))
        .sort((a, b) => a.t.localeCompare(b.t)),
    [lecturas]
  )

  const guardar = async () => {
    setGuardando(true); setError('')
    try {
      const res = await fetch(`/api/admin/produccion/lotes/${loteId}/lecturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar la lectura'); return }
      setForm({ gravedad: '', temperatura_c: '', ph: '', nota: '' })
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {serie.length >= 2 ? (
        <div>
          <p style={{ ...labelBase, marginBottom: 8 }}>Gravedad en el tiempo</p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
                <CartesianGrid stroke={BORDE} strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="t"
                  tick={{ fontSize: 10.5, fill: GRIS_SUAVE }}
                  tickFormatter={(t: string) => etiquetaFecha(t)}
                  stroke={BORDE}
                />
                <YAxis
                  tick={{ fontSize: 10.5, fill: GRIS_SUAVE }}
                  // Dominio a los datos, no desde 0: las gravedades viven
                  // entre 1.00 y 1.09, y un eje desde 0 aplastaria la curva
                  // en una linea recta.
                  domain={['dataMin - 0.002', 'dataMax + 0.002']}
                  tickFormatter={(v: number) => v.toFixed(3)}
                  stroke={BORDE}
                  width={52}
                />
                {/* Los formatters de recharts reciben tipos anchos
                    (ValueType / ReactNode, que admiten undefined), asi que
                    se estrechan aqui en vez de anotar el parametro con el
                    tipo que esperamos. */}
                <Tooltip
                  formatter={v => [fmtGravedad(typeof v === 'number' ? v : null), 'Gravedad']}
                  labelFormatter={t => (typeof t === 'string' ? etiquetaFecha(t) : '')}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: `1px solid ${BORDE}` }}
                />
                <Line type="monotone" dataKey="gravedad" stroke={ACENTO} strokeWidth={2} dot={{ r: 2.5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>
          {serie.length === 1
            ? 'Una sola lectura con gravedad: la gráfica necesita al menos dos.'
            : 'Sin lecturas de gravedad todavía.'}
        </p>
      )}

      {lecturas.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDE}` }}>
              {['Fecha', 'Gravedad', 'Temp.', 'pH', 'Nota'].map(h => (
                <th key={h} style={{ color: GRIS, fontSize: 10.5, fontWeight: 600, textAlign: 'left', padding: '0 8px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lecturas.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px', color: TINTA_MEDIA, whiteSpace: 'nowrap' }}>{etiquetaFecha(l.fecha.slice(0, 10))}</td>
                <td style={{ padding: '8px', color: TINTA_MEDIA, fontVariantNumeric: 'tabular-nums' }}>{fmtGravedad(l.gravedad)}</td>
                <td style={{ padding: '8px', color: TINTA_MEDIA, fontVariantNumeric: 'tabular-nums' }}>
                  {l.temperatura_c === null ? '—' : `${l.temperatura_c} °C`}
                </td>
                <td style={{ padding: '8px', color: TINTA_MEDIA, fontVariantNumeric: 'tabular-nums' }}>{l.ph ?? '—'}</td>
                <td style={{ padding: '8px', color: GRIS }}>{l.nota || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {canEdit && (
        <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 14 }}>
          <p style={{ ...labelBase, marginBottom: 10 }}>Nueva lectura</p>
          {error && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 10 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 10 }}>
            <input style={inputBase} type="text" inputMode="decimal" placeholder="Gravedad" value={form.gravedad} onChange={e => set('gravedad', soloDecimal(e.target.value))} />
            <input style={inputBase} type="text" inputMode="decimal" placeholder="Temp. °C" value={form.temperatura_c} onChange={e => set('temperatura_c', soloDecimal(e.target.value))} />
            <input style={inputBase} type="text" inputMode="decimal" placeholder="pH" value={form.ph} onChange={e => set('ph', soloDecimal(e.target.value))} />
          </div>
          <input style={{ ...inputBase, marginBottom: 10 }} placeholder="Nota (opcional)" value={form.nota} onChange={e => set('nota', e.target.value)} />
          <button
            onClick={guardar}
            disabled={guardando || vacio}
            title={vacio ? 'Captura al menos una medición o una nota' : undefined}
            style={{ ...botonPrimario(), opacity: guardando || vacio ? 0.5 : 1, cursor: vacio ? 'not-allowed' : 'pointer' }}
          >
            {guardando ? 'Guardando…' : 'Registrar lectura'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Envasado y merma ────────────────────────────────────────

function Envasado({
  lote, envasado, canEdit, onGuardado,
}: {
  lote: LoteFila
  envasado: EnvasadoFila[]
  canEdit: boolean
  onGuardado: () => void
}) {
  const [columna, setColumna] = useState<ColumnaStock>('stock_caja24')
  const [cantidad, setCantidad] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const n = parseInt(cantidad, 10)
  const previo = Number.isFinite(n) && n > 0 ? litrosDeEnvasado(columna, n) : null

  // Ya liberado: el envasado alimento inventario y cambiarlo ahora dejaria
  // el stock sin respaldo. La DB tambien lo impide (etapa terminal).
  const cerrado = lote.etapa === 'liberado' || lote.etapa === 'descartado'

  const guardar = async () => {
    setGuardando(true); setError('')
    try {
      const res = await fetch(`/api/admin/produccion/lotes/${lote.id}/envasado`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columna_stock: columna, cantidad: n }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error || 'No se pudo guardar el envasado'); return }
      setCantidad('')
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  const etiqueta = (c: string) =>
    PRESENTACIONES_ENVASADO.find(p => p.columna === c)?.label ?? c

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {envasado.length === 0 ? (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 13 }}>Sin envasado registrado.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${BORDE}` }}>
              {['Presentación', 'Cantidad', 'Litros'].map((h, i) => (
                <th key={h} style={{ color: GRIS, fontSize: 10.5, fontWeight: 600, textAlign: i === 0 ? 'left' : 'right', padding: '0 8px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {envasado.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px', color: TINTA_MEDIA }}>{etiqueta(e.columna_stock)}</td>
                <td style={{ padding: '8px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{e.cantidad}</td>
                <td style={{ padding: '8px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtLitros(e.litros_equivalentes)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td style={{ padding: '9px 8px', color: TINTA, fontWeight: 600 }}>Total envasado</td>
              <td />
              <td style={{ padding: '9px 8px', color: TINTA, fontWeight: 700, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {fmtLitros(lote.litros_envasados)}
              </td>
            </tr>
            <tr>
              <td style={{ padding: '2px 8px 9px', color: GRIS, fontSize: 12 }}>
                Merma contra {fmtLitros(lote.litros_reales)} reales
              </td>
              <td />
              <td
                style={{
                  padding: '2px 8px 9px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                  fontWeight: 600, fontSize: 12.5,
                  color: lote.merma_pct === null ? GRIS_SUAVE : lote.merma_pct > 10 ? AMBAR : TINTA_MEDIA,
                }}
              >
                {lote.merma_litros === null ? '—' : `${fmtLitros(lote.merma_litros)} · ${fmtPct(lote.merma_pct)}`}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {lote.litros_reales === null && envasado.length > 0 && (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
          Captura los litros reales en General para que la merma se pueda calcular.
        </p>
      )}

      {canEdit && !cerrado && (
        <div style={{ borderTop: `1px solid ${BORDE}`, paddingTop: 14 }}>
          <p style={{ ...labelBase, marginBottom: 10 }}>Registrar envasado</p>
          {error && (
            <div role="alert" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginBottom: 10 }}>
              {error}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 10, marginBottom: 10 }}>
            <select style={inputBase} value={columna} onChange={e => setColumna(e.target.value as ColumnaStock)}>
              {PRESENTACIONES_ENVASADO.map(p => (
                <option key={p.columna} value={p.columna}>{p.label}</option>
              ))}
            </select>
            <input style={inputBase} type="text" inputMode="numeric" min="1" placeholder="Cantidad" value={cantidad} onChange={e => setCantidad(soloEntero(e.target.value))} />
          </div>
          <p style={{ margin: '0 0 10px', color: GRIS, fontSize: 12 }}>
            {previo === null ? 'Equivale a —' : `Equivale a ${fmtLitros(previo)}`}
          </p>
          <button
            onClick={guardar}
            disabled={guardando || previo === null}
            style={{ ...botonPrimario(), opacity: guardando || previo === null ? 0.5 : 1, cursor: previo === null ? 'not-allowed' : 'pointer' }}
          >
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
          <p style={{ margin: '10px 0 0', color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
            Capturar la misma presentación otra vez reemplaza la cantidad, no la suma.
            El stock se mueve al liberar el lote, no aquí.
          </p>
        </div>
      )}

      {cerrado && (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 11.5, lineHeight: 1.45 }}>
          El lote está {etiquetaEtapa(lote.etapa).toLowerCase()}. El envasado ya
          no se edita: estas cantidades son las que entraron a inventario.
        </p>
      )}
    </div>
  )
}

// ── Eventos ─────────────────────────────────────────────────

function Eventos({ eventos }: { eventos: EventoFila[] }) {
  if (eventos.length === 0) {
    return <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 13 }}>Sin cambios de etapa registrados.</p>
  }

  return (
    <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 0 }}>
      {eventos.map((e, i) => (
        <li
          key={e.id}
          style={{
            display: 'flex', gap: 12, padding: '10px 0',
            borderBottom: i === eventos.length - 1 ? 'none' : '1px solid #f3f4f6',
          }}
        >
          <div
            aria-hidden
            style={{
              width: 7, height: 7, borderRadius: 99, flexShrink: 0, marginTop: 5,
              background: e.etapa_a === 'descartado' ? ROJO : GRIS_SUAVE,
            }}
          />
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, color: TINTA_MEDIA, fontSize: 13 }}>
              {e.etapa_de ? `${etiquetaEtapa(e.etapa_de)} → ` : ''}
              <strong style={{ fontWeight: 600 }}>{etiquetaEtapa(e.etapa_a)}</strong>
            </p>
            {e.nota && <p style={{ margin: '2px 0 0', color: GRIS, fontSize: 12 }}>{e.nota}</p>}
          </div>
          <span style={{ color: GRIS_SUAVE, fontSize: 11.5, whiteSpace: 'nowrap' }}>
            {etiquetaFecha(e.created_at.slice(0, 10))}
          </span>
        </li>
      ))}
    </ol>
  )
}
