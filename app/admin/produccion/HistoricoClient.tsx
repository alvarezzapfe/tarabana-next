'use client'
import { useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Icono from './Icono'
import FichaLote from './FichaLote'
import { etiquetaFecha } from '../../../src/lib/fechas'
import {
  ETAPAS, FILTRO_VACIO, filtrarHistorico, historicoCsv,
  fmtAbv, fmtGravedad, fmtLitros, fmtPct,
  type FilaHistorico, type FiltroHistorico,
} from '../../../src/lib/produccion'
import { BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA } from '../dash-ui'
import {
  AMBAR, ICONOS, botonNeutro, etiquetaEtapa, inputBase, labelBase, vacio,
  type LoteFila,
} from './produccion-ui'

/**
 * Historico de lotes: tabla filtrable y export a CSV.
 *
 * El export respeta los filtros. Un boton que baja todo mientras la pantalla
 * muestra un subconjunto entrega un archivo que no es lo que el usuario esta
 * viendo, y eso se descubre cuando ya lo mando por correo.
 */

const CSS = `
  .hi-filtros { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: 10px; align-items: end; }
  .hi-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 11px; }
  .hi-tabla { width: 100%; border-collapse: collapse; font-size: 12.5px; min-width: 980px; }
  .hi-fila:hover { background: #f9fafb; }
  @media (max-width: 900px) { .hi-filtros { grid-template-columns: 1fr 1fr; } }
`

const COLS: { label: string; alinear?: 'right' }[] = [
  { label: 'Folio' },
  { label: 'Producto' },
  { label: 'Etapa' },
  { label: 'Tanque' },
  { label: 'Cocción' },
  { label: 'Liberado' },
  { label: 'Reales', alinear: 'right' },
  { label: 'Envasados', alinear: 'right' },
  { label: 'Merma', alinear: 'right' },
  { label: 'OG / FG', alinear: 'right' },
  { label: 'ABV', alinear: 'right' },
]

export default function HistoricoClient({ lotes, acento }: { lotes: LoteFila[]; acento: string }) {
  const router = useRouter()
  const params = useSearchParams()
  const loteAbierto = params.get('lote')

  const [filtro, setFiltro] = useState<FiltroHistorico>(FILTRO_VACIO)
  const set = (k: keyof FiltroHistorico, v: string) => setFiltro(f => ({ ...f, [k]: v }))

  const estilos = useMemo(
    () => [...new Set(lotes.map(l => l.producto_estilo).filter((e): e is string => !!e))].sort(),
    [lotes]
  )

  const filas = useMemo(() => filtrarHistorico(lotes, filtro), [lotes, filtro])

  const hayFiltro = filtro.estilo || filtro.etapa || filtro.desde || filtro.hasta

  const exportar = () => {
    const csv = historicoCsv(filas.map(toFilaCsv))
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `lotes-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const abrir = (id: string | null) => {
    const q = new URLSearchParams(params.toString())
    if (id) q.set('lote', id)
    else q.delete('lote')
    router.replace(`/admin/produccion?${q}`, { scroll: false })
  }

  const ficha = loteAbierto ? lotes.find(l => l.id === loteAbierto) : undefined

  return (
    <>
      <style>{CSS}</style>

      <div className="hi-filtros" style={{ marginBottom: 16 }}>
        <label>
          <span style={labelBase}>Estilo</span>
          <select style={inputBase} value={filtro.estilo} onChange={e => set('estilo', e.target.value)}>
            <option value="">Todos</option>
            {estilos.map(e => <option key={e} value={e}>{e}</option>)}
          </select>
        </label>
        <label>
          <span style={labelBase}>Etapa</span>
          <select style={inputBase} value={filtro.etapa} onChange={e => set('etapa', e.target.value)}>
            <option value="">Todas</option>
            {ETAPAS.map(e => <option key={e} value={e}>{etiquetaEtapa(e)}</option>)}
          </select>
        </label>
        <label>
          <span style={labelBase}>Cocción desde</span>
          <input style={inputBase} type="date" value={filtro.desde} onChange={e => set('desde', e.target.value)} />
        </label>
        <label>
          <span style={labelBase}>Hasta</span>
          <input style={inputBase} type="date" value={filtro.hasta} onChange={e => set('hasta', e.target.value)} />
        </label>
        <button
          onClick={exportar}
          disabled={filas.length === 0}
          title={hayFiltro ? 'Exporta los lotes filtrados' : 'Exporta todos los lotes'}
          style={{
            ...botonNeutro,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            opacity: filas.length === 0 ? 0.5 : 1,
            cursor: filas.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          <Icono d={ICONOS.descargar} size={15} />
          CSV
        </button>
      </div>

      <p style={{ margin: '0 0 12px', color: GRIS, fontSize: 12.5 }}>
        {filas.length === lotes.length
          ? `${lotes.length} lote${lotes.length === 1 ? '' : 's'}.`
          : `${filas.length} de ${lotes.length} lotes.`}
        {hayFiltro && (
          <button
            onClick={() => setFiltro(FILTRO_VACIO)}
            style={{ marginLeft: 8, background: 'none', border: 'none', padding: 0, color: acento, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Limpiar filtros
          </button>
        )}
      </p>

      {filas.length === 0 ? (
        <div style={vacio}>
          {lotes.length === 0 ? 'No hay lotes registrados.' : 'Ningún lote cumple los filtros.'}
        </div>
      ) : (
        <div className="hi-wrap">
          <table className="hi-tabla">
            <thead>
              <tr style={{ background: PISTA }}>
                {COLS.map(c => (
                  <th
                    key={c.label}
                    style={{
                      color: GRIS, fontSize: 10.5, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: '0.06em', textAlign: c.alinear || 'left',
                      padding: '9px 11px', whiteSpace: 'nowrap',
                    }}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filas.map(l => (
                <tr key={l.id} className="hi-fila" style={{ borderTop: `1px solid ${BORDE}` }}>
                  <td style={{ padding: '9px 11px' }}>
                    <button
                      onClick={() => abrir(l.id)}
                      style={{
                        background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                        color: TINTA, fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {l.folio || '—'}
                    </button>
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA }}>
                    {l.producto_nombre || '—'}
                    {l.producto_estilo && <span style={{ color: GRIS_SUAVE }}> · {l.producto_estilo}</span>}
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA, whiteSpace: 'nowrap' }}>
                    {etiquetaEtapa(l.etapa)}
                  </td>
                  <td style={{ padding: '9px 11px', color: l.tanque_nombre ? TINTA_MEDIA : GRIS_SUAVE }}>
                    {l.tanque_nombre || '—'}
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA, whiteSpace: 'nowrap' }}>
                    {etiquetaFecha(l.fecha_coccion)}
                  </td>
                  <td style={{ padding: '9px 11px', color: l.fecha_liberado ? TINTA_MEDIA : GRIS_SUAVE, whiteSpace: 'nowrap' }}>
                    {l.fecha_liberado ? etiquetaFecha(l.fecha_liberado.slice(0, 10)) : '—'}
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtLitros(l.litros_reales)}
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {fmtLitros(l.litros_envasados)}
                  </td>
                  <td
                    style={{
                      padding: '9px 11px', textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                      color: l.merma_pct === null ? GRIS_SUAVE : l.merma_pct > 10 ? AMBAR : TINTA_MEDIA,
                      fontWeight: l.merma_pct !== null && l.merma_pct > 10 ? 600 : 400,
                    }}
                    title={l.merma_litros === null ? 'Falta capturar litros reales o envasado' : undefined}
                  >
                    {l.merma_pct === null ? '—' : fmtPct(l.merma_pct)}
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {l.og === null && l.fg === null ? '—' : `${fmtGravedad(l.og)} / ${fmtGravedad(l.fg)}`}
                  </td>
                  <td style={{ padding: '9px 11px', color: TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                    {fmtAbv(l.abv)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ficha && (
        <FichaLote
          key={ficha.id}
          lote={ficha}
          // El Historico es de consulta: lo que se edita se edita en el
          // Tablero, donde esta el lote vivo.
          canEdit={false}
          acento={acento}
          onCerrar={() => abrir(null)}
          onCambio={() => router.refresh()}
        />
      )}
    </>
  )
}

/** LoteFila -> la fila que el CSV espera. */
function toFilaCsv(l: LoteFila): FilaHistorico {
  return {
    folio: l.folio,
    producto_nombre: l.producto_nombre,
    producto_estilo: l.producto_estilo,
    etapa: l.etapa,
    tanque_nombre: l.tanque_nombre,
    fecha_coccion: l.fecha_coccion,
    fecha_envasado: l.fecha_envasado,
    fecha_liberado: l.fecha_liberado,
    litros_objetivo: l.litros_objetivo,
    litros_reales: l.litros_reales,
    litros_envasados: l.litros_envasados,
    merma_litros: l.merma_litros,
    merma_pct: l.merma_pct,
    og: l.og,
    fg: l.fg,
    abv: l.abv,
    levadura_cepa: l.levadura_cepa,
  }
}
