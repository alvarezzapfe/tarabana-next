/**
 * Tests de las metricas nuevas del Inicio.
 *
 *   npm test
 *
 * Se cubren los limites de los tramos de antiguedad (donde un off-by-one
 * mueve dinero de un bucket a otro sin que se note), el vencido real, y la
 * normalizacion de nombres de cliente.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_BUCKETS,
  RANGO_MAX_DIAS,
  antiguedadCartera,
  bucketAnoAnterior,
  bucketsDe,
  clientesActivosDe,
  cobradoEnRango,
  contarBuckets,
  diasDeRango,
  filasEnRango,
  granularidadAuto,
  granularidadEfectiva,
  granularidadesPosibles,
  itemsVendidosEn,
  litrosDeItems,
  nombreLegible,
  nombreCliente,
  normalizarRango,
  rangoAnoAnterior,
  rangoAnterior,
  rangoDePeriodo,
  requierenAtencion,
  PERIODOS,
  queryPeriodo,
  resolverPeriodo,
  resumenDePeriodo,
  serieDePeriodo,
  topClientes,
  vencidoDe,
  ventaDe,
  ventaTotal,
  netoDe,
  ivaTotal,
  cobradoSinIvaDe,
  porCobrarDe,
  serieFacturada,
  DIAS_ANO,
  MESES_TENDENCIA_MIN,
  SIN_ESTILO,
  SIN_PRESENTACION,
  estadoCobranzaDe,
  hallazgos,
  mesesDeTendencia,
  mezclaPorBucket,
  partidasValuadas,
  pedidosConSaldo,
  primerPedidoPorCliente,
  rangoTendencia,
  ritmoAnualizado,
  serieCrecimiento,
  totalesDeClientes,
  ventasPorCliente,
  ventasPorEstilo,
  ventasPorPresentacion,
  type FilaCobranza,
  type DatosPeriodo,
  type FilaSaldo,
  type PagoFila,
  type PedidoConItems,
  type Rango,
} from './metricas.ts'
import { topProductosEnLitros } from './unidades.ts'
import { sumarDias } from './fechas.ts'

const AHORA = new Date('2026-11-05T12:00:00-06:00')

function fila(over: Partial<FilaSaldo> = {}): FilaSaldo {
  return {
    id: 'p-' + Math.random().toString(36).slice(2, 8),
    cliente_id: 'c1',
    total: 1_000,
    pagado: 0,
    saldo: 1_000,
    iva_monto: 0,
    status: 'confirmado',
    estado_cobro: 'pendiente',
    dias_vencido: 0,
    fecha_pedido: '2026-11-01',
    // A proposito en otro mes que fecha_pedido: si alguna metrica volviera a
    // agrupar por created_at, los tests de abajo fallarian en vez de pasar
    // por accidente.
    created_at: '2026-06-15T00:00:00Z',
    ...over,
  }
}

// ── Vencido ─────────────────────────────────────────────────

test('vencidoDe cuenta por dias_vencido, no por estado_cobro', () => {
  const filas = [
    // El caso real de produccion: atrasado, con abono, estado 'parcial'.
    fila({ saldo: 100, pagado: 1_400, dias_vencido: 92, estado_cobro: 'parcial' }),
    fila({ saldo: 960, dias_vencido: 91, estado_cobro: 'vencido' }),
    // Vencido pero ya pagado: no hay nada que cobrar.
    fila({ saldo: 0, pagado: 3_600, dias_vencido: 61, estado_cobro: 'pagado' }),
    // Con saldo pero al corriente.
    fila({ saldo: 500, dias_vencido: 0, estado_cobro: 'pendiente' }),
  ]

  // 100 + 960. Filtrar por estado_cobro === 'vencido' daria solo 960.
  assert.equal(vencidoDe(filas), 1_060)
})

test('vencidoDe ignora el sobrepago en vez de restarlo', () => {
  const filas = [
    fila({ saldo: -200, pagado: 1_200, dias_vencido: 40, estado_cobro: 'pagado' }),
    fila({ saldo: 300, dias_vencido: 40, estado_cobro: 'vencido' }),
  ]
  assert.equal(vencidoDe(filas), 300)
})

// ── Antiguedad de cartera ───────────────────────────────────

test('antiguedadCartera: los limites de cada tramo caen donde dicen', () => {
  const filas = [
    fila({ saldo: 1, dias_vencido: 0 }),   // al corriente
    fila({ saldo: 2, dias_vencido: 1 }),   // 1-30, borde bajo
    fila({ saldo: 4, dias_vencido: 30 }),  // 1-30, borde alto
    fila({ saldo: 8, dias_vencido: 31 }),  // 31-60, borde bajo
    fila({ saldo: 16, dias_vencido: 60 }), // 31-60, borde alto
    fila({ saldo: 32, dias_vencido: 61 }), // 61-90, borde bajo
    fila({ saldo: 64, dias_vencido: 90 }), // 61-90, borde alto
    fila({ saldo: 128, dias_vencido: 91 }), // 90+, borde bajo
    fila({ saldo: 256, dias_vencido: 999 }), // 90+
  ]

  const b = antiguedadCartera(filas)
  assert.deepEqual(b.map(x => x.clave), ['corriente', '1-30', '31-60', '61-90', '90+'])
  // Las potencias de 2 hacen que cualquier fuga entre tramos sea inconfundible.
  assert.deepEqual(b.map(x => x.monto), [1, 6, 24, 96, 384])
  assert.deepEqual(b.map(x => x.pedidos), [1, 2, 2, 2, 2])
})

test('antiguedadCartera: solo cartera, lo ya pagado no tiene antiguedad', () => {
  const filas = [
    fila({ saldo: 0, pagado: 1_000, dias_vencido: 95, estado_cobro: 'pagado' }),
    fila({ saldo: -50, pagado: 1_050, dias_vencido: 95, estado_cobro: 'pagado' }),
    fila({ saldo: 700, dias_vencido: 95 }),
  ]

  const b = antiguedadCartera(filas)
  assert.equal(b[4].monto, 700)
  assert.equal(b[4].pedidos, 1)
  assert.equal(b.reduce((s, x) => s + x.pedidos, 0), 1)
})

test('antiguedadCartera: sin cartera devuelve los cinco tramos en cero', () => {
  const b = antiguedadCartera([])
  assert.equal(b.length, 5)
  assert.deepEqual(b.map(x => x.monto), [0, 0, 0, 0, 0])
})

// ── Requiere atencion ───────────────────────────────────────

test('requierenAtencion: entra lo vencido y lo que lleva mas de 30 dias abierto', () => {
  const filas = [
    fila({ id: 'viejo', saldo: 500, dias_vencido: 90, fecha_pedido: '2026-08-01' }),
    fila({ id: 'medio', saldo: 900, dias_vencido: 10, fecha_pedido: '2026-10-20' }),
    // Sin vencer por fecha, pero con 40 dias de saldo abierto.
    fila({ id: 'abierto', saldo: 300, dias_vencido: 0, fecha_pedido: '2026-09-20' }),
    // Reciente y al corriente: no molesta.
    fila({ id: 'nuevo', saldo: 700, dias_vencido: 0, fecha_pedido: '2026-11-01' }),
    // Pagado: fuera, aunque sea viejo.
    fila({ id: 'pagado', saldo: 0, pagado: 1_000, dias_vencido: 90, fecha_pedido: '2026-08-01' }),
  ]

  const r = requierenAtencion(filas, AHORA)
  assert.deepEqual(r.map(x => x.id), ['viejo', 'medio', 'abierto'])
  assert.equal(r[0].diasVencido, 90)
  assert.ok(r[2].diasAbierto > 30, `diasAbierto fue ${r[2].diasAbierto}`)
})

test('requierenAtencion: a igual atraso, primero el monto mas grande', () => {
  const filas = [
    fila({ id: 'chico', saldo: 100, dias_vencido: 50 }),
    fila({ id: 'grande', saldo: 9_000, dias_vencido: 50 }),
  ]
  assert.deepEqual(requierenAtencion(filas, AHORA).map(x => x.id), ['grande', 'chico'])
})

// ── Nombres de cliente ──────────────────────────────────────

test('nombreLegible: razon_social gana a full_name y a email', () => {
  assert.equal(
    nombreLegible({ id: 'c', razon_social: 'ARTIS CERVISIA', full_name: 'DRUNKENDOG', email: 'x@y.mx' }),
    'Artis Cervisia'
  )
  assert.equal(
    nombreLegible({ id: 'c', razon_social: null, full_name: 'Jair Soto', email: 'x@y.mx' }),
    'Jair Soto'
  )
  assert.equal(
    nombreLegible({ id: 'c', razon_social: null, full_name: null, email: 'x@y.mx' }),
    'x@y.mx'
  )
})

test('nombreLegible: el nombre comercial le gana a la razon social', () => {
  // El cliente es el NEGOCIO: una persona fisica puede facturar por un bar
  // con su propia marca, y en la tabla se busca el bar.
  assert.equal(
    nombreLegible({
      id: 'c', marca_negocio: 'Bar La Esquina',
      razon_social: 'JUAN PEREZ LOPEZ', full_name: 'Juan Perez', email: 'x@y.mx',
    }),
    'Bar La Esquina'
  )
  // Sin nombre comercial, la precedencia de siempre.
  assert.equal(
    nombreLegible({
      id: 'c', marca_negocio: null,
      razon_social: 'ARTIS CERVISIA', full_name: 'DRUNKENDOG', email: 'x@y.mx',
    }),
    'Artis Cervisia'
  )
})

test('nombreCliente: el secundario solo sale si dice algo distinto', () => {
  // Negocio con razon social propia: las dos lineas aportan.
  assert.deepEqual(
    nombreCliente({
      id: 'c', marca_negocio: 'Bar La Esquina',
      razon_social: 'JUAN PEREZ LOPEZ', full_name: null, email: 'x@y.mx',
    }),
    { principal: 'Bar La Esquina', secundario: 'JUAN PEREZ LOPEZ' }
  )

  // Se llaman igual salvo las mayusculas: repetirlo en gris seria ruido.
  assert.deepEqual(
    nombreCliente({
      id: 'c', marca_negocio: 'Artis Cervisia',
      razon_social: 'ARTIS CERVISIA', full_name: null, email: null,
    }),
    { principal: 'Artis Cervisia', secundario: null }
  )

  // Sin razon social, el correo hace de segunda linea.
  assert.deepEqual(
    nombreCliente({ id: 'c', marca_negocio: 'Bar La Esquina', razon_social: null, full_name: null, email: 'x@y.mx' }),
    { principal: 'Bar La Esquina', secundario: 'x@y.mx' }
  )

  // Cuando el nombre ES el correo, no se repite abajo.
  assert.deepEqual(
    nombreCliente({ id: 'c', marca_negocio: null, razon_social: null, full_name: null, email: 'x@y.mx' }),
    { principal: 'x@y.mx', secundario: null }
  )
})

test('nombreLegible: nunca devuelve vacio ni "Sin nombre"', () => {
  const n = nombreLegible({ id: 'c', razon_social: null, full_name: '  ', email: null })
  assert.equal(n, 'Cliente sin nombre')
  assert.notEqual(n, 'Sin nombre')
})

test('nombreLegible: pasa a Titulo lo que viene en mayusculas, respetando siglas', () => {
  assert.equal(
    nombreLegible({
      id: 'c', razon_social: 'CERVECERIA DOS AVES DE SAN MIGUEL DE ALLENDE S.A.P.I. DE C.V.',
      full_name: null, email: null,
    }),
    'Cerveceria Dos Aves de San Miguel de Allende S.A.P.I. de C.V.'
  )
  assert.equal(
    nombreLegible({ id: 'c', razon_social: 'LUIS ARMANDO ALVAREZ ZAPFE', full_name: null, email: null }),
    'Luis Armando Alvarez Zapfe'
  )
})

test('nombreLegible: un nombre que ya trae minusculas no se reescribe', () => {
  // Adivinar donde van las mayusculas de un nombre propio es peor que dejarlo.
  assert.equal(
    nombreLegible({ id: 'c', razon_social: null, full_name: 'carlos eduardo gonzalez nava', email: null }),
    'carlos eduardo gonzalez nava'
  )
})

// ── Top clientes ────────────────────────────────────────────

test('topClientes: ordena por facturado, acumula saldo y reparte el 100%', () => {
  const clientes = [
    { id: 'a', razon_social: null, full_name: 'Cliente A', email: null },
    { id: 'b', razon_social: null, full_name: 'Cliente B', email: null },
  ]
  const filas = [
    fila({ cliente_id: 'a', total: 1_000, pagado: 1_000, saldo: 0 }),
    fila({ cliente_id: 'a', total: 500, pagado: 0, saldo: 500 }),
    fila({ cliente_id: 'b', total: 300, pagado: 100, saldo: 200 }),
  ]

  const top = topClientes(filas, clientes)
  assert.deepEqual(top.map(c => c.nombre), ['Cliente A', 'Cliente B'])
  assert.equal(top[0].facturado, 1_500)
  assert.equal(top[0].saldo, 500)
  assert.equal(Math.round(top.reduce((s, c) => s + c.pct, 0)), 100)
})

test('topClientes: un cliente que ya no esta en profiles no rompe la lista', () => {
  const top = topClientes([fila({ cliente_id: 'fantasma' })], [])
  assert.equal(top.length, 1)
  assert.equal(top[0].nombre, 'Cliente sin nombre')
})

// ── Top productos en litros ─────────────────────────────────

test('topProductosEnLitros: convierte cada presentacion a volumen', () => {
  const { filas, sinUnidad } = topProductosEnLitros([
    // 2 cajas de 24 = 48 latas * 0.355 = 17.04 L
    { nombre: 'Magma', unidad: 'caja24', cantidad: 2 },
    // 1 barril de acero = 20 L
    { nombre: 'Brisa', unidad: 'barril_acero', cantidad: 1 },
    // 1 mix de 24 = 8.52 L
    { nombre: 'Magma', unidad: 'mix24', cantidad: 1 },
  ])

  assert.equal(sinUnidad, 0)
  // Brisa 20 L le gana a Magma 25.56... no: Magma suma 17.04 + 8.52 = 25.56
  assert.deepEqual(filas.map(f => f.nombre), ['Magma', 'Brisa'])
  assert.equal(Math.round(filas[0].litros * 100) / 100, 25.56)
  assert.equal(filas[1].litros, 20)
})

test('topProductosEnLitros: una partida sin unidad se reporta, no se inventa', () => {
  // En produccion hay una partida con `unidad` en null.
  const { filas, sinUnidad } = topProductosEnLitros([
    { nombre: 'Magma', unidad: 'caja24', cantidad: 1 },
    { nombre: 'Caliza', unidad: null, cantidad: 10 },
    { nombre: 'Caliza', unidad: 'unidad_rara', cantidad: 10 },
  ])

  assert.equal(sinUnidad, 2)
  assert.deepEqual(filas.map(f => f.nombre), ['Magma'])
})

test('un barril de 20 L pesa mas que una caja de 24, que es el punto de medir en litros', () => {
  const { filas } = topProductosEnLitros([
    { nombre: 'Barrilera', unidad: 'barril_pet', cantidad: 1 },
    { nombre: 'Latera', unidad: 'caja24', cantidad: 2 },
  ])
  // Por piezas serian 1 vs 2 y "Latera" ganaria; por volumen, 20 vs 17.04.
  assert.deepEqual(filas.map(f => f.nombre), ['Barrilera', 'Latera'])
})

// ── fecha_pedido vs created_at ──────────────────────────────

test('agrupa por fecha_pedido y NO por created_at', () => {
  // El caso que motivo la columna: un pedido levantado en agosto y capturado
  // en noviembre pertenece a agosto.
  const filas = [
    fila({ fecha_pedido: '2026-08-20', created_at: '2026-11-05T18:00:00Z', total: 1_000, pagado: 0, saldo: 1_000 }),
  ]

  const serie = serieDePeriodo(
    { saldos: filas, pagos: [], pedidos: [] },
    bucketsDe(rangoDePeriodo('12m', AHORA), 'mes')
  )
  const agosto = serie.find(p => p.desde === '2026-08-01')
  const noviembre = serie.find(p => p.desde === '2026-11-01')

  assert.equal(agosto?.facturado, 1_000, 'no cayo en agosto')
  assert.equal(noviembre?.facturado, 0, 'cayo en noviembre, o sea agrupo por created_at')
})

test('la antiguedad del saldo se mide desde fecha_pedido', () => {
  // Capturado hoy, con fecha de hace dos meses: lleva dos meses abierto, no
  // cero dias.
  const r = requierenAtencion(
    [fila({ id: 'retro', saldo: 500, dias_vencido: 0, fecha_pedido: '2026-09-05', created_at: '2026-11-05T12:00:00Z' })],
    new Date('2026-11-05T12:00:00-06:00')
  )

  assert.equal(r.length, 1, 'quedo fuera, o sea midio desde la captura')
  assert.equal(r[0].diasAbierto, 61)
})

test('clientes activos: la ventana corre sobre fecha_pedido', () => {
  const ahora = new Date('2026-11-05T12:00:00-06:00')
  const filas = [
    // Dentro de los 90 dias.
    fila({ cliente_id: 'dentro', fecha_pedido: '2026-09-01' }),
    // Fuera, aunque se haya capturado hoy.
    fila({ cliente_id: 'fuera', fecha_pedido: '2026-01-10', created_at: '2026-11-05T12:00:00Z' }),
  ]

  assert.equal(clientesActivosDe(filas, ahora), 1)
})

// ── Limites de los periodos ─────────────────────────────────
//
// AHORA es el 5 de noviembre de 2026, 12:00 CDMX.

const rango = (desde: string, hasta: string): Rango => ({ desde, hasta })

test('rangoDePeriodo: cada periodo empieza y acaba donde dice', () => {
  // Los "a la fecha" terminan HOY, no a fin de mes: un rango que se extiende
  // al futuro mete buckets vacios a la derecha de la grafica.
  assert.deepEqual(rangoDePeriodo('mes', AHORA), rango('2026-11-01', '2026-11-05'))
  // El mes anterior si va completo, porque ya cerro.
  assert.deepEqual(rangoDePeriodo('mes_anterior', AHORA), rango('2026-10-01', '2026-10-31'))
  // Trimestre CALENDARIO: noviembre cae en oct-dic.
  assert.deepEqual(rangoDePeriodo('trimestre', AHORA), rango('2026-10-01', '2026-11-05'))
  assert.deepEqual(rangoDePeriodo('ytd', AHORA), rango('2026-01-01', '2026-11-05'))
  // 12 meses son 12, contando el actual: dic-25 ... nov-26.
  assert.deepEqual(rangoDePeriodo('12m', AHORA), rango('2025-12-01', '2026-11-05'))
  assert.deepEqual(rangoDePeriodo('24m', AHORA), rango('2024-12-01', '2026-11-05'))
})

test('rangoDePeriodo: 12m y 24m dan exactamente 12 y 24 meses', () => {
  assert.equal(contarBuckets(rangoDePeriodo('12m', AHORA), 'mes'), 12)
  assert.equal(contarBuckets(rangoDePeriodo('24m', AHORA), 'mes'), 24)
})

test('rangoDePeriodo: el trimestre arranca en el mes correcto los 12 meses', () => {
  const primeros = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => {
    const mm = String(m).padStart(2, '0')
    return rangoDePeriodo('trimestre', new Date(`2026-${mm}-15T12:00:00-06:00`)).desde
  })
  assert.deepEqual(primeros, [
    '2026-01-01', '2026-01-01', '2026-01-01',
    '2026-04-01', '2026-04-01', '2026-04-01',
    '2026-07-01', '2026-07-01', '2026-07-01',
    '2026-10-01', '2026-10-01', '2026-10-01',
  ])
})

test('rangoDePeriodo: a las 19:30 de CDMX el periodo sigue siendo el de Mexico', () => {
  // La frontera de fechas.ts, aplicada al selector: en UTC ya es noviembre.
  const noche = new Date('2026-10-31T19:30:00-06:00')
  assert.equal(noche.toISOString().slice(0, 10), '2026-11-01', 'cambio el supuesto de UTC')

  assert.deepEqual(rangoDePeriodo('mes', noche), rango('2026-10-01', '2026-10-31'))
  // Y el mes anterior es septiembre, no octubre.
  assert.deepEqual(rangoDePeriodo('mes_anterior', noche), rango('2026-09-01', '2026-09-30'))
})

test('diasDeRango cuenta los dos extremos', () => {
  assert.equal(diasDeRango(rango('2026-11-05', '2026-11-05')), 1)
  assert.equal(diasDeRango(rango('2026-11-01', '2026-11-30')), 30)
  // Febrero bisiesto.
  assert.equal(diasDeRango(rango('2024-02-01', '2024-02-29')), 29)
})

// ── Periodo anterior ────────────────────────────────────────

test('rangoAnterior: misma duracion, pegado atras y sin traslape', () => {
  const r = rango('2026-11-01', '2026-11-05') // 5 dias
  assert.deepEqual(rangoAnterior(r), rango('2026-10-27', '2026-10-31'))
  assert.equal(diasDeRango(rangoAnterior(r)), diasDeRango(r))
  // Pegado: el dia siguiente al fin del anterior es el inicio del actual.
  assert.equal(sumarDias(rangoAnterior(r).hasta, 1), r.desde)
})

test('rangoAnterior: la base de un mes de 31 dias son 31 dias, no el mes previo', () => {
  // Octubre tiene 31 y septiembre 30. "La misma duracion" gana: la base va del
  // 31 de agosto al 30 de septiembre. Comparar 31 dias contra 30 seria peor.
  assert.deepEqual(rangoAnterior(rango('2026-10-01', '2026-10-31')), rango('2026-08-31', '2026-09-30'))
})

test('rangoAnterior: funciona igual con un rango personalizado cualquiera', () => {
  const r = rango('2026-03-11', '2026-03-20') // 10 dias
  assert.deepEqual(rangoAnterior(r), rango('2026-03-01', '2026-03-10'))
})

// ── Anio anterior ───────────────────────────────────────────

test('rangoAnoAnterior: el mismo periodo por calendario, no menos 365 dias', () => {
  assert.deepEqual(rangoAnoAnterior(rango('2025-12-01', '2026-11-05')), rango('2024-12-01', '2025-11-05'))
  assert.deepEqual(rangoAnoAnterior(rango('2026-11-01', '2026-11-30')), rango('2025-11-01', '2025-11-30'))
})

test('rangoAnoAnterior: el 29 de febrero se recorta al 28', () => {
  // 2023 no fue bisiesto. Sin recorte, "un anio antes" se iria al 1 de marzo.
  assert.deepEqual(rangoAnoAnterior(rango('2024-02-29', '2024-02-29')), rango('2023-02-28', '2023-02-28'))
})

// ── Granularidad ────────────────────────────────────────────

test('granularidadAuto: los cortes caen en 31 y 120 dias', () => {
  assert.equal(granularidadAuto(rango('2026-01-01', '2026-01-31')), 'dia')    // 31, borde alto
  assert.equal(granularidadAuto(rango('2026-01-01', '2026-02-01')), 'semana') // 32, borde bajo
  assert.equal(granularidadAuto(rango('2026-01-01', '2026-04-30')), 'semana') // 120, borde alto
  assert.equal(granularidadAuto(rango('2026-01-01', '2026-05-01')), 'mes')    // 121, borde bajo
})

test('granularidadAuto: los periodos con nombre salen como se espera', () => {
  assert.equal(granularidadAuto(rangoDePeriodo('mes', AHORA)), 'dia')
  assert.equal(granularidadAuto(rangoDePeriodo('mes_anterior', AHORA)), 'dia')
  assert.equal(granularidadAuto(rangoDePeriodo('trimestre', AHORA)), 'semana')
  assert.equal(granularidadAuto(rangoDePeriodo('ytd', AHORA)), 'mes')
  assert.equal(granularidadAuto(rangoDePeriodo('12m', AHORA)), 'mes')
  assert.equal(granularidadAuto(rangoDePeriodo('24m', AHORA)), 'mes')
})

test('granularidadesPosibles: no ofrece lo que no se puede leer', () => {
  // 12 meses por dia serian 340 barras.
  const doce = rangoDePeriodo('12m', AHORA)
  assert.ok(contarBuckets(doce, 'dia') > MAX_BUCKETS)
  assert.deepEqual(granularidadesPosibles(doce), ['semana', 'mes'])
  // Un mes acepta las tres.
  assert.deepEqual(granularidadesPosibles(rangoDePeriodo('mes_anterior', AHORA)), ['dia', 'semana', 'mes'])
})

test('granularidadEfectiva: el override manda, salvo que no quepa', () => {
  const mes = rangoDePeriodo('mes_anterior', AHORA)
  assert.equal(granularidadEfectiva(mes, 'mes'), 'mes')
  assert.equal(granularidadEfectiva(mes, null), 'dia', 'sin override deberia caer en la automatica')

  // En 12 meses, pedir dia no cabe y se cae a la automatica.
  const doce = rangoDePeriodo('12m', AHORA)
  assert.equal(granularidadEfectiva(doce, 'dia'), 'mes')
  assert.equal(granularidadEfectiva(doce, 'semana'), 'semana')
})

test('contarBuckets coincide con los buckets que se construyen', () => {
  const casos: [Rango, 'dia' | 'semana' | 'mes'][] = [
    [rango('2026-11-01', '2026-11-05'), 'dia'],
    [rango('2026-11-04', '2026-11-20'), 'semana'],
    [rango('2025-12-01', '2026-11-05'), 'mes'],
    [rango('2026-01-01', '2026-01-01'), 'semana'],
    [rango('2024-02-01', '2024-02-29'), 'semana'],
  ]
  for (const [r, g] of casos) {
    assert.equal(contarBuckets(r, g), bucketsDe(r, g).length, `${r.desde}..${r.hasta} por ${g}`)
  }
})

// ── Buckets ─────────────────────────────────────────────────

test('bucketsDe: los buckets son contiguos y cubren el rango exacto', () => {
  for (const g of ['dia', 'semana', 'mes'] as const) {
    const r = rango('2026-02-11', '2026-05-07')
    const bs = bucketsDe(r, g)

    assert.equal(bs[0].desde, r.desde, `${g}: el primero no arranca en el rango`)
    assert.equal(bs[bs.length - 1].hasta, r.hasta, `${g}: el ultimo se pasa o se queda corto`)
    for (let i = 1; i < bs.length; i++) {
      assert.equal(bs[i].desde, sumarDias(bs[i - 1].hasta, 1), `${g}: hueco o traslape en ${i}`)
    }
  }
})

test('bucketsDe por mes: el primero y el ultimo se recortan al rango', () => {
  // Recortar es lo que hace que la suma de los buckets sea el total del
  // periodo; si el primero se extendiera hacia atras, la grafica mostraria
  // dinero que el KPI no cuenta.
  const bs = bucketsDe(rango('2026-10-15', '2026-11-05'), 'mes')
  assert.equal(bs.length, 2)
  assert.deepEqual([bs[0].desde, bs[0].hasta], ['2026-10-15', '2026-10-31'])
  assert.deepEqual([bs[1].desde, bs[1].hasta], ['2026-11-01', '2026-11-05'])
})

test('bucketsDe por semana: la primera semana se corta en domingo', () => {
  // 2026-11-04 es miercoles, asi que la primera semana dura 5 dias y el resto
  // arrancan en lunes. Con semanas de domingo a sabado, el fin de semana
  // quedaria partido en dos barras.
  const bs = bucketsDe(rango('2026-11-04', '2026-11-20'), 'semana')
  assert.deepEqual(
    bs.map(b => [b.desde, b.hasta]),
    [['2026-11-04', '2026-11-08'], ['2026-11-09', '2026-11-15'], ['2026-11-16', '2026-11-20']]
  )
})

test('bucketsDe por dia: un bucket por dia, con su propia etiqueta', () => {
  const bs = bucketsDe(rango('2026-11-03', '2026-11-05'), 'dia')
  assert.deepEqual(bs.map(b => b.desde), ['2026-11-03', '2026-11-04', '2026-11-05'])
  assert.ok(bs.every(b => b.desde === b.hasta))
  assert.equal(bs[0].etiqueta, '3 nov')
})

test('bucketAnoAnterior: uno a uno contra el bucket actual', () => {
  const bs = bucketsDe(rangoDePeriodo('12m', AHORA), 'mes')
  const previos = bs.map(bucketAnoAnterior)

  assert.equal(previos.length, bs.length, 'la linea de comparacion se desalinearia')
  assert.deepEqual([previos[0].desde, previos[0].hasta], ['2024-12-01', '2024-12-31'])
  // El ultimo bucket actual va recortado a hoy; su espejo tambien.
  assert.deepEqual([bs[11].desde, bs[11].hasta], ['2026-11-01', '2026-11-05'])
  assert.deepEqual([previos[11].desde, previos[11].hasta], ['2025-11-01', '2025-11-05'])
})

// ── resolverPeriodo (lo que llega por la URL) ───────────────

test('resolverPeriodo: ?periodo= valido se respeta', () => {
  assert.deepEqual(resolverPeriodo({ periodo: 'mes_anterior' }, AHORA), {
    clave: 'mes_anterior',
    rango: rango('2026-10-01', '2026-10-31'),
  })
})

test('resolverPeriodo: sin parametros cae en 12 meses', () => {
  assert.deepEqual(resolverPeriodo({}, AHORA), { clave: '12m', rango: rango('2025-12-01', '2026-11-05') })
})

test('resolverPeriodo: la basura de la URL no revienta, cae en el default', () => {
  for (const basura of ['', 'mes2', '../etc', 'personalizado']) {
    assert.equal(resolverPeriodo({ periodo: basura }, AHORA).clave, '12m', `fallo con "${basura}"`)
  }
  // Un rango a medias tampoco es un rango.
  assert.equal(resolverPeriodo({ desde: '2026-01-01' }, AHORA).clave, '12m')
  assert.equal(resolverPeriodo({ desde: '2026-02-30', hasta: '2026-03-05' }, AHORA).clave, '12m')
})

test('resolverPeriodo: un rango explicito manda sobre ?periodo=', () => {
  const r = resolverPeriodo({ periodo: '12m', desde: '2026-03-01', hasta: '2026-03-31' }, AHORA)
  assert.deepEqual(r, { clave: 'personalizado', rango: rango('2026-03-01', '2026-03-31') })
})

test('normalizarRango: ordena los extremos al reves y recorta lo absurdo', () => {
  assert.deepEqual(normalizarRango('2026-03-31', '2026-03-01'), rango('2026-03-01', '2026-03-31'))

  // Un rango de siglos llega por la URL, no por la UI: se recorta para que la
  // pantalla siga contestando, y el selector muestra la fecha recortada.
  const enorme = normalizarRango('0001-01-01', '2026-11-05')
  assert.equal(diasDeRango(enorme), RANGO_MAX_DIAS)
  assert.equal(enorme.hasta, '2026-11-05')
})

// ── Cobrado por fecha de pago vs facturado por fecha de pedido ──

const pago = (fecha_pago: string, monto: number): PagoFila => ({ fecha_pago, monto })

const datos = (over: Partial<DatosPeriodo> = {}): DatosPeriodo =>
  ({ saldos: [], pagos: [], pedidos: [], ...over })

test('Cobrado va por fecha de pago y Facturado por fecha de pedido', () => {
  // El caso que separa las dos preguntas: un pedido de agosto que se cobra en
  // noviembre. `pedidos_saldo.pagado` no tiene fecha, asi que agrupando por la
  // vista ese dinero contaria como cobro de AGOSTO.
  const d = datos({
    saldos: [fila({ fecha_pedido: '2026-08-10', pagado: 1_000, saldo: 0, estado_cobro: 'pagado' })],
    pagos: [pago('2026-11-03', 1_000)],
  })

  const noviembre = resumenDePeriodo(d, rangoDePeriodo('mes', AHORA))
  assert.equal(noviembre.facturado, 0, 'noviembre no facturo nada')
  assert.equal(noviembre.cobrado, 1_000, 'el dinero entro en noviembre')
  assert.equal(noviembre.pedidos, 0)
  assert.equal(noviembre.pctCobrado, null, 'sin facturacion no hay porcentaje')

  const agosto = resumenDePeriodo(d, rango('2026-08-01', '2026-08-31'))
  assert.equal(agosto.facturado, 1_000, 'el pedido es de agosto')
  assert.equal(agosto.cobrado, 0, 'en agosto no entro dinero')
  assert.equal(agosto.pctCobrado, 100, 'de lo facturado en agosto ya se cobro todo')
})

test('un pago cancelado no llega aqui, pero un pago fuera del rango tampoco cuenta', () => {
  const pagos = [pago('2026-10-31', 500), pago('2026-11-01', 700), pago('2026-11-05', 300)]
  // Los bordes son inclusivos en los dos extremos.
  assert.equal(cobradoEnRango(pagos, rangoDePeriodo('mes', AHORA)), 1_000)
  assert.equal(cobradoEnRango(pagos, rango('2026-10-31', '2026-10-31')), 500)
})

test('pctCobrado es la cohorte del pedido, no el cociente de los dos KPIs', () => {
  // Facturado 1,000 en noviembre, del que entro la mitad; y ademas entraron
  // 5,000 de un pedido viejo. El cociente de los KPIs daria 500%.
  const d = datos({
    saldos: [fila({ fecha_pedido: '2026-11-02', pagado: 500, saldo: 500 })],
    pagos: [pago('2026-11-02', 500), pago('2026-11-03', 5_000)],
  })
  const r = resumenDePeriodo(d, rangoDePeriodo('mes', AHORA))
  assert.equal(r.facturado, 1_000)
  assert.equal(r.cobrado, 5_500)
  assert.equal(r.pctCobrado, 50)
})

// ── Resumen del periodo ─────────────────────────────────────

test('resumenDePeriodo: ticket promedio y clientes distintos', () => {
  const d = datos({
    saldos: [
      fila({ cliente_id: 'a', fecha_pedido: '2026-11-02', pagado: 0, saldo: 1_000 }),
      fila({ cliente_id: 'a', fecha_pedido: '2026-11-03', pagado: 0, saldo: 2_000 }),
      fila({ cliente_id: 'b', fecha_pedido: '2026-11-04', pagado: 0, saldo: 3_000 }),
      // Fuera del periodo: no debe mover ni el ticket ni los clientes.
      fila({ cliente_id: 'c', fecha_pedido: '2026-10-20', pagado: 0, saldo: 9_000 }),
    ],
  })
  const r = resumenDePeriodo(d, rangoDePeriodo('mes', AHORA))
  assert.equal(r.facturado, 6_000)
  assert.equal(r.pedidos, 3)
  assert.equal(r.ticket, 2_000)
  assert.equal(r.clientes, 2, 'el mismo cliente con dos pedidos cuenta una vez')
})

test('resumenDePeriodo: un periodo vacio no inventa un ticket de cero', () => {
  const r = resumenDePeriodo(datos(), rangoDePeriodo('mes', AHORA))
  assert.deepEqual(
    [r.facturado, r.cobrado, r.pedidos, r.litros, r.clientes],
    [0, 0, 0, 0, 0]
  )
  // null y no 0: dividir entre cero no da cero, y un "ticket promedio $0"
  // se lee como si se hubiera vendido a precio cero.
  assert.equal(r.ticket, null)
  assert.equal(r.pctCobrado, null)
})

test('un pedido sin cliente_id cuenta como pedido pero no como cliente', () => {
  const d = datos({ saldos: [fila({ cliente_id: null, fecha_pedido: '2026-11-02' })] })
  const r = resumenDePeriodo(d, rangoDePeriodo('mes', AHORA))
  assert.equal(r.pedidos, 1)
  assert.equal(r.clientes, 0)
})

// ── Litros vendidos del periodo ─────────────────────────────

const conItems = (fecha_pedido: string, items: { unidad: string | null; cantidad: number }[]): PedidoConItems => ({
  id: 'p-' + fecha_pedido + '-' + items.length,
  fecha_pedido,
  pedido_items: items.map(it => ({ ...it, productos: { nombre: 'Magma' } })),
})

test('litros vendidos: solo los pedidos del periodo, y la unidad manda', () => {
  const pedidos = [
    conItems('2026-11-02', [{ unidad: 'barril_pet', cantidad: 2 }]),   // 40 L
    conItems('2026-11-04', [{ unidad: 'caja24', cantidad: 1 }]),       // 8.52 L
    conItems('2026-10-02', [{ unidad: 'barril_pet', cantidad: 10 }]),  // fuera
  ]
  const items = itemsVendidosEn(pedidos, rangoDePeriodo('mes', AHORA))
  assert.equal(items.length, 2)
  assert.equal(litrosDeItems(items).toFixed(2), '48.52')
})

test('litros vendidos: una partida sin unidad se omite, no se asume', () => {
  // Rellenar la unidad inventaria volumen que no se vendio.
  const items = itemsVendidosEn(
    [conItems('2026-11-02', [{ unidad: null, cantidad: 5 }, { unidad: 'barril_pet', cantidad: 1 }])],
    rangoDePeriodo('mes', AHORA)
  )
  assert.equal(items.length, 2, 'la partida sin unidad igual se reporta hacia arriba')
  assert.equal(litrosDeItems(items), 20)
})

test('itemsVendidosEn normaliza el to-one que Supabase puede tipar como arreglo', () => {
  const pedidos: PedidoConItems[] = [
    { id: 'uno', fecha_pedido: '2026-11-02', pedido_items: [{ unidad: 'lata', cantidad: 1, productos: [{ nombre: 'Tierra' }] }] },
    { id: 'dos', fecha_pedido: '2026-11-02', pedido_items: [{ unidad: 'lata', cantidad: 1, productos: null }] },
  ]
  const items = itemsVendidosEn(pedidos, rangoDePeriodo('mes', AHORA))
  assert.deepEqual(items.map(i => i.nombre), ['Tierra', 'Sin producto'])
})

// ── La serie de la grafica ──────────────────────────────────

test('serieDePeriodo: los buckets sin nada salen en cero, no desaparecen', () => {
  // Es justo lo que hay que ver en un mes sin ventas.
  const d = datos({ saldos: [fila({ fecha_pedido: '2026-09-15', pagado: 0, saldo: 1_000 })] })
  const serie = serieDePeriodo(d, bucketsDe(rangoDePeriodo('12m', AHORA), 'mes'))

  assert.equal(serie.length, 12)
  const conDato = serie.filter(p => p.facturado > 0)
  assert.equal(conDato.length, 1)
  assert.equal(conDato[0].desde, '2026-09-01')
  // Los otros once, en cero y con pct null (no 0%, que seria un dato falso).
  for (const p of serie.filter(p => p.facturado === 0)) {
    assert.equal(p.pedidos, 0)
    assert.equal(p.cobrado, 0)
    assert.equal(p.litros, 0)
    assert.equal(p.pct, null)
  }
})

test('serieDePeriodo: la suma de los buckets es el total del periodo', () => {
  const r = rangoDePeriodo('12m', AHORA)
  const d = datos({
    saldos: [
      fila({ fecha_pedido: '2025-12-31', pagado: 100, saldo: 0 }),
      fila({ fecha_pedido: '2026-06-15', pagado: 0, saldo: 250 }),
      fila({ fecha_pedido: '2026-11-05', pagado: 50, saldo: 50 }),
      // Justo fuera por un dia en cada punta.
      fila({ fecha_pedido: '2025-11-30', pagado: 777, saldo: 0 }),
    ],
    pagos: [pago('2026-01-10', 100), pago('2026-11-05', 50), pago('2025-11-30', 777)],
    pedidos: [conItems('2026-06-15', [{ unidad: 'barril_pet', cantidad: 1 }])],
  })

  for (const g of ['semana', 'mes'] as const) {
    const serie = serieDePeriodo(d, bucketsDe(r, g))
    const total = resumenDePeriodo(d, r)
    assert.equal(serie.reduce((s, p) => s + p.facturado, 0), total.facturado, `facturado por ${g}`)
    assert.equal(serie.reduce((s, p) => s + p.cobrado, 0), total.cobrado, `cobrado por ${g}`)
    assert.equal(serie.reduce((s, p) => s + p.pedidos, 0), total.pedidos, `pedidos por ${g}`)
    assert.equal(serie.reduce((s, p) => s + p.litros, 0), total.litros, `litros por ${g}`)
  }
})

test('serieDePeriodo: las dos barras apiladas suman el facturado del bucket', () => {
  const d = datos({
    saldos: [fila({ fecha_pedido: '2026-11-02', pagado: 400, saldo: 600 })],
    // El pago entro en otro bucket: la apilada no debe moverse por eso.
    pagos: [pago('2026-11-04', 400)],
  })
  const serie = serieDePeriodo(d, bucketsDe(rangoDePeriodo('mes', AHORA), 'dia'))
  const dos = serie.find(p => p.desde === '2026-11-02')!
  const cuatro = serie.find(p => p.desde === '2026-11-04')!

  assert.equal(dos.facturado, 1_000)
  assert.equal(dos.cobradoCohorte + dos.pendiente, dos.facturado)
  assert.equal(dos.pct, 40)
  assert.equal(dos.cobrado, 0, 'el dia 2 no entro dinero')
  assert.equal(cuatro.cobrado, 400, 'el dinero entro el dia 4')
  assert.equal(cuatro.facturado, 0, 'el dia 4 no facturo')
})

test('serieDePeriodo: un sobrepago no deja pendiente negativo', () => {
  const d = datos({ saldos: [fila({ fecha_pedido: '2026-11-02', pagado: 1_200, saldo: -200 })] })
  const p = serieDePeriodo(d, bucketsDe(rangoDePeriodo('mes', AHORA), 'dia')).find(x => x.desde === '2026-11-02')!
  assert.equal(p.pendiente, 0)
})

test('serieDePeriodo: clientes y ticket por bucket', () => {
  const d = datos({
    saldos: [
      fila({ cliente_id: 'a', fecha_pedido: '2026-11-02', pagado: 0, saldo: 1_000 }),
      fila({ cliente_id: 'a', fecha_pedido: '2026-11-02', pagado: 0, saldo: 3_000 }),
      fila({ cliente_id: 'b', fecha_pedido: '2026-11-02', pagado: 0, saldo: 2_000 }),
    ],
  })
  const p = serieDePeriodo(d, bucketsDe(rangoDePeriodo('mes', AHORA), 'dia')).find(x => x.desde === '2026-11-02')!
  assert.equal(p.clientes, 2)
  assert.equal(p.ticket, 2_000)
})

test('serieDePeriodo del anio anterior: alineada bucket a bucket', () => {
  const buckets = bucketsDe(rangoDePeriodo('12m', AHORA), 'mes')
  const d = datos({ saldos: [fila({ fecha_pedido: '2025-06-10', pagado: 0, saldo: 500 })] })

  const actual = serieDePeriodo(d, buckets)
  const previa = serieDePeriodo(d, buckets.map(bucketAnoAnterior))

  // El pedido de junio-25 no esta en el periodo actual (arranca en dic-25)...
  assert.equal(actual.reduce((s, p) => s + p.facturado, 0), 0)
  // ...pero si en el espejo del anio anterior, en el mismo indice que jun-26.
  const i = buckets.findIndex(b => b.desde === '2026-06-01')
  assert.equal(previa[i].facturado, 500)
  assert.equal(previa.length, actual.length)
})

// ── El periodo filtra los tops ──────────────────────────────

test('filasEnRango: los bordes son inclusivos y recortan los tops', () => {
  const filas = [
    fila({ cliente_id: 'dentro', fecha_pedido: '2026-11-01', pagado: 0, saldo: 100 }),
    fila({ cliente_id: 'borde', fecha_pedido: '2026-11-05', pagado: 0, saldo: 200 }),
    fila({ cliente_id: 'fuera', fecha_pedido: '2026-10-31', pagado: 0, saldo: 9_000 }),
  ]
  const r = rangoDePeriodo('mes', AHORA)
  assert.equal(filasEnRango(filas, r).length, 2)

  const top = topClientes(filasEnRango(filas, r), [])
  assert.deepEqual(top.map(c => c.id), ['borde', 'dentro'])
  // El pct se recalcula sobre el total DEL PERIODO, no sobre el historico.
  assert.equal(top[0].pct, (200 / 300) * 100)
})

// ── Reporte: el importe neto por partida ────────────────────
//
// Lo que se prueba aqui es el reparto: el importe de una partida es bruto y el
// del pedido es neto, y si el reparto se equivoca la seccion de presentaciones
// deja de cuadrar con el Facturado del resumen.

/** Un pedido con partidas valuadas. `precio_unitario` es el bruto del renglon. */
const ped = (
  id: string,
  fecha_pedido: string,
  items: { unidad: string | null; cantidad: number; precio: number; nombre?: string; estilo?: string | null; producto_id?: string; mix?: { producto_id: string; latas: number }[] }[]
): PedidoConItems => ({
  id,
  fecha_pedido,
  pedido_items: items.map(it => ({
    unidad: it.unidad,
    cantidad: it.cantidad,
    precio_unitario: it.precio,
    productos: { id: it.producto_id ?? 'prod-' + (it.nombre || 'x'), nombre: it.nombre || 'Magma', estilo: it.estilo ?? 'Double IPA' },
    ...(it.mix ? { metadata: { estilos: it.mix } } : {}),
  })),
})

test('partidasValuadas reparte el neto del pedido entre sus partidas', () => {
  // Bruto 1,000 (600 + 400) y neto 900: hubo 100 de descuento. Si el reporte
  // sumara el bruto, diria 1,000 facturados donde el resumen dice 900.
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 500, saldo: 400 })],
    pedidos: [ped('p1', '2026-11-02', [
      { unidad: 'caja24', cantidad: 3, precio: 200 },
      { unidad: 'lata', cantidad: 8, precio: 50 },
    ])],
  })

  const { partidas, sinReparto } = partidasValuadas(d, rangoDePeriodo('mes', AHORA))
  assert.equal(partidas.length, 2)
  assert.equal(partidas[0].importe, 540)
  assert.equal(partidas[1].importe, 360)
  assert.equal(partidas.reduce((s, p) => s + p.importe, 0), 900, 'el reparto no suma el neto del pedido')
  assert.equal(sinReparto, 0)
})

test('partidasValuadas: el cliente sale de pedidos_saldo, no del pedido', () => {
  // `cliente_id` siempre viene en la vista; la consulta de partidas no tiene
  // por que traerlo otra vez.
  const d = datos({
    saldos: [fila({ id: 'p1', cliente_id: 'c-9', fecha_pedido: '2026-11-02', pagado: 0, saldo: 100 })],
    pedidos: [ped('p1', '2026-11-02', [{ unidad: 'lata', cantidad: 1, precio: 100 }])],
  })
  assert.equal(partidasValuadas(d, rangoDePeriodo('mes', AHORA)).partidas[0].cliente_id, 'c-9')
})

test('partidasValuadas: un pedido con bruto cero no se reparte, se reporta', () => {
  // Un regalo o una captura a medias: no hay proporcion con la que repartir, y
  // inventar una meteria dinero en una presentacion que no lo gano.
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 700 })],
    pedidos: [ped('p1', '2026-11-02', [{ unidad: 'caja24', cantidad: 2, precio: 0 }])],
  })
  const { partidas, sinReparto } = partidasValuadas(d, rangoDePeriodo('mes', AHORA))
  assert.equal(partidas[0].importe, 0)
  assert.equal(sinReparto, 700, 'el neto sin clasificar tiene que decirse')
})

test('partidasValuadas: solo las partidas de los pedidos del periodo', () => {
  const d = datos({
    saldos: [
      fila({ id: 'dentro', fecha_pedido: '2026-11-02', pagado: 0, saldo: 100 }),
      fila({ id: 'fuera', fecha_pedido: '2026-10-02', pagado: 0, saldo: 100 }),
    ],
    pedidos: [
      ped('dentro', '2026-11-02', [{ unidad: 'lata', cantidad: 1, precio: 100 }]),
      ped('fuera', '2026-10-02', [{ unidad: 'lata', cantidad: 1, precio: 100 }]),
    ],
  })
  const { partidas } = partidasValuadas(d, rangoDePeriodo('mes', AHORA))
  assert.deepEqual(partidas.map(p => p.pedido_id), ['dentro'])
})

// ── Reporte: por presentacion ───────────────────────────────

const partidasDe = (d: DatosPeriodo) => partidasValuadas(d, rangoDePeriodo('mes', AHORA)).partidas

test('ventasPorPresentacion: las de siempre salen aunque esten en cero', () => {
  // Un cero dice "este mes no se vendio ni un barril", que es informacion.
  const filas = ventasPorPresentacion(partidasDe(datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 1_000 })],
    pedidos: [ped('p1', '2026-11-02', [{ unidad: 'caja24', cantidad: 5, precio: 200 }])],
  })))

  assert.deepEqual(filas.map(f => f.unidad), ['lata', 'caja12', 'caja24', 'barril_pet', 'barril_acero'])
  const caja = filas.find(f => f.unidad === 'caja24')!
  assert.equal(caja.unidades, 5)
  assert.equal(caja.litros.toFixed(2), '42.60')
  assert.equal(caja.importe, 1_000)
  assert.equal(caja.pct, 100)
  assert.equal(filas.find(f => f.unidad === 'barril_pet')!.importe, 0)
})

test('ventasPorPresentacion: mix24 y los de 10 L solo si hubo', () => {
  const filas = ventasPorPresentacion(partidasDe(datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 300 })],
    pedidos: [ped('p1', '2026-11-02', [
      { unidad: 'mix24', cantidad: 1, precio: 200 },
      { unidad: 'barril10_pet', cantidad: 1, precio: 100 },
    ])],
  })))
  const claves = filas.map(f => f.unidad)
  assert.ok(claves.includes('mix24'), 'la caja mixta no puede desaparecer dentro de caja 24')
  assert.ok(claves.includes('barril10_pet'))
  assert.ok(!claves.includes('barril10_acero'), 'un 10 L que no se vendio no lleva renglon')
})

test('ventasPorPresentacion: las partidas sin presentacion van a su renglon', () => {
  // Tienen importe pero no litros. Mezclarlas haria que la columna de litros
  // no cuadre con el total sin que se vea por que.
  const filas = ventasPorPresentacion(partidasDe(datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 500 })],
    pedidos: [ped('p1', '2026-11-02', [
      { unidad: 'caja24', cantidad: 1, precio: 250 },
      { unidad: null, cantidad: 1, precio: 250 },
    ])],
  })))

  const sin = filas.find(f => f.unidad === SIN_PRESENTACION)!
  assert.equal(sin.importe, 250)
  assert.equal(sin.litros, 0, 'no se le puede asignar volumen')
  assert.equal(filas.at(-1)!.unidad, SIN_PRESENTACION, 'va al final')
  assert.equal(Math.round(filas.reduce((s, f) => s + f.pct, 0)), 100)
})

// ── Reporte: por estilo ─────────────────────────────────────

const ESTILOS = new Map<string, string | null>([
  ['pa', 'West Coast IPA'],
  ['pb', 'Red IPA'],
  ['pc', 'Czech Pale Lager'],
])

test('ventasPorEstilo desglosa la caja mixta por sus latas', () => {
  // El caso de produccion: 8 de 29 partidas son mix24 con metadata.estilos.
  // Sin desglose, la caja entera se le atribuye al producto de la partida
  // (solo el primero de la mezcla) y el reporte diria que de ese estilo salio
  // el doble de lo que salio de la bodega.
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 400 })],
    pedidos: [ped('p1', '2026-11-02', [{
      unidad: 'mix24', cantidad: 1, precio: 400, producto_id: 'pa', estilo: 'West Coast IPA',
      mix: [{ producto_id: 'pa', latas: 12 }, { producto_id: 'pb', latas: 12 }],
    }])],
  })

  const filas = ventasPorEstilo(partidasDe(d), ESTILOS)
  assert.equal(filas.length, 2)
  // 24 latas = 8.52 L, mitad y mitad.
  for (const f of filas) {
    assert.equal(f.litros.toFixed(2), '4.26')
    assert.equal(f.importe, 200)
  }
  assert.deepEqual(filas.map(f => f.estilo).sort(), ['Red IPA', 'West Coast IPA'])
})

test('ventasPorEstilo: el reparto de la mezcla sigue las latas, no el conteo', () => {
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 1_200 })],
    pedidos: [ped('p1', '2026-11-02', [{
      unidad: 'mix24', cantidad: 1, precio: 1_200, producto_id: 'pa',
      mix: [{ producto_id: 'pa', latas: 18 }, { producto_id: 'pb', latas: 6 }],
    }])],
  })
  const filas = ventasPorEstilo(partidasDe(d), ESTILOS)
  assert.equal(filas.find(f => f.estilo === 'West Coast IPA')!.importe, 900)
  assert.equal(filas.find(f => f.estilo === 'Red IPA')!.importe, 300)
})

test('ventasPorEstilo: el estilo del componente sale del catalogo, no del nombre', () => {
  // metadata.estilos[].nombre es el nombre del PRODUCTO ("Chula Vista"), no el
  // del estilo: meterlo en esta columna mezclaria dos vocabularios.
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 100 })],
    pedidos: [ped('p1', '2026-11-02', [{
      unidad: 'mix24', cantidad: 1, precio: 100, producto_id: 'pa',
      mix: [{ producto_id: 'desconocido', latas: 24 }],
    }])],
  })
  const filas = ventasPorEstilo(partidasDe(d), ESTILOS)
  assert.deepEqual(filas.map(f => f.estilo), [SIN_ESTILO])
})

test('ventasPorEstilo: una mezcla sin latas cae al estilo del producto', () => {
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 100 })],
    pedidos: [ped('p1', '2026-11-02', [{
      unidad: 'mix24', cantidad: 1, precio: 100, estilo: 'Porter',
      mix: [{ producto_id: 'pa', latas: 0 }],
    }])],
  })
  assert.deepEqual(ventasPorEstilo(partidasDe(d), ESTILOS).map(f => f.estilo), ['Porter'])
})

test('ventasPorEstilo ordena por litros y reparte el 100%', () => {
  const d = datos({
    saldos: [fila({ id: 'p1', fecha_pedido: '2026-11-02', pagado: 0, saldo: 300 })],
    pedidos: [ped('p1', '2026-11-02', [
      { unidad: 'lata', cantidad: 1, precio: 100, estilo: 'Porter' },
      { unidad: 'barril_pet', cantidad: 1, precio: 200, estilo: 'Stout' },
    ])],
  })
  const filas = ventasPorEstilo(partidasDe(d), ESTILOS)
  assert.deepEqual(filas.map(f => f.estilo), ['Stout', 'Porter'])
  assert.equal(Math.round(filas.reduce((s, f) => s + f.pct, 0)), 100)
})

// ── Reporte: estado de cobranza ─────────────────────────────

test('estadoCobranzaDe: vencido le gana a parcial', () => {
  // El caso real de produccion: atrasado, con abono, y la vista lo marca
  // 'parcial' porque evalua esa rama antes que 'vencido'. Para quien cobra, lo
  // primero es que hay 92 dias de atraso.
  const e = estadoCobranzaDe([fila({ saldo: 100, pagado: 1_400, dias_vencido: 92, estado_cobro: 'parcial' })])
  assert.deepEqual(e, { clave: 'vencido', dias: 92 })
})

test('estadoCobranzaDe: pagado, al corriente y parcial', () => {
  assert.deepEqual(
    estadoCobranzaDe([fila({ saldo: 0, pagado: 1_000, estado_cobro: 'pagado' })]),
    { clave: 'pagado', dias: 0 }
  )
  assert.deepEqual(
    estadoCobranzaDe([fila({ saldo: 1_000, pagado: 0, dias_vencido: 0 })]),
    { clave: 'corriente', dias: 0 }
  )
  assert.deepEqual(
    estadoCobranzaDe([fila({ saldo: 600, pagado: 400, dias_vencido: 0 })]),
    { clave: 'parcial', dias: 0 }
  )
})

test('estadoCobranzaDe: un sobrepago no deja al cliente "debiendo"', () => {
  assert.equal(estadoCobranzaDe([fila({ saldo: -200, pagado: 1_200, dias_vencido: 40 })]).clave, 'pagado')
})

test('estadoCobranzaDe: con varios pedidos manda el atraso mas viejo', () => {
  const e = estadoCobranzaDe([
    fila({ saldo: 100, dias_vencido: 12 }),
    fila({ saldo: 100, dias_vencido: 95 }),
    fila({ saldo: 0, pagado: 500, dias_vencido: 200, estado_cobro: 'pagado' }),
  ])
  assert.deepEqual(e, { clave: 'vencido', dias: 95 })
})

// ── Reporte: ventas por cliente ─────────────────────────────

test('ventasPorCliente: pedidos, litros, cohorte y estado por cliente', () => {
  const d = datos({
    saldos: [
      fila({ id: 'p1', cliente_id: 'c1', fecha_pedido: '2026-11-02', pagado: 500, saldo: 500 }),
      fila({ id: 'p2', cliente_id: 'c1', fecha_pedido: '2026-11-03', pagado: 0, saldo: 2_000, dias_vencido: 7 }),
      fila({ id: 'p3', cliente_id: 'c2', fecha_pedido: '2026-11-04', pagado: 400, saldo: 0, estado_cobro: 'pagado' }),
    ],
    pedidos: [
      ped('p1', '2026-11-02', [{ unidad: 'barril_pet', cantidad: 1, precio: 1_000 }]),
      ped('p2', '2026-11-03', [{ unidad: 'barril_pet', cantidad: 2, precio: 1_000 }]),
      ped('p3', '2026-11-04', [{ unidad: 'lata', cantidad: 1, precio: 400 }]),
    ],
    // Los pagos del periodo no entran en esta tabla: aqui va la cohorte.
    pagos: [pago('2026-11-02', 9_999)],
  })

  const filas = ventasPorCliente(d, [], rangoDePeriodo('mes', AHORA))
  assert.deepEqual(filas.map(f => f.cliente_id), ['c1', 'c2'], 'no ordeno por facturado')

  const c1 = filas[0]
  assert.equal(c1.pedidos, 2)
  assert.equal(c1.facturado, 3_000)
  assert.equal(c1.cobrado, 500, 'tomo los pagos del periodo en vez de la cohorte')
  assert.equal(c1.saldo, 2_500)
  assert.equal(c1.litros, 60)
  assert.deepEqual(c1.estado, { clave: 'vencido', dias: 7 })

  assert.equal(filas[1].estado.clave, 'pagado')
  assert.equal(filas[1].litros.toFixed(3), '0.355')
})

test('ventasPorCliente: un pedido sin cliente tiene su propio renglon', () => {
  const d = datos({ saldos: [fila({ cliente_id: null, fecha_pedido: '2026-11-02' })] })
  const filas = ventasPorCliente(d, [], rangoDePeriodo('mes', AHORA))
  assert.deepEqual(filas.map(f => f.nombre), ['Sin cliente'])
})

test('totalesDeClientes suma exactamente lo que se imprime', () => {
  const d = datos({
    saldos: [
      fila({ id: 'p1', cliente_id: 'c1', fecha_pedido: '2026-11-02', pagado: 500, saldo: 500 }),
      fila({ id: 'p2', cliente_id: 'c2', fecha_pedido: '2026-11-03', pagado: 0, saldo: 250 }),
    ],
    pedidos: [ped('p1', '2026-11-02', [{ unidad: 'barril_pet', cantidad: 1, precio: 1_000 }])],
  })
  const filas = ventasPorCliente(d, [], rangoDePeriodo('mes', AHORA))
  const t = totalesDeClientes(filas)
  assert.deepEqual(t, { pedidos: 2, litros: 20, facturado: 1_250, cobrado: 500, saldo: 750 })
  // Y cuadra con el resumen del mismo periodo.
  assert.equal(t.facturado, resumenDePeriodo(d, rangoDePeriodo('mes', AHORA)).facturado)
})

// ── Reporte: pedidos con saldo ──────────────────────────────

test('pedidosConSaldo: solo los que deben, lo mas atrasado primero', () => {
  const filas = pedidosConSaldo(
    [
      fila({ id: 'viejo', saldo: 100, dias_vencido: 90, fecha_vencimiento: '2026-08-07' }),
      fila({ id: 'nuevo', saldo: 500, dias_vencido: 0, fecha_vencimiento: '2026-12-01' }),
      fila({ id: 'medio', saldo: 300, dias_vencido: 30, fecha_vencimiento: '2026-10-10' }),
      fila({ id: 'pagado', saldo: 0, pagado: 900, estado_cobro: 'pagado', dias_vencido: 200 }),
      fila({ id: 'sobrepago', saldo: -50, pagado: 1_000, dias_vencido: 10 }),
    ],
    []
  )
  assert.deepEqual(filas.map(f => f.id), ['viejo', 'medio', 'nuevo'])
  assert.equal(filas[0].fecha_vencimiento, '2026-08-07')
  assert.equal(filas[0].dias, 90)
})

test('pedidosConSaldo: a igual atraso, primero el monto mas grande', () => {
  const filas = pedidosConSaldo(
    [fila({ id: 'chico', saldo: 100, dias_vencido: 10 }), fila({ id: 'grande', saldo: 900, dias_vencido: 10 })],
    []
  )
  assert.deepEqual(filas.map(f => f.id), ['grande', 'chico'])
})

test('pedidosConSaldo: sin fecha_vencimiento en la consulta, la columna va vacia', () => {
  // La vista si la expone, pero el tipo la trae opcional: una consulta que no
  // la pida no debe reventar la tabla.
  assert.equal(pedidosConSaldo([fila({ saldo: 100 })], []) [0].fecha_vencimiento, null)
})

// ── Reporte: crecimiento ────────────────────────────────────

test('mesesDeTendencia: 12 por default, 24 cuando el periodo ya pasa de 12', () => {
  assert.equal(MESES_TENDENCIA_MIN, 12)
  assert.equal(mesesDeTendencia(rangoDePeriodo('mes', AHORA)), 12)
  assert.equal(mesesDeTendencia(rangoDePeriodo('ytd', AHORA)), 12)
  assert.equal(mesesDeTendencia(rangoDePeriodo('12m', AHORA)), 12)
  // Un periodo de 24 meses con tendencia de 12 dejaria fuera la mitad de lo
  // que el resto del reporte esta sumando.
  assert.equal(mesesDeTendencia(rangoDePeriodo('24m', AHORA)), 24)
})

test('rangoTendencia da meses completos hasta hoy', () => {
  assert.deepEqual(rangoTendencia(12, AHORA), rango('2025-12-01', '2026-11-05'))
  assert.deepEqual(rangoTendencia(24, AHORA), rango('2024-12-01', '2026-11-05'))
  assert.equal(contarBuckets(rangoTendencia(24, AHORA), 'mes'), 24)
})

test('primerPedidoPorCliente toma la fecha mas vieja de todo el historial', () => {
  const m = primerPedidoPorCliente([
    fila({ cliente_id: 'c1', fecha_pedido: '2026-06-10' }),
    fila({ cliente_id: 'c1', fecha_pedido: '2024-02-01' }),
    fila({ cliente_id: 'c2', fecha_pedido: '2026-11-01' }),
    fila({ cliente_id: null, fecha_pedido: '2020-01-01' }),
  ])
  assert.equal(m.get('c1'), '2024-02-01')
  assert.equal(m.get('c2'), '2026-11-01')
  assert.equal(m.size, 2, 'un pedido sin cliente no es un cliente')
})

test('serieCrecimiento: nuevo es quien estrena en el bucket, no quien aparece', () => {
  // Un cliente de hace tres anios que vuelve a comprar es RECURRENTE, aunque
  // sea la primera vez que aparece dentro de la ventana que se mira.
  const buckets = bucketsDe(rangoTendencia(12, AHORA), 'mes')
  const d = datos({
    saldos: [
      fila({ cliente_id: 'viejo', fecha_pedido: '2023-05-01', pagado: 0, saldo: 100 }),
      fila({ cliente_id: 'viejo', fecha_pedido: '2026-06-10', pagado: 0, saldo: 100 }),
      fila({ cliente_id: 'estreno', fecha_pedido: '2026-06-20', pagado: 0, saldo: 100 }),
    ],
  })

  const serie = serieCrecimiento(d, buckets)
  const junio = serie.find(p => p.desde === '2026-06-01')!
  assert.equal(junio.clientesNuevos, 1, 'solo "estreno" es nuevo')
  assert.equal(junio.clientesRecurrentes, 1)
  assert.equal(junio.clientesNuevos + junio.clientesRecurrentes, junio.clientes)
})

test('serieCrecimiento: la variacion mes contra mes y la anual', () => {
  const buckets = bucketsDe(rangoTendencia(12, AHORA), 'mes')
  const d = datos({
    saldos: [
      fila({ fecha_pedido: '2026-06-10', pagado: 0, saldo: 100 }),
      fila({ fecha_pedido: '2026-07-10', pagado: 0, saldo: 150 }),
      // El mismo mes, un anio antes.
      fila({ fecha_pedido: '2025-07-10', pagado: 0, saldo: 300 }),
    ],
  })
  const serie = serieCrecimiento(d, buckets)
  const julio = serie.find(p => p.desde === '2026-07-01')!

  assert.deepEqual(julio.varMes, { pct: 50, dir: 'up' }, '150 contra 100')
  assert.equal(julio.anoAnterior, 300)
  assert.deepEqual(julio.varAnual, { pct: 50, dir: 'down' }, '150 contra 300')
  // El primer bucket no tiene mes previo dentro de la serie: sin base, null.
  assert.equal(serie[0].varMes, null)
})

test('mezclaPorBucket: litros por presentacion y mes, sin las unidades raras', () => {
  const buckets = bucketsDe(rango('2026-10-01', '2026-11-30'), 'mes')
  const d = datos({
    pedidos: [
      ped('p1', '2026-10-05', [{ unidad: 'barril_pet', cantidad: 1, precio: 1 }]),
      ped('p2', '2026-11-05', [
        { unidad: 'caja24', cantidad: 1, precio: 1 },
        { unidad: null, cantidad: 99, precio: 1 },
      ]),
    ],
  })

  const mezcla = mezclaPorBucket(d, buckets)
  assert.equal(mezcla[0].litros, 20)
  assert.deepEqual(mezcla[0].porUnidad, { barril_pet: 20 })
  assert.equal(mezcla[1].litros.toFixed(2), '8.52')
  assert.deepEqual(Object.keys(mezcla[1].porUnidad), ['caja24'], 'una unidad sin litros no entra en la mezcla')
})

test('ritmoAnualizado extrapola el paso del periodo', () => {
  assert.equal(DIAS_ANO, 365)
  // 10,000 en 10 dias = 1,000 al dia = 365,000 al anio.
  assert.equal(ritmoAnualizado(10_000, rango('2026-11-01', '2026-11-10')), 365_000)
  // Un anio completo se anualiza casi a si mismo.
  assert.equal(Math.round(ritmoAnualizado(365_000, rango('2026-01-01', '2026-12-31'))), 365_000)
})

// ── Reporte: hallazgos ──────────────────────────────────────

const cobro = (over: Partial<FilaCobranza> = {}): FilaCobranza => ({
  id: 'p1', cliente_id: 'c1', nombre: 'Bar La Esquina',
  fecha_pedido: '2026-09-01', fecha_vencimiento: '2026-10-01', dias: 30, saldo: 1_000,
  ...over,
})

const entradaHallazgos = (over: Partial<Parameters<typeof hallazgos>[0]> = {}) => ({
  resumen: resumenDePeriodo(datos(), rangoDePeriodo('mes', AHORA)),
  previo: resumenDePeriodo(datos(), rangoDePeriodo('mes_anterior', AHORA)),
  cobranza: [] as FilaCobranza[],
  productos: [] as { nombre: string; litros: number }[],
  porCobrar: 0,
  vencido: 0,
  ...over,
})

test('hallazgos: la variacion de facturado se dice con su direccion', () => {
  const h = hallazgos(entradaHallazgos({
    resumen: { facturado: 1_500, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 1, litros: 0, ticket: 1_500, clientes: 1 },
    previo: { facturado: 1_000, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 1, litros: 0, ticket: 1_000, clientes: 1 },
  }))
  const f = h.find(x => x.clave === 'facturado')!
  assert.match(f.texto, /subió 50%/)
  assert.match(f.texto, /\$1,500 frente a \$1,000/)
  assert.equal(f.tono, 'bueno')
})

test('hallazgos: sin periodo anterior lo dice, no inventa un porcentaje', () => {
  const h = hallazgos(entradaHallazgos({
    resumen: { facturado: 1_500, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 1, litros: 0, ticket: 1_500, clientes: 1 },
    previo: { facturado: 0, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 0, litros: 0, ticket: null, clientes: 0 },
  }))
  const f = h.find(x => x.clave === 'facturado')!
  assert.match(f.texto, /no tuvo ventas/)
  assert.equal(f.tono, 'neutral')
})

test('hallazgos: el deudor se agrupa por cliente, no por pedido', () => {
  // Un cliente con tres pedidos chicos puede deber mas que otro con uno grande.
  const h = hallazgos(entradaHallazgos({
    cobranza: [
      cobro({ id: 'a', cliente_id: 'c1', nombre: 'Tres Chicos', saldo: 400 }),
      cobro({ id: 'b', cliente_id: 'c1', nombre: 'Tres Chicos', saldo: 400 }),
      cobro({ id: 'c', cliente_id: 'c1', nombre: 'Tres Chicos', saldo: 400 }),
      cobro({ id: 'd', cliente_id: 'c2', nombre: 'Uno Grande', saldo: 1_000 }),
    ],
    porCobrar: 2_200,
  }))
  const d = h.find(x => x.clave === 'deudor')!
  assert.match(d.texto, /Tres Chicos concentra \$1,200/)
  assert.match(d.texto, /el 55%/)
})

test('hallazgos: el producto mas vendido va en litros y con su peso', () => {
  // El peso se mide contra el volumen del PERIODO, no contra la suma de la
  // lista: esa llega recortada a los primeros N y el porcentaje saldria
  // inflado justo cuando hay muchos productos.
  const h = hallazgos(entradaHallazgos({
    resumen: { facturado: 0, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 2, litros: 200, ticket: null, clientes: 1 },
    productos: [{ nombre: 'Oleaje', litros: 75 }, { nombre: 'Caliza', litros: 25 }],
  }))
  const p = h.find(x => x.clave === 'producto')!
  assert.match(p.texto, /Oleaje fue lo más vendido con 75 L, el 38% del volumen/)
})

test('hallazgos: el % vencido cambia de tono segun que tan mal este', () => {
  const malo = hallazgos(entradaHallazgos({ porCobrar: 1_000, vencido: 800 })).find(x => x.clave === 'vencido')!
  assert.match(malo.texto, /\$800 ya pasaron su fecha de vencimiento: el 80%/)
  assert.equal(malo.tono, 'malo')

  const bien = hallazgos(entradaHallazgos({ porCobrar: 1_000, vencido: 0 })).find(x => x.clave === 'vencido')!
  assert.match(bien.texto, /Nada de la cartera está vencido/)
  assert.equal(bien.tono, 'bueno')
})

test('hallazgos: sin datos no inventa ninguno, y nunca pasa de cuatro', () => {
  assert.deepEqual(hallazgos(entradaHallazgos()), [])

  const todos = hallazgos(entradaHallazgos({
    resumen: { facturado: 1_500, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 1, litros: 75, ticket: 1_500, clientes: 1 },
    previo: { facturado: 1_000, iva: 0, cobrado: 0, pctCobrado: null, pedidos: 1, litros: 0, ticket: 1_000, clientes: 1 },
    cobranza: [cobro()],
    productos: [{ nombre: 'Oleaje', litros: 75 }],
    porCobrar: 1_000,
    vencido: 300,
  }))
  assert.equal(todos.length, 4)
  assert.deepEqual(todos.map(h => h.clave), ['facturado', 'deudor', 'producto', 'vencido'])
})

// ── queryPeriodo: ida y vuelta con resolverPeriodo ──────────

test('queryPeriodo y resolverPeriodo son inversos', () => {
  // Si se separan, el link al reporte abre un periodo distinto al que se esta
  // viendo en el Inicio.
  for (const { clave } of PERIODOS) {
    const rango = clave === 'personalizado'
      ? { desde: '2026-03-01', hasta: '2026-03-31' }
      : rangoDePeriodo(clave, AHORA)
    const q = queryPeriodo(clave, rango)
    const params = Object.fromEntries(new URLSearchParams(q))
    const vuelta = resolverPeriodo(params, AHORA)

    // 'personalizado' sin fechas no es un periodo: cae al default, y por eso
    // el ida y vuelta se mide con un rango explicito.
    assert.deepEqual(vuelta.rango, rango, `se perdio el rango de ${clave}`)
    assert.equal(vuelta.clave, clave, `se perdio la clave de ${clave}`)
  }
})

test('queryPeriodo no escribe el periodo default', () => {
  assert.equal(queryPeriodo('12m', rangoDePeriodo('12m', AHORA)), '')
  assert.equal(queryPeriodo('mes', rangoDePeriodo('mes', AHORA)), 'periodo=mes')
  assert.equal(
    queryPeriodo('personalizado', { desde: '2026-03-01', hasta: '2026-03-31' }),
    'desde=2026-03-01&hasta=2026-03-31'
  )
})

// ── IVA: las dos unidades ───────────────────────────────────
//
// La regla del archivo: lo analitico va SIN IVA y la cobranza CON IVA. Estos
// tests existen para que no se mezclen, porque mezclarlas no rompe nada —
// solo da numeros creibles y equivocados.
//
// El pedido modelo: mercancia 1,000, IVA 160, total 1,160.

const conIva = (over: Partial<FilaSaldo> = {}) =>
  fila({ total: 1_000, iva_monto: 160, pagado: 0, saldo: 1_160, ...over })

const sinIva = (over: Partial<FilaSaldo> = {}) =>
  fila({ total: 1_000, iva_monto: 0, pagado: 0, saldo: 1_000, ...over })

test('IVA: la venta lo quita, el neto lo conserva', () => {
  const f = conIva()
  assert.equal(netoDe(f), 1_160)
  assert.equal(ventaDe(f), 1_000)
  assert.equal(ivaTotal([f]), 160)
})

test('IVA: dos pedidos de la misma mercancia venden lo mismo', () => {
  // Es la propiedad que justifica todo: prender el switch no puede verse
  // como 16% de crecimiento.
  assert.equal(ventaTotal([conIva()]), ventaTotal([sinIva()]))
})

test('IVA: la cobranza si lo cobra', () => {
  // El cliente debe 1,160, no 1,000.
  assert.equal(porCobrarDe([conIva()]), 1_160)
  assert.equal(vencidoDe([conIva({ dias_vencido: 10 })]), 1_160)
})

test('IVA: un pedido pagado completo no deja saldo', () => {
  const f = conIva({ pagado: 1_160, saldo: 0, estado_cobro: 'pagado' })
  assert.equal(porCobrarDe([f]), 0)
  assert.equal(ventaDe(f), 1_000)
})

test('IVA: el cobrado prorrateado no pasa del 100%', () => {
  // Con el cobrado bruto (1,160) contra la venta (1,000) daria 116%.
  const f = conIva({ pagado: 1_160, saldo: 0 })
  assert.equal(cobradoSinIvaDe(f), 1_000)
  assert.equal((cobradoSinIvaDe(f) / ventaDe(f)) * 100, 100)
})

test('IVA: un pago parcial se prorratea', () => {
  // La mitad de 1,160 son 580; la mitad de la mercancia, 500.
  const f = conIva({ pagado: 580, saldo: 580 })
  assert.equal(cobradoSinIvaDe(f), 500)
})

test('IVA: sin pagos el prorrateo no inventa nada', () => {
  assert.equal(cobradoSinIvaDe(conIva()), 0)
  // Y un pedido en cero no divide entre cero.
  assert.equal(cobradoSinIvaDe(fila({ total: 0, iva_monto: 0, pagado: 0, saldo: 0 })), 0)
})

test('IVA: el top de clientes ordena por venta y cobra el saldo con IVA', () => {
  const filas = [conIva({ cliente_id: 'c1' }), sinIva({ cliente_id: 'c2' })]
  const top = topClientes(filas, [
    { id: 'c1', full_name: 'Con IVA', email: null, razon_social: null },
    { id: 'c2', full_name: 'Sin IVA', email: null, razon_social: null },
  ])
  const c1 = top.find(t => t.id === 'c1')!
  const c2 = top.find(t => t.id === 'c2')!
  // Venden lo mismo...
  assert.equal(c1.facturado, 1_000)
  assert.equal(c2.facturado, 1_000)
  // ...pero uno debe mas.
  assert.equal(c1.saldo, 1_160)
  assert.equal(c2.saldo, 1_000)
})

test('IVA: la serie mensual no se infla', () => {
  const mes = '2026-11-02'
  const a = serieFacturada([conIva({ fecha_pedido: mes })], 1, AHORA)
  const b = serieFacturada([sinIva({ fecha_pedido: mes })], 1, AHORA)
  assert.equal(a[0].total, b[0].total)
  assert.equal(a[0].total, 1_000)
})

test('IVA: el resumen lo pone como renglon aparte', () => {
  const r = resumenDePeriodo(
    { saldos: [conIva({ fecha_pedido: '2026-11-02' })], pagos: [], pedidos: [] },
    rangoDePeriodo('mes', AHORA)
  )
  assert.equal(r.facturado, 1_000)
  assert.equal(r.iva, 160)
  // El ticket promedio tampoco se infla.
  assert.equal(r.ticket, 1_000)
})

test('IVA: la serie por bucket separa venta de IVA', () => {
  const r = rangoDePeriodo('mes', AHORA)
  const buckets = bucketsDe(r, 'mes')
  const serie = serieDePeriodo(
    { saldos: [conIva({ fecha_pedido: '2026-11-02', pagado: 580, saldo: 580 })], pagos: [], pedidos: [] },
    buckets
  )
  const p = serie.find(x => x.facturado > 0)!
  assert.equal(p.facturado, 1_000)
  assert.equal(p.iva, 160)
  assert.equal(p.cobradoCohorte, 500)
  assert.equal(p.pendiente, 500)
  assert.equal(p.pct, 50)
})
