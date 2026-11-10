/**
 * Tests de la carga masiva de clientes.
 *
 * Tres cosas que se prueban aqui y en ningun otro lado:
 *
 *   1. El ROUND-TRIP: lo que escribe el export y lo que escribe la plantilla
 *      se vuelven a leer con el lector de verdad, pasando por un .xlsx real.
 *      Es lo que sostiene la promesa de "exporta, agrega renglones y vuelve a
 *      subir": si el export agregara una columna y la plantilla no, o si un
 *      encabezado dejara de normalizarse a la misma clave, esto truena.
 *   2. Que un renglon que ya existe se OMITA y no se reporte como error, ni
 *      en la base ni repetido dentro del mismo archivo.
 *   3. Que las columnas calculadas se ignoren: subir el export con "Cobrado"
 *      capturado a mano no puede mover un peso.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { claveColumna } from './clave-columna.ts'
import { COLUMNAS_CLIENTES, TITULOS_CLIENTES } from './clientes-columnas.ts'
import { camposCliente } from './cliente-campos.ts'
import { NOMBRE_HOJA_CLIENTES, armarHojasClientes, type ClienteExport } from './clientes-export.ts'
import { construirLibro } from './libro-xlsx.ts'
import { construirPlantillaClientes } from './plantilla-clientes.ts'
import { leerHojaCaptura } from './leer-xlsx.ts'
import {
  CLAVES_IMPORT, LIMITE_CLIENTES, avisoCalculadas, codigoSat,
  construirPlanClientes, parseSiNo,
  type CatalogoClientes,
} from './clientes-importar.ts'

const catalogo = (over: Partial<CatalogoClientes> = {}): CatalogoClientes => ({
  emails: new Set<string>(),
  rfcs: new Set<string>(),
  vendedores: [{ id: 'v1', nombre: 'Ana Vendedora' }],
  ...over,
})

/** Un renglon de archivo, por clave de columna. */
const fila = (n: number, valores: Record<string, string>) => ({
  fila: n,
  valores: { nombre_comercial: 'Bar Nuevo', email: `bar${n}@ejemplo.mx`, ...valores },
})

const plan = (filas: ReturnType<typeof fila>[], cat = catalogo(), esVendedor = false) =>
  construirPlanClientes(filas, cat, { esVendedor })

// ── Las claves del archivo ──────────────────────────────────

test('cada titulo normaliza a la clave que el importador espera', () => {
  for (const c of COLUMNAS_CLIENTES) {
    assert.equal(claveColumna(c.titulo), c.clave, `"${c.titulo}" normaliza distinto`)
  }
  assert.equal(new Set(CLAVES_IMPORT).size, CLAVES_IMPORT.length, 'hay claves repetidas')
})

test('el export declara un valor por columna y ninguno de sobra', () => {
  // `armarHojasClientes` indexa por titulo; una columna sin accesor saldria
  // como celda vacia en silencio.
  const [hoja] = armarHojasClientes({
    clientes: [clienteExport()],
    saldos: [],
    vendedores: new Map(),
  })
  assert.deepEqual(hoja.columnas, TITULOS_CLIENTES)
  assert.deepEqual(Object.keys(hoja.filas[0]), TITULOS_CLIENTES)
})

// ── Estado de cada renglon ──────────────────────────────────

test('un renglon completo y nuevo queda nuevo, con su cuerpo listo', () => {
  const r = plan([fila(2, {
    nombre_comercial: 'Taproom Centro',
    email: 'hola@taproomcentro.mx',
    giro: 'Taproom',
    nivel_de_precio: 'Mayorista',
    vendedor: 'Ana Vendedora',
    telefono: '33 1111 2222',
    dias_de_credito: '30',
    limite_de_credito: '$25,000.00',
  })])

  assert.equal(r.nuevos, 1)
  assert.equal(r.errores, 0)
  const f = r.filas[0]
  assert.equal(f.estado, 'nuevo')
  assert.equal(f.motivo, null)
  // Las etiquetas del Excel ya traducidas a los valores de la DB.
  assert.equal(f.cuerpo!.giro, 'taproom')
  assert.equal(f.cuerpo!.nivel_precio, 'taproom')
  assert.equal(f.cuerpo!.vendedor_id, 'v1')
  assert.equal(f.cuerpo!.dias_credito, 30)
  assert.equal(f.cuerpo!.limite_credito, 25000)
})

test('sin correo el renglon no se puede crear', () => {
  const r = plan([{ fila: 2, valores: { nombre_comercial: 'Bar Sin Correo', email: '' } }])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /Falta el correo/)
})

test('sin nombre comercial tampoco, con el mensaje del formulario', () => {
  const r = plan([{ fila: 2, valores: { nombre_comercial: '', email: 'a@b.mx' } }])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /nombre comercial es obligatorio/)
})

test('un correo mal formado es error, no "ya existe"', () => {
  const r = plan([fila(2, { email: 'bar@' })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /correo/i)
})

test('un correo que ya esta en la base se OMITE, no es error', () => {
  const r = plan(
    [fila(2, { email: 'Repetido@Ejemplo.MX' })],
    catalogo({ emails: new Set(['repetido@ejemplo.mx']) })
  )
  assert.equal(r.filas[0].estado, 'existe')
  assert.equal(r.existentes, 1)
  assert.equal(r.errores, 0)
  assert.match(r.filas[0].motivo!, /Ya hay un cliente con ese correo/)
})

test('un RFC que ya esta en la base tambien se omite', () => {
  const r = plan(
    [fila(2, { rfc: 'cdv-120101-abc' })],
    catalogo({ rfcs: new Set(['CDV120101ABC']) })
  )
  assert.equal(r.filas[0].estado, 'existe')
  assert.match(r.filas[0].motivo!, /RFC CDV120101ABC/)
})

test('un repetido DENTRO del archivo se omite y dice en que renglon venia', () => {
  const r = plan([
    fila(2, { email: 'mismo@ejemplo.mx' }),
    fila(3, { email: 'MISMO@ejemplo.mx' }),
  ])
  assert.equal(r.filas[0].estado, 'nuevo')
  assert.equal(r.filas[1].estado, 'existe')
  assert.match(r.filas[1].motivo!, /renglon 2/)
  assert.equal(r.nuevos, 1)
  assert.equal(r.existentes, 1)
})

test('un RFC repetido dentro del archivo tambien, aunque el correo sea otro', () => {
  const r = plan([
    fila(2, { rfc: 'CDV120101ABC' }),
    fila(3, { rfc: 'CDV120101ABC' }),
  ])
  assert.equal(r.filas[0].estado, 'nuevo')
  assert.equal(r.filas[1].estado, 'existe')
  assert.match(r.filas[1].motivo!, /se repite/)
})

test('un renglon sin RFC no colisiona con otro sin RFC', () => {
  const r = plan([fila(2, {}), fila(3, {}), fila(4, {})])
  assert.equal(r.nuevos, 3)
})

// ── Catalogos ───────────────────────────────────────────────

test('el giro se acepta por etiqueta y por valor interno', () => {
  for (const texto of ['Bar o cantina', 'bar', 'BAR O CANTINA', 'bar o cantina']) {
    const r = plan([fila(2, { giro: texto })])
    assert.equal(r.filas[0].cuerpo?.giro, 'bar', `"${texto}" no se reconocio`)
  }
})

test('un giro que no existe es error, no un cliente sin giro', () => {
  const r = plan([fila(2, { giro: 'Cervecería artesanal' })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /Giro desconocido/)
})

test('el nivel de precio acepta las etiquetas que escribe el export', () => {
  const casos: [string, string][] = [
    ['Público', 'publico'], ['publico', 'publico'],
    ['Mayorista', 'taproom'], ['taproom', 'taproom'],
    ['Distribuidor', 'distribuidor'],
  ]
  for (const [texto, esperado] of casos) {
    const r = plan([fila(2, { nivel_de_precio: texto })])
    assert.equal(r.filas[0].cuerpo?.nivel_precio, esperado, `"${texto}"`)
  }
})

test('un vendedor que no esta en el catalogo es error, no un cliente sin dueno', () => {
  // Dejarlo pasar cambiaria quien ve al cliente y quien cobra comision.
  const r = plan([fila(2, { vendedor: 'Juan el de ventas' })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /Vendedor desconocido/)
})

test('los codigos SAT se leen de "codigo · descripcion" y del codigo solo', () => {
  assert.equal(codigoSat('601 · General de Ley Personas Morales'), '601')
  assert.equal(codigoSat('601'), '601')
  assert.equal(codigoSat('G03 · Gastos en general'), 'G03')
  assert.equal(codigoSat(' g03 '), 'G03')
  assert.equal(codigoSat(''), '')
  assert.equal(codigoSat('—'), '')
})

test('parseSiNo entiende las formas en que la gente escribe que si', () => {
  for (const si of ['Sí', 'si', 'SI', 'S', 'x', 'X', '1', 'true', 'Verdadero']) {
    assert.equal(parseSiNo(si), true, `"${si}"`)
  }
  for (const no of ['No', 'no', '', '0', 'tal vez']) {
    assert.equal(parseSiNo(no), false, `"${no}"`)
  }
})

// ── Facturacion: las reglas son las del formulario ──────────

test('con factura, el RFC, la razon social y el uso de CFDI son obligatorios', () => {
  const r = plan([fila(2, { requiere_factura: 'Sí' })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /RFC es obligatorio/)

  const sinRazon = plan([fila(3, { requiere_factura: 'Sí', rfc: 'CDV120101ABC' })])
  assert.match(sinRazon.filas[0].motivo!, /razon social es obligatoria/)

  const sinUso = plan([fila(4, {
    requiere_factura: 'Sí', rfc: 'CDV120101ABC', razon_social: 'Cerveceria del Valle',
  })])
  assert.match(sinUso.filas[0].motivo!, /uso de CFDI es obligatorio/)
})

test('un regimen que no corresponde al tipo de persona del RFC se rechaza', () => {
  // 601 es de persona moral; un RFC de 13 caracteres es persona fisica.
  const r = plan([fila(2, {
    requiere_factura: 'Sí',
    rfc: 'VAMJ901130UE1',
    razon_social: 'Juan Vargas Mendez',
    uso_cfdi: 'G03 · Gastos en general',
    regimen_fiscal: '601 · General de Ley Personas Morales',
  })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /no corresponde a una persona fisica/)
})

test('un cliente con factura completo pasa, con los codigos ya limpios', () => {
  const r = plan([fila(2, {
    requiere_factura: 'Sí',
    rfc: 'cdv 120101 abc',
    razon_social: 'Cerveceria del Valle SA de CV',
    uso_cfdi: 'G03 · Gastos en general',
    regimen_fiscal: '601 · General de Ley Personas Morales',
    cp_fiscal: '44100',
  })])
  assert.equal(r.filas[0].estado, 'nuevo')
  assert.equal(r.filas[0].cuerpo!.uso_cfdi, 'G03')
  assert.equal(r.filas[0].cuerpo!.regimen_fiscal, '601')
})

test('el credito negativo se rechaza con el mensaje del formulario', () => {
  const r = plan([fila(2, { dias_de_credito: '-5' })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /no puede ser negativo/)

  const limite = plan([fila(3, { limite_de_credito: '-100' })])
  assert.match(limite.filas[0].motivo!, /no puede ser negativo/)
})

test('un credito que no es numero lo rechaza el validador, no el parser', () => {
  const r = plan([fila(2, { dias_de_credito: 'treinta' })])
  assert.equal(r.filas[0].estado, 'error')
  assert.match(r.filas[0].motivo!, /credito/)
})

// ── Vendedor que sube ───────────────────────────────────────

test('un vendedor no captura columnas comerciales, y se le avisa una vez', () => {
  const r = plan(
    [
      fila(2, { nivel_de_precio: 'Distribuidor', vendedor: 'Ana Vendedora', limite_de_credito: '9000' }),
      fila(3, { notas: 'cliente del centro' }),
    ],
    catalogo(),
    true
  )
  assert.equal(r.nuevos, 2)
  // El nivel y el vendedor del archivo se ignoran: los pone la ruta.
  assert.equal(r.filas[0].cuerpo!.vendedor_id, null)
  // El aviso sale UNA vez para todo el archivo, no por renglon.
  assert.equal(r.avisos.length, 1)
  assert.match(r.avisos[0], /no capturas nivel de precio/)
  assert.match(r.avisos[0], /nivel_de_precio/)
  assert.match(r.avisos[0], /notas/)
})

test('un vendedor con un nombre de vendedor invalido no se bloquea por eso', () => {
  // La columna no es suya: no tiene por que frenarle la carga.
  const r = plan([fila(2, { vendedor: 'Quien sea' })], catalogo(), true)
  assert.equal(r.filas[0].estado, 'nuevo')
})

test('sin columnas comerciales capturadas no hay aviso', () => {
  const r = plan([fila(2, {})], catalogo(), true)
  assert.deepEqual(r.avisos, [])
})

// ── Topes ───────────────────────────────────────────────────

test('pasarse del tope de clientes invalida el archivo entero', () => {
  const muchos = Array.from({ length: LIMITE_CLIENTES + 1 }, (_, i) => fila(i + 2, {}))
  const r = plan(muchos)
  assert.equal(r.erroresGlobales.length, 1)
  assert.match(r.erroresGlobales[0], new RegExp(`maximo por carga es ${LIMITE_CLIENTES}`))
})

test('justo en el tope si pasa', () => {
  const r = plan(Array.from({ length: LIMITE_CLIENTES }, (_, i) => fila(i + 2, {})))
  assert.deepEqual(r.erroresGlobales, [])
})

// ── Columnas calculadas ─────────────────────────────────────

test('las columnas calculadas no entran al cuerpo', () => {
  const r = plan([fila(2, {
    pedidos: '99', total_facturado: '500000', cobrado: '500000',
    saldo: '0', ultimo_pedido: '2026-01-01', fecha_de_alta: '2020-01-01',
  })])
  assert.equal(r.filas[0].estado, 'nuevo')
  const cuerpo = r.filas[0].cuerpo!
  for (const clave of ['pedidos', 'total_facturado', 'cobrado', 'saldo', 'ultimo_pedido', 'fecha_de_alta', 'created_at']) {
    assert.ok(!(clave in cuerpo), `el cuerpo trae "${clave}"`)
  }
})

test('el aviso de las calculadas sale cuando el archivo las trae', () => {
  const aviso = avisoCalculadas(['nombre_comercial', 'email', 'cobrado', 'saldo'])
  assert.match(aviso!, /no se leen/)
  assert.match(aviso!, /Cobrado/)
  assert.match(aviso!, /Saldo/)
  // Y no cuando no.
  assert.equal(avisoCalculadas(['nombre_comercial', 'email']), null)
})

// ── Round-trip: export -> archivo -> lector -> plan ─────────

function clienteExport(over: Partial<ClienteExport> = {}): ClienteExport {
  return {
    id: 'c1',
    email: 'hola@taproomcentro.mx',
    full_name: 'Taproom Centro',
    marca_negocio: 'Taproom Centro',
    razon_social: 'Cerveceria del Valle SA de CV',
    giro: 'taproom',
    tipo_consumidor: 'tiene_tap',
    nivel_precio: 'taproom',
    rfc: 'CDV120101ABC',
    created_at: '2026-03-15T18:30:00Z',
    vendedor_id: 'v1',
    contacto_nombre: 'Luisa',
    contacto_whatsapp: '+5213311112222',
    phone: '+5213344445555',
    instagram: '@taproomcentro',
    sitio_web: 'taproomcentro.mx',
    requiere_factura: true,
    tipo_persona_registro: 'moral',
    regimen_fiscal: '601',
    cp_fiscal: '44100',
    uso_cfdi: 'G03',
    calle: 'Av. Chapultepec',
    num_ext: '15',
    num_int: 'B',
    colonia: 'Americana',
    municipio: 'Guadalajara',
    estado: 'Jalisco',
    cp: '44160',
    referencias: 'Puerta azul',
    horario_recepcion: 'L-V 9 a 13',
    dias_credito: 30,
    limite_credito: 25000,
    notas: 'Pide factura el mismo dia',
    ...over,
  }
}

/** Agrega renglones nuevos al final de una hoja de un .xlsx ya armado. */
async function agregarRenglones(bytes: Uint8Array, filas: Record<string, string>[]) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet(NOMBRE_HOJA_CLIENTES)!
  for (const f of filas) {
    const valores = TITULOS_CLIENTES.map(t => f[t] ?? null)
    ws.addRow(valores)
  }
  return new Uint8Array(await wb.xlsx.writeBuffer())
}

test('round-trip: el archivo del export se vuelve a leer y el cliente sale "ya existe"', async () => {
  const bytes = await construirLibro(
    armarHojasClientes({
      clientes: [clienteExport()],
      saldos: [],
      vendedores: new Map([['v1', 'Ana Vendedora']]),
    })
  )

  // El lector de verdad, con la hoja del export.
  const lectura = await leerHojaCaptura(bytes, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.ok(lectura.ok, lectura.ok ? '' : lectura.error)
  assert.equal(lectura.filas.length, 1)
  // Todos los encabezados del export se reconocen: ninguno queda "desconocido".
  assert.deepEqual(lectura.columnasDesconocidas, [])
  assert.equal(lectura.columnasUsadas.length, TITULOS_CLIENTES.length)

  // Con ese cliente ya en la base, subirlo otra vez lo omite.
  const r = construirPlanClientes(
    lectura.filas,
    catalogo({ emails: new Set(['hola@taproomcentro.mx']) }),
    { esVendedor: false }
  )
  assert.equal(r.existentes, 1)
  assert.equal(r.errores, 0, r.filas[0]?.motivo || '')
})

test('round-trip: exportar, agregar renglones abajo y volver a subir', async () => {
  const bytes = await construirLibro(
    armarHojasClientes({
      clientes: [clienteExport()],
      saldos: [],
      vendedores: new Map([['v1', 'Ana Vendedora']]),
    })
  )

  const conNuevos = await agregarRenglones(bytes, [
    {
      'Nombre comercial': 'Bar La Esquina',
      'Email': 'nuevo@laesquina.mx',
      'Giro': 'Bar o cantina',
      'Nivel de precio': 'Mayorista',
      'Vendedor': 'Ana Vendedora',
      'Requiere factura': 'No',
      'Teléfono': '3312345678',
      'Días de crédito': '15',
    },
    {
      'Nombre comercial': 'Hotel Mar',
      'Email': 'compras@hotelmar.mx',
      'Giro': 'Hotel',
    },
  ])

  const lectura = await leerHojaCaptura(conNuevos, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.ok(lectura.ok, lectura.ok ? '' : lectura.error)
  assert.equal(lectura.filas.length, 3)

  const r = construirPlanClientes(
    lectura.filas,
    catalogo({ emails: new Set(['hola@taproomcentro.mx']), rfcs: new Set(['CDV120101ABC']) }),
    { esVendedor: false }
  )

  assert.equal(r.existentes, 1, 'el cliente que ya estaba deberia omitirse')
  assert.equal(r.errores, 0, r.filas.find(f => f.estado === 'error')?.motivo || '')
  assert.equal(r.nuevos, 2)

  const nuevos = r.filas.filter(f => f.estado === 'nuevo')
  assert.deepEqual(nuevos.map(f => f.email), ['nuevo@laesquina.mx', 'compras@hotelmar.mx'])
  // Los renglones reportados son los de Excel, para poder ir a corregirlos.
  assert.deepEqual(nuevos.map(f => f.fila), [3, 4])
  assert.equal(nuevos[0].cuerpo!.giro, 'bar')
  assert.equal(nuevos[0].cuerpo!.nivel_precio, 'taproom')
  assert.equal(nuevos[0].cuerpo!.vendedor_id, 'v1')
  assert.equal(nuevos[0].cuerpo!.dias_credito, 15)
  // Sin nivel capturado el cuerpo va en null, y el default a Público lo pone
  // `camposCliente` al escribir: es el mismo camino que el formulario.
  assert.equal(nuevos[1].cuerpo!.nivel_precio, null)
  assert.equal(camposCliente(nuevos[1].cuerpo!, { comercial: true }).nivel_precio, 'publico')
  // El telefono se guarda con prefijo, como en el formulario.
  assert.equal(camposCliente(nuevos[0].cuerpo!, { comercial: true }).phone, '+523312345678')
})

test('round-trip: la plantilla vacia trae los mismos encabezados que el export', async () => {
  const plantilla = await construirPlantillaClientes({
    vendedores: [{ id: 'v1', nombre: 'Ana Vendedora' }],
    esVendedor: false,
  })

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(plantilla as unknown as Parameters<typeof wb.xlsx.load>[0])

  const captura = wb.getWorksheet(NOMBRE_HOJA_CLIENTES)
  assert.ok(captura, `la plantilla no tiene la hoja "${NOMBRE_HOJA_CLIENTES}"`)

  const encabezados = (captura!.getRow(1).values as unknown[]).slice(1).map(v => String(v))
  assert.deepEqual(encabezados, TITULOS_CLIENTES)

  // Las hojas de apoyo, y Listas escondida porque es maquinaria.
  const nombres = wb.worksheets.map(h => h.name)
  assert.ok(nombres.includes('Instrucciones'), nombres.join(', '))
  assert.ok(nombres.includes('Vendedores'), nombres.join(', '))
  assert.equal(wb.getWorksheet('Listas')!.state, 'hidden')
})

test('la plantilla lleva desplegables en las columnas de catalogo', async () => {
  const plantilla = await construirPlantillaClientes({
    vendedores: [{ id: 'v1', nombre: 'Ana Vendedora' }],
    esVendedor: false,
  })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(plantilla as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet(NOMBRE_HOJA_CLIENTES)!

  const conLista = COLUMNAS_CLIENTES
    .map((c, i) => ({ c, col: i + 1 }))
    .filter(({ c }) => c.lista)
  assert.equal(conLista.length, 6, 'cambiaron las columnas con lista')

  for (const { c, col } of conLista) {
    const dv = ws.getCell(2, col).dataValidation
    assert.ok(dv, `"${c.titulo}" no tiene desplegable`)
    assert.equal(dv!.type, 'list')
    assert.match(String((dv as { formulae: string[] }).formulae[0]), /^=Listas!\$[A-Z]\$2:\$[A-Z]\$\d+$/)
  }
})

test('a un vendedor la plantilla le llega sin el desplegable de vendedor, pero con la columna', async () => {
  const plantilla = await construirPlantillaClientes({ vendedores: [], esVendedor: true })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(plantilla as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet(NOMBRE_HOJA_CLIENTES)!

  // La columna sigue ahi: el formato tiene que ser el mismo que el del export.
  const encabezados = (ws.getRow(1).values as unknown[]).slice(1).map(v => String(v))
  assert.deepEqual(encabezados, TITULOS_CLIENTES)

  const colVendedor = COLUMNAS_CLIENTES.findIndex(c => c.lista === 'vendedor') + 1
  assert.equal(ws.getCell(2, colVendedor).dataValidation, undefined)
  // Las otras listas si.
  const colGiro = COLUMNAS_CLIENTES.findIndex(c => c.lista === 'giro') + 1
  assert.ok(ws.getCell(2, colGiro).dataValidation)
})

test('capturar en el renglon 2 de la plantilla se reporta como renglon 2', async () => {
  // La plantilla deja 200 renglones con desplegable ya formateados, asi que
  // `rowCount` viene inflado. Quien captura escribe en el 2, y ese es el
  // numero que tiene que ver de vuelta para ir a corregirlo.
  const plantilla = await construirPlantillaClientes({ vendedores: [], esVendedor: false })
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(plantilla as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet(NOMBRE_HOJA_CLIENTES)!

  const col = (titulo: string) => TITULOS_CLIENTES.indexOf(titulo) + 1
  ws.getCell(2, col('Nombre comercial')).value = 'Primer Renglon'
  ws.getCell(2, col('Email')).value = 'primero@ejemplo.mx'
  ws.getCell(3, col('Nombre comercial')).value = 'Segundo Renglon'
  ws.getCell(3, col('Email')).value = 'segundo@ejemplo.mx'

  const bytes = new Uint8Array(await wb.xlsx.writeBuffer())
  const lectura = await leerHojaCaptura(bytes, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.ok(lectura.ok, lectura.ok ? '' : lectura.error)

  // Los 200 renglones preparados pero vacios no entran.
  assert.equal(lectura.filas.length, 2)
  assert.deepEqual(lectura.filas.map(f => f.fila), [2, 3])

  const r = construirPlanClientes(lectura.filas, catalogo(), { esVendedor: false })
  assert.equal(r.nuevos, 2)
  assert.deepEqual(r.filas.map(f => f.fila), [2, 3])
})

test('la plantilla se puede capturar y leer con el lector de verdad', async () => {
  const plantilla = await construirPlantillaClientes({
    vendedores: [{ id: 'v1', nombre: 'Ana Vendedora' }],
    esVendedor: false,
  })
  const conDatos = await agregarRenglones(plantilla, [
    { 'Nombre comercial': 'Abarrotes Don Chuy', 'Email': 'donchuy@ejemplo.mx', 'Giro': 'Abarrotes' },
  ])

  const lectura = await leerHojaCaptura(conDatos, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.ok(lectura.ok, lectura.ok ? '' : lectura.error)
  assert.equal(lectura.filas.length, 1)

  const r = construirPlanClientes(lectura.filas, catalogo(), { esVendedor: false })
  assert.equal(r.nuevos, 1)
  assert.equal(r.filas[0].cuerpo!.giro, 'abarrotes')
  assert.equal(r.filas[0].cuerpo!.marca_negocio, 'Abarrotes Don Chuy')
})

// ── Defensas del lector, sobre este formato ─────────────────

test('un archivo que no es .xlsx se rechaza antes de parsear', async () => {
  const csv = new TextEncoder().encode('Nombre comercial,Email\nBar,bar@ejemplo.mx\n')
  const lectura = await leerHojaCaptura(csv, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.equal(lectura.ok, false)
  assert.match((lectura as { error: string }).error, /no es un \.xlsx/)
})

test('un .xlsx sin los encabezados esperados se rechaza con una pista util', async () => {
  const bytes = await construirLibro([
    { nombre: NOMBRE_HOJA_CLIENTES, columnas: ['cosa', 'otra'], filas: [{ cosa: 1, otra: 2 }] },
  ])
  const lectura = await leerHojaCaptura(bytes, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.equal(lectura.ok, false)
  assert.match((lectura as { error: string }).error, /Descarga la plantilla/)
})

test('columnas de sobra se reportan en vez de ignorarse en silencio', async () => {
  const bytes = await construirLibro([
    {
      nombre: NOMBRE_HOJA_CLIENTES,
      columnas: ['Nombre comercial', 'Email', 'Descuento especial'],
      filas: [{ 'Nombre comercial': 'Bar', 'Email': 'bar@ejemplo.mx', 'Descuento especial': '20%' }],
    },
  ])
  const lectura = await leerHojaCaptura(bytes, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.ok(lectura.ok)
  assert.deepEqual(lectura.columnasDesconocidas, ['Descuento especial'])
})

test('la hoja Resumen del export no se confunde con la de datos', async () => {
  // El archivo del export trae dos hojas; el lector tiene que tomar
  // "Clientes" y no la primera que encuentre.
  const bytes = await construirLibro(
    armarHojasClientes({ clientes: [clienteExport()], saldos: [], vendedores: new Map() })
  )
  const lectura = await leerHojaCaptura(bytes, CLAVES_IMPORT, NOMBRE_HOJA_CLIENTES)
  assert.ok(lectura.ok)
  assert.equal(lectura.filas[0].valores.email, 'hola@taproomcentro.mx')
})
