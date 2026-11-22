'use client'
import { useCallback, useMemo, useState, type CSSProperties } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import KpiCard from '../KpiCard'
import Icono from './Icono'
import FichaLote from './FichaLote'
import NuevoLote from './NuevoLote'
import {
  ETAPAS_TABLERO, esTerminal, siguienteEtapa, puedeAvanzar,
  mermaDelPeriodo, ventanaDias, pesoAlerta, motivosChip, progresoEtapa,
  fmtDias, fmtGravedad, fmtLitros, fmtPct,
  type Etapa, type Progreso,
} from '../../../src/lib/produccion'
import { etiquetaDiaCorto, etiquetaFecha } from '../../../src/lib/fechas'
import { BORDE, GRIS, GRIS_SUAVE, MOVIL_MAX, TINTA, TINTA_MEDIA, enteros } from '../dash-ui'
import {
  AMBAR, BORDE_ALERTA, COLUMNA_FONDO, ELIPSIS, FONDO_ALERTA, ICONOS, ROJO_ALERTA,
  TEXTO_ALERTA, estaParado, etiquetaEtapa,
  type LoteFila, type ProductoFila, type RecetaFila, type TanqueFila,
} from './produccion-ui'

/**
 * Tablero kanban de lotes.
 *
 * Una columna por etapa viva. Liberado no es columna: el lote ya salio a
 * inventario y dejarlo ahi haria crecer el tablero para siempre. Descartado
 * tampoco: es una salida, no un lugar donde esperar. Los dos se ven en
 * Historico.
 *
 * El color es senal: las tarjetas son neutras y solo se tinta el lote que va
 * tarde en su etapa —contra el objetivo de su receta, o contra DIAS_NORMALES
 * si no tiene— y las alertas de la vista. Con siete etapas de siete colores,
 * ninguno significaria nada.
 *
 * El tablero CABE: las cinco columnas se reparten el ancho disponible y las
 * etapas vacias se colapsan a un riel (ver `plantilla` y ANCHO_VACIA). Nunca
 * hay scroll horizontal en escritorio.
 *
 * La ficha vive en la URL (`?lote=<id>`), igual que el panel de un pedido:
 * asi se comparte por link y el boton Atras la cierra.
 */

/**
 * Ancho de una columna SIN lotes.
 *
 * Alcanza para el titulo girado (una linea de 12 px) y nada mas. Una etapa
 * vacia no necesita ancho: necesita decir que existe y que esta en cero.
 */
const ANCHO_VACIA = 44

/**
 * Ancho MAXIMO de una columna con lotes.
 *
 * "Las columnas se reparten el ancho disponible" no puede significar que una
 * sola se quede con todo: con cuatro etapas vacias, la quinta llegaba a
 * 888 px y la tarjeta se estiraba hasta dejar la etiqueta "Tanque" y su valor
 * FV3 separados por 800 px de nada. Una tarjeta ancha no es mas legible, es
 * menos.
 *
 * Como el tope va en el `max` de un minmax y no en un ancho fijo, la columna
 * encoge por debajo cuando no hay espacio —cinco columnas llenas a 1100 px
 * dan 144 cada una— y el sobrante se queda como hueco a la derecha, que es lo
 * honesto: el tablero no esta lleno.
 */
const ANCHO_MAX = 300

/**
 * Alto del riel de una columna vacia.
 *
 * Fijo y el mismo para las cinco a proposito: con el alto natural, cada riel
 * mediria lo que mide su palabra girada —COCCION 70 px, FERMENTACION 115— y
 * cinco rieles de distinto largo se ven como un error de maquetado. Cabe la
 * etiqueta mas larga con aire.
 */
const ALTO_RIEL = 132

const CSS = `
  /*
   * El kanban es un GRID, no un flex con columnas de ancho fijo.
   *
   * Con 5 carriles de 260 px el tablero pedia 1340 px y desbordaba en
   * cualquier ventana de escritorio real: a 1100 px el area util son 742, y
   * PLANEADO salia cortado. Las pistas son minmax(0, 1fr) y no 1fr a
   * secas porque el minimo por defecto de una pista es auto, o sea el
   * min-content de su contenido — exactamente la causa raiz del desborde de
   * Pedidos (ver app/admin/layout.tsx:130). Con el 0 explicito, el contenido
   * se recorta y la pista nunca crece: 5 columnas caben en lo que haya.
   *
   * grid-template-columns sale de una variable y no de un style inline
   * porque las columnas vacias se colapsan en JS (ver plantilla), y un
   * style inline le ganaria al media query de celular.
   */
  .tb-cols {
    display: grid;
    grid-template-columns: var(--tb-cols);
    gap: 12px;
    align-items: start;
  }
  .tb-col { min-width: 0; display: flex; flex-direction: column; }
  .tb-cab { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 0 4px 8px; min-width: 0; }
  .tb-tit { margin: 0; color: ${TINTA}; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tb-cuenta { color: ${GRIS_SUAVE}; font-size: 12px; font-variant-numeric: tabular-nums; flex: 0 0 auto; }
  .tb-caja { background: ${COLUMNA_FONDO}; border-radius: 10px; padding: 8px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }

  /*
   * Columna sin lotes: un riel con el titulo girado.
   *
   * El titulo gira para que la columna quepa en ${ANCHO_VACIA} px en vez de
   * pedir los ~110 que mide FERMENTACION en horizontal. vertical-rl mas
   * rotate(180deg) lo deja leyendose de abajo hacia arriba, que es la
   * convencion de un eje; sideways-lr haria lo mismo en una sola
   * declaracion pero no esta en todos los navegadores.
   */
  .tb-riel {
    background: ${COLUMNA_FONDO};
    border-radius: 10px;
    height: ${ALTO_RIEL}px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .tb-riel .tb-tit {
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    color: ${GRIS};
    overflow: visible;
  }
  /* En escritorio el 0 va arriba del riel, centrado sobre sus 44 px. */
  .tb-cab-vacia { justify-content: center; }
  .tb-cuenta-movil { display: none; }

  .tb-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 22px; }
  .tb-card { transition: border-color 120ms ease, box-shadow 120ms ease; min-width: 0; }
  .tb-card:hover { border-color: #d1d5db; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .tb-avanzar:hover:not(:disabled) { background: #f9fafb; border-color: #d1d5db; }
  @media (max-width: 1100px) { .tb-kpis { grid-template-columns: repeat(2, 1fr); } }

  /*
   * En celular las columnas se APILAN, igual que antes: una etapa por
   * seccion, con su titulo y su cuenta. Aqui se deshace todo lo de arriba —
   * una sola pista, el titulo horizontal y el riel sin alto fijo— porque en
   * 390 px de ancho no hay nada que colapsar.
   */
  @media screen and (max-width: ${MOVIL_MAX}px) {
    .tb-kpis { grid-template-columns: repeat(2, 1fr); }
    .tb-cols { grid-template-columns: 1fr; gap: 18px; }
    .tb-riel { height: auto; justify-content: space-between; padding: 12px 14px; }
    .tb-riel .tb-tit { writing-mode: horizontal-tb; transform: none; }
    /*
     * Apilada, la franja de una etapa vacia ES su encabezado: el titulo a la
     * izquierda y la cuenta a la derecha, igual que el de una etapa con
     * lotes. El 0 de escritorio —centrado sobre un riel de 44 px— se esconde
     * y aparece el de adentro, para que las dos formas no se contradigan.
     */
    .tb-cab-vacia { display: none; }
    .tb-cuenta-movil { display: inline; }
  }
  @media screen and (max-width: 420px) { .tb-kpis { grid-template-columns: 1fr; } }
`

type Props = {
  lotes: LoteFila[]
  tanques: TanqueFila[]
  productos: ProductoFila[]
  recetas: RecetaFila[]
  canEdit: boolean
  ahoraISO: string
}

export default function TableroClient({ lotes, tanques, productos, recetas, canEdit, ahoraISO }: Props) {
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
    // Dentro de cada columna: primero lo que tiene alerta, y entre iguales el
    // que lleva mas tiempo. El orden es la primera señal, antes del color.
    for (const arr of m.values()) {
      arr.sort((a, b) =>
        pesoAlerta(b.alerta_nivel) - pesoAlerta(a.alerta_nivel) ||
        b.dias_en_etapa - a.dias_en_etapa)
    }
    return m
  }, [activos])

  /**
   * Las pistas del grid: las columnas CON lotes se reparten el ancho, las
   * vacias se colapsan a un riel.
   *
   * Es lo que hace que el tablero quepa sin scroll en una ventana real. Con
   * dos etapas ocupadas, las otras tres se van a 44 px cada una y las dos que
   * importan se quedan con el resto —hasta ANCHO_MAX cada una—, en vez de
   * cinco carriles iguales donde el 60 % del ancho lo gastan tres cajas que
   * dicen "Vacio".
   *
   * Con el tablero entero en cero NO se colapsa nada: cinco rieles juntos a
   * la izquierda y un hueco a la derecha se leen como un error de maquetado,
   * no como una fabrica sin lotes.
   */
  const plantilla = useMemo(() => {
    const llenas = ETAPAS_TABLERO.filter(e => (porEtapa.get(e)?.length ?? 0) > 0).length
    if (llenas === 0) return `repeat(${ETAPAS_TABLERO.length}, minmax(0, 1fr))`
    return ETAPAS_TABLERO
      .map(e => (porEtapa.get(e)?.length ? `minmax(0, ${ANCHO_MAX}px)` : `${ANCHO_VACIA}px`))
      .join(' ')
  }, [porEtapa])

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

      {/* No hay renglon de "N lotes en proceso": el KPI "Lotes activos" ya
          dice ese numero, y repetirlo abajo gasta un renglon para no agregar
          nada. El alta vive en la cabecera. */}
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

      <div
        className="tb-cols"
        // La variable, y no `gridTemplateColumns` directo: un style inline le
        // ganaria al media query que apila las columnas en celular.
        style={{ '--tb-cols': plantilla } as CSSProperties}
      >
        {ETAPAS_TABLERO.map(etapa => {
          const items = porEtapa.get(etapa) || []

          // Etapa sin lotes: riel angosto con el titulo girado. Ya no hay caja
          // gris con "Vacio" adentro — esa caja gastaba una quinta parte del
          // tablero para decir que no habia nada que ver.
          if (items.length === 0) {
            return (
              <div key={etapa} className="tb-col">
                <div className="tb-cab tb-cab-vacia">
                  <span className="tb-cuenta">0</span>
                </div>
                <div className="tb-riel">
                  <h2 className="tb-tit">{etiquetaEtapa(etapa)}</h2>
                  {/* El mismo 0 otra vez: en celular se ve este y se esconde
                      el de arriba (ver el media query). Dos nodos y no uno
                      movido con JS, porque el que aplica depende del ancho de
                      la ventana y eso lo decide CSS, no el render.
                      Sin aria-hidden: el que no aplica va en display:none, que
                      ya lo saca del arbol de accesibilidad, y esconder los dos
                      dejaria la etapa vacia sin cuenta que anunciar. */}
                  <span className="tb-cuenta tb-cuenta-movil">0</span>
                </div>
              </div>
            )
          }

          return (
            <div key={etapa} className="tb-col">
              <div className="tb-cab">
                <h2 className="tb-tit">{etiquetaEtapa(etapa)}</h2>
                <span className="tb-cuenta">{items.length}</span>
              </div>

              <div className="tb-caja">
                {items.map(l => (
                  <TarjetaLote
                    key={l.id}
                    lote={l}
                    canEdit={canEdit}
                    avanzando={avanzando === l.id}
                    onAbrir={() => abrir(l.id)}
                    onAvanzar={destino => avanzar(l, destino)}
                  />
                ))}
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
          recetas={recetas}
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

  // Con receta y en una etapa con duracion objetivo, la barra dice en que dia
  // va y si eso ya es tarde. Sin eso —sin receta, o en `planeado`, que no
  // tiene duracion— no hay contra que medir y se cae al renglon "En etapa".
  const progreso = progresoEtapa(lote.dias_en_etapa, lote.dias_objetivo_etapa)

  // `estaParado` sigue siendo el respaldo para un producto SIN receta: ahi la
  // vista no puede comparar contra un objetivo y no emite `etapa_vencida`.
  // Con receta, la alerta de la vista manda y esto no se usa.
  const parado = !lote.tiene_receta && estaParado(lote.etapa, lote.dias_en_etapa)
  const motivos = motivosChip(lote.alerta_motivos)
  const nivel = lote.alerta_nivel

  return (
    <div
      className="tb-card"
      style={{
        background: '#fff',
        border: `1px solid ${nivel !== 'ninguna' ? BORDE_ALERTA[nivel] : parado ? BORDE_ALERTA.ambar : BORDE_ALERTA.ninguna}`,
        borderRadius: 9,
        padding: '10px 11px',
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
          minWidth: 0,
        }}
      >
        <span
          style={{
            ...ELIPSIS,
            color: TINTA, fontSize: 13.5, fontWeight: 700,
            fontVariantNumeric: 'tabular-nums', letterSpacing: '0.01em',
          }}
        >
          {lote.folio || '—'}
        </span>
        {/* El nombre del producto lo escribe una persona y puede medir lo que
            sea: se recorta con elipsis y el completo queda en el title. Si
            empujara, se llevaria la columna entera. */}
        <span
          style={{ ...ELIPSIS, color: TINTA_MEDIA, fontSize: 12.5 }}
          title={[lote.producto_nombre, lote.producto_estilo].filter(Boolean).join(' · ') || undefined}
        >
          {lote.producto_nombre || '—'}
          {lote.producto_estilo && (
            <span style={{ color: GRIS_SUAVE }}> · {lote.producto_estilo}</span>
          )}
        </span>
      </button>

      {progreso && <ProgresoEtapa progreso={progreso} />}

      {lote.fecha_fin_estimada && (
        // Se deja envolver en dos renglones en vez de recortarse: "Fin
        // estimado" es una etiqueta fija y corta, y "Fin estim…" no diria
        // nada. Lo que se recorta es el texto que escribe una persona.
        <p style={{ margin: 0, color: GRIS, fontSize: 11, lineHeight: 1.35 }}>
          Fin estimado:{' '}
          <span
            style={{ color: TINTA_MEDIA, fontWeight: 500, whiteSpace: 'nowrap' }}
            title={etiquetaFecha(lote.fecha_fin_estimada)}
          >
            {etiquetaDiaCorto(lote.fecha_fin_estimada)}
          </span>
        </p>
      )}

      <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '3px 6px', fontSize: 11.5 }}>
        <dt style={{ color: GRIS_SUAVE, whiteSpace: 'nowrap' }}>Tanque</dt>
        <dd
          style={{
            ...ELIPSIS, margin: 0, textAlign: 'right',
            color: lote.tanque_nombre ? TINTA_MEDIA : GRIS_SUAVE,
          }}
          title={lote.tanque_nombre || undefined}
        >
          {lote.tanque_nombre || 'sin asignar'}
        </dd>

        {/* Los dias en etapa solo se dicen aqui cuando NO hay barra: con
            barra, "Día 2 de 7" ya lo dice mejor y repetirlo gasta un renglon
            del ancho que hay que cuidar. */}
        {!progreso && (
          <>
            <dt style={{ color: GRIS_SUAVE, whiteSpace: 'nowrap' }}>En etapa</dt>
            <dd
              style={{
                margin: 0, textAlign: 'right', fontVariantNumeric: 'tabular-nums',
                color: parado ? AMBAR : TINTA_MEDIA, fontWeight: parado ? 600 : 400,
              }}
              title={parado ? 'Lleva más días de lo normal en esta etapa' : undefined}
            >
              {fmtDias(lote.dias_en_etapa)}
            </dd>
          </>
        )}

        <dt style={{ color: GRIS_SUAVE, whiteSpace: 'nowrap' }}>Gravedad</dt>
        {/* El title no es decoracion: "sin lecturas" es lo unico de la
            tarjeta que se recorta en el peor caso —las cinco etapas ocupadas
            en una ventana de 1100 px, columnas de 145— y asi sigue
            alcanzable. De 1200 px en adelante cabe entero. */}
        <dd
          style={{ ...ELIPSIS, margin: 0, color: lote.ultima_gravedad === null ? GRIS_SUAVE : TINTA_MEDIA, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
          title={lote.ultima_gravedad === null ? 'Sin lecturas de gravedad' : undefined}
        >
          {lote.ultima_gravedad === null ? 'sin lecturas' : fmtGravedad(lote.ultima_gravedad)}
        </dd>
      </dl>

      {motivos.length > 0 && (
        /*
         * Los motivos van como chips cortos y no como frases: en una columna
         * de 140 px, "Lleva más días de los planeados en esta etapa" ocupa
         * cuatro renglones para decir lo que la barra de arriba ya pinta en
         * ámbar. La frase completa viaja en el title.
         *
         * Los chips toman el nivel del LOTE y no uno por motivo: la vista
         * publica un solo `alerta_nivel` (el maximo de los cuatro), y
         * deducir aqui la severidad de cada clave seria copiar las reglas de
         * SQL a TS para que se desincronicen.
         */
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {motivos.map(m => (
            <li
              key={m.clave}
              title={m.largo}
              style={{
                ...ELIPSIS, maxWidth: '100%',
                border: `1px solid ${BORDE_ALERTA[nivel]}`,
                background: FONDO_ALERTA[nivel],
                color: TEXTO_ALERTA[nivel],
                borderRadius: 999, padding: '2px 7px',
                fontSize: 10.5, fontWeight: 600, lineHeight: 1.5,
              }}
            >
              {m.corto}
            </li>
          ))}
        </ul>
      )}

      {!lote.tiene_receta && (
        // Se dice, no se esconde: sin receta la vista no puede comparar contra
        // ningun objetivo, asi que tres de las cuatro alertas no aplican — y
        // esta tarjeta se queda sin barra de progreso y sin fin estimado.
        <p style={{ margin: 0, color: GRIS_SUAVE, fontSize: 10.5 }}>Sin receta</p>
      )}

      {canEdit && destino && (
        <button
          className="tb-avanzar"
          onClick={() => onAvanzar(destino)}
          disabled={avanzando || !veredicto?.ok}
          title={veredicto?.ok ? `Avanzar a ${etiquetaEtapa(destino).toLowerCase()}` : veredicto?.motivo}
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            background: '#fff', border: `1px solid ${BORDE}`, borderRadius: 7,
            padding: '6px 8px', fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
            color: veredicto?.ok ? TINTA_MEDIA : GRIS_SUAVE,
            cursor: veredicto?.ok && !avanzando ? 'pointer' : 'not-allowed',
            // El texto se parte en dos renglones antes que ensanchar la
            // columna. `minWidth: 0` porque un boton, como cualquier item de
            // flex, se niega a encoger bajo su min-content sin el.
            minWidth: 0, whiteSpace: 'normal', lineHeight: 1.3,
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

/**
 * En que dia de su etapa va el lote: "Día 2 de 7" y una barrita.
 *
 * El color es senal y nada mas: gris mientras va en tiempo, ambar cuando pasa
 * del objetivo de la receta y rojo cuando pasa del doble. Son los mismos dos
 * umbrales que `lotes_vista` usa para `etapa_vencida` y `etapa_muy_vencida`
 * (el espejo vive en `progresoEtapa`), asi que la barra y el chip de alerta
 * no se pueden contradecir.
 *
 * `aria-valuetext` carga el texto completo porque `aria-valuenow` va topado
 * en el objetivo: un lote en el dia 12 de 7 no puede anunciar un valor fuera
 * del rango que declara, pero si decir en palabras que va vencido.
 */
function ProgresoEtapa({ progreso }: { progreso: Progreso }) {
  const { dia, objetivo, fraccion, nivel } = progreso
  const color = nivel === 'rojo' ? ROJO_ALERTA : nivel === 'ambar' ? AMBAR : GRIS
  const texto = `Día ${dia} de ${objetivo}`

  return (
    <div>
      <span
        style={{
          display: 'block', marginBottom: 4, fontSize: 11.5,
          color, fontWeight: nivel === 'ninguna' ? 500 : 600,
          fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
        }}
      >
        {texto}
      </span>
      <div
        role="progressbar"
        aria-label="Avance de la etapa"
        aria-valuemin={0}
        aria-valuemax={objetivo}
        aria-valuenow={Math.min(dia, objetivo)}
        aria-valuetext={texto}
        style={{ height: 4, borderRadius: 999, background: BORDE, overflow: 'hidden' }}
      >
        <div style={{ width: `${fraccion * 100}%`, height: '100%', borderRadius: 999, background: color }} />
      </div>
    </div>
  )
}
