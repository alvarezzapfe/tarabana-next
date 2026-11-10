/**
 * Tests de la escala de ejes.
 *
 *   npm test
 *
 * Es un calculo chico con una consecuencia visible: las marcas de un eje que
 * se repiten ("0 1 1 2 2") hacen que la grafica se lea mal, y eso no se nota
 * revisando el codigo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escalaEje, monedaCorta, pctCorto } from './dash-ui.ts'

const LINEAS = 4
/** Las marcas que pintaria el eje con esa escala. */
const marcas = (max: number, entero = false) => {
  const { paso, lineas } = escalaEje(max, LINEAS, entero)
  return Array.from({ length: lineas + 1 }, (_, i) => paso * i)
}

test('el techo nunca queda por debajo del maximo de los datos', () => {
  for (const max of [1, 2, 7, 99, 100, 101, 875, 3_500, 44_334, 1_250_000, 0.355, 18.1]) {
    const { techo, paso, lineas } = escalaEje(max, LINEAS)
    assert.ok(techo >= max, `techo ${techo} < max ${max}`)
    assert.ok(paso > 0, `paso ${paso} con max ${max}`)
    assert.equal(techo, paso * lineas, `el techo no es la ultima linea con max ${max}`)
    // Una linea de margen sobre las pedidas, no mas: el eje tiene que caber.
    assert.ok(lineas >= 1 && lineas <= LINEAS + 1, `${lineas} lineas con max ${max}`)
  }
})

test('el techo no deja media grafica vacia', () => {
  // Es lo que obligo a que el numero de lineas sea variable: con cuatro
  // lineas fijas, 44,334 solo admitia paso 20,000, o sea techo 80,000 y la
  // barra mas alta al 55% del alto.
  for (const max of [1, 2, 7, 99, 101, 875, 3_500, 44_334, 1_250_000, 18.1]) {
    const { techo } = escalaEje(max, LINEAS)
    assert.ok(max / techo >= 0.6, `max ${max} contra techo ${techo}: solo ${Math.round((max / techo) * 100)}% de uso`)
  }
})

test('un eje entero no repite marcas', () => {
  // El caso que lo motivo: dos clientes nuevos daban paso 0.5 y marcas
  // "0 1 1 2 2" al formatearlas como enteros.
  for (const max of [1, 2, 3, 5, 7, 9, 14, 37]) {
    const vistas = marcas(max, true).map(v => Math.round(v))
    assert.equal(new Set(vistas).size, vistas.length, `max ${max} repite marcas: ${vistas.join(' ')}`)
    assert.ok(marcas(max, true).every(Number.isInteger), `max ${max} dio marcas fraccionarias`)
  }
})

test('el paso cae en numeros que la gente lee', () => {
  // 3,500 con paso crudo de 875 daba marcas de $900 y $2,700; ahora $1k.
  assert.equal(escalaEje(3_500, LINEAS).paso, 1_000)
  assert.equal(escalaEje(3_500, LINEAS).techo, 4_000)
  assert.deepEqual(marcas(3_500).map(monedaCorta), ['$0', '$1k', '$2k', '$3k', '$4k'])

  // El facturado real de produccion a 12 meses.
  assert.deepEqual(escalaEje(44_334, LINEAS), { paso: 10_000, techo: 50_000, lineas: 5 })
  assert.equal(escalaEje(180, LINEAS).paso, 50)
  // 100 cabe exacto en cinco pasos de 20, que es mejor que cuatro de 25 con
  // techo 100 igual: la escala prefiere el paso mas fino que quepa.
  assert.deepEqual(escalaEje(100, LINEAS), { paso: 20, techo: 100, lineas: 5 })
  // Litros: el paso puede ser fraccionario si no se pide entero.
  assert.equal(escalaEje(18.1, LINEAS).paso, 5)
})

test('un maximo exacto no se desborda a la decada siguiente', () => {
  // 4,000 ya es multiplo de 4 pasos de 1,000: el techo no tiene por que
  // saltar a 5,000 y dejar la barra mas alta a cuatro quintos.
  assert.equal(escalaEje(4_000, LINEAS).techo, 4_000)
  assert.equal(escalaEje(8, LINEAS, true).techo, 8)
  assert.equal(escalaEje(100, LINEAS).techo, 100)
})

test('sin datos la escala sigue siendo dibujable', () => {
  // Las graficas vacias igual pintan sus lineas guia; un techo de 0 daria
  // divisiones entre cero.
  for (const max of [0, -5, NaN]) {
    const { techo, paso } = escalaEje(max, LINEAS)
    assert.ok(techo > 0 && Number.isFinite(techo), `techo ${techo} con max ${max}`)
    assert.ok(paso > 0 && Number.isFinite(paso), `paso ${paso} con max ${max}`)
  }
  assert.deepEqual(marcas(0, true), [0, 1, 2, 3, 4])
})

test('pctCorto no pierde el decimal en los porcentajes chicos', () => {
  assert.equal(pctCorto(4.2), '4.2%')
  assert.equal(pctCorto(73.4), '73%')
})
