/**
 * Tests del stock disponible.
 *
 *   npm test
 *
 * Lo que se prueba es el ciclo completo de una celda de inventario —crear,
 * entregar, cancelar— y la propiedad que lo hace confiable: al entregar, el
 * disponible NO SE MUEVE. Si eso se rompe, el inventario se descuenta dos
 * veces y nadie lo nota hasta que falta producto.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  STATUS_SIN_COMPROMISO,
  claveStock,
  comprometePedido,
  comprometidoAJSON,
  comprometidoDe,
  comprometidoDeJSON,
  disponibilidadDe,
  disponibleDe,
  stockDisponible,
  type PedidoAbierto,
  type ProductoStock,
} from './stock-disponible.ts'
import { LATAS_POR_ESTILO_DEFAULT } from './stock-entrega.ts'

const CALIZA = 'prod-caliza'
const BRISA = 'prod-brisa'

/** Un pedido con una sola partida normal. */
const ped = (over: Partial<PedidoAbierto> & { unidad?: string | null; cantidad?: number; producto?: string } = {}): PedidoAbierto => ({
  id: over.id ?? 'p1',
  status: over.status ?? 'pendiente',
  pedido_items: over.pedido_items ?? [
    {
      producto_id: over.producto ?? CALIZA,
      unidad: over.unidad ?? 'caja24',
      cantidad: over.cantidad ?? 5,
      nombre: 'Caliza',
    },
  ],
})

const prod = (id: string, stock: Partial<ProductoStock> = {}): ProductoStock => ({ id, ...stock })

// ── Crear ───────────────────────────────────────────────────

test('un pedido abierto compromete, y el disponible baja', () => {
  const { por, sinClasificar } = comprometidoDe([ped({ cantidad: 5 })])
  assert.equal(por.get(claveStock(CALIZA, 'stock_caja24')), 5)
  assert.deepEqual(sinClasificar, [])

  const d = disponibilidadDe(prod(CALIZA, { stock_caja24: 45 }), 'stock_caja24', por)
  assert.deepEqual(d, { fisico: 45, comprometido: 5, disponible: 40 })
})

test('todos los status abiertos comprometen, no solo confirmado', () => {
  // La regla se escribe por EXCLUSION: lo que no esta entregado ni cancelado
  // compromete, porque en ninguno de esos casos el fisico se ha movido.
  for (const status of ['pendiente', 'confirmado', 'enviado']) {
    const { por } = comprometidoDe([ped({ status, cantidad: 3 })])
    assert.equal(por.get(claveStock(CALIZA, 'stock_caja24')), 3, `${status} no comprometio`)
  }
  // Y un status que nadie previo compromete por default: es el lado seguro.
  const { por } = comprometidoDe([ped({ status: 'en_ruta_nuevo', cantidad: 3 })])
  assert.equal(por.get(claveStock(CALIZA, 'stock_caja24')), 3)

  assert.deepEqual([...STATUS_SIN_COMPROMISO], ['entregado', 'cancelado'])
  assert.equal(comprometePedido('confirmado'), true)
  assert.equal(comprometePedido('entregado'), false)
  assert.equal(comprometePedido(null), false)
})

test('el comprometido se consolida entre partidas y entre pedidos', () => {
  const { por } = comprometidoDe([
    {
      id: 'p1',
      status: 'confirmado',
      // Dos partidas del mismo producto y columna en el mismo pedido.
      pedido_items: [
        { producto_id: CALIZA, unidad: 'caja24', cantidad: 2 },
        { producto_id: CALIZA, unidad: 'caja24', cantidad: 3 },
        { producto_id: CALIZA, unidad: 'lata', cantidad: 10 },
      ],
    },
    ped({ id: 'p2', status: 'pendiente', cantidad: 4 }),
  ])

  assert.equal(por.get(claveStock(CALIZA, 'stock_caja24')), 9, '2 + 3 + 4')
  assert.equal(por.get(claveStock(CALIZA, 'stock_latas')), 10)
})

// ── Entregar: la propiedad que importa ──────────────────────

test('al entregar, el disponible NO se mueve: no hay doble descuento', () => {
  const ANTES = prod(CALIZA, { stock_caja24: 45 })
  const pedido = ped({ id: 'p1', status: 'confirmado', cantidad: 5 })

  const antes = disponibilidadDe(ANTES, 'stock_caja24', comprometidoDe([pedido]).por)
  assert.deepEqual(antes, { fisico: 45, comprometido: 5, disponible: 40 })

  // Entregar hace dos cosas a la vez: baja el fisico en 5 (lo hace la ruta de
  // status) y saca al pedido de los abiertos.
  const DESPUES = prod(CALIZA, { stock_caja24: 40 })
  const despues = disponibilidadDe(DESPUES, 'stock_caja24', comprometidoDe([{ ...pedido, status: 'entregado' }]).por)

  assert.deepEqual(despues, { fisico: 40, comprometido: 0, disponible: 40 })
  assert.equal(despues.disponible, antes.disponible, 'el disponible se movio al entregar')
})

test('marcar entregado SIN descontar libera el comprometido y sube el disponible', () => {
  // Es el caso de los pedidos de agosto, ya entregados en la realidad y con el
  // inventario ajustado a mano: el fisico NO cambia y el comprometido se va,
  // asi que el disponible sube. Es el efecto buscado — ese producto ya salio y
  // el fisico ya lo refleja.
  const PROD = prod(CALIZA, { stock_caja24: 40 })
  const pedido = ped({ id: 'p1', status: 'confirmado', cantidad: 5 })

  const antes = disponibilidadDe(PROD, 'stock_caja24', comprometidoDe([pedido]).por)
  const despues = disponibilidadDe(PROD, 'stock_caja24', comprometidoDe([{ ...pedido, status: 'entregado' }]).por)

  assert.equal(antes.disponible, 35)
  assert.equal(despues.disponible, 40)
  assert.equal(despues.fisico, antes.fisico, 'el fisico no se debe tocar en este camino')
})

// ── Cancelar ────────────────────────────────────────────────

test('un pedido cancelado no compromete nada', () => {
  const { por } = comprometidoDe([ped({ status: 'cancelado', cantidad: 5 })])
  assert.equal(por.size, 0)
  assert.deepEqual(
    disponibilidadDe(prod(CALIZA, { stock_caja24: 45 }), 'stock_caja24', por),
    { fisico: 45, comprometido: 0, disponible: 45 }
  )
})

test('cancelar libera lo que el pedido tenia comprometido', () => {
  const pedido = ped({ id: 'p1', status: 'confirmado', cantidad: 5 })
  const abierto = comprometidoDe([pedido]).por
  const cancelado = comprometidoDe([{ ...pedido, status: 'cancelado' }]).por

  assert.equal(disponibleDe(CALIZA, 'stock_caja24', 45, abierto), 40)
  assert.equal(disponibleDe(CALIZA, 'stock_caja24', 45, cancelado), 45)
})

// ── Caja mixta ──────────────────────────────────────────────

test('una caja mixta compromete latas por estilo, nunca cajas', () => {
  // Mismo criterio que al entregar: el mix se arma con latas sueltas de varios
  // estilos. Si comprometiera `stock_caja24`, bloquearia cajas que nadie pidio
  // y dejaria libres las latas que si se van a usar.
  const { por } = comprometidoDe([{
    id: 'p1',
    status: 'confirmado',
    pedido_items: [{
      producto_id: CALIZA,
      unidad: 'mix24',
      cantidad: 2,
      metadata: { estilos: [
        { producto_id: CALIZA, nombre: 'Caliza', latas: 12 },
        { producto_id: BRISA, nombre: 'Brisa', latas: 12 },
      ] },
    }],
  }])

  assert.equal(por.get(claveStock(CALIZA, 'stock_latas')), 24, '2 cajas x 12 latas')
  assert.equal(por.get(claveStock(BRISA, 'stock_latas')), 24)
  assert.equal(por.get(claveStock(CALIZA, 'stock_caja24')), undefined, 'comprometio cajas')
})

test('una caja mixta sin latas por estilo usa el default, como al entregar', () => {
  const { por } = comprometidoDe([{
    id: 'p1',
    status: 'confirmado',
    pedido_items: [{
      producto_id: CALIZA,
      unidad: 'mix24',
      cantidad: 1,
      metadata: { estilos: [{ producto_id: BRISA, nombre: 'Brisa' }] },
    }],
  }])
  assert.equal(por.get(claveStock(BRISA, 'stock_latas')), LATAS_POR_ESTILO_DEFAULT)
})

test('una mixta y latas sueltas del mismo producto se suman en la misma celda', () => {
  const { por } = comprometidoDe([{
    id: 'p1',
    status: 'confirmado',
    pedido_items: [
      { producto_id: CALIZA, unidad: 'lata', cantidad: 6 },
      { producto_id: CALIZA, unidad: 'mix24', cantidad: 1, metadata: { estilos: [{ producto_id: CALIZA, latas: 24 }] } },
    ],
  }])
  assert.equal(por.get(claveStock(CALIZA, 'stock_latas')), 30)
})

// ── Modo tolerante ──────────────────────────────────────────

test('una partida sin presentacion se reporta y NO tumba el resto', () => {
  // El caso real: el pedido #0E1B76 tiene una partida de Brisa con `unidad` en
  // null. `movimientosDeEntrega` aborta el lote completo con eso, que esta
  // bien al entregar pero aqui dejaria toda la matriz del POS sin numeros.
  const { por, sinClasificar } = comprometidoDe([{
    id: 'p-0e1b76',
    status: 'confirmado',
    pedido_items: [
      { producto_id: BRISA, unidad: null, cantidad: 1, nombre: 'Brisa' },
      { producto_id: CALIZA, unidad: 'caja24', cantidad: 5, nombre: 'Caliza' },
    ],
  }])

  assert.equal(por.get(claveStock(CALIZA, 'stock_caja24')), 5, 'la partida buena se perdio')
  assert.equal(por.get(claveStock(BRISA, 'stock_latas')), undefined, 'se le adivino una columna')
  assert.equal(sinClasificar.length, 1)
  assert.equal(sinClasificar[0].pedido_id, 'p-0e1b76')
  assert.equal(sinClasificar[0].producto_id, BRISA)
  assert.equal(sinClasificar[0].unidad, null)
  assert.equal(sinClasificar[0].cantidad, 1)
  assert.match(sinClasificar[0].motivo, /presentacion no reconocida/)
})

test('una presentacion desconocida tampoco se adivina', () => {
  const { por, sinClasificar } = comprometidoDe([
    ped({ unidad: 'barrilito', cantidad: 3 }),
  ])
  assert.equal(por.size, 0)
  assert.equal(sinClasificar.length, 1)
  assert.equal(sinClasificar[0].unidad, 'barrilito')
})

test('una partida en cero o negativa no compromete ni se reporta', () => {
  const { por, sinClasificar } = comprometidoDe([
    ped({ cantidad: 0 }),
    ped({ id: 'p2', cantidad: -4 }),
  ])
  assert.equal(por.size, 0)
  assert.deepEqual(sinClasificar, [], 'una cantidad vacia no es un problema de datos')
})

test('una mixta con un estilo sin producto se reporta, no se reparte a ciegas', () => {
  const { por, sinClasificar } = comprometidoDe([{
    id: 'p1',
    status: 'confirmado',
    pedido_items: [{
      producto_id: CALIZA, unidad: 'mix24', cantidad: 1,
      metadata: { estilos: [{ producto_id: '', latas: 24 }] },
    }],
  }])
  assert.equal(por.size, 0)
  assert.equal(sinClasificar.length, 1)
  assert.match(sinClasificar[0].motivo, /estilo sin producto/)
})

// ── La tabla completa y los bordes ──────────────────────────

test('stockDisponible devuelve una entrada por producto y columna', () => {
  const { por } = comprometidoDe([ped({ cantidad: 5 })])
  const tabla = stockDisponible([prod(CALIZA, { stock_caja24: 45, stock_latas: 200 }), prod(BRISA)], por)

  // 2 productos x 7 columnas.
  assert.equal(tabla.size, 14)
  assert.deepEqual(tabla.get(claveStock(CALIZA, 'stock_caja24')), { fisico: 45, comprometido: 5, disponible: 40 })
  // Las celdas vacias salen igual, para no tener que distinguir "no hay
  // entrada" de "no hay stock".
  assert.deepEqual(tabla.get(claveStock(BRISA, 'stock_barril10_pet')), { fisico: 0, comprometido: 0, disponible: 0 })
  assert.deepEqual(tabla.get(claveStock(CALIZA, 'stock_latas')), { fisico: 200, comprometido: 0, disponible: 200 })
})

test('el disponible negativo no se recorta a cero', () => {
  // Pasa si alguien baja el fisico a mano por debajo de lo ya vendido. El
  // numero en rojo es la senal; recortarlo a cero la esconderia.
  const { por } = comprometidoDe([ped({ cantidad: 10 })])
  const d = disponibilidadDe(prod(CALIZA, { stock_caja24: 4 }), 'stock_caja24', por)
  assert.deepEqual(d, { fisico: 4, comprometido: 10, disponible: -6 })
})

test('un producto fuera del catalogo consultado no inventa stock', () => {
  const { por } = comprometidoDe([ped({ cantidad: 5 })])
  assert.equal(disponibleDe('prod-fantasma', 'stock_caja24', 0, por), 0)
})

test('el comprometido sobrevive el viaje a JSON', () => {
  // Viaja del servidor al navegador por la ruta; un Map no sobrevive a
  // JSON.stringify.
  const { por } = comprometidoDe([ped({ cantidad: 5 })])
  const vuelta = comprometidoDeJSON(JSON.parse(JSON.stringify(comprometidoAJSON(por))))
  assert.deepEqual([...vuelta.entries()], [...por.entries()])
  assert.equal(comprometidoDeJSON(null).size, 0, 'una respuesta vacia no debe reventar')
})

// ── Excluir un pedido del conteo ────────────────────────────

test('un pedido no se bloquea a si mismo al editarse', () => {
  // Al revisar si un cambio cabe, lo que ESE pedido ya tenia apartado tiene
  // que volver a estar disponible: si no, un pedido de 10 cajas no se podria
  // editar a 11 aunque hubiera 40 libres.
  const pedidos = [
    ped({ id: 'el-que-se-edita', status: 'confirmado', cantidad: 10 }),
    ped({ id: 'otro', status: 'confirmado', cantidad: 6 }),
  ]

  const todo = comprometidoDe(pedidos).por
  const sinEl = comprometidoDe(pedidos, { excepto: 'el-que-se-edita' }).por

  assert.equal(todo.get(claveStock(CALIZA, 'stock_caja24')), 16)
  assert.equal(sinEl.get(claveStock(CALIZA, 'stock_caja24')), 6, 'no se devolvieron sus propias cajas')

  const PROD = prod(CALIZA, { stock_caja24: 20 })
  assert.equal(disponibilidadDe(PROD, 'stock_caja24', todo).disponible, 4)
  assert.equal(disponibilidadDe(PROD, 'stock_caja24', sinEl).disponible, 14, '10 suyas + 4 libres')
})

test('excluir un pedido que no existe no cambia nada', () => {
  const pedidos = [ped({ id: 'p1', cantidad: 5 })]
  assert.deepEqual(
    [...comprometidoDe(pedidos, { excepto: 'fantasma' }).por.entries()],
    [...comprometidoDe(pedidos).por.entries()]
  )
})

test('la exclusion tambien saca sus partidas sin clasificar', () => {
  // Si no, el aviso de Inventario seguiria contando una partida del pedido
  // que se esta editando como si todavia estuviera apartada.
  const pedidos: PedidoAbierto[] = [{
    id: 'el-que-se-edita',
    status: 'confirmado',
    pedido_items: [{ producto_id: BRISA, unidad: null, cantidad: 1, nombre: 'Brisa' }],
  }]
  assert.equal(comprometidoDe(pedidos).sinClasificar.length, 1)
  assert.equal(comprometidoDe(pedidos, { excepto: 'el-que-se-edita' }).sinClasificar.length, 0)
})
