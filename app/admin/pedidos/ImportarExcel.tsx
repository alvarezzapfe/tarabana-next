'use client'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Carga masiva de pedidos desde Excel.
 *
 * Dos pasos sobre el mismo archivo: subir (vista previa, no crea nada) y
 * confirmar. El archivo se vuelve a mandar al confirmar en vez de mandar el
 * plan que tiene el navegador, para que lo que se crea sea exactamente lo
 * que el servidor valido y la persona aprobo.
 */

const ACENTO = '#D95F2E'
const ROJO = '#dc2626'
const BORDE = '#e5e7eb'
const GRIS = '#6b7280'
const GRIS_SUAVE = '#9ca3af'
const TINTA = '#111827'

const moneda = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`
const tabular = { fontVariantNumeric: 'tabular-nums' } as const

type ErrorFila = { fila: number | null; mensaje: string }
type Partida = {
  filas: number[]
  producto: string
  presentacionLabel: string
  cantidad: number
  precioUnitario: number
  subtotal: number
}
type PedidoPlan = {
  referencia: string
  clienteNombre: string
  nivelPrecio: string | null
  condiciones_pago: string
  costo_envio: number
  descuento_tipo: string | null
  descuento_valor: number | null
  descuentoMonto: number
  partidas: Partida[]
  subtotal: number
  total: number
  errores: ErrorFila[]
  valido: boolean
}
type Plan = {
  renglones: number
  validos: number
  invalidos: number
  totalValido: number
  pedidos: PedidoPlan[]
}
type Resultado = {
  creados: { referencia: string; pedido_id: string; total: number }[]
  fallidos: { referencia: string; error: string }[]
  omitidos: number
  total: number
}

type Props = {
  /** Cierra el modal. */
  onClose: () => void
  /** Si quien sube es admin: la plantilla trae envio y descuento. */
  puedeDescuento: boolean
}

export default function ImportarExcel({ onClose, puedeDescuento }: Props) {
  const router = useRouter()
  const inputRef = useRef<HTMLInputElement>(null)

  const [archivo, setArchivo] = useState<File | null>(null)
  const [plan, setPlan] = useState<Plan | null>(null)
  const [avisos, setAvisos] = useState<string[]>([])
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)
  const [abierta, setAbierta] = useState<string | null>(null)

  async function enviar(file: File, modo: 'preview' | 'confirmar') {
    setCargando(true)
    setError('')
    const body = new FormData()
    body.set('archivo', file)
    body.set('modo', modo)

    try {
      const res = await fetch('/api/admin/pedidos/importar', { method: 'POST', body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(json.error || 'No se pudo procesar el archivo.')
        return
      }
      setAvisos(json.avisos || [])
      if (modo === 'preview') {
        setPlan(json.plan)
        setResultado(null)
      } else {
        setResultado({
          creados: json.creados || [],
          fallidos: json.fallidos || [],
          omitidos: json.omitidos || 0,
          total: json.total || 0,
        })
        setPlan(null)
        router.refresh()
      }
    } catch {
      setError('Se cayo la conexion al subir el archivo.')
    } finally {
      setCargando(false)
    }
  }

  const elegir = (file: File | null) => {
    setPlan(null)
    setResultado(null)
    setError('')
    setAvisos([])
    setArchivo(file)
    if (file) enviar(file, 'preview')
  }

  const btn = (fondo: string, color: string, borde = 'transparent') => ({
    padding: '9px 16px', background: fondo, border: `1px solid ${borde}`, borderRadius: 8,
    color, fontSize: 13, fontWeight: 600 as const, cursor: cargando ? 'default' : 'pointer',
    opacity: cargando ? 0.6 : 1, whiteSpace: 'nowrap' as const,
  })

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(17,24,39,0.35)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 120, padding: '40px 16px', overflowY: 'auto' }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 940, padding: '24px 26px', boxShadow: '0 16px 48px rgba(17,24,39,0.18)' }}
      >
        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: TINTA }}>Carga masiva de pedidos</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12.5, color: GRIS }}>
              Un renglón por partida. Los renglones con la misma referencia se juntan en un pedido.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: GRIS_SUAVE, fontSize: 20, lineHeight: 1, padding: 2 }}
          >
            ×
          </button>
        </div>

        {/* Paso 1 y 2 */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 18 }}>
          <a
            href="/api/admin/pedidos/plantilla"
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
          {!puedeDescuento && (
            <span style={{ marginLeft: 'auto', fontSize: 11.5, color: GRIS_SUAVE }}>
              Sin columnas de descuento ni envío: son de admin.
            </span>
          )}
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
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: resultado.creados.length ? '#15803d' : '#b91c1c' }}>
                {resultado.creados.length === 0
                  ? 'No se creó ningún pedido.'
                  : `Se crearon ${resultado.creados.length} ${resultado.creados.length === 1 ? 'pedido' : 'pedidos'} por ${moneda(resultado.total)}.`}
              </p>
              {(resultado.fallidos.length > 0 || resultado.omitidos > 0) && (
                <p style={{ margin: '6px 0 0', fontSize: 12.5, color: GRIS }}>
                  {resultado.fallidos.length > 0 && `${resultado.fallidos.length} ${resultado.fallidos.length === 1 ? 'falló' : 'fallaron'} al crearse. `}
                  {resultado.omitidos > 0 && `${resultado.omitidos} se omitieron por errores del archivo.`}
                </p>
              )}
            </div>

            {resultado.fallidos.length > 0 && (
              <div style={{ border: `1px solid ${BORDE}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: GRIS_SUAVE }}>
                  No se crearon
                </p>
                {resultado.fallidos.map(f => (
                  <p key={f.referencia} style={{ margin: '0 0 5px', fontSize: 12.5, color: ROJO }}>
                    <strong>{f.referencia}</strong> — {f.error}
                  </p>
                ))}
              </div>
            )}

            {resultado.creados.length > 0 && (
              <div style={{ border: `1px solid ${BORDE}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: GRIS_SUAVE }}>
                  Creados
                </p>
                {resultado.creados.map(c => (
                  <p key={c.pedido_id} style={{ margin: '0 0 5px', fontSize: 12.5, color: '#374151', display: 'flex', gap: 10 }}>
                    <span style={{ minWidth: 90 }}><strong>{c.referencia}</strong></span>
                    <a href={`/admin/pedidos/${c.pedido_id}/edit`} className="font-mono" style={{ color: ACENTO, textDecoration: 'none' }}>
                      #{c.pedido_id.slice(-6).toUpperCase()}
                    </a>
                    <span style={{ ...tabular, marginLeft: 'auto' }}>{moneda(c.total)}</span>
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
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', padding: '12px 16px', background: '#fafafa', border: `1px solid ${BORDE}`, borderRadius: 10, marginBottom: 14 }}>
              {[
                { l: 'Renglones', v: String(plan.renglones) },
                { l: 'Pedidos listos', v: String(plan.validos), c: plan.validos ? '#15803d' : GRIS },
                { l: 'Con errores', v: String(plan.invalidos), c: plan.invalidos ? ROJO : GRIS },
                { l: 'Total a crear', v: moneda(plan.totalValido), c: ACENTO },
              ].map(k => (
                <div key={k.l}>
                  <p style={{ margin: 0, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.07em', color: GRIS_SUAVE, fontWeight: 600 }}>{k.l}</p>
                  <p style={{ ...tabular, margin: '2px 0 0', fontSize: 17, fontWeight: 700, color: k.c || TINTA }}>{k.v}</p>
                </div>
              ))}
            </div>

            <p style={{ margin: '0 0 10px', fontSize: 12, color: GRIS }}>
              Nada se ha creado todavía. Revisa y confirma.
            </p>

            <div style={{ maxHeight: 420, overflowY: 'auto', border: `1px solid ${BORDE}`, borderRadius: 10 }}>
              {plan.pedidos.map(p => {
                const expandido = abierta === p.referencia
                return (
                  <div key={p.referencia} style={{ borderBottom: `1px solid #f3f4f6` }}>
                    <div
                      onClick={() => setAbierta(expandido ? null : p.referencia)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', cursor: 'pointer', background: p.valido ? '#fff' : '#fffbfb' }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: 99, background: p.valido ? '#22c55e' : ROJO, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: TINTA, minWidth: 90 }}>{p.referencia}</span>
                      <span style={{ fontSize: 12.5, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={p.clienteNombre}>
                        {p.clienteNombre}
                      </span>
                      <span style={{ fontSize: 11.5, color: GRIS_SUAVE, whiteSpace: 'nowrap' }}>
                        {p.partidas.length} {p.partidas.length === 1 ? 'partida' : 'partidas'}
                      </span>
                      <span style={{ ...tabular, fontSize: 13, fontWeight: 700, color: p.valido ? TINTA : GRIS_SUAVE, minWidth: 80, textAlign: 'right' }}>
                        {p.valido ? moneda(p.total) : '—'}
                      </span>
                      <span style={{ color: GRIS_SUAVE, fontSize: 11 }}>{expandido ? '▲' : '▼'}</span>
                    </div>

                    {/* Errores: siempre visibles, no hay que expandir para verlos. */}
                    {p.errores.length > 0 && (
                      <div style={{ padding: '0 14px 11px 34px' }}>
                        {p.errores.map((e, i) => (
                          <p key={i} style={{ margin: '0 0 4px', fontSize: 12, color: ROJO }}>
                            {e.fila !== null && (
                              <span style={{ ...tabular, display: 'inline-block', minWidth: 62, color: '#991b1b', fontWeight: 600 }}>
                                Renglón {e.fila}
                              </span>
                            )}
                            {e.mensaje}
                          </p>
                        ))}
                      </div>
                    )}

                    {expandido && p.partidas.length > 0 && (
                      <div style={{ padding: '0 14px 12px 34px', background: '#fafafa' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>
                              {['Renglón', 'Producto', 'Presentación', 'Cant.', 'P. unitario', 'Subtotal'].map((h, i) => (
                                <th key={h} style={{ textAlign: i >= 3 ? 'right' : 'left', padding: '7px 6px', color: GRIS_SUAVE, fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {p.partidas.map((it, i) => (
                              <tr key={i} style={{ borderTop: '1px solid #eef0f2' }}>
                                <td style={{ ...tabular, padding: '6px', color: GRIS_SUAVE }}>{it.filas.join(', ')}</td>
                                <td style={{ padding: '6px', color: '#374151' }}>{it.producto}</td>
                                <td style={{ padding: '6px', color: GRIS }}>{it.presentacionLabel}</td>
                                <td style={{ ...tabular, padding: '6px', textAlign: 'right' }}>{it.cantidad}</td>
                                <td style={{ ...tabular, padding: '6px', textAlign: 'right', color: GRIS }}>
                                  {it.precioUnitario > 0 ? moneda(it.precioUnitario) : '—'}
                                </td>
                                <td style={{ ...tabular, padding: '6px', textAlign: 'right', fontWeight: 600 }}>
                                  {it.subtotal > 0 ? moneda(it.subtotal) : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', paddingTop: 9, marginTop: 4, borderTop: `1px solid ${BORDE}`, fontSize: 11.5, color: GRIS }}>
                          <span>Condiciones: {p.condiciones_pago.replace('_', ' ')}</span>
                          {p.nivelPrecio && <span>Nivel: {p.nivelPrecio === 'taproom' ? 'mayorista' : p.nivelPrecio}</span>}
                          {p.descuentoMonto > 0 && (
                            <span>Descuento: −{moneda(p.descuentoMonto)}{p.descuento_tipo === 'porcentaje' && ` (${p.descuento_valor}%)`}</span>
                          )}
                          {p.costo_envio > 0 && <span>Envío: {moneda(p.costo_envio)}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
              {plan.invalidos > 0 && plan.validos > 0 && (
                <span style={{ fontSize: 12, color: GRIS }}>
                  Se crean los {plan.validos} que están listos; los {plan.invalidos} con errores se quedan fuera.
                </span>
              )}
              <button onClick={onClose} style={{ ...btn('#fff', GRIS, '#d1d5db'), marginLeft: 'auto' }}>Cancelar</button>
              <button
                onClick={() => archivo && enviar(archivo, 'confirmar')}
                disabled={cargando || plan.validos === 0}
                style={btn(plan.validos === 0 ? '#e5e7eb' : ACENTO, plan.validos === 0 ? GRIS_SUAVE : '#fff')}
              >
                {cargando
                  ? 'Creando…'
                  : plan.validos === 0
                    ? 'Nada que crear'
                    : `Confirmar ${plan.validos} ${plan.validos === 1 ? 'pedido' : 'pedidos'}`}
              </button>
            </div>
          </div>
        )}

        {/* Estado inicial */}
        {!plan && !resultado && !error && (
          <div style={{ padding: '28px 0', textAlign: 'center', color: GRIS_SUAVE, fontSize: 13 }}>
            {cargando ? 'Leyendo el archivo…' : 'Descarga la plantilla, captura y súbela aquí.'}
          </div>
        )}
      </div>
    </div>
  )
}
