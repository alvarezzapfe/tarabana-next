'use client'
import { useRef, useState } from 'react'

/**
 * Carga masiva de clientes NUEVOS desde Excel.
 *
 * Dos pasos sobre el mismo archivo: subir (vista previa, no crea nada) y
 * confirmar. El archivo se vuelve a mandar al confirmar en vez de mandar el
 * plan que tiene el navegador, para que lo que se crea sea exactamente lo que
 * el servidor valido y la persona aprobo.
 *
 * Nada de exceljs aqui: el archivo se manda tal cual y lo parsea el servidor.
 */

const ACENTO = '#D95F2E'
const VERDE = '#15803d'
const ROJO = '#dc2626'
const BORDE = '#e5e7eb'
const GRIS = '#6b7280'
const GRIS_SUAVE = '#9ca3af'
const TINTA = '#111827'

const tabular = { fontVariantNumeric: 'tabular-nums' } as const

type Estado = 'nuevo' | 'existe' | 'error'

type FilaPlan = {
  fila: number
  estado: Estado
  nombre: string
  email: string
  rfc: string | null
  giro: string | null
  nivel: string | null
  vendedor: string | null
  motivo: string | null
}

type Plan = {
  renglones: number
  nuevos: number
  existentes: number
  errores: number
  filas: FilaPlan[]
}

type Resultado = {
  creados: { fila: number; id: string; nombre: string; email: string }[]
  fallidos: { fila: number; nombre: string; email: string; error: string }[]
  existentes: number
  errores: number
}

const ESTADOS: Record<Estado, { etiqueta: string; color: string; fondo: string; punto: string }> = {
  nuevo:  { etiqueta: 'Nuevo',             color: VERDE,      fondo: '#fff',    punto: '#22c55e' },
  existe: { etiqueta: 'Ya existe',         color: GRIS,       fondo: '#fafafa', punto: '#d1d5db' },
  error:  { etiqueta: 'No se puede crear', color: ROJO,       fondo: '#fffbfb', punto: ROJO },
}

type Props = {
  onClose: () => void
  /** Se llama tras confirmar, para que la lista vuelva a cargar. */
  onCreados: () => void
}

export default function ImportarClientesExcel({ onClose, onCreados }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [soloProblemas, setSoloProblemas] = useState(false)

  async function enviar(file: File, modo: 'preview' | 'confirmar') {
    setCargando(true)
    setError('')
    const body = new FormData()
    body.set('archivo', file)
    body.set('modo', modo)

    try {
      const res = await fetch('/api/admin/clientes/importar', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'No se pudo procesar el archivo.')
        return
      }
      setAvisos([...(json.erroresGlobales || []), ...(json.avisos || [])])
      if (modo === 'preview') {
        setPlan(json.plan)
        setResultado(null)
      } else {
        setResultado({
          creados: json.creados || [],
          fallidos: json.fallidos || [],
          existentes: json.existentes || 0,
          errores: json.errores || 0,
        })
        setPlan(null)
        onCreados()
      }
    } catch {
      setError('Se cayo la conexión al subir el archivo.')
    } finally {
      setCargando(false)
    }
  }

  const elegir = (file: File | null) => {
    setPlan(null)
    setResultado(null)
    setError('')
    setAvisos([])
    setSoloProblemas(false)
    setArchivo(file)
    if (file) enviar(file, 'preview')
  }

  const btn = (fondo: string, color: string, borde = 'transparent') => ({
    padding: '9px 16px', background: fondo, border: `1px solid ${borde}`, borderRadius: 8,
    color, fontSize: 13, fontWeight: 600 as const, fontFamily: 'inherit',
    cursor: cargando ? 'default' : 'pointer', opacity: cargando ? 0.6 : 1,
    whiteSpace: 'nowrap' as const,
  })

  const visibles = plan
    ? (soloProblemas ? plan.filas.filter(f => f.estado !== 'nuevo') : plan.filas)
    : []

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 120, padding: '40px 16px', overflowY: 'auto', fontFamily: 'system-ui, sans-serif' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 960, padding: '24px 26px', boxShadow: '0 16px 48px rgba(17,24,39,0.18)' }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TINTA }}>Carga masiva de clientes</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: GRIS }}>
              Un renglón por cliente nuevo. Los que ya existen se omiten; no se actualiza ninguna ficha.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: GRIS_SUAVE, fontSize: 20, lineHeight: 1, padding: 2 }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          <a
            href="/api/admin/clientes/plantilla"
            style={{ ...btn('#fff', '#374151', '#d1d5db'), textDecoration: 'none', display: 'inline-block' }}
          >
            ↓ Descargar plantilla
          </a>
          <button onClick={() => inputRef.current?.click()} disabled={cargando} style={btn(ACENTO, '#fff')}>
            {cargando && !plan ? 'Leyendo…' : archivo ? 'Cambiar archivo' : 'Subir Excel'}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={e => elegir(e.target.files?.[0] ?? null)}
            style={{ display: 'none' }}
          />
          {archivo && (
            <span style={{ fontSize: 12.5, color: GRIS }}>
              {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
            </span>
          )}
          <span style={{ marginLeft: 'auto', fontSize: 11.5, color: GRIS_SUAVE }}>
            No se envían correos de invitación.
          </span>
        </div>

        {error && (
          <p style={{ padding: '11px 14px', marginBottom: 16, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
            {error}
          </p>
        )}

        {avisos.map((a, i) => (
          <p key={i} style={{ padding: '10px 14px', marginBottom: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 12.5 }}>
            {a}
          </p>
        ))}

        {/* ── Resultado del confirmar ─────────────────────── */}
        {resultado && (
          <div>
            <div style={{ padding: '14px 16px', background: resultado.creados.length ? '#f0fdf4' : '#fef2f2', border: `1px solid ${resultado.creados.length ? '#bbf7d0' : '#fecaca'}`, borderRadius: 10, marginBottom: 14 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: resultado.creados.length ? VERDE : '#b91c1c' }}>
                {resultado.creados.length === 0
                  ? 'No se creó ningún cliente.'
                  : `Se crearon ${resultado.creados.length} ${resultado.creados.length === 1 ? 'cliente' : 'clientes'}.`}
              </p>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: GRIS }}>
                {resultado.existentes > 0 && `${resultado.existentes} ya existían y se omitieron. `}
                {resultado.errores > 0 && `${resultado.errores} se omitieron por errores del archivo. `}
                {resultado.fallidos.length > 0 && `${resultado.fallidos.length} ${resultado.fallidos.length === 1 ? 'falló' : 'fallaron'} al crearse.`}
              </p>
            </div>

            {resultado.fallidos.length > 0 && (
              <div style={{ border: `1px solid ${BORDE}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: GRIS_SUAVE }}>
                  No se crearon
                </p>
                {resultado.fallidos.map(f => (
                  <p key={f.fila} style={{ margin: '0 0 5px', fontSize: 12.5, color: ROJO }}>
                    <span style={{ ...tabular, display: 'inline-block', minWidth: 70, color: '#991b1b', fontWeight: 600 }}>
                      Renglón {f.fila}
                    </span>
                    <strong>{f.nombre}</strong> — {f.error}
                  </p>
                ))}
              </div>
            )}

            {resultado.creados.length > 0 && (
              <div style={{ maxHeight: 300, overflowY: 'auto', border: `1px solid ${BORDE}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: GRIS_SUAVE }}>
                  Creados
                </p>
                {resultado.creados.map(c => (
                  <p key={c.id} style={{ margin: '0 0 5px', fontSize: 12.5, color: '#374151', display: 'flex', gap: 10, alignItems: 'baseline' }}>
                    <span style={{ ...tabular, minWidth: 70, color: GRIS_SUAVE }}>Renglón {c.fila}</span>
                    <a href={`/admin/clientes/edit/${c.id}`} style={{ color: ACENTO, textDecoration: 'none', fontWeight: 600 }}>
                      {c.nombre}
                    </a>
                    <span style={{ marginLeft: 'auto', color: GRIS_SUAVE }}>{c.email}</span>
                  </p>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={onClose} style={{ ...btn(ACENTO, '#fff'), marginLeft: 'auto' }}>Listo</button>
            </div>
          </div>
        )}

        {/* ── Vista previa ────────────────────────────────── */}
        {plan && (
          <div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center', padding: '12px 16px', background: '#fafafa', border: `1px solid ${BORDE}`, borderRadius: 10, marginBottom: 14 }}>
              {[
                { l: 'Renglones', v: plan.renglones },
                { l: 'Nuevos', v: plan.nuevos, c: plan.nuevos ? VERDE : GRIS },
                { l: 'Ya existen', v: plan.existentes, c: GRIS },
                { l: 'Con error', v: plan.errores, c: plan.errores ? ROJO : GRIS },
              ].map(k => (
                <div key={k.l}>
                  <p style={{ margin: 0, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: GRIS_SUAVE, fontWeight: 600 }}>{k.l}</p>
                  <p style={{ ...tabular, margin: '2px 0 0', fontSize: 17, fontWeight: 700, color: k.c || TINTA }}>{k.v}</p>
                </div>
              ))}
              {(plan.existentes > 0 || plan.errores > 0) && (
                <label style={{ marginLeft: 'auto', fontSize: 12, color: GRIS, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={soloProblemas} onChange={e => setSoloProblemas(e.target.checked)} />
                  Ver solo lo que no se va a crear
                </label>
              )}
            </div>

            <p style={{ margin: '0 0 10px', fontSize: 12, color: GRIS }}>
              Nada se ha creado todavía. Revisa y confirma.
            </p>

            <div style={{ maxHeight: 420, overflowY: 'auto', border: `1px solid ${BORDE}`, borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr>
                    {['', 'Renglón', 'Nombre comercial', 'Correo', 'Giro', 'Nivel', 'Vendedor', 'Estado'].map((h, i) => (
                      <th key={i} style={{
                        position: 'sticky', top: 0, background: '#fff', textAlign: 'left',
                        padding: '8px 10px', color: GRIS_SUAVE, fontSize: 10.5, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.05em',
                        borderBottom: `1px solid ${BORDE}`, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(f => {
                    const e = ESTADOS[f.estado]
                    return (
                      <tr key={f.fila} style={{ background: e.fondo, borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px 10px' }}>
                          <span style={{ display: 'block', width: 8, height: 8, borderRadius: 99, background: e.punto }} />
                        </td>
                        <td style={{ ...tabular, padding: '8px 10px', color: GRIS_SUAVE }}>{f.fila}</td>
                        <td style={{ padding: '8px 10px', color: TINTA, fontWeight: 600, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.nombre}>
                          {f.nombre}
                        </td>
                        <td style={{ padding: '8px 10px', color: GRIS, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.email}>
                          {f.email || '—'}
                        </td>
                        <td style={{ padding: '8px 10px', color: GRIS, whiteSpace: 'nowrap' }}>{f.giro || '—'}</td>
                        <td style={{ padding: '8px 10px', color: GRIS, whiteSpace: 'nowrap' }}>{f.nivel || '—'}</td>
                        <td style={{ padding: '8px 10px', color: GRIS, whiteSpace: 'nowrap' }}>{f.vendedor || '—'}</td>
                        <td style={{ padding: '8px 10px', color: e.color, minWidth: 220 }}>
                          <strong style={{ fontSize: 11.5 }}>{e.etiqueta}</strong>
                          {f.motivo && <span style={{ display: 'block', fontSize: 11.5, lineHeight: 1.4 }}>{f.motivo}</span>}
                        </td>
                      </tr>
                    )
                  })}
                  {visibles.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '28px 10px', textAlign: 'center', color: GRIS_SUAVE }}>
                        Todos los renglones se van a crear.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
              {plan.nuevos > 0 && plan.nuevos < plan.renglones && (
                <span style={{ fontSize: 12, color: GRIS }}>
                  Se crean los {plan.nuevos} nuevos; el resto se queda fuera.
                </span>
              )}
              <button onClick={onClose} style={{ ...btn('#fff', GRIS, '#d1d5db'), marginLeft: 'auto' }}>Cancelar</button>
              <button
                onClick={() => archivo && enviar(archivo, 'confirmar')}
                disabled={cargando || plan.nuevos === 0}
                style={btn(plan.nuevos === 0 ? '#e5e7eb' : ACENTO, plan.nuevos === 0 ? GRIS_SUAVE : '#fff')}
              >
                {cargando
                  ? 'Creando…'
                  : plan.nuevos === 0
                    ? 'Nada que crear'
                    : `Crear ${plan.nuevos} ${plan.nuevos === 1 ? 'cliente' : 'clientes'}`}
              </button>
            </div>
          </div>
        )}

        {!plan && !resultado && !error && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
            {cargando
              ? 'Leyendo el archivo…'
              : 'Descarga la plantilla, captura y súbela aquí. También puedes subir el archivo del botón Exportar Excel con renglones nuevos abajo.'}
          </div>
        )}
      </div>
    </div>
  )
}
