/**
 * Tests de la lista de precios.
 *
 *   npm test
 *
 * Lo que se cubre es lo que se rompe en silencio: que la caja muestre el mismo
 * precio que va a cobrar el pedido, que un cero no se cuele como precio, y que
 * el lote solo lleve las celdas que de verdad cambiaron.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  COLUMNAS_PRECIO,
  DESCUENTO_DEFAULT,
  FILAS_EDITABLES,
  FILAS_PRECIO,
  PRECIO_MAX,
  armarLote,
  claveCelda,
  esColumnaPrecio,
  etiquetaColumna,
  faltantesDe,
  leerPrecio,
  leerPreciosDeFormulario,
  mayoristaSugerido,
  primerErrorDePrecios,
  precioGuardado,
  precioMostrado,
  redondeoLata,
  tieneFaltantes,
  partirClave,
  type ProductoPrecios,
} from './precios.ts'
import { precioUnitario } from './calcular-pedido.ts'

function producto(over: Record<string, unknown> = {}): ProductoPrecios {
  return {
    id: 'p-1',
    nombre: 'Magma',
    precio_lata_publico: 60,
    precio_lata_taproom: 50,
    precio_barril_pet_publico: 2800,
    precio_barril_pet_taproom: null,
    precio_barril_acero_publico: 2497,
    precio_barril_acero_taproom: null,
    precio_barril10_pet_publico: null,
    precio_barril10_pet_taproom: null,
    precio_barril10_acero_publico: null,
    precio_barril10_acero_taproom: null,
    ...over,
  }
}

const fila = (unidad: string) => FILAS_PRECIO.find(f => f.unidad === unidad)!

// ── La cuadricula ───────────────────────────────────────────

test('hay diez columnas de precio y ninguna es de caja', () => {
  // Si alguien agrega `precio_caja24_publico`, este test lo obliga a decidir
  // explicitamente que hacer con `precioUnitario`, que hoy la deriva.
  assert.equal(COLUMNAS_PRECIO.length, 10)
  assert.equal(FILAS_EDITABLES.length, 5)
  assert.ok(!COLUMNAS_PRECIO.some(c => /caja/.test(c)), `hay columna de caja: ${COLUMNAS_PRECIO}`)
})

test('la caja se muestra pero no se edita', () => {
  assert.equal(fila('caja12').columna, null)
  assert.equal(fila('caja24').columna, null)
  assert.ok(fila('lata').columna, 'la lata si se captura')
})

test('cada fila editable apunta a las columnas que existen en productos', () => {
  for (const f of FILAS_EDITABLES) {
    assert.ok(esColumnaPrecio(f.columna!.publico), f.columna!.publico)
    assert.ok(esColumnaPrecio(f.columna!.taproom), f.columna!.taproom)
  }
  assert.equal(esColumnaPrecio('precio_caja24_publico'), false)
  assert.equal(esColumnaPrecio('stock_latas'), false)
  assert.equal(esColumnaPrecio(null), false)
})

// ── El precio que se muestra es el que se cobra ─────────────

test('con precios enteros, la lista dice EXACTAMENTE lo que cobra el pedido', () => {
  // Es la razon de ser de `precioMostrado`: si la lista dijera un numero y el
  // pedido cobrara otro, la lista no serviria para cotizar.
  const p = producto()
  for (const nivel of ['publico', 'taproom'] as const) {
    for (const f of FILAS_PRECIO) {
      const mostrado = precioMostrado(p, f, nivel)
      const cobrado = precioUnitario(p, f.unidad, nivel)
      assert.equal(mostrado ?? 0, cobrado, `${f.unidad} / ${nivel}: lista ${mostrado} vs pedido ${cobrado}`)
    }
  }
})

test('la LATA SUELTA con centavos es la unica celda donde lista y pedido difieren', () => {
  // `precioUnitario` hace Math.round() para la lata suelta y NO para la caja,
  // asi que 37.45 se cobra 37 por lata y 899 por caja de 24. Es comportamiento
  // existente de los pedidos; esta pantalla lo avisa con `redondeoLata` en vez
  // de cambiarlo.
  const p = producto({ precio_lata_publico: 37.45, precio_lata_taproom: 31.83 })

  assert.equal(precioMostrado(p, fila('lata'), 'publico'), 37.45, 'la celda editable guarda los centavos')
  assert.equal(precioUnitario(p, 'lata', 'publico'), 37, 'el pedido cobra la lata redondeada')
  assert.equal(redondeoLata(37.45), 37, 'y la pantalla lo avisa')

  // En la caja no hay divergencia: los centavos si cuentan.
  for (const unidad of ['caja12', 'caja24'] as const) {
    assert.equal(precioMostrado(p, fila(unidad), 'publico'), precioUnitario(p, unidad, 'publico'))
  }
  // Y los barriles no se redondean en ningun lado.
  const conCentavos = producto({ precio_barril_pet_publico: 2700.5 })
  assert.equal(precioMostrado(conCentavos, fila('barril_pet'), 'publico'), precioUnitario(conCentavos, 'barril_pet', 'publico'))
})

test('redondeoLata avisa solo cuando de verdad hay diferencia', () => {
  assert.equal(redondeoLata(40), null, 'un entero no necesita aviso')
  assert.equal(redondeoLata(null), null)
  assert.equal(redondeoLata(37.45), 37)
  assert.equal(redondeoLata(37.5), 38, 'redondea como Math.round')
})

test('la caja replica el redondeo de precioUnitario', () => {
  // 37.45 por lata: la caja de 24 son 898.8, que se redondea a 899.
  const p = producto({ precio_lata_publico: 37.45 })
  assert.equal(precioMostrado(p, fila('caja24'), 'publico'), 899)
  assert.equal(precioMostrado(p, fila('caja24'), 'publico'), precioUnitario(p, 'caja24', 'publico'))
  assert.equal(precioMostrado(p, fila('caja12'), 'publico'), 449)
})

test('sin precio por lata, la caja no muestra cero: muestra vacio', () => {
  // Un cero se leeria como "cuesta cero". Vacio dice "falta capturarlo".
  const p = producto({ precio_lata_publico: null })
  assert.equal(precioMostrado(p, fila('caja24'), 'publico'), null)
  assert.equal(precioMostrado(p, fila('lata'), 'publico'), null)
  // Y el mayorista, que si tiene, sigue saliendo.
  assert.equal(precioMostrado(p, fila('caja24'), 'taproom'), 1200)
})

test('precioGuardado distingue el cero del vacio', () => {
  assert.equal(precioGuardado(producto(), 'precio_lata_publico'), 60)
  assert.equal(precioGuardado(producto({ precio_lata_publico: null }), 'precio_lata_publico'), null)
  assert.equal(precioGuardado(producto({ precio_lata_publico: '' }), 'precio_lata_publico'), null)
  // Un 0 guardado se reporta como 0 y no como vacio: es un dato malo que hay
  // que poder ver para corregirlo.
  assert.equal(precioGuardado(producto({ precio_lata_publico: 0 }), 'precio_lata_publico'), 0)
})

// ── Faltantes ───────────────────────────────────────────────

test('faltantesDe cuenta solo celdas editables vacias', () => {
  // El producto base trae publico de lata y los dos barriles de 20 L, y le
  // faltan los dos mayoristas de barril y las cuatro celdas de 10 L.
  assert.equal(faltantesDe(producto()), 6)
  assert.equal(tieneFaltantes(producto()), true)

  const completo = producto({
    precio_barril_pet_taproom: 2600, precio_barril_acero_taproom: 2300,
    precio_barril10_pet_publico: 1500, precio_barril10_pet_taproom: 1400,
    precio_barril10_acero_publico: 1400, precio_barril10_acero_taproom: 1300,
  })
  assert.equal(faltantesDe(completo), 0)
  assert.equal(tieneFaltantes(completo), false)
})

// ── Lectura de una celda ────────────────────────────────────

test('leerPrecio acepta lo que la gente pega', () => {
  assert.deepEqual(leerPrecio('2700'), { valor: 2700 })
  assert.deepEqual(leerPrecio('$2,700'), { valor: 2700 }, 'pegar de otra hoja debe funcionar')
  assert.deepEqual(leerPrecio(' 2700 '), { valor: 2700 })
  // Decimales cuyo VALOR es entero si pasan: es lo que sale al pegar de una
  // hoja de calculo y no tiene nada de ambiguo.
  assert.deepEqual(leerPrecio('2700.00'), { valor: 2700 })
})

test('leerPrecio rechaza los centavos, con el motivo', () => {
  // `precioUnitario` redondea la lata suelta pero no la caja, asi que 37.45
  // se cobraria 37 por lata y 899 por caja de 24: dos precios que no
  // corresponden al mismo valor por lata. Con enteros cuadran sin tocar ese
  // redondeo, que es lo que cobran todos los pedidos.
  for (const centavos of ['37.45', '37.456', '0.5', '2700.01']) {
    const r = leerPrecio(centavos)
    assert.ok('error' in r, `${centavos} paso`)
    if ('error' in r) assert.match(r.error, /pesos enteros/)
  }
})

test('leerPrecio rechaza el cero, que en este sistema significa "sin precio"', () => {
  // `precioUnitario` devuelve 0 cuando falta el precio y `calcularPedido`
  // rechaza la venta, asi que guardar un 0 seria vaciar la celda en silencio.
  for (const malo of ['0', '0.00', '-5']) {
    const r = leerPrecio(malo)
    assert.ok('error' in r, `${malo} paso`)
    if ('error' in r) assert.match(r.error, /mayor que 0/)
  }
})

test('leerPrecio rechaza lo que no es numero y los dedazos de siete cifras', () => {
  assert.ok('error' in leerPrecio(''))
  assert.ok('error' in leerPrecio('abc'))
  assert.ok('error' in leerPrecio('2.7.0'))
  const grande = leerPrecio(String(PRECIO_MAX + 1))
  assert.ok('error' in grande)
  if ('error' in grande) assert.match(grande.error, /no puede pasar/)
})

// ── Sugerencia de mayorista ─────────────────────────────────

test('mayoristaSugerido aplica el descuento sobre el publico', () => {
  assert.equal(DESCUENTO_DEFAULT, 15)
  assert.equal(mayoristaSugerido(2700, 15), 2295)
  assert.equal(mayoristaSugerido(60, 15), 51)
  assert.equal(mayoristaSugerido(100, 0), 100, 'sin descuento es el mismo precio')
})

test('la sugerencia siempre es un precio que leerPrecio aceptaria', () => {
  // Si sugiriera centavos, la hoja se llenaria de celdas que la validacion
  // rechaza justo al picar Guardar.
  for (const publico of [2497, 1185, 37, 999, 1, 2700]) {
    for (const pct of [15, 12.5, 7, 33.3]) {
      const sugerido = mayoristaSugerido(publico, pct)
      assert.ok(sugerido !== null, `${publico} / ${pct}%`)
      assert.ok(Number.isInteger(sugerido), `${publico} - ${pct}% dio ${sugerido}`)
      const leido = leerPrecio(String(sugerido))
      assert.ok('valor' in leido, `${sugerido} no pasaria la validacion: ${JSON.stringify(leido)}`)
    }
  }
  // 2497 - 15% = 2122.45 -> 2122
  assert.equal(mayoristaSugerido(2497, 15), 2122)
})

test('mayoristaSugerido no inventa un precio cuando no hay de donde', () => {
  // Null y no 0: un cero se veria como un precio capturado.
  assert.equal(mayoristaSugerido(null, 15), null)
  assert.equal(mayoristaSugerido(0, 15), null)
  // Un descuento absurdo tampoco se aplica.
  assert.equal(mayoristaSugerido(100, 100), null)
  assert.equal(mayoristaSugerido(100, -5), null)
  assert.equal(mayoristaSugerido(100, NaN), null)
})

// ── El lote ─────────────────────────────────────────────────

const K = claveCelda

test('el lote solo lleva las celdas que cambiaron', () => {
  const p = producto()
  const lote = armarLote([p], {
    // Igual a lo guardado: no es un cambio.
    [K('p-1', 'precio_lata_publico')]: '60',
    // Cambio real.
    [K('p-1', 'precio_lata_taproom')]: '55',
    // Celda vacia que seguia vacia: no es un cambio ni un error.
    [K('p-1', 'precio_barril10_pet_publico')]: '',
  })

  assert.equal(lote.celdas, 1)
  assert.deepEqual(lote.cambios, [{ id: 'p-1', precios: { precio_lata_taproom: 55 } }])
  assert.deepEqual(lote.errores, {})
})

test('el lote agrupa por producto y cuenta celdas, no productos', () => {
  const a = producto({ id: 'p-a' })
  const b = producto({ id: 'p-b', nombre: 'Brisa' })
  const lote = armarLote([a, b], {
    [K('p-a', 'precio_lata_publico')]: '65',
    [K('p-a', 'precio_lata_taproom')]: '55',
    [K('p-b', 'precio_barril_pet_taproom')]: '2600',
  })

  assert.equal(lote.celdas, 3)
  assert.equal(lote.cambios.length, 2)
  const pa = lote.cambios.find(c => c.id === 'p-a')!
  assert.deepEqual(pa.precios, { precio_lata_publico: 65, precio_lata_taproom: 55 })
})

test('una celda invalida se reporta y no entra al lote', () => {
  const lote = armarLote([producto()], {
    [K('p-1', 'precio_lata_publico')]: '0',
    [K('p-1', 'precio_lata_taproom')]: '55',
  })
  assert.equal(lote.celdas, 1, 'la celda mala no debe contarse como cambio')
  assert.deepEqual(lote.cambios, [{ id: 'p-1', precios: { precio_lata_taproom: 55 } }])
  assert.match(lote.errores[K('p-1', 'precio_lata_publico')], /mayor que 0/)
})

test('vaciar una celda que tenia precio se reporta como error, no borra', () => {
  // Borrar un precio no es una operacion de esta pantalla: dejaria el producto
  // sin poder venderse y se veria igual que un descuido.
  const lote = armarLote([producto()], { [K('p-1', 'precio_lata_publico')]: '' })
  assert.equal(lote.celdas, 0)
  assert.deepEqual(lote.cambios, [])
  assert.match(lote.errores[K('p-1', 'precio_lata_publico')], /vacío/)
})

test('el lote ignora claves que no corresponden a nada', () => {
  // Las claves vienen del estado de la pantalla; una columna que no es de
  // precio no puede terminar en un UPDATE.
  const lote = armarLote([producto()], {
    [K('p-1', 'stock_latas')]: '999',
    [K('p-1', 'precio_caja24_publico')]: '1500',
    [K('p-fantasma', 'precio_lata_publico')]: '70',
  })
  assert.equal(lote.celdas, 0)
  assert.deepEqual(lote.cambios, [])
  assert.deepEqual(lote.errores, {})
})

test('un producto con id que trae el separador no rompe la clave', () => {
  // Los uuid no traen '|', asi que esto es defensivo: la clave se corta por el
  // ULTIMO separador, porque las columnas son una lista blanca sin '|' y el id
  // es el dato ajeno. Cortando por el primero, el UPDATE iba a un id que no
  // existe y el cambio se perdia en silencio.
  const p = producto({ id: 'raro|con|barras' })
  const lote = armarLote([p], { [K('raro|con|barras', 'precio_lata_taproom')]: '55' })
  assert.deepEqual(lote.cambios, [{ id: 'raro|con|barras', precios: { precio_lata_taproom: 55 } }])
})

test('partirClave corta por el ultimo separador', () => {
  assert.deepEqual(partirClave('abc|precio_lata_publico'), { productoId: 'abc', columna: 'precio_lata_publico' })
  assert.deepEqual(partirClave('a|b|precio_lata_publico'), { productoId: 'a|b', columna: 'precio_lata_publico' })
  assert.equal(partirClave('sinseparador'), null)
  assert.equal(partirClave('|empieza-con-separador'), null)
})

// ── Formularios de producto ─────────────────────────────────

test('la ficha y el alta usan la misma regla de pesos enteros', () => {
  // Si cada pantalla leyera los precios a su manera, un precio con centavos
  // entraria por la puerta de al lado y la lista lo mostraria avisando.
  const r = leerPreciosDeFormulario({
    precio_lata_publico: '60',
    precio_barril_pet_publico: '2700.50',
  })
  assert.ok(r.errores, 'dejo pasar los centavos')
  assert.match(r.errores!.precio_barril_pet_publico, /pesos enteros/)
  assert.equal(r.precios, undefined, 'con errores no debe devolver precios a medias')
})

test('una celda vacia del formulario es "sin precio", no un error', () => {
  // Al dar de alta un producto es normal no tener todavia el precio de todas
  // las presentaciones.
  const r = leerPreciosDeFormulario({
    precio_lata_publico: '60',
    precio_lata_taproom: '',
    precio_barril_pet_publico: null,
    precio_barril_pet_taproom: undefined,
  })
  assert.equal(r.errores, undefined)
  assert.deepEqual(r.precios, {
    precio_lata_publico: 60,
    precio_lata_taproom: null,
    precio_barril_pet_publico: null,
    precio_barril_pet_taproom: null,
  })
})

test('una columna ausente se omite y no borra lo que ya estaba', () => {
  // El alta manda solo las presentaciones que se eligieron; devolver null por
  // las demas borraria precios en un UPDATE.
  const r = leerPreciosDeFormulario({ precio_lata_publico: '60' })
  assert.deepEqual(Object.keys(r.precios!), ['precio_lata_publico'])
})

test('el formulario tampoco acepta cero ni negativos', () => {
  for (const malo of ['0', '-10']) {
    const r = leerPreciosDeFormulario({ precio_lata_publico: malo })
    assert.ok(r.errores, `${malo} paso`)
    assert.match(r.errores!.precio_lata_publico, /mayor que 0/)
  }
})

test('lo que no es columna de precio se ignora', () => {
  // El body de un formulario trae stock, nombre, imagen… nada de eso puede
  // terminar en el resultado.
  const r = leerPreciosDeFormulario({ stock_latas: '100', nombre: 'Magma', precio_lata_publico: '60' })
  assert.deepEqual(r.precios, { precio_lata_publico: 60 })
})

test('primerErrorDePrecios redacta el aviso con el nombre de la celda', () => {
  assert.equal(
    primerErrorDePrecios({ precio_barril_pet_taproom: 'solo pesos enteros, sin centavos' }),
    'Barril PET 20 L · Mayorista: solo pesos enteros, sin centavos.'
  )
  const dos = primerErrorDePrecios({ precio_lata_publico: 'vacío', precio_lata_taproom: 'vacío' })
  assert.match(dos, /Lata · Público: vacío\. \(y 1 precio más/)
  const tres = primerErrorDePrecios({ a1: 'x', precio_lata_publico: 'y', precio_lata_taproom: 'z' })
  assert.match(tres, /y 2 precios más/)
  assert.equal(primerErrorDePrecios({}), '')
})

test('etiquetaColumna nombra las diez celdas y no inventa las que no conoce', () => {
  assert.equal(etiquetaColumna('precio_lata_publico'), 'Lata · Público')
  assert.equal(etiquetaColumna('precio_barril10_acero_taproom'), 'Barril acero 10 L · Mayorista')
  assert.equal(etiquetaColumna('stock_latas'), 'stock_latas')
  for (const c of COLUMNAS_PRECIO) {
    assert.notEqual(etiquetaColumna(c), c, `${c} no tiene etiqueta`)
  }
})
