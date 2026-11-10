/**
 * Que puede hacer cada rol en la seccion de Clientes.
 *
 * Existe por un cambio concreto: contabilidad ya ve la pestana de Clientes,
 * en SOLO LECTURA. Antes no la veia, y lo unico que la mantenia fuera era que
 * el link no se pintaba — un gate de UI. Ahora que si entra, lo unico que la
 * mantiene en solo lectura es el guard de cada ruta que escribe, asi que ese
 * guard pasa a ser load-bearing y se fija aqui.
 *
 * El segundo bloque lee el CODIGO de las rutas y revisa con que predicado
 * autorizan. Es inusual y es a proposito: probar el handler de verdad pediria
 * levantar Supabase y una sesion, y lo que puede romperse en silencio no es
 * la mecanica del handler, es que alguien relaje `canWrite` a `isStaff` para
 * "que contabilidad tambien pueda" y le abra la escritura sin notarlo.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { canEnterPanel, canWrite, isStaff, isVendedor } from './roles.ts'
import { tabsParaRol } from './admin-nav.ts'

const ROLES = ['super_admin', 'admin', 'ventas', 'produccion', 'contabilidad', 'vendedor'] as const

// ── La pestana ──────────────────────────────────────────────

test('contabilidad ve la pestana de Clientes, y SOLO esa', () => {
  // Darle el item de Clientes no le abre Puntos de venta de pasada: esa
  // seccion sigue como estaba.
  assert.deepEqual(tabsParaRol('clientes', 'contabilidad').map(t => t.key), ['clientes'])
})

test('los demas roles de oficina conservan las dos pestanas', () => {
  for (const rol of ['super_admin', 'admin', 'ventas', 'produccion'] as const) {
    assert.deepEqual(tabsParaRol('clientes', rol).map(t => t.key), ['clientes', 'puntos-venta'], rol)
  }
  // El vendedor nunca tuvo puntos de venta.
  assert.deepEqual(tabsParaRol('clientes', 'vendedor').map(t => t.key), ['clientes'])
})

test('todos los que pueden entrar al panel ven la pestana de Clientes', () => {
  for (const rol of ROLES) {
    const tabs = tabsParaRol('clientes', rol).map(t => t.key)
    assert.equal(
      tabs.includes('clientes'), canEnterPanel(rol),
      `${rol} ve ${tabs.join(', ') || '(nada)'}`
    )
  }
})

test('un comprador no ve la pestana, aunque la pida por URL', () => {
  // La page devuelve "Sin acceso" cuando no hay pestana activa.
  assert.deepEqual(tabsParaRol('clientes', 'comprador'), [])
  assert.deepEqual(tabsParaRol('clientes', null), [])
})

// ── Quien escribe y quien solo lee ──────────────────────────

test('contabilidad lee y exporta, pero no escribe', () => {
  const rol = 'contabilidad'
  // Lo que habilita ver la lista y exportar.
  assert.equal(isStaff(rol), true)
  assert.equal(canEnterPanel(rol), true)
  // Lo que habilita crear, editar, invitar, cargar Excel y bajar plantilla.
  assert.equal(canWrite(rol), false)
  assert.equal(isVendedor(rol), false)
})

test('el vendedor escribe lo suyo sin ser staff', () => {
  assert.equal(canWrite('vendedor'), false)
  assert.equal(isStaff('vendedor'), false)
  assert.equal(isVendedor('vendedor'), true)
  assert.equal(canEnterPanel('vendedor'), true)
})

// ── Los guards de las rutas, en el codigo ───────────────────

const fuente = (ruta: string) =>
  readFileSync(join(process.cwd(), 'app/api/admin/clientes', ruta), 'utf8')

/** Las rutas que ESCRIBEN: guard `canWrite`, con o sin vendedor. */
const RUTAS_ESCRITURA = [
  { ruta: 'crear/route.ts', conVendedor: true },
  { ruta: 'importar/route.ts', conVendedor: true },
  // La plantilla no escribe, pero lleva el mismo guard que la carga: trae los
  // nombres de los vendedores y no le sirve a quien no puede cargar.
  { ruta: 'plantilla/route.ts', conVendedor: true },
  { ruta: '[id]/actualizar/route.ts', conVendedor: false },
  { ruta: '[id]/nivel-precio/route.ts', conVendedor: false },
  { ruta: '[id]/invitar/route.ts', conVendedor: false },
] as const

test('las rutas que escriben autorizan con canWrite, no con isStaff', () => {
  for (const { ruta, conVendedor } of RUTAS_ESCRITURA) {
    const src = fuente(ruta)
    // `assert.ok` y no `assert.match`: match imprime el archivo entero como
    // `actual` y el mensaje se pierde entre 200 lineas de fuente.
    assert.ok(/canWrite\(/.test(src), `${ruta} no autoriza con canWrite`)
    // `isStaff` incluye contabilidad: usarlo aqui le abriria la escritura.
    assert.ok(!/isStaff\(/.test(src), `${ruta} autoriza con isStaff, que incluye contabilidad`)
    assert.equal(
      /isVendedor\(/.test(src), conVendedor,
      `${ruta} ${conVendedor ? 'deberia' : 'no deberia'} contemplar al vendedor`
    )
    assert.ok(src.includes('403'), `${ruta} no responde 403`)
  }
})

test('la ruta del export si deja a contabilidad', () => {
  const src = fuente('exportar/route.ts')
  assert.ok(/isStaff\(/.test(src), 'el export deberia autorizar con isStaff')
  assert.ok(/isVendedor\(/.test(src), 'el export deberia contemplar al vendedor')
})

test('el predicado de la pestana coincide con el guard del export', () => {
  // Lo unico que contabilidad puede hacer en la pantalla es exportar, asi que
  // ver la pestana y poder exportar tienen que ser la misma condicion: si se
  // separan, o entra a una pantalla donde el boton le da 403, o no entra a
  // una donde si podria.
  for (const rol of ROLES) {
    const veLaPestana = tabsParaRol('clientes', rol).some(t => t.key === 'clientes')
    const puedeExportar = isStaff(rol) || isVendedor(rol)
    assert.equal(veLaPestana, puedeExportar, rol)
  }
})
