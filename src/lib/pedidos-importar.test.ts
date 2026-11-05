/**
 * Tests de la importacion masiva de pedidos.
 *
 *   npm test
 *
 * Los del lector van contra .xlsx REALES: el test los genera con exceljs y
 * los vuelve a leer, asi que se prueba el formato de verdad y no un mock de
 * filas. Los del validador son puros.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import {
  LIMITE_BYTES, LIMITE_RENGLONES, NOMBRE_HOJA_CAPTURA,
  claveColumna, leerHojaCaptura, textoDeCelda,
} from './leer-xlsx.ts'
import {
  COLUMNAS_ADMIN, COLUMNAS_BASE, LIMITE_PARTIDAS, LIMITE_PEDIDOS, PRESENTACIONES,
  construirPlan, itemsParaCrear, norm, parseCantidad, parseFecha,
  type Catalogo,
} from './pedidos-importar.ts'
import { combinacionesDisponibles, construirPlantilla } from './plantilla-pedidos.ts'

const TODAS = [...COLUMNAS_BASE, ...COLUMNAS_ADMIN]

// ── Catalogo de prueba ──────────────────────────────────────

function producto(id: string, nombre: string, over: Record<string, unknown> = {}) {
  return {
    id, nombre,
    precio_lata_publico: 50, precio_lata_taproom: 45,
    precio_barril_pet_publico: 2900, precio_barril_pet_taproom: null,
    precio_barril_acero_publico: 2600, precio_barril_acero_taproom: null,
    precio_barril10_pet_publico: 1500, precio_barril10_pet_taproom: null,
    precio_barril10_acero_publico: 1400, precio_barril10_acero_taproom: null,
    stock_latas: 200, stock_caja12: 0, stock_caja24: 45,
    stock_barril_pet: 2, stock_barril_acero: 3,
    stock_barril10_pet: 0, stock_barril10_acero: 0,
    ...over,
  }
}

const CATALOGO: Catalogo = {
  productos: [producto('p-magma', 'Magma'), producto('p-brisa', 'Brisa'), producto('p-silice', 'Sílice')],
  clientes: [
    { id: 'c-1', email: 'uno@cliente.mx', nombre: 'Cliente Uno', nivel_precio: 'publico' },
    { id: 'c-2', email: 'dos@cliente.mx', nombre: 'Cliente Dos', nivel_precio: 'taproom' },
  ],
}

/** Renglones como los entrega el lector. */
const filas = (...renglones: Record<string, string>[]) =>
  renglones.map((valores, i) => ({ fila: i + 2, valores }))

/** Hoy fijo en los tests: una fecha movil haria fallar los casos de borde. */
const HOY = '2026-11-05'

const plan = (fs: ReturnType<typeof filas>, puedeDescuento = true, esVendedor = false) =>
  construirPlan(fs, CATALOGO, { puedeDescuento, esVendedor, hoy: HOY })

const partida = (over: Record<string, string> = {}) => ({
  referencia: 'P1', cliente: 'uno@cliente.mx', producto: 'Magma',
  presentacion: 'Caja 24 latas', cantidad: '2', condiciones_pago: '', notas: '',
  ...over,
})

// ── Lector de xlsx ──────────────────────────────────────────

/** Arma un .xlsx con la hoja de captura y lo devuelve como bytes. */
async function xlsxDe(
  renglones: (string | number)[][],
  opciones: { encabezados?: string[]; hoja?: string } = {}
): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet(opciones.hoja ?? NOMBRE_HOJA_CAPTURA)
  ws.addRow(opciones.encabezados ?? [...TODAS])
  for (const r of renglones) ws.addRow(r)
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

test('lector: ida y vuelta por un .xlsx real', async () => {
  // Las columnas van en el orden de COLUMNAS_BASE: ..., condiciones_pago,
  // fecha_pedido, fecha_entrega, orden_compra, notas.
  const bytes = await xlsxDe([[
    'P1', 'uno@cliente.mx', 'Magma', 'Caja 24 latas', 2, 'Contado',
    '2026-10-20', '2026-10-25', 'OC-991', 'urge',
  ]])
  const r = await leerHojaCaptura(bytes, TODAS)

  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  assert.equal(r.filas.length, 1)
  // El renglon 2 de la hoja, que es lo que el usuario ve en Excel.
  assert.equal(r.filas[0].fila, 2)
  assert.equal(r.filas[0].valores.cliente, 'uno@cliente.mx')
  assert.equal(r.filas[0].valores.cantidad, '2')
  assert.equal(r.filas[0].valores.fecha_pedido, '2026-10-20')
  assert.equal(r.filas[0].valores.orden_compra, 'OC-991')
  assert.equal(r.filas[0].valores.notas, 'urge')
})

test('lector: rechaza lo que no es un .xlsx', async () => {
  const csv = new TextEncoder().encode('referencia,cliente\nP1,uno@cliente.mx\n')
  const r = await leerHojaCaptura(csv, TODAS)
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.error, /no es un \.xlsx/)
})

test('lector: rechaza un archivo vacio', async () => {
  const r = await leerHojaCaptura(new Uint8Array(0), TODAS)
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.error, /vacio/)
})

test('lector: rechaza por tamano antes de parsear', async () => {
  // Con firma ZIP valida, para probar que lo que corta es el tope y no la firma.
  const grande = new Uint8Array(LIMITE_BYTES + 1)
  grande.set([0x50, 0x4b, 0x03, 0x04])
  const r = await leerHojaCaptura(grande, TODAS)
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.error, /limite es 2 MB/)
})

test('lector: un zip que no es xlsx no revienta, da error legible', async () => {
  // Firma ZIP pero contenido basura: el parser tira y se traduce el error.
  const falso = new Uint8Array(200)
  falso.set([0x50, 0x4b, 0x03, 0x04])
  const r = await leerHojaCaptura(falso, TODAS)
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.error, /No se pudo leer el archivo/)
})

test('lector: encabezados con acentos y mayusculas se normalizan', async () => {
  const bytes = await xlsxDe(
    [['P1', 'uno@cliente.mx', 'Magma', 'Caja 24 latas', 2]],
    { encabezados: ['Referencia', 'CLIENTE', 'Producto', 'Presentación', ' Cantidad '] }
  )
  const r = await leerHojaCaptura(bytes, TODAS)
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  assert.equal(r.filas[0].valores.presentacion, 'Caja 24 latas')
  assert.deepEqual(r.columnasDesconocidas, [])
})

test('lector: una columna que no existe se reporta, no se ignora', async () => {
  const bytes = await xlsxDe(
    [['P1', 'uno@cliente.mx', 'Magma', 'Caja 24 latas', 2, '', '', 'mucho']],
    { encabezados: [...COLUMNAS_BASE, 'descuento_secreto'] }
  )
  const r = await leerHojaCaptura(bytes, COLUMNAS_BASE)
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  assert.deepEqual(r.columnasDesconocidas, ['descuento_secreto'])
})

test('lector: sin los encabezados esperados avisa que use la plantilla', async () => {
  const bytes = await xlsxDe([[1, 2, 3]], { encabezados: ['a', 'b', 'c'] })
  const r = await leerHojaCaptura(bytes, TODAS)
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.error, /plantilla/)
})

test('lector: salta renglones vacios intercalados', async () => {
  const bytes = await xlsxDe([
    ['P1', 'uno@cliente.mx', 'Magma', 'Caja 24 latas', 1],
    ['', '', '', '', ''],
    ['P2', 'dos@cliente.mx', 'Brisa', 'Lata', 10],
  ])
  const r = await leerHojaCaptura(bytes, TODAS)
  assert.ok(r.ok)
  if (!r.ok) return
  assert.equal(r.filas.length, 2)
  // El numero de renglon se conserva: el segundo dato esta en la fila 4.
  assert.deepEqual(r.filas.map(f => f.fila), [2, 4])
})

test('lector: encuentra la hoja aunque venga con otro caso', async () => {
  const bytes = await xlsxDe([['P1', 'uno@cliente.mx', 'Magma', 'Lata', 1]], { hoja: 'captura' })
  const r = await leerHojaCaptura(bytes, TODAS)
  assert.ok(r.ok, !r.ok ? r.error : '')
})

test('textoDeCelda: de una formula toma el resultado y nunca la evalua', () => {
  assert.equal(textoDeCelda({ formula: '1+1', result: 2 }), '2')
  assert.equal(textoDeCelda({ formula: 'A1&"x"', result: 'Magma' }), 'Magma')
  // Celda en error: se trata como vacia en vez de meter "#REF!" al pipeline.
  assert.equal(textoDeCelda({ error: '#REF!' }), '')
  assert.equal(textoDeCelda({ richText: [{ text: 'Ca' }, { text: 'liza' }] }), 'Caliza')
  assert.equal(textoDeCelda({ text: 'x@y.mx', hyperlink: 'mailto:x@y.mx' }), 'x@y.mx')
  assert.equal(textoDeCelda(null), '')
  assert.equal(textoDeCelda(undefined), '')
})

test('claveColumna normaliza acentos y espacios', () => {
  assert.equal(claveColumna('Presentación'), 'presentacion')
  assert.equal(claveColumna(' Condiciones de Pago '), 'condiciones_de_pago')
  assert.equal(claveColumna('COSTO_ENVIO'), 'costo_envio')
})

// ── Agrupacion ──────────────────────────────────────────────

test('agrupa los renglones de la misma referencia en un pedido', () => {
  const p = plan(filas(
    partida({ referencia: 'P1', producto: 'Magma', cantidad: '2' }),
    partida({ referencia: 'P1', producto: 'Brisa', cantidad: '3' }),
    partida({ referencia: 'P2', producto: 'Sílice', cantidad: '1' }),
  ))

  assert.equal(p.pedidos.length, 2)
  assert.equal(p.pedidos[0].referencia, 'P1')
  assert.equal(p.pedidos[0].partidas.length, 2)
  assert.equal(p.pedidos[1].partidas.length, 1)
  assert.equal(p.validos, 2)
})

test('el mismo producto y presentacion dos veces en un pedido se consolida', () => {
  const p = plan(filas(
    partida({ cantidad: '3' }),
    partida({ cantidad: '4' }),
  ))

  // Si no se consolidaran, cada renglon se validaria contra el stock completo.
  assert.equal(p.pedidos[0].partidas.length, 1)
  assert.equal(p.pedidos[0].partidas[0].cantidad, 7)
  assert.deepEqual(p.pedidos[0].partidas[0].filas, [2, 3])
})

test('un renglon sin referencia se reporta, no desaparece', () => {
  const p = plan(filas(partida(), partida({ referencia: '' })))
  const fantasma = p.pedidos.find(x => x.referencia === '(sin referencia)')
  assert.ok(fantasma)
  assert.match(fantasma!.errores[0].mensaje, /Sin referencia/)
  assert.equal(fantasma!.valido, false)
})

test('dos clientes en la misma referencia es un error del pedido', () => {
  const p = plan(filas(
    partida({ referencia: 'P1', cliente: 'uno@cliente.mx' }),
    partida({ referencia: 'P1', cliente: 'dos@cliente.mx', producto: 'Brisa' }),
  ))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores[0].mensaje, /clientes distintos/)
})

test('condiciones de pago contradictorias en la misma referencia', () => {
  const p = plan(filas(
    partida({ condiciones_pago: 'Contado' }),
    partida({ producto: 'Brisa', condiciones_pago: '30 días' }),
  ))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores.map(e => e.mensaje).join(' '), /condiciones de pago distintas/)
})

test('las condiciones de pago se aceptan por etiqueta o por clave', () => {
  for (const texto of ['Contado', 'contado', '30 días', '30_dias', '30 dias', '15 días']) {
    const p = plan(filas(partida({ condiciones_pago: texto })))
    assert.equal(p.pedidos[0].valido, true, `fallo con "${texto}": ${JSON.stringify(p.pedidos[0].errores)}`)
  }
})

// ── Errores por renglon ─────────────────────────────────────

test('cliente inexistente: error pegado al renglon', () => {
  const p = plan(filas(partida({ cliente: 'fantasma@nadie.mx' })))
  assert.equal(p.pedidos[0].valido, false)
  assert.equal(p.pedidos[0].errores[0].fila, 2)
  assert.match(p.pedidos[0].errores[0].mensaje, /no existe o no esta en tu cartera/)
})

test('cliente por id tambien funciona', () => {
  const p = plan(filas(partida({ cliente: 'c-1' })))
  // 'c-1' no es un uuid, asi que no resuelve por id: se exige el correo.
  assert.equal(p.pedidos[0].valido, false)

  const conUuid: Catalogo = {
    ...CATALOGO,
    clientes: [{ id: '11111111-2222-3333-4444-555555555555', email: 'x@y.mx', nombre: 'X', nivel_precio: 'publico' }],
  }
  const p2 = construirPlan(
    filas(partida({ cliente: '11111111-2222-3333-4444-555555555555' })),
    conUuid, { puedeDescuento: true, esVendedor: false, hoy: HOY }
  )
  assert.equal(p2.pedidos[0].cliente_id, '11111111-2222-3333-4444-555555555555')
})

test('producto inexistente y presentacion invalida, cada uno en su renglon', () => {
  const p = plan(filas(
    partida({ producto: 'Cerveza Fantasma' }),
    partida({ producto: 'Magma', presentacion: 'Barrica de roble' }),
  ))
  const msgs = p.pedidos[0].errores
  assert.equal(msgs[0].fila, 2)
  assert.match(msgs[0].mensaje, /no existe o no esta activo/)
  assert.equal(msgs[1].fila, 3)
  assert.match(msgs[1].mensaje, /no es valida/)
})

test('el producto se resuelve sin acentos y sin importar mayusculas', () => {
  const p = plan(filas(partida({ producto: 'silice', presentacion: 'lata', cantidad: '5' })))
  assert.equal(p.pedidos[0].valido, true, JSON.stringify(p.pedidos[0].errores))
  assert.equal(p.pedidos[0].partidas[0].producto, 'Sílice')
})

test('cantidad no valida: cada caso con su mensaje', () => {
  for (const cant of ['0', '-3', '2.5', 'dos', '']) {
    const p = plan(filas(partida({ cantidad: cant })))
    assert.equal(p.pedidos[0].valido, false, `"${cant}" paso`)
  }
  // Excel entrega miles con separador segun el formato de la celda.
  const p = plan(filas(partida({ presentacion: 'Lata', cantidad: '1,0' })))
  assert.equal(p.pedidos[0].partidas[0]?.cantidad, 10)
})

test('parseCantidad: entera y positiva', () => {
  assert.equal(parseCantidad('5'), 5)
  assert.equal(parseCantidad('1,000'), 1000)
  assert.equal(parseCantidad('2.5'), null)
  assert.equal(parseCantidad('-1'), null)
  assert.equal(parseCantidad('0'), null)
  assert.equal(parseCantidad(''), null)
})

// ── Precios y stock ─────────────────────────────────────────

test('el precio sale del nivel del cliente', () => {
  const publico = plan(filas(partida({ cliente: 'uno@cliente.mx', presentacion: 'Lata', cantidad: '1' })))
  const mayorista = plan(filas(partida({ cliente: 'dos@cliente.mx', presentacion: 'Lata', cantidad: '1' })))

  assert.equal(publico.pedidos[0].partidas[0].precioUnitario, 50)
  assert.equal(mayorista.pedidos[0].partidas[0].precioUnitario, 45)
})

test('sin precio para el nivel del cliente se rechaza con el motivo', () => {
  // Cliente 2 es taproom y los barriles no tienen precio taproom.
  const p = plan(filas(partida({ cliente: 'dos@cliente.mx', presentacion: 'Barril 20L PET', cantidad: '1' })))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores[0].mensaje, /no tiene precio mayorista/)
})

test('stock insuficiente en la presentacion pedida', () => {
  // stock_caja12 es 0 en el catalogo de prueba.
  const p = plan(filas(partida({ presentacion: 'Caja 12 latas', cantidad: '1' })))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores[0].mensaje, /Stock insuficiente/)
  assert.match(p.pedidos[0].errores[0].mensaje, /quedan 0/)
})

test('el stock se acumula a lo largo del archivo', () => {
  // Hay 3 barriles de acero. Tres pedidos de 2 cada uno: pasan los dos
  // primeros... no: 2 + 2 = 4 > 3, asi que pasa el primero y falla el segundo.
  const p = plan(filas(
    partida({ referencia: 'P1', presentacion: 'Barril 20L Acero', cantidad: '2' }),
    partida({ referencia: 'P2', presentacion: 'Barril 20L Acero', cantidad: '2' }),
  ))

  assert.equal(p.pedidos[0].valido, true, JSON.stringify(p.pedidos[0].errores))
  assert.equal(p.pedidos[1].valido, false)
  assert.match(p.pedidos[1].errores[0].mensaje, /quedan 1/)
  assert.match(p.pedidos[1].errores[0].mensaje, /pedidos anteriores de este archivo/)
})

test('un pedido invalido no le quita stock a los siguientes', () => {
  const p = plan(filas(
    // P1 invalido por cliente, aunque pida 3 barriles.
    partida({ referencia: 'P1', cliente: 'fantasma@nadie.mx', presentacion: 'Barril 20L Acero', cantidad: '3' }),
    // P2 valido: debe encontrar los 3 barriles enteros.
    partida({ referencia: 'P2', presentacion: 'Barril 20L Acero', cantidad: '3' }),
  ))

  assert.equal(p.pedidos[0].valido, false)
  assert.equal(p.pedidos[1].valido, true, JSON.stringify(p.pedidos[1].errores))
})

test('latas sueltas ya se pueden pedir (el bug de stock_lata)', () => {
  const p = plan(filas(partida({ presentacion: 'Lata', cantidad: '24' })))
  assert.equal(p.pedidos[0].valido, true, JSON.stringify(p.pedidos[0].errores))
  assert.equal(p.pedidos[0].total, 24 * 50)
})

// ── Envio y descuento ───────────────────────────────────────

test('quien no es admin no puede capturar descuento ni envio', () => {
  const p = plan(filas(partida({ descuento_tipo: 'porcentaje', descuento_valor: '10', descuento_motivo: 'x' })), false)
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores[0].mensaje, /solo admin y super admin/i)

  const envio = plan(filas(partida({ costo_envio: '150' })), false)
  assert.equal(envio.pedidos[0].valido, false)
})

test('descuento porcentual: se calcula sobre el subtotal', () => {
  const p = plan(filas(partida({
    presentacion: 'Lata', cantidad: '10',
    descuento_tipo: 'porcentaje', descuento_valor: '10', descuento_motivo: 'volumen',
  })))

  const ped = p.pedidos[0]
  assert.equal(ped.valido, true, JSON.stringify(ped.errores))
  assert.equal(ped.subtotal, 500)
  assert.equal(ped.descuentoMonto, 50)
  assert.equal(ped.total, 450)
})

test('descuento de monto mas costo de envio', () => {
  const p = plan(filas(partida({
    presentacion: 'Lata', cantidad: '10', costo_envio: '120',
    descuento_tipo: 'monto', descuento_valor: '100', descuento_motivo: 'cortesia',
  })))

  const ped = p.pedidos[0]
  assert.equal(ped.subtotal, 500)
  assert.equal(ped.total, 500 - 100 + 120)
  assert.equal(ped.costo_envio, 120)
})

test('un descuento mayor al subtotal se rechaza', () => {
  const p = plan(filas(partida({
    presentacion: 'Lata', cantidad: '1',
    descuento_tipo: 'monto', descuento_valor: '9999', descuento_motivo: 'x',
  })))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores.map(e => e.mensaje).join(' '), /mayor al subtotal/)
})

test('descuento sin motivo y porcentaje imposible', () => {
  const sinMotivo = plan(filas(partida({ descuento_tipo: 'porcentaje', descuento_valor: '10' })))
  assert.match(sinMotivo.pedidos[0].errores.map(e => e.mensaje).join(' '), /motivo del descuento/)

  const imposible = plan(filas(partida({ descuento_tipo: 'porcentaje', descuento_valor: '120', descuento_motivo: 'x' })))
  assert.match(imposible.pedidos[0].errores.map(e => e.mensaje).join(' '), /no puede ser 120/)

  const sinTipo = plan(filas(partida({ descuento_valor: '50' })))
  assert.match(sinTipo.pedidos[0].errores.map(e => e.mensaje).join(' '), /sin tipo de descuento/)
})

// ── Limites ─────────────────────────────────────────────────

test('tope de pedidos por archivo', () => {
  const muchos = Array.from({ length: LIMITE_PEDIDOS + 1 }, (_, i) =>
    partida({ referencia: `P${i}`, presentacion: 'Lata', cantidad: '1' })
  )
  const p = plan(filas(...muchos))
  assert.match(p.erroresGlobales.join(' '), new RegExp(`limite es ${LIMITE_PEDIDOS}`))
})

test('tope de partidas por pedido', () => {
  // Productos distintos para que no se consoliden; se repiten las 3 del
  // catalogo variando presentacion no alcanza, asi que se usa un catalogo ancho.
  const anchos: Catalogo = {
    clientes: CATALOGO.clientes,
    productos: Array.from({ length: LIMITE_PARTIDAS + 1 }, (_, i) => producto(`p-${i}`, `Producto ${i}`)),
  }
  const fs = filas(...Array.from({ length: LIMITE_PARTIDAS + 1 }, (_, i) =>
    partida({ producto: `Producto ${i}`, presentacion: 'Lata', cantidad: '1' })
  ))
  const p = construirPlan(fs, anchos, { puedeDescuento: true, esVendedor: false, hoy: HOY })
  assert.match(p.pedidos[0].errores.map(e => e.mensaje).join(' '), new RegExp(`limite es ${LIMITE_PARTIDAS}`))
})

// ── Resumen y salida ────────────────────────────────────────

test('el resumen cuenta validos, invalidos y el total de lo que se va a crear', () => {
  const p = plan(filas(
    partida({ referencia: 'P1', presentacion: 'Lata', cantidad: '10' }),
    partida({ referencia: 'P2', cliente: 'fantasma@nadie.mx' }),
    partida({ referencia: 'P3', presentacion: 'Lata', cantidad: '2' }),
  ))

  assert.equal(p.renglones, 3)
  assert.equal(p.validos, 2)
  assert.equal(p.invalidos, 1)
  assert.equal(p.totalValido, 500 + 100)
  // El invalido no suma al total, y no se cotiza: su precio dependeria del
  // nivel de un cliente que no existe.
  const invalido = p.pedidos.find(x => x.referencia === 'P2')!
  assert.equal(invalido.total, 0)
  assert.equal(invalido.subtotal, 0)
  // Pero las partidas capturadas si se listan, para que se vea lo escrito.
  assert.equal(invalido.partidas.length, 1)
  assert.equal(invalido.partidas[0].cantidad, 2)
  assert.equal(invalido.partidas[0].precioUnitario, 0)
})

test('itemsParaCrear devuelve el formato que espera crearPedido', () => {
  const p = plan(filas(partida({ presentacion: 'Caja 24 latas', cantidad: '2' })))
  assert.deepEqual(itemsParaCrear(p.pedidos[0]), [{ producto_id: 'p-magma-caja24', cantidad: 2 }])
})

test('cada presentacion de la lista produce un producto_id que se puede parsear', () => {
  // El parser de crearPedido corta en el ultimo guion, asi que ninguna clave
  // de presentacion puede traer un guion.
  for (const pres of PRESENTACIONES) {
    assert.ok(!pres.key.includes('-'), `la clave "${pres.key}" trae un guion y rompe el parseo`)
  }
})

test('norm quita acentos y colapsa espacios', () => {
  assert.equal(norm('  Sílice   Negra '), 'silice negra')
  assert.equal(norm('CAJA 24 LATAS'), 'caja 24 latas')
})

test('el lector respeta el tope de renglones', () => {
  assert.equal(LIMITE_RENGLONES, 2000)
  assert.equal(LIMITE_BYTES, 2 * 1024 * 1024)
})

// ── La plantilla y el lector tienen que cuadrar ─────────────
//
// Es el test mas importante del archivo: si los encabezados que escribe la
// plantilla no son los que el lector espera, la funcion completa no sirve, y
// eso no se nota en ninguno de los tests de arriba porque todos arman el
// .xlsx a mano.

test('plantilla: el lector entiende la que genera la app, sin columnas sueltas', async () => {
  const bytes = await construirPlantilla({
    productos: CATALOGO.productos,
    clientes: CATALOGO.clientes,
    puedeDescuento: true,
    esVendedor: false,
  })

  const r = await leerHojaCaptura(bytes, TODAS)
  // Sin renglones de datos, el lector avisa que esta vacia: eso es correcto
  // para una plantilla recien bajada.
  assert.ok(!r.ok)
  if (r.ok) return
  assert.match(r.error, /no tiene ningun renglon con datos/)
})

test('plantilla: capturada y vuelta a leer, llega completa al validador', async () => {
  const bytes = await construirPlantilla({
    productos: CATALOGO.productos, clientes: CATALOGO.clientes,
    puedeDescuento: true, esVendedor: false,
  })

  // Se "captura" sobre la plantilla real, como haria una persona.
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet(NOMBRE_HOJA_CAPTURA)!
  ws.getRow(2).getCell(1).value = 'OC-100'
  ws.getRow(2).getCell(2).value = 'dos@cliente.mx'
  ws.getRow(2).getCell(3).value = 'Magma'
  ws.getRow(2).getCell(4).value = 'Lata'
  ws.getRow(2).getCell(5).value = 12
  ws.getRow(2).getCell(6).value = '30 días'
  const capturado = new Uint8Array(await wb.xlsx.writeBuffer())

  const r = await leerHojaCaptura(capturado, TODAS)
  assert.ok(r.ok, !r.ok ? r.error : '')
  if (!r.ok) return
  assert.deepEqual(r.columnasDesconocidas, [])

  const p = construirPlan(r.filas, CATALOGO, { puedeDescuento: true, esVendedor: false, hoy: HOY })
  assert.equal(p.pedidos.length, 1)
  const ped = p.pedidos[0]
  assert.equal(ped.valido, true, JSON.stringify(ped.errores))
  assert.equal(ped.referencia, 'OC-100')
  assert.equal(ped.cliente_id, 'c-2')
  assert.equal(ped.condiciones_pago, '30_dias')
  // Cliente 2 es mayorista: 12 latas a $45.
  assert.equal(ped.total, 12 * 45)
})

test('plantilla de no-admin: no trae las columnas de descuento ni envio', async () => {
  const bytes = await construirPlantilla({
    productos: CATALOGO.productos, clientes: CATALOGO.clientes,
    puedeDescuento: false, esVendedor: true,
  })

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  const encabezados = (wb.getWorksheet(NOMBRE_HOJA_CAPTURA)!.getRow(1).values as unknown[])
    .filter(Boolean).map(String)

  // El orden importa: `assert.deepEqual` trae un type predicate que narrowea
  // `encabezados` al tipo del valor esperado, asi que cualquier `includes`
  // posterior deja de compilar.
  for (const col of COLUMNAS_ADMIN as readonly string[]) {
    assert.ok(!encabezados.includes(col), `la plantilla de no-admin trae "${col}"`)
  }
  assert.deepEqual(encabezados, [...COLUMNAS_BASE])
})

test('plantilla: las hojas de referencia y los desplegables estan ahi', async () => {
  const bytes = await construirPlantilla({
    productos: CATALOGO.productos, clientes: CATALOGO.clientes,
    puedeDescuento: true, esVendedor: false,
  })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])

  const nombres = wb.worksheets.map(h => h.name)
  for (const n of [NOMBRE_HOJA_CAPTURA, 'Instrucciones', 'Productos', 'Clientes', 'Listas']) {
    assert.ok(nombres.includes(n), `falta la hoja ${n}`)
  }
  // La maquinaria de los desplegables no se le ensena al usuario.
  assert.equal(wb.getWorksheet('Listas')!.state, 'hidden')

  const captura = wb.getWorksheet(NOMBRE_HOJA_CAPTURA)!
  const dvProducto = captura.getCell('C2').dataValidation
  assert.equal(dvProducto?.type, 'list')
  assert.match(String(dvProducto?.formulae?.[0]), /Listas/)

  const dvCantidad = captura.getCell('E2').dataValidation
  assert.equal(dvCantidad?.type, 'whole')
})

test('plantilla: la hoja Productos solo lista combinaciones que se pueden pedir', () => {
  const combos = combinacionesDisponibles(CATALOGO.productos)

  // Ninguna combinacion sin un solo precio configurado.
  for (const c of combos) {
    assert.ok(c.precioPublico > 0 || c.precioMayorista > 0, `${c.producto} / ${c.presentacion} sin precio`)
  }
  // Y las que si tienen precio aparecen: lata, caja12, caja24 y los 4 barriles.
  const deMagma = combos.filter(c => c.producto === 'Magma')
  assert.equal(deMagma.length, PRESENTACIONES.length)

  // Un producto sin precio de lata no ofrece presentaciones de lata.
  const sinLata = combinacionesDisponibles([
    { id: 'p-x', nombre: 'Zap', precio_lata_publico: null, precio_lata_taproom: null,
      precio_barril_acero_publico: 1800, stock_barril_acero: 4 },
  ])
  assert.deepEqual(sinLata.map(c => c.presentacion), ['Barril 20L Acero'])
})

// ── Fechas en el Excel ──────────────────────────────────────

test('parseFecha acepta los tres formatos que entrega Excel', () => {
  assert.equal(parseFecha('2026-10-20'), '2026-10-20')
  // Timestamp completo, por si la celda es de tipo fecha con hora.
  assert.equal(parseFecha('2026-10-20T00:00:00.000Z'), '2026-10-20')
  // Dia primero, que es como se captura en Mexico.
  assert.equal(parseFecha('20/10/2026'), '2026-10-20')
  assert.equal(parseFecha('5/3/2026'), '2026-03-05')
  assert.equal(parseFecha('20-10-2026'), '2026-10-20')
})

test('parseFecha rechaza lo que no es una fecha en vez de adivinar', () => {
  for (const basura of ['', 'urge', '20/13/2026', '0/10/2026', '46327', '2026/10/20']) {
    assert.equal(parseFecha(basura), null, `acepto "${basura}"`)
  }
})

test('sin fecha_pedido el pedido toma hoy', () => {
  const p = plan(filas(partida()))
  assert.equal(p.pedidos[0].fecha_pedido, HOY)
  assert.equal(p.pedidos[0].valido, true, JSON.stringify(p.pedidos[0].errores))
})

test('una fecha retroactiva se respeta', () => {
  const p = plan(filas(partida({ fecha_pedido: '20/10/2026' })))
  assert.equal(p.pedidos[0].fecha_pedido, '2026-10-20')
  assert.equal(p.pedidos[0].valido, true, JSON.stringify(p.pedidos[0].errores))
})

test('una fecha futura se rechaza', () => {
  const p = plan(filas(partida({ fecha_pedido: '2027-01-01' })))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores.map(e => e.mensaje).join(' '), /no puede ser futura/)
})

test('un vendedor no puede capturar con fecha retroactiva', () => {
  const retro = plan(filas(partida({ fecha_pedido: '2026-10-20' })), true, true)
  assert.equal(retro.pedidos[0].valido, false)
  assert.match(retro.pedidos[0].errores.map(e => e.mensaje).join(' '), /solo puedes capturar con la fecha de hoy/)

  // Con la de hoy, o vacia, si pasa.
  assert.equal(plan(filas(partida({ fecha_pedido: HOY })), true, true).pedidos[0].valido, true)
  assert.equal(plan(filas(partida()), true, true).pedidos[0].valido, true)
})

test('dos fechas distintas en la misma referencia es un error', () => {
  const p = plan(filas(
    partida({ fecha_pedido: '2026-10-20' }),
    partida({ producto: 'Brisa', fecha_pedido: '2026-10-21' }),
  ))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores.map(e => e.mensaje).join(' '), /fechas de pedido distintas/)
})

test('la entrega no puede ser antes del pedido', () => {
  const p = plan(filas(partida({ fecha_pedido: '2026-10-20', fecha_entrega: '2026-10-19' })))
  assert.equal(p.pedidos[0].valido, false)
  assert.match(p.pedidos[0].errores.map(e => e.mensaje).join(' '), /antes de la fecha del pedido/)

  const ok = plan(filas(partida({ fecha_pedido: '2026-10-20', fecha_entrega: '2026-10-25' })))
  assert.equal(ok.pedidos[0].valido, true, JSON.stringify(ok.pedidos[0].errores))
  assert.equal(ok.pedidos[0].fecha_entrega, '2026-10-25')
})

test('orden de compra y folio de factura llegan al plan', () => {
  const p = plan(filas(partida({ orden_compra: 'OC-4471', folio_factura: 'A-1234' })))
  assert.equal(p.pedidos[0].orden_compra, 'OC-4471')
  assert.equal(p.pedidos[0].folio_factura, 'A-1234')
})

test('el folio de factura es de admin: sin permiso no se guarda', () => {
  const p = plan(filas(partida({ folio_factura: 'A-1234' })), false)
  // No es un error de captura — la columna no existe en su plantilla —, pero
  // tampoco se guarda a escondidas.
  assert.equal(p.pedidos[0].folio_factura, null)
})
