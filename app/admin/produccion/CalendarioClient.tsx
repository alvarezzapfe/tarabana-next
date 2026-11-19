'use client'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FichaLote from './FichaLote'
import { etiquetaDiaCorto, etiquetaFecha, etiquetaMesCorto, inicioSemana, sumarDias } from '../../../src/lib/fechas'
import {
  carrilesDe, hayTraslape, indiceDia, tramosPorTanque, ventana,
  type Tramo,
} from '../../../src/lib/calendario-tanques'
import { BORDE, GRIS, GRIS_SUAVE, MOVIL_MAX, PISTA, TINTA, TINTA_MEDIA } from '../dash-ui'
import { AMBAR, TANQUE_TIPO_LABEL, vacio, type LoteFila, type OcupacionFila, type TanqueFila } from './produccion-ui'

/**
 * Gantt de ocupacion de tanques.
 *
 * ── Por que CSS grid y no SVG ni la geometria de GraficaPeriodo ──
 *
 * Grid porque una barra es UN elemento con `grid-column: inicio / span n`:
 * cero aritmetica de pixeles, y por lo tanto cero posibilidad de que una
 * barra y su marca del encabezado se desfasen por redondeo, que es el error
 * clasico de un Gantt hecho a mano.
 *
 * No SVG porque una barra tiene que ser un link con texto que se recorte y un
 * blanco tocable; un `<rect>` no es ninguna de las tres cosas, y la columna
 * de nombres necesita `position: sticky`, que en SVG no existe.
 *
 * No la geometria de fracciones de `GraficaPeriodo` porque esa existe para
 * alinear una linea SVG estirada con el centro de unas columnas con hueco
 * entre ellas. Aqui los dias son contiguos (hueco = 0), asi que ese calculo
 * degenera en `i / dias` y no hay overlay que alinear.
 *
 * ── Lo que las barras dicen y lo que no ──
 *
 * Macizo = lo que PASO (tramo cerrado, o la parte ya transcurrida).
 * Punteado = ESTIMACION a partir de la receta.
 * Sin cierre a la derecha = el lote sigue ahi y no se sabe hasta cuando,
 * porque su producto no tiene receta completa. No se le invent un fin: usar
 * los umbrales de DIAS_NORMALES seria presentar un umbral de atencion como si
 * fuera un plan.
 *
 * Las etapas NO se pintan de colores, igual que en el tablero. El unico
 * acento es ambar, y solo para un traslape real de dos lotes en un tanque.
 */

const ANCHO_DIA = 22
const ANCHO_DIA_MOVIL = 11
const ANCHO_NOMBRE = 116
const ANCHO_NOMBRE_MOVIL = 76
const ALTO_CARRIL = 30

const CSS = `
  .cl-wrap { border: 1px solid ${BORDE}; border-radius: 11px; background: #fff; overflow: hidden; }
  .cl-scroll {
    overflow-x: auto; overflow-y: hidden;
    overscroll-behavior-x: contain; -webkit-overflow-scrolling: touch;
  }
  .cl-grid {
    --cl-dia: ${ANCHO_DIA}px;
    --cl-nombre: ${ANCHO_NOMBRE}px;
    display: grid;
    width: max-content;
    min-width: 100%;
    position: relative;
  }
  .cl-nombre {
    position: sticky; left: 0; z-index: 3; background: #fff;
    border-right: 1px solid ${BORDE};
    display: flex; flex-direction: column; justify-content: center;
    padding: 0 10px; gap: 1px;
  }
  .cl-cabecera { position: sticky; top: 0; z-index: 4; background: #fff; }
  /*
   * La trama de dias es un fondo repetido, NO 760 divs de un dia cada uno:
   * 10 tanques por 76 dias serian mas de setecientos nodos para dibujar
   * lineas verticales.
   */
  .cl-pista {
    background-image: repeating-linear-gradient(
      to right, ${PISTA} 0 1px, transparent 1px var(--cl-dia));
  }
  .cl-barra {
    height: 22px; align-self: center; border-radius: 5px;
    font-size: 11px; line-height: 22px; padding: 0 7px;
    overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
    text-decoration: none; display: block; margin: 0 1px;
    background: ${GRIS_SUAVE}; color: #fff;
  }
  .cl-barra:hover { filter: brightness(.94); }
  .cl-barra.est {
    background: transparent; border: 1px dashed ${GRIS_SUAVE}; color: ${GRIS};
    line-height: 20px;
  }
  .cl-barra.corte-der { border-top-right-radius: 0; border-bottom-right-radius: 0; margin-right: 0; }
  .cl-barra.corte-izq { border-top-left-radius: 0; border-bottom-left-radius: 0; margin-left: 0; }
  .cl-barra.conflicto { box-shadow: inset 0 0 0 1.5px ${AMBAR}; }
  .cl-hoy { border-left: 2px solid ${TINTA_MEDIA}; pointer-events: none; z-index: 2; }
  .cl-sem { border-left: 1px solid ${BORDE}; pointer-events: none; z-index: 1; }
  .cl-lista { display: none; }

  @media screen and (max-width: ${MOVIL_MAX}px) {
    .cl-grid { --cl-dia: ${ANCHO_DIA_MOVIL}px; --cl-nombre: ${ANCHO_NOMBRE_MOVIL}px; }
    /* A 11 px por dia no cabe ni un folio: la identidad sale de la lista. */
    .cl-barra { font-size: 0; padding: 0; }
    .cl-lista { display: block; }
  }
`

type Props = {
  tanques: TanqueFila[]
  ocupacion: OcupacionFila[]
  lotes: LoteFila[]
  hoy: string
  canEdit: boolean
}

export default function CalendarioClient({ tanques, ocupacion, lotes, hoy, canEdit }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const loteAbierto = params.get('lote')
  const scroll = useRef<HTMLDivElement>(null)

  const v = useMemo(() => ventana(hoy), [hoy])

  const porTanque = useMemo(
    () => tramosPorTanque(
      ocupacion.map(o => ({
        id: o.id, lote_id: o.lote_id, tanque_id: o.tanque_id, folio: o.folio,
        producto_nombre: o.producto_nombre, etapa: o.etapa,
        desde: o.desde, hasta: o.hasta, fin: o.fin,
        estimado: o.estimado, tiene_receta: o.tiene_receta,
      })),
      v
    ),
    [ocupacion, v]
  )

  // Filas: los tanques activos, MAS los inactivos que todavia tengan un tramo
  // en la ventana. Un tanque dado de baja con cerveza adentro no puede
  // desaparecer del calendario: es justo el que hay que vaciar.
  const filas = useMemo(() => {
    const conTramos = new Set([...porTanque.keys()])
    return tanques.filter(t => t.activo || conTramos.has(t.id))
  }, [tanques, porTanque])

  const colHoy = indiceDia(v, hoy)

  // Separadores de semana: el lunes es el inicio de semana del negocio
  // (`inicioSemana` en fechas.ts). Son ~11 elementos, no 76.
  const semanas = useMemo(() => {
    const cols: number[] = []
    for (let i = 0; i < v.dias; i++) {
      const f = sumarDias(v.desde, i)
      if (inicioSemana(f) === f && i > 0) cols.push(i)
    }
    return cols
  }, [v])

  // Arranca con hoy a un tercio del ancho. `scrollLeft` y no `scrollIntoView`:
  // ese ultimo tambien mueve la pagina en vertical y en un celular te deja a
  // medio documento, con la cabecera de pestañas fuera de vista.
  useLayoutEffect(() => {
    const el = scroll.current
    if (!el) return
    const dia = parseFloat(getComputedStyle(el).getPropertyValue('--cl-dia')) || ANCHO_DIA
    el.scrollLeft = Math.max(0, colHoy * dia - el.clientWidth / 3)
  }, [colHoy])

  const abrir = (id: string | null) => {
    const q = new URLSearchParams(params.toString())
    if (id) q.set('lote', id)
    else q.delete('lote')
    // Se reconstruye desde `params`, asi `tab=calendario` sobrevive: un
    // `router.replace('?lote=x')` a secas regresaria al Tablero.
    router.replace(`/admin/produccion?${q}`, { scroll: false })
  }

  const ficha = loteAbierto ? lotes.find(l => l.id === loteAbierto) : undefined

  /**
   * La fila de grid donde empieza cada tanque, calculada ANTES de renderizar.
   *
   * La version obvia —un acumulador que se incrementa dentro del `.map()`—
   * muta una variable durante el render, y eso es justo lo que React no
   * garantiza entre renders. Aqui sale de un reduce puro.
   *
   * Las dos primeras filas del grid son las cabeceras (meses y dias), de ahi
   * el 3.
   */
  const { basePorTanque, totalCarriles } = useMemo(() => {
    const base = new Map<string, number>()
    let fila = 3
    for (const t of filas) {
      base.set(t.id, fila)
      fila += carrilesDe(porTanque.get(t.id))
    }
    return { basePorTanque: base, totalCarriles: fila - 3 }
  }, [filas, porTanque])

  if (tanques.length === 0) {
    return <div style={vacio}>No hay tanques dados de alta.</div>
  }

  return (
    <>
      <style>{CSS}</style>

      <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <Leyenda color={GRIS_SUAVE} texto="Ocurrido" />
        <Leyenda punteado texto="Estimado por receta" />
        <Leyenda borde={AMBAR} texto="Dos lotes en el mismo tanque" />
        <span style={{ color: GRIS_SUAVE, fontSize: 11.5 }}>
          {v.dias} días · {etiquetaFecha(v.desde)} a {etiquetaFecha(v.hasta)}
        </span>
      </div>

      <div className="cl-wrap">
        <div className="cl-scroll" ref={scroll}>
          <div
            className="cl-grid"
            role="img"
            aria-label={`Ocupación de ${filas.length} tanques entre ${v.desde} y ${v.hasta}. El detalle está en la lista de abajo.`}
            style={{
              gridTemplateColumns: `var(--cl-nombre) repeat(${v.dias}, var(--cl-dia))`,
              gridTemplateRows: `28px 22px repeat(${totalCarriles}, ${ALTO_CARRIL}px)`,
            }}
          >
            {/* Cabecera: meses */}
            <div className="cl-nombre cl-cabecera" style={{ gridRow: 1, gridColumn: 1 }} />
            {mesesDe(v).map(m => (
              <div
                key={m.col}
                className="cl-cabecera"
                style={{
                  gridRow: 1, gridColumn: `${m.col + 2} / span ${m.ancho}`,
                  borderLeft: `1px solid ${BORDE}`, padding: '0 6px',
                  color: TINTA_MEDIA, fontSize: 11, fontWeight: 600,
                  display: 'flex', alignItems: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
                }}
              >
                {m.etiqueta}
              </div>
            ))}

            {/* Cabecera: dias, uno de cada 7 para que no se encimen */}
            <div className="cl-nombre cl-cabecera" style={{ gridRow: 2, gridColumn: 1 }} />
            {Array.from({ length: v.dias }).map((_, i) => {
              const f = sumarDias(v.desde, i)
              const marca = i === colHoy || i % 7 === 0
              return (
                <div
                  key={i}
                  className="cl-cabecera"
                  style={{
                    gridRow: 2, gridColumn: i + 2,
                    fontSize: 9.5, color: i === colHoy ? TINTA : GRIS_SUAVE,
                    fontWeight: i === colHoy ? 700 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    whiteSpace: 'nowrap', overflow: 'visible',
                  }}
                  title={etiquetaFecha(f)}
                >
                  {marca ? (i === colHoy ? 'hoy' : etiquetaDiaCorto(f).replace(' ', ' ')) : ''}
                </div>
              )
            })}

            {/* Guias verticales, que cruzan todas las filas de tanques */}
            {semanas.map(c => (
              <div key={`s${c}`} className="cl-sem" style={{ gridColumn: c + 2, gridRow: `3 / span ${totalCarriles}` }} />
            ))}
            {colHoy >= 0 && colHoy < v.dias && (
              <div className="cl-hoy" style={{ gridColumn: colHoy + 2, gridRow: `3 / span ${totalCarriles}` }} />
            )}

            {/* Filas */}
            {filas.map(t => {
              const tramos = porTanque.get(t.id) || []
              return (
                <FilaTanque
                  key={t.id}
                  tanque={t}
                  tramos={tramos}
                  carriles={carrilesDe(tramos)}
                  conflicto={hayTraslape(tramos)}
                  filaBase={basePorTanque.get(t.id) ?? 3}
                  dias={v.dias}
                  onAbrir={abrir}
                />
              )
            })}
          </div>
        </div>
      </div>

      {/* La lista es el contenido accesible del grafico, y en celular la
          unica forma de leer los folios: a 11 px por dia no cabe texto. */}
      <ListaTramos filas={filas} porTanque={porTanque} onAbrir={abrir} />

      {ficha && (
        <FichaLote
          key={ficha.id}
          lote={ficha}
          canEdit={canEdit}
          onCerrar={() => abrir(null)}
          onCambio={() => router.refresh()}
        />
      )}
    </>
  )
}

// ── Piezas ──────────────────────────────────────────────────

function FilaTanque({
  tanque, tramos, carriles, conflicto, filaBase, dias, onAbrir,
}: {
  tanque: TanqueFila
  tramos: Tramo[]
  carriles: number
  conflicto: boolean
  filaBase: number
  dias: number
  onAbrir: (id: string) => void
}) {
  return (
    <>
      <div
        className="cl-nombre"
        style={{ gridRow: `${filaBase} / span ${carriles}`, gridColumn: 1, opacity: tanque.activo ? 1 : 0.55 }}
      >
        <span style={{ color: TINTA, fontSize: 12.5, fontWeight: 600 }}>{tanque.nombre}</span>
        <span style={{ color: GRIS_SUAVE, fontSize: 10 }}>
          {TANQUE_TIPO_LABEL[tanque.tipo]}
          {!tanque.activo && ' · baja'}
        </span>
        {conflicto && (
          <span style={{ color: AMBAR, fontSize: 9.5, fontWeight: 600 }}>2 lotes</span>
        )}
      </div>

      {/* Pista de fondo, una por carril */}
      {Array.from({ length: carriles }).map((_, c) => (
        <div
          key={`p${c}`}
          className="cl-pista"
          style={{ gridRow: filaBase + c, gridColumn: `2 / span ${dias}`, borderTop: `1px solid ${BORDE}` }}
        />
      ))}

      {tramos.map(t => (
        <a
          key={t.id}
          href={`/admin/produccion?tab=calendario&lote=${t.loteId}`}
          onClick={e => { e.preventDefault(); onAbrir(t.loteId) }}
          className={[
            'cl-barra',
            t.estimado || t.sinFin ? 'est' : '',
            t.cortadoIzq ? 'corte-izq' : '',
            t.cortadoDer || t.sinFin ? 'corte-der' : '',
            conflicto ? 'conflicto' : '',
          ].filter(Boolean).join(' ')}
          style={{ gridRow: filaBase + t.carril, gridColumn: `${t.col + 2} / span ${t.ancho}` }}
          title={tituloTramo(t)}
        >
          {t.folio || '—'}
        </a>
      ))}
    </>
  )
}

function ListaTramos({
  filas, porTanque, onAbrir,
}: {
  filas: TanqueFila[]
  porTanque: Map<string, Tramo[]>
  onAbrir: (id: string) => void
}) {
  const todos = filas.flatMap(t => (porTanque.get(t.id) || []).map(x => ({ tanque: t.nombre, t: x })))

  if (todos.length === 0) {
    return (
      <p className="cl-lista" style={{ margin: '12px 0 0', color: GRIS_SUAVE, fontSize: 12.5 }}>
        Ningún lote ocupa un tanque en esta ventana.
      </p>
    )
  }

  return (
    <ul className="cl-lista" style={{ margin: '12px 0 0', padding: 0, listStyle: 'none' }}>
      {todos.map(({ tanque, t }) => (
        <li key={t.id} style={{ borderTop: `1px solid ${BORDE}`, padding: '9px 2px' }}>
          <button
            onClick={() => onAbrir(t.loteId)}
            style={{
              background: 'none', border: 'none', padding: 0, textAlign: 'left',
              cursor: 'pointer', font: 'inherit', display: 'block', width: '100%',
            }}
          >
            <span style={{ color: TINTA, fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {t.folio || '—'}
            </span>
            <span style={{ color: GRIS, fontSize: 12 }}> · {t.producto || '—'} · {tanque}</span>
            <span style={{ display: 'block', color: GRIS_SUAVE, fontSize: 11.5, marginTop: 2 }}>
              {etiquetaFecha(t.inicioReal)} → {t.finReal ? etiquetaFecha(t.finReal) : 'sin fecha estimada'}
              {t.estimado && ' · estimado'}
            </span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Leyenda({ color, punteado, borde, texto }: { color?: string; punteado?: boolean; borde?: string; texto: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: GRIS, fontSize: 11.5 }}>
      <span
        aria-hidden
        style={{
          width: 22, height: 11, borderRadius: 3,
          background: punteado || borde ? 'transparent' : color,
          border: punteado ? `1px dashed ${GRIS_SUAVE}` : borde ? `1.5px solid ${borde}` : 'none',
        }}
      />
      {texto}
    </span>
  )
}

// ── Helpers locales ─────────────────────────────────────────

function mesesDe(v: { desde: string; dias: number }): { col: number; ancho: number; etiqueta: string }[] {
  const out: { col: number; ancho: number; etiqueta: string }[] = []
  let col = 0
  let mes = sumarDias(v.desde, 0).slice(0, 7)
  for (let i = 1; i <= v.dias; i++) {
    const m = i < v.dias ? sumarDias(v.desde, i).slice(0, 7) : null
    if (m !== mes) {
      out.push({ col, ancho: i - col, etiqueta: etiquetaMesCorto(`${mes}-01`) })
      col = i
      if (m) mes = m
    }
  }
  return out
}

function tituloTramo(t: Tramo): string {
  const partes = [
    `${t.folio || 'sin folio'}${t.producto ? ` · ${t.producto}` : ''}`,
    `${etiquetaFecha(t.inicioReal)} → ${t.finReal ? etiquetaFecha(t.finReal) : 'sin fecha estimada'}`,
  ]
  if (t.sinFin) partes.push('Sin receta completa: no se puede proyectar el fin')
  else if (t.estimado) partes.push('Fin estimado con la receta')
  if (t.cortadoIzq) partes.push('Empieza antes de la ventana')
  if (t.cortadoDer) partes.push('Termina después de la ventana')
  return partes.join('\n')
}
