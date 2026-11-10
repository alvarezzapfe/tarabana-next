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
  resolverPeriodo,
  resumenDePeriodo,
  serieDePeriodo,
  topClientes,
  vencidoDe,
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
