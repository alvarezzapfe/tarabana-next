import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ETAPAS_TABLERO, esTerminal, siguienteEtapa, ordenDe, puedeAvanzar,
  mermaDelPeriodo, ventanaDias, litrosDeEnvasado, historicoCsv,
  filtrarHistorico, fmtDias, fmtGravedad, FILTRO_VACIO,
  type FilaHistorico, type LoteParaAvance,
  textoMotivo, textosMotivos, pesoAlerta, hayAlerta,
  diasObjetivoEtapa, diasObjetivoTotal, diasRestantes, litrosEnCamino, barraEnVentana,
  type DiasReceta, type LoteEnCamino,
} from './produccion.ts'
import { LITROS_POR_LATA } from './unidades.ts'

// ── Etapas ──────────────────────────────────────────────────

test('el tablero no tiene columna de descartado ni de liberado', () => {
  // Liberado sale del tablero (ya esta en inventario) y descartado es una
  // salida, no un lugar donde un lote se queda esperando.
  assert.ok(!(ETAPAS_TABLERO as readonly string[]).includes('descartado'))
  assert.ok(!(ETAPAS_TABLERO as readonly string[]).includes('liberado'))
  assert.equal(ETAPAS_TABLERO.length, 5)
})

test('la etapa siguiente nunca es descartado', () => {
  // Descartar es una decision, no el paso natural despues de envasar.
  assert.equal(siguienteEtapa('planeado'), 'coccion')
  assert.equal(siguienteEtapa('maduracion'), 'envasado')
  assert.equal(siguienteEtapa('envasado'), 'liberado')
  assert.equal(siguienteEtapa('liberado'), null)
  assert.equal(siguienteEtapa('descartado'), null)
})

test('liberado y descartado son terminales', () => {
  assert.ok(esTerminal('liberado'))
  assert.ok(esTerminal('descartado'))
  assert.ok(!esTerminal('envasado'))
})

test('el orden de etapa espeja lote_etapa_orden() de SQL', () => {
  // Si estos numeros dejan de coincidir con la funcion SQL, el boton Avanzar
  // ofrece transiciones que la DB rechaza.
  assert.equal(ordenDe('planeado'), 0)
  assert.equal(ordenDe('coccion'), 1)
  assert.equal(ordenDe('fermentacion'), 2)
  assert.equal(ordenDe('maduracion'), 3)
  assert.equal(ordenDe('envasado'), 4)
  assert.equal(ordenDe('liberado'), 5)
  assert.equal(ordenDe('descartado'), 99)
})

// ── Requisitos de avance ────────────────────────────────────

const lote = (p: Partial<LoteParaAvance> = {}): LoteParaAvance =>
  ({ etapa: 'fermentacion', fg: null, envasado: 0, ...p })

test('no se envasa sin FG', () => {
  const r = puedeAvanzar(lote({ etapa: 'maduracion', fg: null }), 'envasado')
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.motivo : '', /FG/)
})

test('con FG si se envasa', () => {
  assert.deepEqual(puedeAvanzar(lote({ etapa: 'maduracion', fg: 1.012 }), 'envasado'), { ok: true })
})

test('una FG de 0 no cuenta como ausente', () => {
  // `fg: 0` es falsy. Un `if (!lote.fg)` lo trataria como no capturada y
  // bloquearia el envasado de un lote que si tiene lectura.
  assert.deepEqual(puedeAvanzar(lote({ etapa: 'maduracion', fg: 0 }), 'envasado'), { ok: true })
})

test('no se libera sin envasado registrado', () => {
  const r = puedeAvanzar(lote({ etapa: 'envasado', fg: 1.01, envasado: 0 }), 'liberado')
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.motivo : '', /envasado/)
})

test('con envasado si se libera', () => {
  assert.deepEqual(
    puedeAvanzar(lote({ etapa: 'envasado', fg: 1.01, envasado: 2 }), 'liberado'),
    { ok: true }
  )
})

test('las etapas no retroceden', () => {
  const r = puedeAvanzar(lote({ etapa: 'envasado', fg: 1.01 }), 'fermentacion')
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.motivo : '', /solo avanzan/)
})

test('se puede saltar maduracion', () => {
  // Hay cervezas que no maduran. Saltar hacia adelante se permite; volver
  // atras no.
  assert.deepEqual(
    puedeAvanzar(lote({ etapa: 'fermentacion', fg: 1.01 }), 'envasado'),
    { ok: true }
  )
})

test('un lote liberado ya no avanza', () => {
  const r = puedeAvanzar(lote({ etapa: 'liberado', fg: 1.01, envasado: 3 }), 'descartado')
  assert.equal(r.ok, false)
  assert.match(r.ok === false ? r.motivo : '', /ya no avanza/)
})

test('se descarta desde cualquier etapa viva, sin requisitos', () => {
  assert.deepEqual(puedeAvanzar(lote({ etapa: 'planeado' }), 'descartado'), { ok: true })
  assert.deepEqual(puedeAvanzar(lote({ etapa: 'coccion' }), 'descartado'), { ok: true })
})

test('no se avanza a la etapa en que ya esta', () => {
  const r = puedeAvanzar(lote({ etapa: 'coccion' }), 'coccion')
  assert.equal(r.ok, false)
})

// ── Merma ───────────────────────────────────────────────────

const ahora = new Date('2026-11-18T12:00:00Z')
const { desde, hasta } = ventanaDias(90, ahora)

test('la merma del periodo es ponderada por volumen, no promedio de porcentajes', () => {
  // Dos lotes: uno de 1000 L con 5% de merma, uno de 50 L con 50%.
  // Promediar los porcentajes daria 27.5%, que no es lo que perdio la
  // fabrica. Lo real: (1000+50) - (950+25) = 75 L sobre 1050 = 7.1%.
  const r = mermaDelPeriodo([
    { litros_reales: 1000, litros_envasados: 950, fecha_liberado: '2026-11-01T00:00:00Z' },
    { litros_reales: 50, litros_envasados: 25, fecha_liberado: '2026-11-02T00:00:00Z' },
  ], desde, hasta)
  assert.equal(r.pct, 7.1)
  assert.equal(r.litros, 75)
  assert.equal(r.lotes, 2)
})

test('un lote sin litros_reales no cuenta como merma cero: se reporta', () => {
  // Contarlo como 0 bajaria el KPI con un lote que no dice nada.
  const r = mermaDelPeriodo([
    { litros_reales: 1000, litros_envasados: 900, fecha_liberado: '2026-11-01T00:00:00Z' },
    { litros_reales: null, litros_envasados: null, fecha_liberado: '2026-11-02T00:00:00Z' },
  ], desde, hasta)
  assert.equal(r.pct, 10)
  assert.equal(r.lotes, 1)
  assert.equal(r.sinDatos, 1)
})

test('sin ni un lote con los dos lados, la merma es null y no 0', () => {
  const r = mermaDelPeriodo([
    { litros_reales: null, litros_envasados: null, fecha_liberado: '2026-11-02T00:00:00Z' },
  ], desde, hasta)
  assert.equal(r.pct, null)
  assert.equal(r.litros, null)
  assert.equal(r.sinDatos, 1)
})

test('los lotes fuera de la ventana no entran', () => {
  const r = mermaDelPeriodo([
    { litros_reales: 1000, litros_envasados: 500, fecha_liberado: '2025-01-01T00:00:00Z' },
  ], desde, hasta)
  assert.equal(r.pct, null)
  // Fuera de rango no es "sin datos": es otro periodo.
  assert.equal(r.sinDatos, 0)
})

test('un lote sin liberar no entra en la merma', () => {
  // La merma se mide cuando el lote cerro. Antes, el envasado esta a medias
  // y daria una merma inventada.
  const r = mermaDelPeriodo([
    { litros_reales: 1000, litros_envasados: 100, fecha_liberado: null },
  ], desde, hasta)
  assert.equal(r.pct, null)
  assert.equal(r.lotes, 0)
})

test('litros_reales en 0 no divide entre cero', () => {
  const r = mermaDelPeriodo([
    { litros_reales: 0, litros_envasados: 0, fecha_liberado: '2026-11-01T00:00:00Z' },
  ], desde, hasta)
  assert.equal(r.pct, null)
  assert.equal(r.sinDatos, 1)
})

// ── Litros de envasado ──────────────────────────────────────

test('los litros de envasado salen de los factores de unidades.ts', () => {
  // Mismos numeros que la columna generada lote_envasado.litros_equivalentes.
  assert.equal(litrosDeEnvasado('stock_latas', 100), Math.round(100 * LITROS_POR_LATA * 1000) / 1000)
  assert.equal(litrosDeEnvasado('stock_caja12', 10), 42.6)
  assert.equal(litrosDeEnvasado('stock_caja24', 10), 85.2)
  assert.equal(litrosDeEnvasado('stock_barril_pet', 5), 100)
  assert.equal(litrosDeEnvasado('stock_barril10_acero', 5), 50)
})

// ── CSV ─────────────────────────────────────────────────────

const fila = (p: Partial<FilaHistorico> = {}): FilaHistorico => ({
  folio: 'BRA-26-014', producto_nombre: 'Brasa', producto_estilo: 'Lager',
  etapa: 'liberado', tanque_nombre: 'FV1',
  fecha_coccion: '2026-10-01', fecha_envasado: '2026-10-20',
  fecha_liberado: '2026-10-22T18:30:00Z',
  litros_objetivo: 1000, litros_reales: 980, litros_envasados: 940,
  merma_litros: 40, merma_pct: 4.08,
  og: 1.048, fg: 1.01, abv: 4.99, levadura_cepa: 'W-34/70',
  ...p,
})

test('el CSV lleva BOM: sin el, Excel en Windows rompe los acentos', () => {
  assert.ok(historicoCsv([]).startsWith('﻿'))
})

test('el CSV abre con la fila de encabezados', () => {
  const l = historicoCsv([]).replace('﻿', '').split('\r\n')
  assert.equal(l[0], 'Folio,Producto,Estilo,Etapa,Tanque,Cocción,Envasado,Liberado,Litros objetivo,Litros reales,Litros envasados,Merma L,Merma %,OG,FG,ABV,Levadura')
})

test('el CSV recorta la hora de fecha_liberado', () => {
  // Es timestamptz; la hora no aporta en una hoja de calculo y empuja la
  // columna a lo ancho.
  const l = historicoCsv([fila()]).split('\r\n')[1]
  assert.ok(l.includes('2026-10-22'))
  assert.ok(!l.includes('18:30'))
})

test('el CSV entrecomilla el punto y coma, no solo la coma', () => {
  // Excel en es-MX separa por `;`. Un nombre con `;` partiria la fila.
  const l = historicoCsv([fila({ levadura_cepa: 'W-34/70; 2a gen' })]).split('\r\n')[1]
  assert.ok(l.includes('"W-34/70; 2a gen"'))
})

test('el CSV duplica la comilla de adentro', () => {
  const l = historicoCsv([fila({ producto_nombre: 'Brasa "reserva"' })]).split('\r\n')[1]
  assert.ok(l.includes('"Brasa ""reserva"""'))
})

test('un null del CSV sale vacio, no "null"', () => {
  const l = historicoCsv([fila({ tanque_nombre: null, merma_pct: null })]).split('\r\n')[1]
  assert.ok(!l.includes('null'))
  assert.ok(l.includes(',,'))
})

// ── Filtros ─────────────────────────────────────────────────

const filas = [
  fila({ folio: 'A', producto_estilo: 'Lager', etapa: 'liberado', fecha_coccion: '2026-01-15' }),
  fila({ folio: 'B', producto_estilo: 'Stout', etapa: 'envasado', fecha_coccion: '2026-06-10' }),
  fila({ folio: 'C', producto_estilo: 'Lager', etapa: 'liberado', fecha_coccion: '2026-11-01' }),
]

test('sin filtros pasa todo', () => {
  assert.equal(filtrarHistorico(filas, FILTRO_VACIO).length, 3)
})

test('filtra por estilo y por etapa', () => {
  assert.deepEqual(
    filtrarHistorico(filas, { ...FILTRO_VACIO, estilo: 'Lager' }).map(f => f.folio),
    ['A', 'C']
  )
  assert.deepEqual(
    filtrarHistorico(filas, { ...FILTRO_VACIO, etapa: 'envasado' }).map(f => f.folio),
    ['B']
  )
})

test('el rango de fechas es inclusivo en los dos extremos', () => {
  assert.deepEqual(
    filtrarHistorico(filas, { ...FILTRO_VACIO, desde: '2026-01-15', hasta: '2026-06-10' })
      .map(f => f.folio),
    ['A', 'B']
  )
})

test('el rango compara strings ISO, sin pasar por Date', () => {
  // `new Date('2026-01-15')` en CDMX da el 14 de enero a las 18:00, asi que
  // comparar con Date dejaria fuera el lote del propio dia `desde`.
  assert.deepEqual(
    filtrarHistorico(filas, { ...FILTRO_VACIO, desde: '2026-11-01' }).map(f => f.folio),
    ['C']
  )
})

test('un lote sin fecha_coccion queda fuera de cualquier rango', () => {
  // No se puede afirmar que este dentro; dejarlo pasar lo contaria en todos
  // los periodos a la vez.
  const sinFecha = [fila({ folio: 'X', fecha_coccion: null })]
  assert.equal(filtrarHistorico(sinFecha, { ...FILTRO_VACIO, desde: '2026-01-01' }).length, 0)
  assert.equal(filtrarHistorico(sinFecha, FILTRO_VACIO).length, 1)
})

// ── Formato ─────────────────────────────────────────────────

test('los dias en etapa se leen en español', () => {
  assert.equal(fmtDias(0), 'hoy')
  assert.equal(fmtDias(1), '1 día')
  assert.equal(fmtDias(12), '12 días')
  assert.equal(fmtDias(null), '—')
})

test('la gravedad va con tres decimales', () => {
  // 1.05 y 1.050 son la misma densidad, pero en una columna de gravedades
  // la segunda se alinea con las demas.
  assert.equal(fmtGravedad(1.05), '1.050')
  assert.equal(fmtGravedad(null), '—')
})

// ── F2: alertas ─────────────────────────────────────────────

test('un motivo desconocido no se esconde: se devuelve tal cual', () => {
  // Si la vista empieza a emitir una clave nueva, tiene que aparecer en
  // pantalla para que alguien la traduzca, no desaparecer en silencio.
  assert.equal(textoMotivo('merma_alta'), 'Merma arriba del 10%')
  assert.equal(textoMotivo('clave_que_no_existe'), 'clave_que_no_existe')
})

test('los motivos se traducen en orden y un null da lista vacia', () => {
  assert.deepEqual(textosMotivos(['sin_lectura_48h', 'merma_alta']), [
    'Sin lectura en más de 48 h',
    'Merma arriba del 10%',
  ])
  assert.deepEqual(textosMotivos(null), [])
  assert.deepEqual(textosMotivos(undefined), [])
})

test('el peso de alerta ordena rojo > ambar > ninguna', () => {
  assert.ok(pesoAlerta('rojo') > pesoAlerta('ambar'))
  assert.ok(pesoAlerta('ambar') > pesoAlerta('ninguna'))
  assert.equal(pesoAlerta(null), 0)
  assert.equal(hayAlerta('ninguna'), false)
  assert.equal(hayAlerta('ambar'), true)
})

// ── F2: dias objetivo ───────────────────────────────────────

const receta = (p: Partial<DiasReceta> = {}): DiasReceta => ({
  dias_coccion: 1, dias_fermentacion: 14, dias_maduracion: 21, dias_envasado: 3, ...p,
})

test('dias objetivo por etapa espeja receta_dias_etapa() de SQL', () => {
  const r = receta()
  assert.equal(diasObjetivoEtapa('coccion', r), 1)
  assert.equal(diasObjetivoEtapa('fermentacion', r), 14)
  assert.equal(diasObjetivoEtapa('maduracion', r), 21)
  assert.equal(diasObjetivoEtapa('envasado', r), 3)
})

test('planeado, liberado y descartado no tienen dias objetivo', () => {
  // Planeado es la bandeja de entrada, no una etapa con duracion; las otras
  // dos son terminales.
  const r = receta()
  assert.equal(diasObjetivoEtapa('planeado', r), null)
  assert.equal(diasObjetivoEtapa('liberado', r), null)
  assert.equal(diasObjetivoEtapa('descartado', r), null)
})

test('sin receta no hay dias objetivo de ninguna etapa', () => {
  assert.equal(diasObjetivoEtapa('fermentacion', null), null)
})

test('un cero en la receta es un cero, no un faltante', () => {
  // `0 || null` daria null y trataria "no madura" como "no se sabe".
  assert.equal(diasObjetivoEtapa('maduracion', receta({ dias_maduracion: 0 })), 0)
})

test('el total suma las cuatro etapas', () => {
  assert.equal(diasObjetivoTotal(receta()), 39)
})

test('una receta incompleta NO da un total parcial', () => {
  // Un total a medias proyectaria una fecha falsa que se ve igual de
  // legitima que una buena.
  assert.equal(diasObjetivoTotal(receta({ dias_maduracion: null })), null)
  assert.equal(diasObjetivoTotal(null), null)
})

// ── F2: litros en camino ────────────────────────────────────

const enCamino = (p: Partial<LoteEnCamino> = {}): LoteEnCamino => ({
  producto_id: 'brasa', etapa: 'fermentacion',
  litros_reales: null, litros_objetivo: 800,
  fecha_fin_estimada: '2026-11-25', ...p,
})

test('suma los litros de los lotes que caen en la ventana', () => {
  const r = litrosEnCamino([
    enCamino({ fecha_fin_estimada: '2026-11-25', litros_objetivo: 800 }),
    enCamino({ fecha_fin_estimada: '2026-11-28', litros_objetivo: 500 }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), 1300)
  assert.equal(r.lotesPor.get('brasa'), 2)
})

test('prefiere los litros reales sobre el objetivo cuando ya se midieron', () => {
  const r = litrosEnCamino([
    enCamino({ litros_reales: 780, litros_objetivo: 800 }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), 780)
})

test('un litros_reales de 0 se respeta y no cae al objetivo', () => {
  // `?? `y no `||`: con `||` un lote medido en 0 reportaria su objetivo.
  const r = litrosEnCamino([
    enCamino({ litros_reales: 0, litros_objetivo: 800 }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), 0)
})

test('los lotes fuera de la ventana no se suman', () => {
  const r = litrosEnCamino([
    enCamino({ fecha_fin_estimada: '2026-12-20' }),
    enCamino({ fecha_fin_estimada: '2026-10-01' }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), undefined)
  assert.equal(r.sinFecha.get('brasa'), undefined)
})

test('la ventana es inclusiva en los dos extremos', () => {
  const r = litrosEnCamino([
    enCamino({ fecha_fin_estimada: '2026-11-18', litros_objetivo: 100 }),
    enCamino({ fecha_fin_estimada: '2026-12-02', litros_objetivo: 200 }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), 300)
})

test('un lote sin fecha estimada se reporta, no se reparte ni se asume', () => {
  // Mismo criterio que `sinClasificar` en stock-disponible.ts: el dato y sus
  // huecos viajan juntos.
  const r = litrosEnCamino([
    enCamino({ fecha_fin_estimada: null }),
    enCamino({ litros_objetivo: 500 }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), 500)
  assert.equal(r.sinFecha.get('brasa'), 1)
})

test('un lote sin litros de ningun tipo tambien se reporta como hueco', () => {
  const r = litrosEnCamino([
    enCamino({ litros_reales: null, litros_objetivo: null }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), undefined)
  assert.equal(r.sinFecha.get('brasa'), 1)
})

test('los lotes terminales no estan en camino: ya llegaron o se fueron', () => {
  const r = litrosEnCamino([
    enCamino({ etapa: 'liberado' }),
    enCamino({ etapa: 'descartado' }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.size, 0)
  assert.equal(r.sinFecha.size, 0)
})

test('separa por producto', () => {
  const r = litrosEnCamino([
    enCamino({ producto_id: 'brasa', litros_objetivo: 800 }),
    enCamino({ producto_id: 'caliza', litros_objetivo: 300 }),
  ], '2026-11-18', '2026-12-02')
  assert.equal(r.por.get('brasa'), 800)
  assert.equal(r.por.get('caliza'), 300)
})

// ── F2: geometria del calendario ────────────────────────────

const V0 = '2026-11-01'
const DIAS = 10   // ventana 2026-11-01 .. 2026-11-10

test('una barra dentro de la ventana se posiciona en fracciones', () => {
  // 11-03 a 11-04 = indices 2 y 3, fin inclusivo -> [2,4) de 10
  const b = barraEnVentana('2026-11-03', '2026-11-04', V0, DIAS)
  assert.ok(b)
  assert.equal(b!.izq, 0.2)
  assert.equal(b!.ancho, 0.2)
  assert.equal(b!.cortadaIzq, false)
  assert.equal(b!.cortadaDer, false)
})

test('un lote de un solo dia ocupa un dia, no cero', () => {
  // El fin es inclusivo. Sin el +1, una barra de un dia seria invisible.
  const b = barraEnVentana('2026-11-05', '2026-11-05', V0, DIAS)
  assert.ok(b)
  assert.equal(b!.ancho, 0.1)
})

test('una barra que empieza antes de la ventana se recorta y lo dice', () => {
  const b = barraEnVentana('2026-10-20', '2026-11-03', V0, DIAS)
  assert.ok(b)
  assert.equal(b!.izq, 0)
  assert.equal(b!.cortadaIzq, true)
  assert.equal(b!.cortadaDer, false)
})

test('una barra que termina despues de la ventana se recorta y lo dice', () => {
  const b = barraEnVentana('2026-11-08', '2026-12-15', V0, DIAS)
  assert.ok(b)
  assert.equal(b!.cortadaDer, true)
  assert.equal(b!.izq + b!.ancho, 1)
})

test('una barra que cubre toda la ventana se corta en los dos lados', () => {
  const b = barraEnVentana('2026-01-01', '2026-12-31', V0, DIAS)
  assert.ok(b)
  assert.equal(b!.izq, 0)
  assert.equal(b!.ancho, 1)
  assert.equal(b!.cortadaIzq, true)
  assert.equal(b!.cortadaDer, true)
})

test('una barra totalmente fuera de la ventana es null, no una barra de ancho 0', () => {
  // Devolver {ancho:0} haria que el calendario pintara una raya invisible
  // por cada lote viejo.
  assert.equal(barraEnVentana('2026-01-01', '2026-01-05', V0, DIAS), null)
  assert.equal(barraEnVentana('2027-01-01', '2027-01-05', V0, DIAS), null)
})

test('una barra que acaba justo el dia anterior a la ventana es null', () => {
  assert.equal(barraEnVentana('2026-10-25', '2026-10-31', V0, DIAS), null)
})

test('una barra que empieza el ultimo dia de la ventana si se ve', () => {
  const b = barraEnVentana('2026-11-10', '2026-11-20', V0, DIAS)
  assert.ok(b)
  assert.equal(b!.izq, 0.9)
  assert.equal(b!.ancho, 0.1)
})

test('una ventana de 0 dias no divide entre cero', () => {
  assert.equal(barraEnVentana('2026-11-03', '2026-11-04', V0, 0), null)
})

test('los dias restantes se cuentan desde la etapa actual', () => {
  const r = receta()  // 1 + 14 + 21 + 3
  assert.equal(diasRestantes('planeado', r), 39)
  assert.equal(diasRestantes('coccion', r), 39)
  assert.equal(diasRestantes('fermentacion', r), 38)
  assert.equal(diasRestantes('maduracion', r), 24)
  assert.equal(diasRestantes('envasado', r), 3)
})

test('un lote terminal no tiene dias restantes', () => {
  assert.equal(diasRestantes('liberado', receta()), null)
  assert.equal(diasRestantes('descartado', receta()), null)
})

test('una receta incompleta no da restantes parciales', () => {
  // Si falta maduracion, no se puede proyectar desde fermentacion.
  assert.equal(diasRestantes('fermentacion', receta({ dias_maduracion: null })), null)
  // Pero desde envasado si: maduracion ya no entra en lo que falta.
  assert.equal(diasRestantes('envasado', receta({ dias_maduracion: null })), 3)
})

test('sin receta no hay restantes', () => {
  assert.equal(diasRestantes('fermentacion', null), null)
})
