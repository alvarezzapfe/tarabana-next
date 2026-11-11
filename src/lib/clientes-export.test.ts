/**
 * Tests del filtro de la lista de clientes y del armado del libro.
 *
 * Lo que se prueba es lo que un Excel mal armado no avisa: que los montos
 * salgan de `pedidos_saldo` y no de `total`, que una fecha quede como fecha y
 * no como texto, que una celda vacia quede vacia y no con un guion, y que el
 * resumen cuente lo exportado y no la cartera completa.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  armarHojasClientes, fechaCelda, filtrarClientes, metricasPorCliente,
  nombreArchivoClientes, SIN_VENDEDOR, type ClienteExport,
} from './clientes-export.ts'
import { construirLibro } from './libro-xlsx.ts'
import type { FilaSaldo } from './metricas.ts'

const cliente = (over: Partial<ClienteExport> = {}): ClienteExport => ({
  id: 'c1',
  email: 'bar@ejemplo.mx',
  full_name: 'Bar La Esquina',
  marca_negocio: 'Bar La Esquina',
  razon_social: null,
  giro: 'bar',
  tipo_consumidor: 'tiene_bar',
  nivel_precio: 'taproom',
  rfc: null,
  created_at: '2026-03-15T18:30:00Z',
  ...over,
})

const saldo = (over: Partial<FilaSaldo> = {}): FilaSaldo => ({
  id: 'p1',
  cliente_id: 'c1',
  total: 1000,
  pagado: 400,
  saldo: 200,
  iva_monto: 0,
  ajuste: 0,
  status: 'entregado',
  estado_cobro: 'parcial',
  dias_vencido: 0,
  fecha_pedido: '2026-04-01',
  created_at: '2026-04-01T10:00:00Z',
  ...over,
})

/** Las celdas de una columna por su encabezado, ya leidas del .xlsx. */
async function leerHoja(bytes: Uint8Array, hoja: string) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet(hoja)!
  const encabezados = (ws.getRow(1).values as unknown[]).map(v => (v == null ? '' : String(v)))
  return {
    ws,
    celda: (fila: number, titulo: string) => ws.getCell(fila, encabezados.indexOf(titulo)).value,
    columna: (titulo: string) => ws.getColumn(encabezados.indexOf(titulo)),
  }
}

// ── Filtro ──────────────────────────────────────────────────

test('sin filtros no se cae nada', () => {
  const lista = [cliente(), cliente({ id: 'c2' })]
  assert.equal(filtrarClientes(lista, {}).length, 2)
  assert.equal(filtrarClientes(lista, { q: '', tipo: '', nivel: '' }).length, 2)
})

test('el buscador cubre nombre comercial, razon social, nombre, correo y RFC', () => {
  const lista = [
    cliente({ id: 'marca', marca_negocio: 'Taproom Centro' }),
    cliente({ id: 'razon', marca_negocio: null, razon_social: 'Cerveceria del Valle SA de CV' }),
    cliente({ id: 'nombre', marca_negocio: null, full_name: 'Juana Perez' }),
    cliente({ id: 'correo', marca_negocio: null, email: 'compras@hotelmar.mx' }),
    cliente({ id: 'rfc', marca_negocio: null, rfc: 'XAXX010101000' }),
  ]
  const soloUno = (q: string) => filtrarClientes(lista, { q }).map(c => c.id)

  assert.deepEqual(soloUno('taproom ce'), ['marca'])
  assert.deepEqual(soloUno('del valle'), ['razon'])
  assert.deepEqual(soloUno('juana'), ['nombre'])
  assert.deepEqual(soloUno('hotelmar'), ['correo'])
  // El RFC se teclea en minusculas tanto como en mayusculas.
  assert.deepEqual(soloUno('xaxx0101'), ['rfc'])
})

test('un cliente sin nivel cuenta como publico, igual que en la tabla', () => {
  const lista = [cliente({ id: 'sin', nivel_precio: null }), cliente({ id: 'dist', nivel_precio: 'distribuidor' })]
  assert.deepEqual(filtrarClientes(lista, { nivel: 'publico' }).map(c => c.id), ['sin'])
  assert.deepEqual(filtrarClientes(lista, { nivel: 'distribuidor' }).map(c => c.id), ['dist'])
})

test('el filtro de tipo es por tipo_consumidor, no por giro', () => {
  // Un cliente del portal puede tener tipo_consumidor y un giro distinto: el
  // select de la pantalla filtra por el primero.
  const lista = [cliente({ id: 'a', tipo_consumidor: 'restaurante', giro: 'bar' })]
  assert.deepEqual(filtrarClientes(lista, { tipo: 'restaurante' }).map(c => c.id), ['a'])
  assert.deepEqual(filtrarClientes(lista, { tipo: 'bar' }), [])
})

test('los filtros se acumulan', () => {
  const lista = [
    cliente({ id: 'a', marca_negocio: 'Bar Uno', tipo_consumidor: 'tiene_bar', nivel_precio: 'taproom' }),
    cliente({ id: 'b', marca_negocio: 'Bar Dos', tipo_consumidor: 'tiene_bar', nivel_precio: 'publico' }),
    cliente({ id: 'c', marca_negocio: 'Hotel Tres', tipo_consumidor: 'hotel', nivel_precio: 'taproom' }),
  ]
  assert.deepEqual(
    filtrarClientes(lista, { q: 'bar', tipo: 'tiene_bar', nivel: 'taproom' }).map(c => c.id),
    ['a']
  )
})

// ── Metricas por cliente ────────────────────────────────────

test('los montos son netos (pagado + saldo), no el total bruto', () => {
  // total 1000 con descuento: lo facturado es 400 + 200 = 600, no 1000.
  const m = metricasPorCliente([saldo()]).get('c1')!
  assert.equal(m.facturado, 600)
  assert.equal(m.cobrado, 400)
  assert.equal(m.saldo, 200)
  assert.equal(m.pedidos, 1)
})

test('un sobrepago no resta del saldo por cobrar', () => {
  const m = metricasPorCliente([saldo({ pagado: 1200, saldo: -200 })]).get('c1')!
  assert.equal(m.saldo, 0)
  // Lo facturado si refleja la resta: 1200 - 200 = 1000.
  assert.equal(m.facturado, 1000)
})

test('el ultimo pedido es la fecha mas reciente, comparada como string', () => {
  const m = metricasPorCliente([
    saldo({ id: 'p1', fecha_pedido: '2026-09-30' }),
    saldo({ id: 'p2', fecha_pedido: '2026-10-01' }),
    saldo({ id: 'p3', fecha_pedido: '2026-02-11' }),
  ]).get('c1')!
  assert.equal(m.ultimo, '2026-10-01')
  assert.equal(m.pedidos, 3)
})

test('las filas sin cliente_id se ignoran en vez de agruparse juntas', () => {
  const mapa = metricasPorCliente([saldo({ cliente_id: null })])
  assert.equal(mapa.size, 0)
})

// ── Hoja "Clientes" ─────────────────────────────────────────

test('un renglon por cliente, con las 37 columnas pedidas', () => {
  const [hoja] = armarHojasClientes({
    clientes: [cliente(), cliente({ id: 'c2' })],
    saldos: [],
    vendedores: new Map(),
  })
  assert.equal(hoja.nombre, 'Clientes')
  assert.equal(hoja.filas.length, 2)
  assert.equal(hoja.columnas.length, 37)
  assert.equal(hoja.columnas.length, new Set(hoja.columnas).size, 'hay encabezados repetidos')
  assert.equal(hoja.anchos!.length, hoja.columnas.length)
})

test('cada celda corresponde a su encabezado', () => {
  const [hoja] = armarHojasClientes({
    clientes: [cliente({
      vendedor_id: 'v1', contacto_nombre: 'Luisa', contacto_whatsapp: '+5213311112222',
      phone: '+5213344445555', instagram: '@barlaesquina', sitio_web: 'barlaesquina.mx',
      requiere_factura: true, rfc: 'CDV120101ABC', tipo_persona_registro: 'moral',
      regimen_fiscal: '601', cp_fiscal: '44100', uso_cfdi: 'G03',
      calle: 'Av. Chapultepec', num_ext: '15', num_int: 'B', colonia: 'Americana',
      municipio: 'Guadalajara', estado: 'Jalisco', cp: '44160', referencias: 'Puerta azul',
      horario_recepcion: 'L-V 9 a 13', dias_credito: 30, limite_credito: 25000,
      notas: 'Pide factura el mismo dia',
    })],
    saldos: [saldo()],
    vendedores: new Map([['v1', 'Ana Vendedora']]),
  })
  const f = hoja.filas[0]

  assert.equal(f['Nombre comercial'], 'Bar La Esquina')
  assert.equal(f['Giro'], 'Bar o cantina')
  assert.equal(f['Nivel de precio'], 'Mayorista')
  assert.equal(f['Vendedor'], 'Ana Vendedora')
  assert.equal(f['Contacto'], 'Luisa')
  assert.equal(f['WhatsApp'], '+5213311112222')
  assert.equal(f['Requiere factura'], 'Sí')
  assert.equal(f['Tipo de persona'], 'Moral')
  // Los catalogos SAT salen con su descripcion, no solo el codigo.
  assert.match(String(f['Régimen fiscal']), /^601 · /)
  assert.match(String(f['Uso CFDI']), /^G03 · /)
  assert.equal(f['Núm. int.'], 'B')
  assert.equal(f['Días de crédito'], 30)
  assert.equal(f['Límite de crédito'], 25000)
  assert.equal(f['# pedidos'], 1)
  assert.equal(f['Total facturado'], 600)
  assert.equal(f['IVA'], 0)
  assert.equal(f['Ajuste'], 0)
  assert.equal(f['Cobrado'], 400)
  assert.equal(f['Saldo'], 200)
  assert.equal(f['Notas'], 'Pide factura el mismo dia')
})

test('lo que falta queda en celda vacia, no en guion', () => {
  const [hoja] = armarHojasClientes({ clientes: [cliente()], saldos: [], vendedores: new Map() })
  const f = hoja.filas[0]

  for (const titulo of ['Razón social', 'Vendedor', 'RFC', 'Régimen fiscal', 'Uso CFDI', 'Calle', 'Notas']) {
    assert.equal(f[titulo], null, `"${titulo}" trae ${JSON.stringify(f[titulo])}`)
  }
  // Los dias y el limite de credito vacios NO son cero: cero es un dato.
  assert.equal(f['Días de crédito'], null)
  assert.equal(f['Límite de crédito'], null)
  // Un cliente sin pedidos si tiene cero, que es cierto, y sin ultimo pedido.
  assert.equal(f['# pedidos'], 0)
  assert.equal(f['Total facturado'], 0)
  assert.equal(f['Último pedido'], null)
})

test('un cliente del portal sin giro cae en su tipo_consumidor', () => {
  const [hoja] = armarHojasClientes({
    clientes: [cliente({ giro: null, tipo_consumidor: 'restaurante' })],
    saldos: [], vendedores: new Map(),
  })
  assert.equal(hoja.filas[0]['Giro'], 'Restaurante')

  const [sinNada] = armarHojasClientes({
    clientes: [cliente({ giro: null, tipo_consumidor: null })],
    saldos: [], vendedores: new Map(),
  })
  assert.equal(sinNada.filas[0]['Giro'], 'Sin giro')
})

test('las fechas son fechas, con el dia correcto', () => {
  const [hoja] = armarHojasClientes({
    clientes: [cliente({ created_at: '2026-03-15T18:30:00Z' })],
    saldos: [saldo({ fecha_pedido: '2026-04-01' })],
    vendedores: new Map(),
  })
  const alta = hoja.filas[0]['Fecha de alta'] as Date
  const ultimo = hoja.filas[0]['Último pedido'] as Date

  assert.ok(alta instanceof Date)
  // 18:30 UTC del 15 son 12:30 del 15 en CDMX: la fecha de negocio es el 15.
  assert.equal(alta.toISOString().slice(0, 10), '2026-03-15')
  assert.equal(ultimo.toISOString().slice(0, 10), '2026-04-01')
})

test('las 18:30 UTC de fin de mes no mueven la fecha de alta al mes siguiente', () => {
  // 2026-11-01T02:00Z son las 20:00 del 31 de octubre en CDMX.
  const [hoja] = armarHojasClientes({
    clientes: [cliente({ created_at: '2026-11-01T02:00:00Z' })],
    saldos: [], vendedores: new Map(),
  })
  assert.equal((hoja.filas[0]['Fecha de alta'] as Date).toISOString().slice(0, 10), '2026-10-31')
})

test('fechaCelda rechaza lo que no es fecha en vez de inventar una', () => {
  for (const malo of [null, undefined, '', 'ayer', '0000-00-00']) {
    assert.equal(fechaCelda(malo), null, `${JSON.stringify(malo)} paso`)
  }
  assert.equal(fechaCelda('2026-04-01')!.getUTCHours(), 12, 'no quedo anclada a mediodia UTC')
})

// ── Hoja "Resumen" ──────────────────────────────────────────

test('el resumen cuenta lo exportado, por giro, nivel y vendedor', () => {
  const [, resumen] = armarHojasClientes({
    clientes: [
      cliente({ id: 'a', giro: 'bar', nivel_precio: 'taproom', vendedor_id: 'v1' }),
      cliente({ id: 'b', giro: 'bar', nivel_precio: 'publico', vendedor_id: 'v1' }),
      cliente({ id: 'c', giro: 'hotel', nivel_precio: 'taproom', vendedor_id: null }),
    ],
    saldos: [],
    vendedores: new Map([['v1', 'Ana Vendedora']]),
  })

  assert.equal(resumen.nombre, 'Resumen')
  const de = (grupo: string) =>
    resumen.filas.filter(f => f['Agrupación'] === grupo)
      .map(f => [f['Concepto'], f['Clientes']])

  assert.deepEqual(de('Total'), [['Clientes exportados', 3]])
  assert.deepEqual(de('Giro'), [['Bar o cantina', 2], ['Hotel', 1]])
  assert.deepEqual(de('Nivel de precio'), [['Mayorista', 2], ['Público', 1]])
  assert.deepEqual(de('Vendedor'), [['Ana Vendedora', 2], [SIN_VENDEDOR, 1]])
})

test('a igual cuenta el resumen ordena alfabetico, para que dos exports iguales salgan iguales', () => {
  const [, resumen] = armarHojasClientes({
    clientes: [cliente({ id: 'a', giro: 'hotel' }), cliente({ id: 'b', giro: 'bar' })],
    saldos: [], vendedores: new Map(),
  })
  assert.deepEqual(
    resumen.filas.filter(f => f['Agrupación'] === 'Giro').map(f => f['Concepto']),
    ['Bar o cantina', 'Hotel']
  )
})

// ── El archivo ──────────────────────────────────────────────

test('el .xlsx que sale se puede volver a leer, con formatos y autofiltro', async () => {
  const hojas = armarHojasClientes({
    clientes: [cliente({ dias_credito: 15, limite_credito: 12345.67 })],
    saldos: [saldo()],
    vendedores: new Map(),
  })
  const bytes = await construirLibro(hojas)
  const { ws, celda, columna } = await leerHoja(bytes, 'Clientes')

  // Encabezado en negrita y fila congelada.
  assert.equal(ws.getRow(1).font?.bold, true)
  assert.equal(ws.views[0].state, 'frozen')
  assert.equal((ws.views[0] as { ySplit?: number }).ySplit, 1)
  assert.ok(ws.autoFilter, 'sin autofiltro')

  // Los montos son numeros con formato de pesos, no texto ya formateado: si
  // fueran texto no se podrian sumar en la hoja.
  assert.equal(celda(2, 'Total facturado'), 600)
  assert.equal(columna('Total facturado').numFmt, '"$"#,##0.00')
  assert.equal(columna('Límite de crédito').numFmt, '"$"#,##0.00')
  assert.equal(columna('Días de crédito').numFmt, '#,##0')

  // La fecha llega como fecha de Excel y con el dia correcto.
  const alta = celda(2, 'Fecha de alta')
  assert.ok(alta instanceof Date, `"Fecha de alta" quedo como ${typeof alta}`)
  assert.equal((alta as Date).toISOString().slice(0, 10), '2026-03-15')
  assert.equal(columna('Fecha de alta').numFmt, 'dd/mm/yyyy')

  // Una celda vacia se queda vacia.
  assert.equal(celda(2, 'Razón social'), null)
})

test('las dos hojas quedan en el archivo y en orden', async () => {
  const bytes = await construirLibro(
    armarHojasClientes({ clientes: [cliente()], saldos: [], vendedores: new Map() })
  )
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  assert.deepEqual(wb.worksheets.map(h => h.name), ['Clientes', 'Resumen'])
})

// ── Nombre del archivo ──────────────────────────────────────

test('el nombre del archivo lleva la fecha de Mexico', () => {
  assert.equal(
    nombreArchivoClientes(new Date('2026-11-09T18:00:00Z')),
    'clientes-tarabana-2026-11-09.xlsx'
  )
  // 02:00 UTC del 10 todavia son las 20:00 del 9 en CDMX.
  assert.equal(
    nombreArchivoClientes(new Date('2026-11-10T02:00:00Z')),
    'clientes-tarabana-2026-11-09.xlsx'
  )
})

test('IVA: el archivo de clientes cuadra consigo mismo', () => {
  // Es de cobranza: facturado, cobrado y saldo van CON IVA y tienen que
  // sumar entre si. La columna IVA dice cuanto de ese total es impuesto,
  // para quien quiera la venta sin el.
  const [hoja] = armarHojasClientes({
    clientes: [cliente()],
    // Mercancia 1,000 + IVA 160 = 1,160; pagados 500, saldo 660.
    saldos: [saldo({ total: 1_000, iva_monto: 160, pagado: 500, saldo: 660 })],
    vendedores: new Map(),
  })
  const f = hoja.filas[0]

  assert.equal(f['Total facturado'], 1_160)
  assert.equal(f['IVA'], 160)
  assert.equal(f['Cobrado'], 500)
  assert.equal(f['Saldo'], 660)
  assert.equal(Number(f['Cobrado']) + Number(f['Saldo']), f['Total facturado'])
  // Y la venta sin IVA se saca restando, que es para lo que esta la columna.
  assert.equal(Number(f['Total facturado']) - Number(f['IVA']), 1_000)
})
