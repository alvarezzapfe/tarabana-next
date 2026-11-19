'use client'
import { useCallback, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import KpiCard from '../KpiCard'
import Icono from './Icono'
import FichaLote from './FichaLote'
import NuevoLote from './NuevoLote'
import {
  ETAPAS_TABLERO, esTerminal, siguienteEtapa, puedeAvanzar,
  mermaDelPeriodo, ventanaDias,
  fmtDias, fmtGravedad, fmtLitros, fmtPct,
  type Etapa,
} from '../../../src/lib/produccion'
import { BORDE, GRIS, GRIS_SUAVE, TINTA, TINTA_MEDIA, enteros } from '../dash-ui'
import {
  AMBAR, COLUMNA_FONDO, ICONOS, estaParado, etiquetaEtapa,
  type LoteFila, type ProductoFila, type TanqueFila,
} from './produccion-ui'

/**
 * Tablero kanban de lotes.
 *
 * Una columna por etapa viva. Liberado no es columna: el lote ya salio a
 * inventario y dejarlo ahi haria crecer el tablero para siempre. Descartado
 * tampoco: es una salida, no un lugar donde esperar. Los dos se ven en
 * Historico.
 *
 * El color es senal: las tarjetas son neutras y solo se tinta el lote que
 * lleva mas dias de lo normal en su etapa (ver DIAS_NORMALES). Con siete
 * etapas de siete colores, ninguno significaria nada.
 *
 * La ficha vive en la URL (`?lote=<id>`), igual que el panel de un pedido:
 * asi se comparte por link y el boton Atras la cierra.
 */

const ANCHO_COLUMNA = 260

const CSS = `
  .tb-cols { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; align-items: flex-start; }
  .tb-col { width: ${ANCHO_COLUMNA}px; flex: 0 0 ${ANCHO_COLUMNA}px; }
  .tb-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
  .tb-card { transition: border-color 120ms ease, box-shadow 120ms ease; }
  .tb-card:hover { border-color: #d1d5db; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .tb-avanzar:hover:not(:disabled) { background: #f9fafb; border-color: #d1d5db; }
  @media (max-width: 1100px) { .tb-kpis { grid-template-columns: repeat(2, 1fr); } }
  @media (max-width: 560px) { .tb-kpis { grid-template-columns: 1fr; } }
`

type Props = {
  lotes: LoteFila[]
  tanques: TanqueFila[]
  productos: ProductoFila[]
  canEdit: boolean
  ahoraISO: string
}

export default function TableroClient({ lotes, tanques, productos, canEdit, ahoraISO }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const loteAbierto = params.get('lote')

  // El modal de alta se abre desde la URL, porque el boton que lo dispara
  // vive en la cabecera (Tabs acciones) y es un Link del server component.
  const nuevoAbierto = params.get('nuevo') === '1'
  const [avanzando, setAvanzando] = useState<string | null>(null)
  const [error, setError] = useState('')

  // ── KPIs ──
  // Se calculan de las MISMAS filas que pintan el kanban, para que el numero
  // de arriba y las tarjetas de abajo no puedan discrepar.
  const activos = useMemo(() => lotes.filter(l => !esTerminal(l.etapa)), [lotes])

  const kpis = useMemo(() => {
    // Litros en proceso: los reales cuando ya se midieron, el objetivo
    // mientras no. Un lote planeado todavia no tiene litros reales, y
    // contarlo como 0 diria que la fabrica esta vacia cuando no lo esta.
    const litros = activos.reduce((a, l) => a + (l.litros_reales ?? l.litros_objetivo ?? 0), 0)

    const tanquesActivos = tanques.filter(t => t.activo)
    const ocupados = new Set(activos.map(l => l.tanque_id).filter(Boolean)).size

    const { desde, hasta } = ventanaDias(90, new Date(ahoraISO))
    const merma = mermaDelPeriodo(
      lotes.map(l => ({
        litros_reales: l.litros_reales,
        litros_envasados: l.litros_envasados,
        fecha_liberado: l.fecha_liberado,
      })),
      desde,
      hasta
    )

    return { litros, ocupados, totalTanques: tanquesActivos.length, merma }
  }, [activos, lotes, tanques, ahoraISO])

  const porEtapa = useMemo(() => {
    const m = new Map<Etapa, LoteFila[]>()
    for (const e of ETAPAS_TABLERO) m.set(e, [])
    for (const l of activos) m.get(l.etapa)?.push(l)
    // Dentro de cada columna, el que lleva mas tiempo parado va arriba: es el
    // que hay que atender.
    for (const arr of m.values()) arr.sort((a, b) => b.dias_en_etapa - a.dias_en_etapa)
    return m
  }, [activos])

  const abrir = useCallback((id: string | null) => {
    const q = new URLSearchParams(params.toString())
    if (id) q.set('lote', id)
    else q.delete('lote')
    router.replace(q.size ? `/admin/produccion?${q}` : '/admin/produccion', { scroll: false })
  }, [params, router])

  const cerrarNuevo = useCallback(() => {
    const q = new URLSearchParams(params.toString())
    q.delete('nuevo')
    router.replace(q.size ? `/admin/produccion?${q}` : '/admin/produccion', { scroll: false })
  }, [params, router])

  const avanzar = async (lote: LoteFila, destino: Etapa) => {
    setError('')
    setAvanzando(lote.id)
    try {
      const res = await fetch(`/api/admin/produccion/lotes/${lote.id}/avanzar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ etapa: destino }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'No se pudo avanzar el lote')
        return
      }
      router.refresh()
    } finally {
      setAvanzando(null)
    }
  }

  const ficha = loteAbierto ? lotes.find(l => l.id === loteAbierto) : undefined

  return (
    <>
      <style>{CSS}</style>

      <div className="tb-kpis">
        <KpiCard label="Lotes activos" valor={enteros(activos.length)} detalle={`${lotes.length} en total`} />
        <KpiCard label="Litros en proceso" valor={fmtLitros(kpis.litros)} detalle="reales, u objetivo si falta medir" />
        <KpiCard
          label="Tanques ocupados"
          valor={`${kpis.ocupados} / ${kpis.totalTanques}`}
          detalle={kpis.totalTanques === 0 ? 'sin tanques dados de alta' : undefined}
          senal={kpis.totalTanques > 0 && kpis.ocupados === kpis.totalTanques ? 'alerta' : 'neutral'}
        />
        <KpiCard
          label="Merma 90 días"
          valor={fmtPct(kpis.merma.pct)}
          detalle={
            kpis.merma.pct === null
              ? 'sin lotes liberados con litros capturados'
              : `${fmtLitros(kpis.merma.litros)} en ${kpis.merma.lotes} lote${kpis.merma.lotes === 1 ? '' : 's'}` +
                (kpis.merma.sinDatos > 0 ? ` · ${kpis.merma.sinDatos} sin datos` : '')
          }
        />
      </div>

      {/* Con cero lotes no se dice nada: las columnas vacias ya lo comunican,
          y un renglon de texto encima solo mete ruido en una pantalla que ya
          esta vacia. El alta vive en la cabecera. */}
      {activos.length > 0 && (
        <p style={{ margin: '0 0 14px', color: GRIS, fontSize: 12.5 }}>
          {activos.length} lote{activos.length === 1 ? '' : 's'} en proceso.
        </p>
      )}

      {error && (
        <div
          role="alert"
          style={{
            background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c',
            borderRadius: 8, padding: '10px 13px', fontSize: 13, marginBottom: 14,
          }}
        >
          {error}
        </div>
      )}

      <div className="tb-cols">
        {ETAPAS_TABLERO.map(etapa => {
          const items = porEtapa.get(etapa) || []
          return (
            <div key={etapa} className="tb-col">
              <div
                style={{
                  display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
                  gap: 8, padding: '0 4px 8px',
                }}
              >
                <h2
                  style={{
                    margin: 0, color: TINTA, fontSize: 12, fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.07em',
                  }}
                >
                  {etiquetaEtapa(etapa)}
                </h2>
                <span style={{ color: GRIS_SUAVE, fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
                  {items.length}
                </span>
              </div>

              <div
                style={{
                  background: COLUMNA_FONDO, borderRadius: 10, padding: 8,
                  display: 'flex', flexDirection: 'column', gap: 8, minHeight: 90,
                }}
              >
                {items.length === 0 ? (
                  <p style={{ margin: 0, padding: '18px 8px', color: GRIS_SUAVE, fontSize: 12, textAlign: 'center' }}>
                    Vacío
                  </p>
                ) : (
                  items.map(l => (
                    <TarjetaLote
                      key={l.id}
                      lote={l}
                      canEdit={canEdit}
                      avanzando={avanzando === l.id}
                      onAbrir={() => abrir(l.id)}
                      onAvanzar={destino => avanzar(l, destino)}
                    />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      {ficha && (
        <FichaLote
          // `key` por lote: el panel se remonta al cambiar de lote, asi su
          // estado de carga nace limpio sin un setState dentro del efecto.
          key={ficha.id}
          lote={ficha}
          canEdit={canEdit}
          onCerrar={() => abrir(null)}
          onCambio={() => router.refresh()}
        />
      )}

      {nuevoAbierto && (
        <NuevoLote
          productos={productos}
          // Solo tanques libres: un tanque con lote vivo adentro no puede
          // recibir otro, y ofrecerlo seria ofrecer un error.
          tanquesLibres={tanques.filter(
            t => t.activo && !activos.some(l => l.tanque_id === t.id)
          )}
          onCerrar={cerrarNuevo}
          onCreado={() => { cerrarNuevo(); router.refresh() }}
        />
      )}
    </>
  )
}

// ── Tarjeta ─────────────────────────────────────────────────

function TarjetaLote({
  lote, canEdit, avanzando, onAbrir, onAvanzar,
}: {
  lote: LoteFila
  canEdit: boolean
  avanzando: boolean
  onAbrir: () => void
  onAvanzar: (destino: Etapa) => void
}) {
  const destino = siguienteEtapa(lote.etapa)

  // `litros_envasados` sale de un left join agrupado: es null cuando el lote
  // no tiene NI UN renglon de envasado, y un numero cuando tiene al menos
  // uno. Es lo que la vista expone del conteo que la funcion SQL hace con
  // `count(*)`, y alcanza para la unica pregunta de aqui: hay envasado o no.
  const tieneEnvasado = lote.litros_envasados !== null

  const veredicto = destino
    ? puedeAvanzar(
        { etapa: lote.etapa, fg: lote.fg, envasado: tieneEnvasado ? 1 : 0 },
        destino
      )
    : null

  const parado = estaParado(lote.etapa, lote.dias_en_etapa)

  return (
    <div
      className="tb-card"
      style={{
        background: '#fff',
        border: `1px solid ${parado ? '#fcd34d' : BORDE}`,
        borderRadius: 9,
        padding: '11px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <button
        onClick={onAbrir}
        style={{
          background: 'none', border: 'none', padding: 0, textAlign: 'left',
          cursor: 'pointer', font: 'inherit', display: 'flex', flexDirection: 'column', gap: 3,
        }}
      >
        <span
          style={{
            color: TINTA, fontSize: 13.5, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
          }}
        >
          {lote.folio || '—'}
        </span>
        <span style={{ color: TINTA_MEDIA, fontSize: 12.5 }}>
          {lote.producto_nombre || '—'}
          {lote.producto_estilo && (
            <span style={{ color: GRIS_SUAVE }}> · {lote.producto_estilo}</span>
          )}
        </span>
      </button>

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 11.5 }}>
        <dt style={{ color: GRIS_SUAVE }}>Tanque</dt>
        <dd style={{ margin: 0, color: lote.tanque_nombre ? TINTA_MEDIA : GRIS_SUAVE, textAlign: 'right' }}>
          {lote.tanque_nombre || 'sin asignar'}
        </dd>

        <dt style={{ color: GRIS_SUAVE }}>En etapa</dt>
        <dd
          style={{
            margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
            color: parado ? AMBAR : TINTA_MEDIA, fontWeight: parado ? 600 : 400,
          }}
          title={parado ? 'Lleva más días de lo normal en esta etapa' : undefined}
        >
          {fmtDias(lote.dias_en_etapa)}
        </dd>

        <dt style={{ color: GRIS_SUAVE }}>Gravedad</dt>
        <dd style={{ margin: 0, color: lote.ultima_gravedad === null ? GRIS_SUAVE : TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {lote.ultima_gravedad === null ? 'sin lecturas' : fmtGravedad(lote.ultima_gravedad)}
        </dd>
      </dl>

      {canEdit && destino && (
        <button
          className="tb-avanzar"
          onClick={() => onAvanzar(destino)}
          disabled={avanzando || !veredicto?.ok}
          title={veredicto?.ok ? `Avanzar a ${etiquetaEtapa(destino).toLowerCase()}` : veredicto?.motivo}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 7,
            padding: '6px 10px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            color: veredicto?.ok ? TINTA_MEDIA : GRIS_SUAVE,
            cursor: veredicto?.ok && !avanzando ? 'pointer' : 'not-allowed',
          }}
        >
          {avanzando ? 'Avanzando…' : `Avanzar a ${etiquetaEtapa(destino).toLowerCase()}`}
          {!avanzando && <Icono d={ICONOS.avanzar} size={13} strokeWidth={2.2} />}
        </button>
      )}

      {canEdit && destino && veredicto && !veredicto.ok && (
        // El motivo se dice, no se esconde en el title: un boton gris sin
        // explicacion obliga a adivinar que falta.
        <p style={{ margin: 0, color: GRIS, fontSize: 11, lineHeight: 1.35 }}>{veredicto.motivo}</p>
      )}
    </div>
  )
}
