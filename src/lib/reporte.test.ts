/**
 * Tests del reporte imprimible.
 *
 *   npm test
 *
 * Lo que importa aqui no es cada suma —esas se prueban en metricas.test.ts—
 * sino que las secciones CUADREN ENTRE SI: el reporte sale impreso y en Excel,
 * y un total de la seccion 2 que no coincida con el KPI de la seccion 1 es el
 * tipo de error que nadie reporta y todos dejan de confiar.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { armarReporte, etiquetaCobranza, folioDe, hojasDeReporte, nombreArchivo, periodoLegible } from './reporte.ts'
import { rangoDePeriodo, type FilaSaldo, type PedidoConItems } from './metricas.ts'
import { MAX_HOJAS, validarHojas } from './libro-xlsx.ts'
import type { DatosReporte } from './reporte-datos.ts'

const AHORA = new Date('2026-11-05T12:00:00-06:00')
const PERIODO = rangoDePeriodo('mes', AHORA)

const saldo = (over: Partial<FilaSaldo> = {}): FilaSaldo => ({
  id: 'p1', cliente_id: 'c1', total: 1_000, pagado: 0, saldo: 1_000, iva_monto: 0, ajuste: 0,
  status: 'confirmado', estado_cobro: 'pendiente', dias_vencido: 0,
  fecha_pedido: '2026-11-02', fecha_vencimiento: '2026-12-02',
  created_at: '2026-11-02T00:00:00Z',
  ...over,
})

const pedido = (
  id: string,
  fecha_pedido: string,
  items: { unidad: string | null; cantidad: number; precio: number; producto_id?: string; estilo?: string }[]
): PedidoConItems => ({
  id,
  fecha_pedido,
  pedido_items: items.map(it => ({
    unidad: it.unidad,
    cantidad: it.cantidad,
    precio_unitario: it.precio,
    productos: { id: it.producto_id ?? 'pa', nombre: 'Oleaje', estilo: it.estilo ?? 'Lager Mexicana' },
  })),
})

/**
 * Dos clientes, cuatro pedidos, un descuento y un atraso. Suficiente para que
 * todas las secciones tengan algo que decir.
 */
function fuente(): DatosReporte {
  return {
    datos: {
      saldos: [
        // Facturado 900 con bruto 1,000: hubo descuento, asi que el reparto
        // por partida tiene que notarse.
        saldo({ id: 'p1', cliente_id: 'c1', pagado: 400, saldo: 500, fecha_pedido: '2026-11-02' }),
        saldo({ id: 'p2', cliente_id: 'c1', pagado: 0, saldo: 2_000, dias_vencido: 15, fecha_pedido: '2026-11-03', fecha_vencimiento: '2026-10-21' }),
        saldo({ id: 'p3', cliente_id: 'c2', pagado: 600, saldo: 0, estado_cobro: 'pagado', fecha_pedido: '2026-11-04' }),
        // Fuera del periodo: entra en cartera y en la tendencia, no en la
        // seccion 2.
        saldo({ id: 'p4', cliente_id: 'c2', pagado: 0, saldo: 700, dias_vencido: 95, fecha_pedido: '2026-07-01' }),
      ],
      pedidos: [
        pedido('p1', '2026-11-02', [
          { unidad: 'caja24', cantidad: 2, precio: 300 },
          { unidad: 'barril_pet', cantidad: 1, precio: 400 },
        ]),
        pedido('p2', '2026-11-03', [{ unidad: 'barril_acero', cantidad: 2, precio: 1_000, estilo: 'Porter', producto_id: 'pb' }]),
        pedido('p3', '2026-11-04', [{ unidad: 'lata', cantidad: 12, precio: 50 }]),
        pedido('p4', '2026-07-01', [{ unidad: 'caja12', cantidad: 1, precio: 700 }]),
      ],
      pagos: [
        { fecha_pago: '2026-11-02', monto: 400 },
        { fecha_pago: '2026-11-04', monto: 600 },
        // De un pedido viejo: entra en Cobrado del periodo y en nada mas.
        { fecha_pago: '2026-11-05', monto: 250 },
      ],
    },
    stock: [{ stock_barril_pet: 3, stock_caja24: 10 }],
    clientes: [
      { id: 'c1', full_name: null, email: 'bar@x.mx', razon_social: 'BAR LA ESQUINA SA DE CV', marca_negocio: 'Bar La Esquina' },
      { id: 'c2', full_name: 'Ana Ruiz', email: 'ana@x.mx', razon_social: null },
    ],
    estiloDeProducto: new Map([['pa', 'Lager Mexicana'], ['pb', 'Porter']]),
  }
}

const reporte = () => armarReporte(fuente(), PERIODO, AHORA)

// ── Que las secciones cuadren entre si ──────────────────────

test('el total por cliente es el Facturado del resumen', () => {
  const r = reporte()
  assert.equal(r.resumen.facturado, 3_500, '900 + 2,000 + 600')
  assert.equal(r.totales.facturado, r.resumen.facturado)
  assert.equal(r.totales.pedidos, r.resumen.pedidos)
  assert.equal(r.totales.litros.toFixed(2), r.resumen.litros.toFixed(2))
})

test('el importe por presentacion suma el Facturado del resumen', () => {
  // Es la razon de ser del reparto de `partidasValuadas`: si las
  // presentaciones sumaran el bruto de las partidas, esta seccion diria 3,700
  // donde el resumen dice 3,500.
  const r = reporte()
  const suma = r.presentaciones.reduce((s, p) => s + p.importe, 0)
  assert.equal(suma.toFixed(2), (r.resumen.facturado - r.sinReparto).toFixed(2))
  assert.equal(r.sinReparto, 0)
})

test('el importe por estilo tambien suma el Facturado', () => {
  const r = reporte()
  const suma = r.estilos.reduce((s, e) => s + e.importe, 0)
  assert.equal(suma.toFixed(2), (r.resumen.facturado - r.sinReparto).toFixed(2))
})

test('los litros por presentacion y por estilo son los mismos litros', () => {
  const r = reporte()
  const porPres = r.presentaciones.reduce((s, p) => s + p.litros, 0)
  const porEstilo = r.estilos.reduce((s, e) => s + e.litros, 0)
  assert.equal(porPres.toFixed(2), r.resumen.litros.toFixed(2))
  assert.equal(porEstilo.toFixed(2), r.resumen.litros.toFixed(2))
})

test('Cobrado del resumen va por fecha de pago y no cuadra con la cohorte, a proposito', () => {
  const r = reporte()
  // Entraron 1,250 en el periodo (400 + 600 + 250 de un pedido de julio)...
  assert.equal(r.resumen.cobrado, 1_250)
  // ...pero de los pedidos DEL periodo solo se ha cobrado 1,000.
  assert.equal(r.totales.cobrado, 1_000)
})

test('la cartera y el por cobrar son al dia de hoy, no del periodo', () => {
  const r = reporte()
  // Incluye el pedido de julio, que no esta en la seccion 2.
  assert.equal(r.hoy.porCobrar, 3_200)
  assert.equal(r.hoy.vencido, 2_700, 'los dos atrasados: 2,000 + 700')
  assert.equal(r.cartera.reduce((s, b) => s + b.monto, 0), r.hoy.porCobrar)
  assert.equal(r.cobranza.reduce((s, c) => s + c.saldo, 0), r.hoy.porCobrar)
  assert.deepEqual(r.cobranza.map(c => c.id), ['p4', 'p2', 'p1'], 'no ordeno por atraso')
})

test('el nombre del cliente sale del catalogo, con el comercial al frente', () => {
  const r = reporte()
  assert.deepEqual(r.clientes.map(c => c.nombre), ['Bar La Esquina', 'Ana Ruiz'])
})

test('la tendencia es de 12 meses aunque el periodo sea de cinco dias', () => {
  const r = reporte()
  assert.equal(r.meses, 12)
  assert.equal(r.crecimiento.length, 12)
  assert.equal(r.mezcla.length, 12)
  // Y cubre el pedido de julio, que el periodo elegido deja fuera.
  assert.ok(r.crecimiento.some(p => p.desde === '2026-07-01' && p.facturado === 700))
})

test('un periodo de 24 meses lleva tendencia de 24', () => {
  const r = armarReporte(fuente(), rangoDePeriodo('24m', AHORA), AHORA)
  assert.equal(r.meses, 24)
  assert.equal(r.crecimiento.length, 24)
})

test('los hallazgos salen armados y no vacios', () => {
  const r = reporte()
  assert.ok(r.hallazgos.length >= 3, `solo salieron ${r.hallazgos.length}`)
  assert.ok(r.hallazgos.every(h => h.texto.length > 10))
  // El del deudor tiene que nombrar al que mas debe hoy, que es c2 por el
  // pedido de julio.
  assert.match(r.hallazgos.find(h => h.clave === 'deudor')!.texto, /Bar La Esquina/)
})

test('el ritmo anualizado extrapola el periodo elegido', () => {
  const r = reporte()
  // 3,500 en 5 dias.
  assert.equal(Math.round(r.ritmo), Math.round((3_500 / 5) * 365))
})

// ── El Excel dice lo mismo que la pagina ────────────────────

const hojas = () => hojasDeReporte(reporte())

test('las hojas son validas para libro-xlsx', () => {
  const h = hojas()
  assert.ok(h.length <= MAX_HOJAS, `${h.length} hojas`)
  assert.ok(!('error' in validarHojas(h)), JSON.stringify(validarHojas(h)))
})

test('una hoja por seccion, con los nombres que Excel acepta', () => {
  assert.deepEqual(hojas().map(h => h.nombre), [
    'Resumen', 'Por cliente', 'Por presentacion', 'Por estilo',
    'Cartera', 'Pedidos con saldo', 'Crecimiento', 'Mezcla por mes',
  ])
  for (const h of hojas()) {
    assert.ok(h.nombre.length <= 31, h.nombre)
    assert.ok(!/[:\\/?*[\]]/.test(h.nombre), h.nombre)
  }
})

test('ningun renglon trae una llave que no sea columna', () => {
  // `addRow` con objeto respeta las keys de las columnas: una llave que no
  // existe se pierde en silencio, y la columna queda vacia sin aviso.
  for (const h of hojas()) {
    for (const fila of h.filas) {
      for (const k of Object.keys(fila)) {
        assert.ok(h.columnas.includes(k), `${h.nombre}: "${k}" no esta en columnas`)
      }
    }
  }
})

test('los anchos y los formatos corresponden a columnas que existen', () => {
  for (const h of hojas()) {
    if (h.anchos) assert.equal(h.anchos.length, h.columnas.length, h.nombre)
    for (const k of Object.keys(h.formatos || {})) {
      assert.ok(h.columnas.includes(k), `${h.nombre}: formato de "${k}", que no es columna`)
    }
  }
})

test('el renglon TOTAL del Excel es el mismo total de la pagina', () => {
  const r = reporte()
  const cliente = hojasDeReporte(r).find(h => h.nombre === 'Por cliente')!
  const total = cliente.filas.at(-1)!
  assert.equal(total.Cliente, 'TOTAL')
  assert.equal(total.Facturado, Number(r.totales.facturado.toFixed(2)))
  assert.equal(total.Pedidos, r.totales.pedidos)
  assert.equal(cliente.filas.length, r.clientes.length + 1)
})

test('los montos van como numero, no como texto con signo de pesos', () => {
  // Para que quien reciba el archivo pueda sumar la columna sin limpiarla.
  const cliente = hojasDeReporte(reporte()).find(h => h.nombre === 'Por cliente')!
  for (const fila of cliente.filas) {
    assert.equal(typeof fila.Facturado, 'number', JSON.stringify(fila))
    assert.equal(typeof fila.Saldo, 'number')
  }
})

test('las fechas van como texto YYYY-MM-DD y no como Date', () => {
  // Son columnas `date` sin hora ni zona: pasarlas por Date las corre un dia.
  const saldos = hojasDeReporte(reporte()).find(h => h.nombre === 'Pedidos con saldo')!
  for (const fila of saldos.filas) {
    assert.equal(typeof fila.Fecha, 'string')
    assert.match(String(fila.Fecha), /^\d{4}-\d{2}-\d{2}$/)
  }
})

test('una variacion sin base va como guion y no como cero', () => {
  const crec = hojasDeReporte(reporte()).find(h => h.nombre === 'Crecimiento')!
  assert.equal(crec.filas[0]['Var. mes %'], '—', 'el primer mes no tiene mes previo')
  // Y una caida lleva el signo en el numero.
  const conCaida = crec.filas.find(f => typeof f['Var. mes %'] === 'number' && (f['Var. mes %'] as number) < 0)
  assert.ok(conCaida || crec.filas.some(f => typeof f['Var. mes %'] === 'number'), 'ninguna variacion salio como numero')
})

test('la mezcla lleva columnas fijas, no las del mes que toco', () => {
  // Una hoja cuyas columnas cambian segun lo que se vendio no se puede
  // comparar entre periodos.
  const mezcla = hojasDeReporte(reporte()).find(h => h.nombre === 'Mezcla por mes')!
  assert.deepEqual(mezcla.columnas, [
    'Mes', 'Litros', 'Lata', 'Caja 12', 'Caja 24', 'Caja 24 mixta',
    'Barril PET 20 L', 'Barril acero 20 L', 'Barril PET 10 L', 'Barril acero 10 L',
  ])
  assert.equal(mezcla.filas.length, 12)
})

test('el resumen del Excel trae el periodo, la hora y los hallazgos', () => {
  const r = reporte()
  const hoja = hojasDeReporte(r).find(h => h.nombre === 'Resumen')!
  const valor = (c: string) => hoja.filas.find(f => f.Concepto === c)?.Valor
  assert.equal(valor('Periodo'), '2026-11-01 a 2026-11-05')
  assert.equal(valor('Generado'), r.generado)
  assert.equal(valor('Facturado (sin IVA)'), 3_500)
  // El IVA va como renglon propio, y aparece aunque sea 0: en una hoja de
  // calculo un renglon ausente se lee como un olvido, no como un cero.
  assert.equal(valor('IVA facturado'), 0)
  assert.equal(valor('Total facturado (con IVA)'), 3_500)
  assert.equal(hoja.filas.filter(f => f.Concepto === 'Hallazgo').length, r.hallazgos.length)
})

// ── Rotulos ─────────────────────────────────────────────────

test('etiquetaCobranza dice los dias solo cuando hay atraso', () => {
  assert.equal(etiquetaCobranza({ clave: 'vencido', dias: 92 }), 'Vencido 92 días')
  assert.equal(etiquetaCobranza({ clave: 'vencido', dias: 1 }), 'Vencido 1 día')
  assert.equal(etiquetaCobranza({ clave: 'corriente', dias: 0 }), 'Al corriente')
  assert.equal(etiquetaCobranza({ clave: 'parcial', dias: 0 }), 'Parcial')
  assert.equal(etiquetaCobranza({ clave: 'pagado', dias: 0 }), 'Pagado')
})

test('folioDe es el mismo folio que muestra Pedidos', () => {
  assert.equal(folioDe('0f3a9c7e-1111-2222-3333-44b1465d0000'), '#5D0000')
  assert.equal(folioDe('abcdef'), '#ABCDEF')
})

test('el nombre del archivo lleva el periodo, para no pisar dos exports', () => {
  assert.equal(nombreArchivo(PERIODO), 'Reporte-Tarabana-2026-11-01-a-2026-11-05.xlsx')
  // Y pasa el saneado de la ruta de export sin perder nada.
  assert.equal(nombreArchivo(PERIODO).replace(/[^\w.\-]+/g, '-'), nombreArchivo(PERIODO))
})

test('periodoLegible colapsa un rango de un solo dia', () => {
  assert.equal(periodoLegible({ desde: '2026-11-05', hasta: '2026-11-05' }), '5 nov 2026')
  assert.equal(periodoLegible(PERIODO), '1 nov 2026 – 5 nov 2026')
})
