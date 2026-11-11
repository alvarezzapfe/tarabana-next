/**
 * Tests de la comision por tramos marginales.
 *
 *   npm test
 *
 * Node 24 corre TypeScript nativo, asi que no hay runner ni dependencia que
 * instalar: `node --test`.
 *
 * Los casos de la ESCALERA van con las tasas en 0 a proposito. Asi la base
 * queda igual a lo cobrado y lo que se esta probando (2,500 + 800 = 3,300) se
 * lee directo en vez de quedar escondido detras de una division entre
 * 1.4674. Los casos de IMPUESTOS Y PRORRATEO van aparte, con las tasas
 * reales y con los numeros esperados calculados a mano en el comentario de
 * cada assert.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  IEPS_TASA_DEFAULT,
  IVA_TASA_DEFAULT,
  calcularComision,
  comisionesPorVendedor,
  periodoDe,
  periodoPrevio,
  resolverTramos,
  usaEsquemaGlobal,
  validarTramos,
  type EntradaComision,
  type PagoParaComision,
  type PedidoParaComision,
  type Tramo,
} from './comisiones.ts'

const PERIODO = '2026-08'

/** Escalera de tres tramos con el ultimo abierto. */
const ESCALERA: Tramo[] = [
  { desde: 0, hasta: 50_000, porcentaje: 5 },
  { desde: 50_000, hasta: 100_000, porcentaje: 8 },
  { desde: 100_000, hasta: null, porcentaje: 10 },
]

/** Pedido sin descuento ni envio: total_con_envio = total. */
function pedido(id: string, total: number, extra: Partial<PedidoParaComision> = {}): PedidoParaComision {
  return {
    id,
    vendedor_id: 'v1',
    total,
    descuento_monto: 0,
    total_con_envio: total,
    ...extra,
  }
}

function pago(id: string, pedido_id: string, monto: number, fecha_pago = `${PERIODO}-15`): PagoParaComision {
  return { pago_id: id, pedido_id, monto, fecha_pago, cancelado_at: null }
}

/** Sin impuestos: la base queda igual a lo cobrado y la escalera se lee sola. */
function sinImpuestos(e: Omit<EntradaComision, 'periodo' | 'ivaTasa' | 'iepsTasa'>) {
  return calcularComision({ ...e, periodo: PERIODO, ivaTasa: 0, iepsTasa: 0 })
}

// ── Base 0 ──────────────────────────────────────────────────

test('base 0: sin pagos no hay comision, pero si escalera y tasa marginal', () => {
  const r = sinImpuestos({ pagos: [], pedidos: [pedido('p1', 10_000)], tramos: ESCALERA })

  assert.equal(r.base, 0)
  assert.equal(r.comision, 0)
  assert.equal(r.cobrado, 0)
  assert.deepEqual(r.detalle, [])
  assert.equal(r.sinEsquema, false)
  // Con base 0 el vendedor esta al principio del primer tramo: el siguiente
  // peso paga 5% y le faltan 50,000 para el siguiente tramo.
  assert.equal(r.tasaMarginal, 5)
  assert.equal(r.faltaParaSiguiente, 50_000)
  assert.equal(r.tramoActual?.desde, 0)
  assert.equal(r.siguienteTramo?.desde, 50_000)
  // Todos los tramos aparecen, en 0.
  assert.equal(r.porTramo.length, 3)
  assert.deepEqual(r.porTramo.map(t => t.comision), [0, 0, 0])
})

test('base 0: una escalera vacia es "sin esquema", no una comision de 0 cualquiera', () => {
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 10_000)], pedidos: [pedido('p1', 10_000)], tramos: [] })

  assert.equal(r.sinEsquema, true)
  assert.equal(r.comision, 0)
  // La base si se calcula: lo que falta es con que repartirla.
  assert.equal(r.base, 10_000)
  assert.equal(r.tasaMarginal, null)
  assert.equal(r.tramoActual, null)
})

// ── La escalera ─────────────────────────────────────────────

test('justo en el limite: la base del limite paga solo el tramo de abajo, pero el siguiente peso ya es del de arriba', () => {
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 50_000)], pedidos: [pedido('p1', 50_000)], tramos: ESCALERA })

  assert.equal(r.base, 50_000)
  // 50,000 * 5% = 2,500. El segundo tramo no recibe nada.
  assert.equal(r.comision, 2_500)
  assert.equal(r.porTramo[0].porcion, 50_000)
  assert.equal(r.porTramo[1].porcion, 0)
  assert.equal(r.porTramo[1].comision, 0)

  // Lo que mueve la barra de avance: el intervalo es [desde, hasta), asi que
  // con la base exactamente en 50,000 el vendedor ya esta en el segundo tramo.
  assert.equal(r.tramoActual?.desde, 50_000)
  assert.equal(r.tasaMarginal, 8)
  assert.equal(r.faltaParaSiguiente, 50_000)
})

test('cruzando dos tramos: cada porcion paga su propia tasa', () => {
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 60_000)], pedidos: [pedido('p1', 60_000)], tramos: ESCALERA })

  assert.equal(r.base, 60_000)
  // 50,000 * 5% + 10,000 * 8% = 2,500 + 800 = 3,300.
  // Marginal, no plano: 60,000 * 8% serian 4,800.
  assert.equal(r.comision, 3_300)
  assert.deepEqual(r.porTramo.map(t => t.porcion), [50_000, 10_000, 0])
  assert.deepEqual(r.porTramo.map(t => t.comision), [2_500, 800, 0])
  assert.equal(r.tasaMarginal, 8)
  assert.equal(r.faltaParaSiguiente, 40_000)
})

test('cruzando los tres tramos, con el ultimo abierto', () => {
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 120_000)], pedidos: [pedido('p1', 120_000)], tramos: ESCALERA })

  // 50,000*5% + 50,000*8% + 20,000*10% = 2,500 + 4,000 + 2,000 = 8,500.
  assert.equal(r.comision, 8_500)
  assert.equal(r.topado, false)
  assert.equal(r.tasaMarginal, 10)
  // El ultimo tramo es abierto: no hay siguiente ni falta nada.
  assert.equal(r.siguienteTramo, null)
  assert.equal(r.faltaParaSiguiente, null)
})

test('ultimo tramo cerrado: es un tope y lo de arriba no comisiona', () => {
  const topada: Tramo[] = [
    { desde: 0, hasta: 50_000, porcentaje: 5 },
    { desde: 50_000, hasta: 100_000, porcentaje: 8 },
  ]
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 120_000)], pedidos: [pedido('p1', 120_000)], tramos: topada })

  assert.equal(r.base, 120_000)
  // 2,500 + 4,000. Los 20,000 de arriba del tope no pagan nada.
  assert.equal(r.comision, 6_500)
  assert.equal(r.topado, true)
  assert.equal(r.tramoActual, null)
  assert.equal(r.tasaMarginal, null)
})

test('la escalera se ordena sola: no depende del orden en que lleguen las filas', () => {
  const desordenada = [ESCALERA[2], ESCALERA[0], ESCALERA[1]]
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 60_000)], pedidos: [pedido('p1', 60_000)], tramos: desordenada })

  assert.equal(r.comision, 3_300)
  assert.deepEqual(r.porTramo.map(t => t.desde), [0, 50_000, 100_000])
})

// ── Impuestos y prorrateo ───────────────────────────────────

test('el IEPS sale de la base: cobrado / 1.265', () => {
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 1_000)],
    pedidos: [pedido('p1', 1_000)],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // Toma las tasas por default sin que se las pasen. La de IVA se asienta
  // en el resultado aunque no divida: es el dato de que tasa estaba vigente.
  assert.equal(r.ivaTasa, IVA_TASA_DEFAULT)
  assert.equal(r.iepsTasa, IEPS_TASA_DEFAULT)
  // Solo IEPS: 1,000 / 1.265 = 790.5138 -> 790.51. El IVA no divide porque
  // este pedido no lo lleva (total_con_envio = total), y si lo llevara se lo
  // quitaria el prorrateo.
  assert.equal(r.base, 790.51)
  assert.equal(r.cobrado, 1_000)
  // Primer tramo: 790.51 * 5% = 39.53 (39.5255)
  assert.equal(r.comision, 39.53)
})

test('pago parcial: comisiona lo cobrado, no lo vendido', () => {
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 400)],
    pedidos: [pedido('p1', 1_000)],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // 400 / 1.265 = 316.2055 -> 316.21. El resto del pedido no comisiona
  // hasta que se cobre.
  assert.equal(r.base, 316.21)
  assert.equal(r.cobrado, 400)
})

test('pedido con envio: el envio no comisiona', () => {
  // Caso real de produccion (pedido 0f709798): total 1,400, envio 100,
  // total_con_envio 1,500, cobrado en dos pagos de 1,000 y 400.
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 1_000, '2026-08-05'), pago('g2', 'p1', 400, '2026-08-05')],
    pedidos: [pedido('p1', 1_400, { total_con_envio: 1_500 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  assert.equal(r.cobrado, 1_400)
  // factor = 1,400 / 1,500 = 0.93333
  // 1,400 * 0.93333 / 1.265 = 1,306.67 / 1.265 = 1,032.94
  assert.equal(r.base, 1_032.94)
  // Un solo renglon: los dos pagos son del mismo pedido.
  assert.equal(r.detalle.length, 1)
  assert.equal(r.detalle[0].cobrado, 1_400)
})

test('pedido con descuento: no se descuenta dos veces', () => {
  // Caso real de produccion (pedido 5231508f): total 2,260, descuento 226,
  // total_con_envio 2,034. Sin envio el factor es 1: el descuento ya esta
  // afuera porque el cliente nunca debio los 2,260.
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 2_034)],
    pedidos: [pedido('p1', 2_260, { descuento_monto: 226, total_con_envio: 2_034 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // 2,034 / 1.265 = 1,607.9051 -> 1,607.91
  assert.equal(r.base, 1_607.91)
})

test('descuento y envio juntos', () => {
  // total 2,260, descuento 226, envio 100 -> total_con_envio 2,134.
  // Pago de 1,067, la mitad.
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 1_067)],
    pedidos: [pedido('p1', 2_260, { descuento_monto: 226, total_con_envio: 2_134 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // factor = (2,260 - 226) / 2,134 = 2,034 / 2,134 = 0.953139
  // 1,067 * 0.953139 / 1.265 = 1,017.0 / 1.265 = 803.95
  assert.equal(r.base, 803.95)
})

test('las tasas en 0 dejan la base igual a lo cobrado', () => {
  const r = sinImpuestos({ pagos: [pago('g1', 'p1', 1_000)], pedidos: [pedido('p1', 1_000)], tramos: ESCALERA })
  assert.equal(r.base, 1_000)
})

// ── IVA ─────────────────────────────────────────────────────
//
// El IVA no tiene divisor: lo saca el prorrateo, porque vive en
// `total_con_envio` y no en `total`. Estos tres casos fijan esa propiedad.

test('IVA: el mismo pedido comisiona igual con y sin IVA', () => {
  // La misma mercancia de 1,000, cobrada completa. Sin IVA el cliente paga
  // 1,000; con IVA al 16% paga 1,160. Lo que comisiona es la mercancia, asi
  // que la base tiene que ser identica: el IVA no es venta del vendedor.
  const base = (p: Parameters<typeof calcularComision>[0]) => calcularComision(p).base

  const sinIva = base({
    pagos: [pago('g1', 'p1', 1_000)],
    pedidos: [pedido('p1', 1_000)],
    tramos: ESCALERA,
    periodo: PERIODO,
  })
  const conIva = base({
    pagos: [pago('g1', 'p1', 1_160)],
    pedidos: [pedido('p1', 1_000, { total_con_envio: 1_160 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  assert.equal(sinIva, 790.51)
  assert.equal(conIva, 790.51)
})

test('IVA: cambiar ivaTasa no mueve la base', () => {
  // `ivaTasa` solo se asienta en el corte. Si volviera a dividir, estas dos
  // llamadas darian numeros distintos y un pedido sin IVA perderia 16%.
  const entrada = {
    pagos: [pago('g1', 'p1', 1_160)],
    pedidos: [pedido('p1', 1_000, { total_con_envio: 1_160 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  }
  const alDieciseis = calcularComision({ ...entrada, ivaTasa: 0.16, iepsTasa: IEPS_TASA_DEFAULT })
  const enCero = calcularComision({ ...entrada, ivaTasa: 0, iepsTasa: IEPS_TASA_DEFAULT })

  assert.equal(alDieciseis.base, enCero.base)
  // Y la tasa sigue viajando en el resultado para el acta del corte.
  assert.equal(alDieciseis.ivaTasa, 0.16)
})

test('IVA con descuento y envio: la base es la mercancia neta', () => {
  // total 2,260, descuento 226, envio 100 -> base gravable 2,134,
  // IVA 341.44, total_con_envio 2,475.44. Pago completo.
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 2_475.44)],
    pedidos: [pedido('p1', 2_260, { descuento_monto: 226, total_con_envio: 2_475.44 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // factor = 2,034 / 2,475.44; 2,475.44 * factor = 2,034 (la mercancia neta,
  // sin envio y sin IVA). 2,034 / 1.265 = 1,607.91 — el mismo numero que el
  // pedido sin IVA de arriba, que es justo lo que debe pasar.
  assert.equal(r.base, 1_607.91)
})

// ── Lo que no cuenta ────────────────────────────────────────

test('pago cancelado: no cuenta', () => {
  const cancelado: PagoParaComision = { ...pago('g2', 'p1', 5_000), cancelado_at: '2026-08-20T10:00:00Z' }
  const r = sinImpuestos({
    pagos: [pago('g1', 'p1', 1_000), cancelado],
    pedidos: [pedido('p1', 10_000)],
    tramos: ESCALERA,
  })

  assert.equal(r.base, 1_000)
  assert.equal(r.cobrado, 1_000)
})

test('un pago cancelado no consume el tope del pedido', () => {
  // Si el cancelado contara para el tope, el pago vivo de 1,000 se quedaria
  // sin espacio y daria base 0.
  const cancelado: PagoParaComision = {
    ...pago('g1', 'p1', 1_000, '2026-08-01'),
    cancelado_at: '2026-08-02T10:00:00Z',
  }
  const r = sinImpuestos({
    pagos: [cancelado, pago('g2', 'p1', 1_000, '2026-08-10')],
    pedidos: [pedido('p1', 1_000)],
    tramos: ESCALERA,
  })

  assert.equal(r.base, 1_000)
})

test('pago de pedido cancelado: no cuenta', () => {
  // Pasa en produccion: el pedido 7345e997 esta cancelado y tiene un pago de
  // 978. `pedidos_saldo` excluye cancelados, asi que el pago llega sin pedido
  // y se descarta.
  const r = sinImpuestos({
    pagos: [pago('g1', 'p1', 1_000), pago('g2', 'cancelado', 978)],
    pedidos: [pedido('p1', 1_000)],
    tramos: ESCALERA,
  })

  assert.equal(r.base, 1_000)
  assert.equal(r.detalle.length, 1)
})

test('sobrepago: se topa al total del pedido y el excedente cae en el pago mas reciente', () => {
  const pedidos = [pedido('p1', 1_400, { total_con_envio: 1_500 })]
  const pagos = [
    pago('g1', 'p1', 1_000, '2026-08-10'),
    pago('g2', 'p1', 1_000, '2026-09-10'),
  ]

  const agosto = calcularComision({ pagos, pedidos, tramos: ESCALERA, periodo: '2026-08', ivaTasa: 0, iepsTasa: 0 })
  const septiembre = calcularComision({ pagos, pedidos, tramos: ESCALERA, periodo: '2026-09', ivaTasa: 0, iepsTasa: 0 })

  // Agosto cobro los 1,000 completos.
  assert.equal(agosto.cobrado, 1_000)
  // Septiembre solo alcanza los 500 que faltaban para los 1,500; los otros
  // 500 son sobrepago y no son venta.
  assert.equal(septiembre.cobrado, 500)

  // factor = 1,400 / 1,500 = 0.93333
  assert.equal(agosto.base, 933.33)
  assert.equal(septiembre.base, 466.67)
  // Entre los dos meses la base suma la mercancia completa (1,400) y ni un
  // peso mas: es lo comisionable del pedido, 1,500 cobrables menos 100 de envio.
  assert.equal(Math.round(agosto.base + septiembre.base), 1_400)
})

test('el sobrepago se topa aunque los pagos lleguen desordenados', () => {
  const pedidos = [pedido('p1', 1_500)]
  const desordenados = [
    pago('g2', 'p1', 1_000, '2026-09-10'),
    pago('g1', 'p1', 1_000, '2026-08-10'),
  ]
  const agosto = calcularComision({ pagos: desordenados, pedidos, tramos: ESCALERA, periodo: '2026-08', ivaTasa: 0, iepsTasa: 0 })

  // El tope se consume cronologicamente, no en el orden del arreglo.
  assert.equal(agosto.cobrado, 1_000)
})

test('un pedido sin total no comisiona en vez de dividir entre cero', () => {
  const r = sinImpuestos({
    pagos: [pago('g1', 'p1', 1_000)],
    pedidos: [pedido('p1', 0, { total: null, total_con_envio: null })],
    tramos: ESCALERA,
  })

  assert.equal(r.base, 0)
  assert.ok(Number.isFinite(r.comision))
})

// ── Periodo ─────────────────────────────────────────────────

test('frontera de mes: el pago del dia 1 es del mes que dice su fecha', () => {
  const pedidos = [pedido('p1', 10_000)]
  const pagos = [
    pago('g1', 'p1', 1_000, '2026-07-31'),
    pago('g2', 'p1', 2_000, '2026-08-01'),
    pago('g3', 'p1', 4_000, '2026-08-31'),
    pago('g4', 'p1', 3_000, '2026-09-01'),
  ]

  const julio = calcularComision({ pagos, pedidos, tramos: ESCALERA, periodo: '2026-07', ivaTasa: 0, iepsTasa: 0 })
  const agosto = calcularComision({ pagos, pedidos, tramos: ESCALERA, periodo: '2026-08', ivaTasa: 0, iepsTasa: 0 })
  const septiembre = calcularComision({ pagos, pedidos, tramos: ESCALERA, periodo: '2026-09', ivaTasa: 0, iepsTasa: 0 })

  // Sin esto, `new Date('2026-08-01')` en CDMX cae el 31 de julio a las 18:00
  // y los 2,000 se irian a julio.
  assert.equal(julio.cobrado, 1_000)
  assert.equal(agosto.cobrado, 6_000)
  assert.equal(septiembre.cobrado, 3_000)
})

test('periodoDe saca el mes del string, sin Date', () => {
  assert.equal(periodoDe('2026-08-01'), '2026-08')
  assert.equal(periodoDe('2026-01-31'), '2026-01')
  // Tolera un timestamp por si la columna dejara de ser `date`.
  assert.equal(periodoDe('2026-08-01T00:00:00+00:00'), '2026-08')
})

test('periodoPrevio cruza el año', () => {
  assert.equal(periodoPrevio('2026-08'), '2026-07')
  assert.equal(periodoPrevio('2026-01'), '2025-12')
})

// ── Cuadre del desglose ─────────────────────────────────────

test('el desglose cuadra: la base es la suma de los pedidos y la comision la de los tramos', () => {
  const r = calcularComision({
    pagos: [
      pago('g1', 'p1', 12_345.67),
      pago('g2', 'p2', 8_999.99),
      pago('g3', 'p3', 777.77),
    ],
    pedidos: [
      pedido('p1', 20_000, { descuento_monto: 1_234.56, total_con_envio: 18_765.44 }),
      pedido('p2', 9_000, { total_con_envio: 9_250 }),
      pedido('p3', 777.77),
    ],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // Al centavo: los totales que devuelve la funcion son la suma de los
  // renglones que ella misma redondeo, no un redondeo aparte del total.
  //
  // La suma se re-redondea aqui porque sumar flotantes en JS arrastra ruido
  // (933.33 + ... da ...8599999999) y ese ruido es del test, no del calculo.
  // Por eso la UI debe pintar `base` y `comision` y nunca re-sumar el
  // desglose: veria los decimales de basura.
  const al2 = (n: number) => Math.round(n * 100) / 100

  assert.equal(r.base, al2(r.detalle.reduce((s, d) => s + d.base, 0)))
  assert.equal(r.comision, al2(r.porTramo.reduce((s, t) => s + t.comision, 0)))
  assert.equal(r.cobrado, al2(r.detalle.reduce((s, d) => s + d.cobrado, 0)))
})

// ── Resolucion del esquema ──────────────────────────────────

const GLOBAL_Y_PROPIO = [
  { vendedor_id: null, desde: 0, hasta: null, porcentaje: 7 },
  { vendedor_id: 'v1', desde: 0, hasta: 30_000, porcentaje: 4 },
  { vendedor_id: 'v1', desde: 30_000, hasta: null, porcentaje: 9 },
]

test('resolverTramos: con escalera propia ignora la global, sin mezclar', () => {
  const t = resolverTramos(GLOBAL_Y_PROPIO, 'v1')

  assert.equal(t.length, 2)
  assert.deepEqual(t.map(x => x.porcentaje), [4, 9])
  assert.equal(usaEsquemaGlobal(GLOBAL_Y_PROPIO, 'v1'), false)
})

test('resolverTramos: sin escalera propia cae a la global', () => {
  const t = resolverTramos(GLOBAL_Y_PROPIO, 'v2')

  assert.deepEqual(t, [{ desde: 0, hasta: null, porcentaje: 7 }])
  assert.equal(usaEsquemaGlobal(GLOBAL_Y_PROPIO, 'v2'), true)
})

test('resolverTramos: sin global y sin propia devuelve vacio', () => {
  assert.deepEqual(resolverTramos([GLOBAL_Y_PROPIO[1]], 'v2'), [])
})

test('comisionesPorVendedor: cada uno con su escalera y sin ver los pedidos del otro', () => {
  const pedidos: PedidoParaComision[] = [
    { ...pedido('p1', 40_000), vendedor_id: 'v1' },
    { ...pedido('p2', 40_000), vendedor_id: 'v2' },
    { ...pedido('p3', 99_999), vendedor_id: null },
  ]
  const pagos = [pago('g1', 'p1', 40_000), pago('g2', 'p2', 40_000), pago('g3', 'p3', 99_999)]

  const r = comisionesPorVendedor({
    vendedorIds: ['v1', 'v2'],
    pagos,
    pedidos,
    tramos: GLOBAL_Y_PROPIO,
    periodo: PERIODO,
    ivaTasa: 0,
    iepsTasa: 0,
  })

  const v1 = r.find(x => x.vendedor_id === 'v1')!
  const v2 = r.find(x => x.vendedor_id === 'v2')!

  // v1 con su escalera propia: 30,000*4% + 10,000*9% = 1,200 + 900 = 2,100
  assert.equal(v1.base, 40_000)
  assert.equal(v1.comision, 2_100)
  assert.equal(v1.global, false)

  // v2 con la global: 40,000 * 7% = 2,800
  assert.equal(v2.base, 40_000)
  assert.equal(v2.comision, 2_800)
  assert.equal(v2.global, true)

  // El pedido sin vendedor no comisiona a nadie.
  assert.equal(r.reduce((s, x) => s + x.cobrado, 0), 80_000)
})

// ── Validacion de la escalera ───────────────────────────────

test('validarTramos: una escalera buena no tiene errores', () => {
  assert.deepEqual(validarTramos(ESCALERA), [])
})

test('validarTramos: vacia es valida y significa sin esquema', () => {
  assert.deepEqual(validarTramos([]), [])
})

test('validarTramos: debe empezar en 0', () => {
  const e = validarTramos([{ desde: 1_000, hasta: null, porcentaje: 5 }])
  assert.equal(e.length, 1)
  assert.match(e[0], /empezar en 0/)
})

test('validarTramos: detecta hueco', () => {
  const e = validarTramos([
    { desde: 0, hasta: 50_000, porcentaje: 5 },
    { desde: 60_000, hasta: null, porcentaje: 8 },
  ])
  assert.match(e.join(' '), /hueco entre 50000 y 60000/)
})

test('validarTramos: detecta traslape', () => {
  const e = validarTramos([
    { desde: 0, hasta: 60_000, porcentaje: 5 },
    { desde: 50_000, hasta: null, porcentaje: 8 },
  ])
  assert.match(e.join(' '), /traslapan/)
})

test('validarTramos: solo el ultimo tramo puede quedar abierto', () => {
  const e = validarTramos([
    { desde: 0, hasta: null, porcentaje: 5 },
    { desde: 50_000, hasta: null, porcentaje: 8 },
  ])
  assert.match(e.join(' '), /ultimo tramo puede quedar abierto/)
})

test('validarTramos: rechaza fin menor o igual al inicio', () => {
  const e = validarTramos([{ desde: 0, hasta: 0, porcentaje: 5 }])
  assert.match(e.join(' '), /no es mayor/)
})

test('validarTramos: rechaza porcentaje fuera de rango', () => {
  assert.match(validarTramos([{ desde: 0, hasta: null, porcentaje: 101 }]).join(' '), /fuera de 0 a 100/)
  assert.match(validarTramos([{ desde: 0, hasta: null, porcentaje: -1 }]).join(' '), /fuera de 0 a 100/)
})

test('validarTramos: detecta dos tramos con el mismo inicio', () => {
  const e = validarTramos([
    { desde: 0, hasta: 10_000, porcentaje: 5 },
    { desde: 0, hasta: 20_000, porcentaje: 8 },
  ])
  assert.match(e.join(' '), /mismo monto/)
})

// ── Redondeo determinista del medio centavo ─────────────────
//
// El calculo corre en centavos enteros justo por esto. Con float,
// 3629.55 * 0.10 da 362.95499999999998 y `Math.round(x*100)/100` entregaba
// 362.95, o sea el medio centavo se iba para abajo por como quedo la
// representacion binaria, no por una regla. Con enteros la regla es
// explicita: medio centavo SIEMPRE hacia arriba.

test('medio centavo exacto: redondea hacia arriba, no segun el float', () => {
  // El caso real que lo saco a la luz: base de 13,629.55 (20,000 cobrados
  // netos de impuestos) con el tramo de 10,000 en adelante al 10%. La porcion
  // es 3,629.55 y su 10% es 362.955: medio centavo exacto.
  const escalera: Tramo[] = [
    { desde: 0, hasta: 5_000, porcentaje: 5 },
    { desde: 5_000, hasta: 10_000, porcentaje: 8 },
    { desde: 10_000, hasta: null, porcentaje: 10 },
  ]
  const r = sinImpuestos({
    pagos: [pago('g1', 'p1', 13_629.55)],
    pedidos: [pedido('p1', 13_629.55)],
    tramos: escalera,
  })

  assert.equal(r.base, 13_629.55)
  assert.equal(r.porTramo[2].porcion, 3_629.55)
  // 362.955 -> 362.96. Antes salia 362.95.
  assert.equal(r.porTramo[2].comision, 362.96)
  // 250 + 400 + 362.96
  assert.equal(r.comision, 1_012.96)
})

test('medio centavo en varios tramos a la vez', () => {
  // Cada tramo cae en medio centavo: 1,000.10 * 0.5% = 5.0005 -> 5.01 y
  // 1,000.10 * 1.5% = 15.0015 -> 15.00 (no es medio, baja), mas el tercero.
  const escalera: Tramo[] = [
    { desde: 0, hasta: 100.1, porcentaje: 0.5 },
    { desde: 100.1, hasta: 200.2, porcentaje: 1.5 },
    { desde: 200.2, hasta: null, porcentaje: 2.5 },
  ]
  const r = sinImpuestos({
    pagos: [pago('g1', 'p1', 300)],
    pedidos: [pedido('p1', 300)],
    tramos: escalera,
  })

  // 100.10 * 0.5% = 0.5005 -> 0.50 | 100.10 * 1.5% = 1.5015 -> 1.50
  // 99.80 * 2.5% = 2.495 -> 2.50 (medio centavo, hacia arriba)
  assert.deepEqual(r.porTramo.map(t => t.comision), [0.5, 1.5, 2.5])
  assert.equal(r.comision, 4.5)
})

test('el resultado no depende de en cuantos pagos llego el dinero', () => {
  const unPago = sinImpuestos({
    pagos: [pago('g1', 'p1', 999.99)],
    pedidos: [pedido('p1', 999.99)],
    tramos: ESCALERA,
  })
  const tresPagos = sinImpuestos({
    pagos: [
      pago('g1', 'p1', 333.33, `${PERIODO}-10`),
      pago('g2', 'p1', 333.33, `${PERIODO}-15`),
      pago('g3', 'p1', 333.33, `${PERIODO}-20`),
    ],
    pedidos: [pedido('p1', 999.99)],
    tramos: ESCALERA,
  })

  // La base se redondea una vez por pedido sobre el cobrado ya acumulado, no
  // pago por pago, asi que fraccionar el cobro no cambia la comision.
  assert.equal(unPago.base, tresPagos.base)
  assert.equal(unPago.comision, tresPagos.comision)
})

test('con impuestos reales el medio centavo tambien es determinista', () => {
  // Se corre dos veces con los pagos en orden distinto: mismo resultado.
  const pedidos = [pedido('p1', 7_777.77, { descuento_monto: 777.77, total_con_envio: 7_250 })]
  const a = calcularComision({
    pagos: [pago('g1', 'p1', 3_625, `${PERIODO}-02`), pago('g2', 'p1', 3_625, `${PERIODO}-03`)],
    pedidos, tramos: ESCALERA, periodo: PERIODO,
  })
  const b = calcularComision({
    pagos: [pago('g2', 'p1', 3_625, `${PERIODO}-03`), pago('g1', 'p1', 3_625, `${PERIODO}-02`)],
    pedidos, tramos: ESCALERA, periodo: PERIODO,
  })

  assert.equal(a.base, b.base)
  assert.equal(a.comision, b.comision)
  // Y los centavos son centavos: nunca mas de 2 decimales.
  for (const v of [a.base, a.comision, ...a.porTramo.map(t => t.comision)]) {
    assert.equal(Math.round(v * 100), v * 100, `${v} tiene mas de 2 decimales`)
  }
})

test('IVA mixto: la base sigue siendo la mercancia neta', () => {
  // Desde que el IVA es por partida, un pedido puede traer IVA de solo una
  // parte. La formula no cambia y sigue siendo correcta porque el prorrateo
  // divide entre `total_con_envio`, que incluye EXACTAMENTE el IVA que ese
  // pedido tenga — todo, nada o un pedazo.
  //
  // Mercancia 1,000 con 600 gravados: IVA 96, total_con_envio 1,096.
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 1_096)],
    pedidos: [pedido('p1', 1_000, { total_con_envio: 1_096 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })

  // 1,096 x 1,000/1,096 = 1,000 de mercancia; / 1.265 = 790.51.
  assert.equal(r.base, 790.51)

  // Y es el MISMO numero que sin IVA y que con IVA en todo: lo que comisiona
  // es la mercancia, y gravar una partida no la cambia.
  const sinIva = calcularComision({
    pagos: [pago('g1', 'p1', 1_000)],
    pedidos: [pedido('p1', 1_000)],
    tramos: ESCALERA, periodo: PERIODO,
  })
  const todoIva = calcularComision({
    pagos: [pago('g1', 'p1', 1_160)],
    pedidos: [pedido('p1', 1_000, { total_con_envio: 1_160 })],
    tramos: ESCALERA, periodo: PERIODO,
  })
  assert.equal(r.base, sinIva.base)
  assert.equal(r.base, todoIva.base)
})

test('IVA mixto con envio: el envio sale y el IVA tambien', () => {
  // Mercancia 1,400 con 700 gravados, envio 100 exento:
  // base gravable 700, IVA 112, total_con_envio 1,400 + 100 + 112 = 1,612.
  const r = calcularComision({
    pagos: [pago('g1', 'p1', 1_612)],
    pedidos: [pedido('p1', 1_400, { total_con_envio: 1_612 })],
    tramos: ESCALERA,
    periodo: PERIODO,
  })
  // 1,612 x 1,400/1,612 = 1,400; / 1.265 = 1,106.72.
  assert.equal(r.base, 1_106.72)
})
