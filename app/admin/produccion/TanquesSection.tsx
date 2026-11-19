import Link from 'next/link'
import { createServerSupabaseClient } from '../../../src/lib/supabase-server'
import { esTerminal, fmtDias, fmtGravedad, fmtLitros } from '../../../src/lib/produccion'
import { BORDE, GRIS, GRIS_SUAVE, PISTA, TINTA, TINTA_MEDIA } from '../dash-ui'
import Icono from './Icono'
import {
  AMBAR, ICONOS, TANQUE_TIPO_LABEL, estaParado, etiquetaEtapa, vacio,
  type LoteFila, type TanqueFila,
} from './produccion-ui'

/**
 * Grid de tanques con su ocupacion.
 *
 * Server component: es una lectura sin interaccion. El CRUD de tanques vive
 * en Configuracion (super_admin / admin): aqui produccion los ve, no los
 * define — un tanque es una vasija fisica, no un dato de operacion diaria.
 *
 * El tanque vacio va en gris, como pidio el dueno del proyecto. Es la unica
 * senal de color de la pantalla junto con el lote parado: un tanque ocupado
 * es lo normal y no necesita destacarse.
 */
export default async function TanquesSection({ acento }: { acento: string }) {
  const supabase = await createServerSupabaseClient()

  const [{ data: tanques }, { data: lotes }] = await Promise.all([
    supabase.from('tanques').select('id, nombre, tipo, capacidad_litros, activo, notas').order('nombre'),
    supabase.from('lotes_vista').select('*'),
  ])

  const filas = (tanques || []) as TanqueFila[]
  const todos = (lotes || []) as LoteFila[]

  // El lote vivo de cada tanque. Un tanque no deberia tener dos (el alta solo
  // ofrece tanques libres), pero si pasara, se muestra el mas reciente y no
  // se esconde el conflicto: la leyenda lo dice.
  const ocupacion = new Map<string, LoteFila[]>()
  for (const l of todos) {
    if (!l.tanque_id || esTerminal(l.etapa)) continue
    const arr = ocupacion.get(l.tanque_id) || []
    arr.push(l)
    ocupacion.set(l.tanque_id, arr)
  }
  for (const arr of ocupacion.values()) {
    arr.sort((a, b) => (b.fecha_coccion || '').localeCompare(a.fecha_coccion || ''))
  }

  const activos = filas.filter(t => t.activo)
  const inactivos = filas.filter(t => !t.activo)

  if (filas.length === 0) {
    return (
      <div style={vacio}>
        <p style={{ margin: '0 0 6px', color: GRIS, fontSize: 14 }}>No hay tanques dados de alta.</p>
        <p style={{ margin: 0, fontSize: 12.5 }}>
          Se dan de alta en{' '}
          <Link href="/admin/configuracion?tab=tanques" style={{ color: acento, textDecoration: 'none', fontWeight: 600 }}>
            Configuración → Tanques
          </Link>
          .
        </p>
      </div>
    )
  }

  return (
    <>
      <style>{`
        .tq-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(238px, 1fr)); gap: 12px; }
      `}</style>

      <p style={{ margin: '0 0 14px', color: GRIS, fontSize: 12.5 }}>
        {ocupacion.size} de {activos.length} tanque{activos.length === 1 ? '' : 's'} activo
        {activos.length === 1 ? '' : 's'} ocupado{ocupacion.size === 1 ? '' : 's'}.
      </p>

      <div className="tq-grid">
        {activos.map(t => (
          <Tarjeta key={t.id} tanque={t} lotes={ocupacion.get(t.id) || []} />
        ))}
      </div>

      {inactivos.length > 0 && (
        <>
          <h2
            style={{
              margin: '26px 0 12px', color: GRIS, fontSize: 11.5, fontWeight: 600,
              textTransform: 'uppercase', letterSpacing: '0.07em',
            }}
          >
            Fuera de servicio
          </h2>
          <div className="tq-grid">
            {inactivos.map(t => (
              <Tarjeta key={t.id} tanque={t} lotes={ocupacion.get(t.id) || []} />
            ))}
          </div>
        </>
      )}
    </>
  )
}

function Tarjeta({ tanque, lotes }: { tanque: TanqueFila; lotes: LoteFila[] }) {
  const lote = lotes[0]
  const libre = !lote
  const parado = lote ? estaParado(lote.etapa, lote.dias_en_etapa) : false

  // Ocupacion contra la capacidad. Los litros reales cuando ya se midieron,
  // el objetivo mientras no: un lote recien encubado no esta vacio.
  const litros = lote ? (lote.litros_reales ?? lote.litros_objetivo) : null
  const pct = litros !== null && tanque.capacidad_litros > 0
    ? Math.min(100, Math.round((litros / tanque.capacidad_litros) * 100))
    : null

  return (
    <div
      style={{
        // El tanque vacio va en gris: fondo y texto apagados, sin borde de
        // color. Se lee como "disponible" sin tener que decirlo.
        background: libre ? PISTA : '#fff',
        border: `1px solid ${parado ? '#fcd34d' : BORDE}`,
        borderRadius: 11,
        padding: '14px 15px',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: tanque.activo ? 1 : 0.6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 7, color: libre ? GRIS : TINTA, fontSize: 14.5, fontWeight: 700 }}>
            <Icono d={ICONOS.tanque} size={15} style={{ color: libre ? GRIS_SUAVE : TINTA_MEDIA }} />
            {tanque.nombre}
          </p>
          <p style={{ margin: '3px 0 0', color: GRIS_SUAVE, fontSize: 11.5 }}>
            {TANQUE_TIPO_LABEL[tanque.tipo]} · {fmtLitros(tanque.capacidad_litros)}
          </p>
        </div>
        {libre && (
          <span style={{ color: GRIS_SUAVE, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Libre
          </span>
        )}
      </div>

      {lote ? (
        <>
          <div>
            <Link
              href={`/admin/produccion?lote=${lote.id}`}
              style={{ color: TINTA, fontSize: 13, fontWeight: 700, textDecoration: 'none', fontVariantNumeric: 'tabular-nums' }}
            >
              {lote.folio || '—'}
            </Link>
            <p style={{ margin: '2px 0 0', color: GRIS, fontSize: 12 }}>
              {lote.producto_nombre || '—'} · {etiquetaEtapa(lote.etapa)}
            </p>
          </div>

          {pct !== null && (
            <div>
              <div style={{ height: 5, background: PISTA, borderRadius: 99, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: GRIS_SUAVE, borderRadius: 99 }} />
              </div>
              <p style={{ margin: '5px 0 0', color: GRIS_SUAVE, fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
                {fmtLitros(litros)} de {fmtLitros(tanque.capacidad_litros)} · {pct}%
              </p>
            </div>
          )}

          <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', fontSize: 11.5 }}>
            <dt style={{ color: GRIS_SUAVE }}>En etapa</dt>
            <dd style={{ margin: 0, textAlign: 'right', color: parado ? AMBAR : TINTA_MEDIA, fontWeight: parado ? 600 : 400, fontVariantNumeric: 'tabular-nums' }}>
              {fmtDias(lote.dias_en_etapa)}
            </dd>
            <dt style={{ color: GRIS_SUAVE }}>Últ. gravedad</dt>
            <dd style={{ margin: 0, textAlign: 'right', color: lote.ultima_gravedad === null ? GRIS_SUAVE : TINTA_MEDIA, fontVariantNumeric: 'tabular-nums' }}>
              {lote.ultima_gravedad === null ? 'sin lecturas' : fmtGravedad(lote.ultima_gravedad)}
            </dd>
          </dl>

          {lotes.length > 1 && (
            <p style={{ margin: 0, color: AMBAR, fontSize: 11, lineHeight: 1.4, fontWeight: 600 }}>
              {lotes.length} lotes vivos asignados a este tanque. Revisa la asignación.
            </p>
          )}
        </>
      ) : (
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 12 }}>Sin lote asignado.</p>
      )}
    </div>
  )
}
