/**
 * Tests del constructor de .xlsx del export.
 *
 * Recibe lo que manda el navegador, asi que lo que se prueba es que los
 * topes aguanten y que el archivo que sale se pueda volver a leer.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { MAX_COLUMNAS, MAX_FILAS, MAX_HOJAS, construirLibro, validarHojas } from './libro-xlsx.ts'

const hoja = (over: Record<string, unknown> = {}) => ({
  nombre: 'Pedidos', columnas: ['Pedido', 'Total'],
  filas: [{ Pedido: '#ABC123', Total: 1500 }],
  ...over,
})

test('ida y vuelta: lo que se escribe se puede volver a leer', async () => {
  const bytes = await construirLibro([
    hoja(),
    { nombre: 'Resumen', columnas: ['Concepto', 'Valor'], filas: [{ Concepto: 'Cobrado', Valor: 5000 }] },
  ])

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])

  assert.deepEqual(wb.worksheets.map(h => h.name), ['Pedidos', 'Resumen'])
  const ws = wb.getWorksheet('Pedidos')!
  assert.equal(ws.getCell('A1').value, 'Pedido')
  assert.equal(ws.getCell('A2').value, '#ABC123')
  // Los numeros siguen siendo numeros, no texto: si no, no se pueden sumar.
  assert.equal(ws.getCell('B2').value, 1500)
})

test('una columna faltante deja la celda vacia, no corre los valores', async () => {
  const bytes = await construirLibro([
    { nombre: 'H', columnas: ['A', 'B', 'C'], filas: [{ A: 1, C: 3 }] },
  ])
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  const ws = wb.getWorksheet('H')!

  assert.equal(ws.getCell('A2').value, 1)
  assert.equal(ws.getCell('B2').value, null)
  assert.equal(ws.getCell('C2').value, 3)
})

test('un nombre de hoja que Excel no acepta se sanea en vez de reventar', async () => {
  const bytes = await construirLibro([
    hoja({ nombre: 'Pedidos 2026/2027 [borrador]: con *todo*' }),
  ])
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])

  const nombre = wb.worksheets[0].name
  assert.ok(nombre.length <= 31, `"${nombre}" tiene ${nombre.length} caracteres`)
  for (const malo of [':', '\\', '/', '?', '*', '[', ']']) {
    assert.ok(!nombre.includes(malo), `el nombre conservo "${malo}"`)
  }
})

test('hojas sin renglones no rompen el archivo', async () => {
  const bytes = await construirLibro([hoja({ filas: [] })])
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bytes as unknown as Parameters<typeof wb.xlsx.load>[0])
  assert.equal(wb.getWorksheet('Pedidos')!.getCell('A1').value, 'Pedido')
})

// ── Validacion de lo que manda el cliente ───────────────────

test('validarHojas acepta lo bien formado', () => {
  const r = validarHojas([hoja()])
  assert.ok(!('error' in r))
})

test('validarHojas rechaza lo que no deberia llegar', () => {
  const casos: [unknown, RegExp][] = [
    [null, /Sin hojas/],
    [[], /Sin hojas/],
    ['no es un arreglo', /Sin hojas/],
    [[{ nombre: '', columnas: ['A'], filas: [] }], /sin nombre/],
    [[{ nombre: 'H', columnas: [], filas: [] }], /no tiene columnas/],
    [[{ nombre: 'H', columnas: ['A'] }], /no trae renglones/],
    [[null], /Hoja invalida/],
  ]
  for (const [entrada, esperado] of casos) {
    const r = validarHojas(entrada)
    assert.ok('error' in r, `${JSON.stringify(entrada)} paso`)
    assert.match((r as { error: string }).error, esperado)
  }
})

test('validarHojas aplica los tres topes', () => {
  const muchasHojas = Array.from({ length: MAX_HOJAS + 1 }, (_, i) => hoja({ nombre: `H${i}` }))
  assert.match((validarHojas(muchasHojas) as { error: string }).error, new RegExp(`Maximo ${MAX_HOJAS} hojas`))

  const muchasColumnas = [hoja({ columnas: Array.from({ length: MAX_COLUMNAS + 1 }, (_, i) => `C${i}`) })]
  assert.match((validarHojas(muchasColumnas) as { error: string }).error, /columnas por hoja/)

  // El tope de filas es sobre el TOTAL, no por hoja: dos hojas a la mitad
  // tampoco pasan.
  const mitad = Math.ceil(MAX_FILAS / 2) + 1
  const dosHojas = [
    hoja({ nombre: 'A', filas: Array.from({ length: mitad }, () => ({ Pedido: 'x', Total: 1 })) }),
    hoja({ nombre: 'B', filas: Array.from({ length: mitad }, () => ({ Pedido: 'x', Total: 1 })) }),
  ]
  assert.match((validarHojas(dosHojas) as { error: string }).error, new RegExp(`maximo es ${MAX_FILAS}`))
})
