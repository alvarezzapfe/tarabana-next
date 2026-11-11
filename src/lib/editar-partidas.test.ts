/**
 * Tests de la edicion de partidas.
 *
 *   npm test
 *
 * Lo que se cubre son las reglas que distinguen EDITAR de crear: que el
 * precio pactado se respete, que el pedido no se bloquee a si mismo contra su
 * propio stock, y que quitar partidas no deje al cliente con mas pagado de lo
 * que debe sin que nadie se entere.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS_NO_EDITABLES,
  claveLinea,
  descuentoMonto,
  motivoNoEditable,
  puedeEditarPartidas,
  recalcularPartidas,
  sobrepagoDe,
  urlNuevoPedido,
  type EntradaEdicion,
  type PartidaActual,
} from './editar-partidas.ts'
import { claveStock } from './stock-disponible.ts'

const MAGMA = 'p-magma'
const BRISA = 'p-brisa'

function prod(id: string, nombre: string, over: Record<string, unknown> = {}) {
  return {
    id, nombre,
    precio_lata_publico: 60, precio_lata_taproom: 45,
    precio_barril_pet_publico: 3200, precio_barril_pet_taproom: 2500,
    precio_barril_acero_publico: 2900, precio_barril_acero_taproom: 2200,
    precio_barril10_pet_publico: null, precio_barril10_pet_taproom: null,
    precio_barril10_acero_publico: null, precio_barril10_acero_taproom: null,
    stock_latas: 100, stock_caja12: 10, stock_caja24: 40,
    stock_barril_pet: 5, stock_barril_acero: 3,
    stock_barril10_pet: 0, stock_barril10_acero: 0,
    ...over,
  }
}

const CATALOGO = new Map<string, Record<string, unknown>>([
  [MAGMA, prod(MAGMA, 'Magma')],
  [BRISA, prod(BRISA, 'Brisa', { precio_lata_publico: 45, precio_lata_taproom: 36, stock_latas: 50 })],
])

/** El pedido tal como esta: 3 cajas de 24 de Magma, a un precio viejo. */
const ACTUALES: PartidaActual[] = [
  { id: 'it-1', producto_id: MAGMA, unidad: 'caja24', cantidad: 3, precio_unitario: 1200 },
]

const entrada = (over: Partial<EntradaEdicion> = {}): EntradaEdicion => ({
  actuales: ACTUALES,
  deseadas: [],
  catalogo: CATALOGO,
  sufijo: 'publico',
  comprometido: new Map(),
  ...over,
})

const ok = (r: ReturnType<typeof recalcularPartidas>) => {
  assert.ok(r.ok, `fallo: ${r.ok ? '' : r.error}`)
  return r as Extract<typeof r, { ok: true }>
}

// ── Cambiar cantidad ────────────────────────────────────────

test('cambiar la cantidad conserva el precio pactado, no el vigente', () => {
  // El catalogo cobra 1440 la caja hoy (60 x 24). El pedido se levanto a
  // 1200. Subir de 3 a 5 cajas no puede re-facturarle al cliente la
  // diferencia por la espalda.
  const r = ok(recalcularPartidas(entrada({
    deseadas: [{ producto_id: MAGMA, unidad: 'caja24', cantidad: 5 }],
  })))

  assert.equal(r.partidas.length, 1)
  assert.equal(r.partidas[0].precio_unitario, 1200, 'le cambio el precio')
  assert.equal(r.partidas[0].cantidad, 5)
  assert.equal(r.total, 6000)
  assert.equal(r.conservadas, 1)
  assert.equal(r.nuevas, 0)
})

test('una partida conservada sigue valiendo aunque su presentacion ya no tenga precio', () => {
  // Si alguien borro el precio mayorista del barril, el pedido que ya lo
  // tenia pactado no se vuelve ineditable.
  const sinPrecio = new Map(CATALOGO)
  sinPrecio.set(MAGMA, prod(MAGMA, 'Magma', { precio_barril_acero_taproom: null }))

  const r = ok(recalcularPartidas(entrada({
    actuales: [{ id: 'it-9', producto_id: MAGMA, unidad: 'barril_acero', cantidad: 1, precio_unitario: 2100 }],
    deseadas: [{ producto_id: MAGMA, unidad: 'barril_acero', cantidad: 2 }],
    catalogo: sinPrecio,
    sufijo: 'taproom',
  })))
  assert.equal(r.partidas[0].precio_unitario, 2100)
  assert.equal(r.total, 4200)
})

// ── Agregar latas sueltas ───────────────────────────────────

test('agregar latas sueltas toma el precio vigente del nivel del cliente', () => {
  const r = ok(recalcularPartidas(entrada({
    deseadas: [
      { producto_id: MAGMA, unidad: 'caja24', cantidad: 3 },
      { producto_id: MAGMA, unidad: 'lata', cantidad: 12 },
    ],
  })))

  const latas = r.partidas.find(p => p.unidad === 'lata')!
  assert.equal(latas.precio_unitario, 60, 'la lata nueva va al precio de hoy')
  assert.equal(latas.conservada, false)
  assert.equal(r.conservadas, 1)
  assert.equal(r.nuevas, 1)
  assert.equal(r.total, 3 * 1200 + 12 * 60)
})

test('una linea nueva en un nivel sin precio se rechaza con el motivo', () => {
  const r = recalcularPartidas(entrada({
    deseadas: [{ producto_id: MAGMA, unidad: 'barril10_pet', cantidad: 1 }],
  }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /no tiene precio al público/)
})

// ── Quitar ──────────────────────────────────────────────────

test('quitar una partida la saca del total y se cuenta', () => {
  const dos: PartidaActual[] = [
    ...ACTUALES,
    { id: 'it-2', producto_id: BRISA, unidad: 'lata', cantidad: 10, precio_unitario: 40 },
  ]
  const r = ok(recalcularPartidas(entrada({
    actuales: dos,
    deseadas: [{ producto_id: MAGMA, unidad: 'caja24', cantidad: 3 }],
  })))

  assert.equal(r.partidas.length, 1)
  assert.equal(r.quitadas, 1)
  assert.equal(r.total, 3600)
})

test('no se puede dejar el pedido sin partidas', () => {
  // Vaciarlo seria cancelarlo por la puerta de atras, sin motivo ni rastro.
  for (const deseadas of [[], [{ producto_id: MAGMA, unidad: 'caja24', cantidad: 0 }]]) {
    const r = recalcularPartidas(entrada({ deseadas }))
    assert.equal(r.ok, false)
    if (!r.ok) assert.match(r.error, /sin partidas/)
  }
})

// ── Disponible ──────────────────────────────────────────────

test('el pedido no se bloquea con su propio stock', () => {
  // 40 cajas fisicas, 3 son de este pedido. Con el comprometido SIN este
  // pedido, las 40 estan libres para el.
  const r = ok(recalcularPartidas(entrada({
    deseadas: [{ producto_id: MAGMA, unidad: 'caja24', cantidad: 40 }],
  })))
  assert.equal(r.partidas[0].cantidad, 40)
})

test('exceder el disponible se rechaza diciendo cuanto hay', () => {
  // 40 fisicas, 8 apartadas por OTROS pedidos: caben 32.
  const comprometido = new Map([[claveStock(MAGMA, 'stock_caja24'), 8]])

  const cabe = recalcularPartidas(entrada({ comprometido, deseadas: [{ producto_id: MAGMA, unidad: 'caja24', cantidad: 32 }] }))
  assert.equal(cabe.ok, true)

  const noCabe = recalcularPartidas(entrada({ comprometido, deseadas: [{ producto_id: MAGMA, unidad: 'caja24', cantidad: 33 }] }))
  assert.equal(noCabe.ok, false)
  if (!noCabe.ok) {
    assert.match(noCabe.error, /No alcanzan las cajas de 24/)
    assert.match(noCabe.error, /Magma/)
    assert.match(noCabe.error, /se necesitan 33 y hay 32/)
  }
})

test('el stock se valida CONSOLIDADO por columna, no partida por partida', () => {
  // Dos renglones de la misma celda: 25 + 20 = 45 contra 40 fisicas. Validar
  // cada uno por separado dejaria pasar los dos.
  const r = recalcularPartidas(entrada({
    deseadas: [
      { producto_id: MAGMA, unidad: 'caja24', cantidad: 25 },
      { producto_id: MAGMA, unidad: 'caja24', cantidad: 20 },
    ],
  }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /se necesitan 45 y hay 40/)
})

// ── Cajas mixtas ────────────────────────────────────────────

const MIX = {
  estilos: [
    { producto_id: MAGMA, nombre: 'Magma', latas: 12 },
    { producto_id: BRISA, nombre: 'Brisa', latas: 12 },
  ],
}

test('una caja mixta nueva se cotiza prorrateando por lata', () => {
  const r = ok(recalcularPartidas(entrada({
    actuales: [],
    deseadas: [{ producto_id: MAGMA, unidad: 'mix24', cantidad: 1, metadata: MIX }],
  })))
  // 12 x 60 (Magma) + 12 x 45 (Brisa) = 1260
  assert.equal(r.partidas[0].precio_unitario, 1260)
})

test('una mixta descuenta latas por estilo, no cajas', () => {
  // 2 mixtas piden 24 latas de cada estilo. Brisa tiene 50: cabe. Con 20 no.
  const pocas = new Map(CATALOGO)
  pocas.set(BRISA, prod(BRISA, 'Brisa', { stock_latas: 20 }))

  const r = recalcularPartidas(entrada({
    actuales: [],
    catalogo: pocas,
    deseadas: [{ producto_id: MAGMA, unidad: 'mix24', cantidad: 2, metadata: MIX }],
  }))
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.match(r.error, /Brisa/)
    assert.match(r.error, /latas sueltas/)
  }
})

test('dos mixtas con estilos distintos son partidas distintas', () => {
  // Y por lo tanto una no hereda el precio de la otra.
  const otra = { estilos: [{ producto_id: MAGMA, nombre: 'Magma', latas: 24 }] }
  assert.notEqual(
    claveLinea(MAGMA, 'mix24', MIX),
    claveLinea(MAGMA, 'mix24', otra),
  )
  // El orden en que se armo el mix no cambia su identidad.
  const alReves = { estilos: [...MIX.estilos].reverse() }
  assert.equal(claveLinea(MAGMA, 'mix24', MIX), claveLinea(MAGMA, 'mix24', alReves))
})

test('una mixta que no suma 24 latas se rechaza', () => {
  const r = recalcularPartidas(entrada({
    actuales: [],
    deseadas: [{ producto_id: MAGMA, unidad: 'mix24', cantidad: 1, metadata: { estilos: [{ producto_id: MAGMA, latas: 12 }] } }],
  }))
  assert.equal(r.ok, false)
  if (!r.ok) assert.match(r.error, /24 latas, trae 12/)
})

// ── Status ──────────────────────────────────────────────────

test('un pedido entregado o cancelado no se edita', () => {
  assert.deepEqual([...STATUS_NO_EDITABLES], ['entregado', 'cancelado'])
  assert.equal(puedeEditarPartidas('entregado'), false, 'un entregado ya desconto inventario')
  assert.equal(puedeEditarPartidas('cancelado'), false)
  assert.equal(puedeEditarPartidas('pendiente'), true)
  assert.equal(puedeEditarPartidas('confirmado'), true)
  assert.equal(puedeEditarPartidas('enviado'), true)
  assert.equal(puedeEditarPartidas(null), false)
})

// ── Pagado mayor que el total ───────────────────────────────

test('quitar partidas de un pedido pagado avisa del sobrepago', () => {
  // Pago 3,600 y ahora el pedido vale 1,200: sobran 2,400.
  const s = sobrepagoDe({ total: 1_200, pagado: 3_600 })
  assert.deepEqual(s, { aCobrar: 1_200, pagado: 3_600, sobra: 2_400 })
})

test('el sobrepago se mide contra lo que el cliente DEBE, no contra el bruto', () => {
  // `total` es bruto: la vista le resta el descuento y le suma el envio.
  // Medir contra el bruto avisaria de sobrepagos que no existen.
  const conDescuento = sobrepagoDe({ total: 1_000, descuento_tipo: 'monto', descuento_valor: 200, pagado: 850 })
  assert.deepEqual(conDescuento, { aCobrar: 800, pagado: 850, sobra: 50 })

  const conEnvio = sobrepagoDe({ total: 1_000, costo_envio: 100, pagado: 1_050 })
  assert.equal(conEnvio, null, '1,050 de 1,100 no es sobrepago')
})

test('sin sobrepago devuelve null, y el borde exacto no avisa', () => {
  assert.equal(sobrepagoDe({ total: 1_000, pagado: 1_000 }), null, 'pagar justo no es sobrepago')
  assert.equal(sobrepagoDe({ total: 1_000, pagado: 0 }), null)
  assert.equal(sobrepagoDe({ total: 1_000, pagado: 999.99 }), null)
  assert.ok(sobrepagoDe({ total: 1_000, pagado: 1_000.01 }))
})

test('descuentoMonto replica la formula de pedidos_saldo, redondeo incluido', () => {
  // La vista hace round(total * valor / 100, 2). Sin el round, el aviso de
  // sobrepago mentiria por centavos contra lo que la vista cobra.
  assert.equal(descuentoMonto(1_000, 'porcentaje', 22.45), 224.5)
  assert.equal(descuentoMonto(333, 'porcentaje', 9), 29.97)
  assert.equal(descuentoMonto(333.33, 'porcentaje', 9), 30)
  assert.equal(descuentoMonto(1_000, 'monto', 150), 150)
  assert.equal(descuentoMonto(1_000, null, null), 0)
  assert.equal(descuentoMonto(1_000, 'porcentaje', null), 0)
})

// ── Por que no se puede editar ──────────────────────────────

test('el motivo explica el status, en vez de esconder la opcion', () => {
  // Esconderla deja a quien la busca sin saber si no existe, si no tiene
  // permiso o si el pedido no califica.
  assert.equal(motivoNoEditable('confirmado'), null, 'un pedido editable no lleva motivo')
  assert.equal(motivoNoEditable('pendiente'), null)
  assert.equal(motivoNoEditable('enviado'), null)

  assert.match(String(motivoNoEditable('entregado')), /descontó inventario/)
  assert.match(String(motivoNoEditable('entregado')), /pedido nuevo/)
  assert.match(String(motivoNoEditable('cancelado')), /no va a salir/)

  // Un status que nadie previo SI es editable: la regla es una lista de
  // EXCLUSION, igual que la del comprometido. Lo unico que no se descontó ni
  // se cancelo se puede corregir, y un status nuevo no deberia bloquear por
  // existir.
  assert.equal(motivoNoEditable('status_raro'), null)

  // El motivo generico queda para un pedido sin status, que no deberia pasar
  // pero no puede terminar en una opcion habilitada.
  assert.match(String(motivoNoEditable(null)), /no se puede editar/)
  assert.match(String(motivoNoEditable('')), /no se puede editar/)
})

test('el motivo y el permiso no se pueden contradecir', () => {
  for (const status of ['pendiente', 'confirmado', 'enviado', 'entregado', 'cancelado', 'raro', null]) {
    assert.equal(
      motivoNoEditable(status) === null,
      puedeEditarPartidas(status),
      `${status}: uno dice que si y el otro que no`
    )
  }
})

test('urlNuevoPedido abre el POS con el cliente puesto', () => {
  assert.equal(urlNuevoPedido('abc-123'), '/admin/pedidos/nuevo?cliente=abc-123')
  // Sin cliente abre el POS vacio en vez de un "?cliente=null" que el POS
  // buscaria en su catalogo y no encontraria.
  assert.equal(urlNuevoPedido(null), '/admin/pedidos/nuevo')
  assert.equal(urlNuevoPedido(''), '/admin/pedidos/nuevo')
})

// ── Sobrepago con IVA por partida ───────────────────────────
//
// El saldo de la vista incluye el IVA. Si `sobrepagoDe` no lo contara, un
// pedido con IVA pagado completo se veria sobrepagado y la pantalla pediria
// confirmar algo que no esta pasando.
//
// Desde que el IVA es por partida, `sobrepagoDe` recibe el BRUTO GRAVADO y no
// una bandera: con 600 de 1,000 gravados el IVA no es 160 ni 0.

test('sobrepago: todo gravado y pagado completo no esta sobrepagado', () => {
  assert.equal(
    sobrepagoDe({ total: 1_000, gravable: 1_000, iva_tasa: 0.16, pagado: 1_160 }),
    null
  )
})

test('sobrepago: nada gravado, esos mismos 1,160 si sobran', () => {
  const s = sobrepagoDe({ total: 1_000, gravable: 0, iva_tasa: 0.16, pagado: 1_160 })
  assert.deepEqual(s, { aCobrar: 1_000, pagado: 1_160, sobra: 160 })
})

test('sobrepago: mixto cobra solo el IVA de lo gravado', () => {
  // 600 de 1,000 gravados: IVA 96, total 1,096.
  assert.equal(sobrepagoDe({ total: 1_000, gravable: 600, iva_tasa: 0.16, pagado: 1_096 }), null)
  const s = sobrepagoDe({ total: 1_000, gravable: 600, iva_tasa: 0.16, pagado: 1_160 })
  assert.equal(s!.aCobrar, 1_096)
  assert.equal(s!.sobra, 64)
})

test('sobrepago: el descuento se prorratea sobre lo gravado', () => {
  // 2,260 con 600 gravados y descuento de 226 (10%): base 540, IVA 86.40.
  // A cobrar: 2,260 - 226 + 100 de envio + 86.40 = 2,220.40.
  const s = sobrepagoDe({
    total: 2_260,
    gravable: 600,
    descuento_tipo: 'monto',
    descuento_valor: 226,
    costo_envio: 100,
    iva_tasa: 0.16,
    pagado: 2_300,
  })
  assert.equal(s!.aCobrar, 2_220.4)
  assert.equal(s!.sobra, 79.6)
})

test('sobrepago: el envio gravado sube lo que se debe', () => {
  const sinFlete = sobrepagoDe({
    total: 1_000, gravable: 1_000, costo_envio: 200, iva_tasa: 0.16, pagado: 0,
  })
  const conFlete = sobrepagoDe({
    total: 1_000, gravable: 1_000, costo_envio: 200, envio_incluye_iva: true, iva_tasa: 0.16, pagado: 0,
  })
  // Sin pagos no hay sobrepago; se comparan via un pago que los distingue.
  assert.equal(sinFlete, null)
  assert.equal(conFlete, null)
  const a = sobrepagoDe({ total: 1_000, gravable: 1_000, costo_envio: 200, iva_tasa: 0.16, pagado: 2_000 })!
  const b = sobrepagoDe({ total: 1_000, gravable: 1_000, costo_envio: 200, envio_incluye_iva: true, iva_tasa: 0.16, pagado: 2_000 })!
  assert.equal(a.aCobrar, 1_360)   // 1,000 + 200 + IVA(1,000)
  assert.equal(b.aCobrar, 1_392)   // 1,000 + 200 + IVA(1,200)
})

test('sobrepago: desgravar un pedido cobrado lo deja sobrepagado', () => {
  // Es el caso que la ruta de IVA tiene que avisar antes de guardar.
  const s = sobrepagoDe({ total: 1_000, gravable: 0, iva_tasa: 0.16, pagado: 1_160 })
  assert.equal(s!.sobra, 160)
})

// ── Sobrepago con ajuste ────────────────────────────────────
//
// La vista suma el ajuste al saldo, asi que `sobrepagoDe` tiene que contarlo:
// sin eso, meterle un ajuste negativo a un pedido ya cobrado no avisaria.

test('sobrepago: un ajuste negativo deja sobrepagado un pedido cobrado', () => {
  // Mercancia 1,000 cobrada completa; se ajusta -200 para cuadrar la OC.
  const s = sobrepagoDe({ total: 1_000, gravable: 0, ajuste: -200, pagado: 1_000 })
  assert.equal(s!.aCobrar, 800)
  assert.equal(s!.sobra, 200)
})

test('sobrepago: un ajuste positivo lo quita', () => {
  // Estaba sobrepagado por 100; el ajuste sube el total y ya no sobra.
  assert.equal(sobrepagoDe({ total: 1_000, ajuste: 100, pagado: 1_100 }), null)
})

test('sobrepago: el ajuste se suma DESPUES del IVA', () => {
  // 1,000 gravados: IVA 160. Ajuste de 0.27 para cuadrar la OC en 1,160.27.
  const s = sobrepagoDe({
    total: 1_000, gravable: 1_000, iva_tasa: 0.16, ajuste: 0.27, pagado: 1_200,
  })
  assert.equal(s!.aCobrar, 1_160.27)
  assert.equal(s!.sobra, 39.73)
})
