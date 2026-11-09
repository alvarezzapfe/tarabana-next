/**
 * Tests del mapeo del alta de clientes.
 *
 *   npm test
 *
 * Lo que se cubre es exactamente donde estuvo el bug: la ruta de crear tenia
 * su propia lista de columnas, mas corta que lo que mandaba el formulario, y
 * los campos que sobraban se perdian sin error. Estos tests fijan que el
 * mapeo no pierda nada, que lo que no viene no se borre, y que un vendedor no
 * pueda escribir lo comercial.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposCliente, nombreCompletoDe, validarCliente } from './cliente-campos.ts'

const base = {
  marca_negocio: 'Bar La Esquina',
  giro: 'bar',
  email: 'hola@laesquina.mx',
  phone: '555 123 4567',
}

// ── Mapeo ───────────────────────────────────────────────────

test('camposCliente: no pierde la direccion estructurada', () => {
  const c = camposCliente({
    ...base,
    calle: 'Insurgentes Sur', num_ext: '1234', num_int: 'A',
    colonia: 'Del Valle', municipio: 'Benito Juarez', estado: 'CDMX',
    cp: '03100', referencias: 'Porton negro',
  }, { comercial: true })

  assert.equal(c.calle, 'Insurgentes Sur')
  assert.equal(c.num_ext, '1234')
  assert.equal(c.num_int, 'A')
  assert.equal(c.colonia, 'Del Valle')
  assert.equal(c.municipio, 'Benito Juarez')
  assert.equal(c.estado, 'CDMX')
  assert.equal(c.cp, '03100')
  assert.equal(c.referencias, 'Porton negro')
  // Las columnas viejas se mantienen en sincronia: hay pantallas y la orden
  // en Word que todavia las leen.
  assert.equal(c.direccion_entrega, 'Insurgentes Sur 1234')
  assert.equal(c.ciudad, 'Benito Juarez')
})

test('camposCliente: el telefono se guarda con prefijo, venga como venga', () => {
  assert.equal(camposCliente({ ...base, phone: '555 123 4567' }, { comercial: true }).phone, '+525551234567')
  assert.equal(camposCliente({ ...base, phone: '5551234567' }, { comercial: true }).phone, '+525551234567')
  assert.equal(camposCliente({ ...base, phone: '+525551234567' }, { comercial: true }).phone, '+525551234567')
  // Incompleto no se guarda a medias.
  assert.equal(camposCliente({ ...base, phone: '555' }, { comercial: true }).phone, null)
})

test('camposCliente: sin factura, el bloque fiscal queda limpio', () => {
  const c = camposCliente({
    ...base,
    requiere_factura: false,
    rfc: 'PELJ800101AB1', razon_social: 'JUAN PEREZ', regimen_fiscal: '612',
    cp_fiscal: '03100', uso_cfdi: 'G03',
  }, { comercial: true })

  // Un RFC colgando de un cliente que no factura es lo que despues timbra mal.
  assert.equal(c.rfc, null)
  assert.equal(c.razon_social, null)
  assert.equal(c.regimen_fiscal, null)
  assert.equal(c.cp_fiscal, null)
  assert.equal(c.uso_cfdi, null)
  assert.equal(c.requiere_factura, false)
  assert.equal(c.tipo_persona_registro, null)
})

test('camposCliente: el tipo de persona se deriva del RFC, no se pregunta', () => {
  const fisica = camposCliente({ ...base, requiere_factura: true, rfc: 'pelj800101ab1', razon_social: 'J', uso_cfdi: 'G03' }, { comercial: true })
  assert.equal(fisica.tipo_persona_registro, 'fisica')
  assert.equal(fisica.rfc, 'PELJ800101AB1', 'el RFC se guarda en mayusculas')

  const moral = camposCliente({ ...base, requiere_factura: true, rfc: 'ABC800101AB1', razon_social: 'X', uso_cfdi: 'G03' }, { comercial: true })
  assert.equal(moral.tipo_persona_registro, 'moral')
})

test('camposCliente: sin la seccion comercial, esas columnas no se tocan', () => {
  // Un vendedor no define precio ni credito. Mandar los campos a mano no
  // alcanza: no se incluyen en el update, ni como null.
  const c = camposCliente({
    ...base,
    nivel_precio: 'distribuidor', dias_credito: '90', limite_credito: '999999',
    vendedor_id: 'otro-vendedor', notas: 'me asigno a mi mismo',
  }, { comercial: false })

  for (const columna of ['nivel_precio', 'dias_credito', 'limite_credito', 'vendedor_id', 'notas']) {
    assert.ok(!(columna in c), `${columna} no deberia viajar`)
  }
})

test('camposCliente: lo que no viene no se borra', () => {
  // El formulario del admin ya no captura esto, y nulificarlo borraria lo que
  // el cliente declaro de si mismo en el portal.
  const sinMandar = camposCliente(base, { comercial: true })
  for (const columna of ['tipo_consumidor', 'nombre_pila', 'apellido_paterno', 'apellido_materno']) {
    assert.ok(!(columna in sinMandar), `${columna} no deberia viajar si no vino`)
  }

  // Pero si viene, se respeta: el portal si los manda.
  const mandado = camposCliente({ ...base, tipo_consumidor: 'tiene_bar' }, { comercial: true })
  assert.equal(mandado.tipo_consumidor, 'tiene_bar')
})

test('nombreCompletoDe: el negocio primero, y nunca queda vacio por el contacto', () => {
  assert.equal(nombreCompletoDe({ marca_negocio: 'Bar La Esquina', razon_social: 'JUAN PEREZ' }), 'Bar La Esquina')
  assert.equal(nombreCompletoDe({ marca_negocio: '', razon_social: 'JUAN PEREZ' }), 'JUAN PEREZ')
  assert.equal(nombreCompletoDe({ marca_negocio: '', razon_social: '', contacto_nombre: 'Ana' }), 'Ana')
  assert.equal(nombreCompletoDe({}), null)
})

// ── Validacion ──────────────────────────────────────────────

test('validarCliente: acepta lo minimo y rechaza lo que falta', () => {
  assert.equal(validarCliente(base, { alCrear: true }), null)

  assert.match(validarCliente({ ...base, marca_negocio: '' }, { alCrear: true })!.error, /nombre comercial/i)
  assert.match(validarCliente({ ...base, email: '' }, { alCrear: true })!.error, /correo/i)
  assert.match(validarCliente({ ...base, email: 'no-es-correo' }, { alCrear: true })!.error, /correo/i)

  // Al editar el correo no viaja siempre; solo se valida si viene.
  assert.equal(validarCliente({ ...base, email: '' }, { alCrear: false }), null)
})

test('validarCliente: el giro tiene que estar en el catalogo', () => {
  assert.equal(validarCliente({ ...base, giro: 'taproom' }, { alCrear: true }), null)
  const fallo = validarCliente({ ...base, giro: 'cantina_inventada' }, { alCrear: true })
  assert.equal(fallo?.status, 400)
  assert.match(fallo!.error, /giro invalido/i)
})

test('validarCliente: con factura exige RFC con forma de RFC', () => {
  const conFactura = { ...base, requiere_factura: true, razon_social: 'JUAN PEREZ', uso_cfdi: 'G03' }

  assert.equal(validarCliente({ ...conFactura, rfc: 'PELJ800101AB1' }, { alCrear: true }), null)
  assert.match(validarCliente({ ...conFactura, rfc: '' }, { alCrear: true })!.error, /RFC es obligatorio/i)
  // Trece caracteres pero sin forma de RFC: el formulario viejo lo aceptaba
  // porque solo contaba el largo.
  assert.match(validarCliente({ ...conFactura, rfc: 'AAAAAAAAAAAAA' }, { alCrear: true })!.error, /formato/i)
  assert.match(validarCliente({ ...conFactura, rfc: 'PELJ800101AB1', razon_social: '' }, { alCrear: true })!.error, /razon social/i)
  assert.match(validarCliente({ ...conFactura, rfc: 'PELJ800101AB1', uso_cfdi: '' }, { alCrear: true })!.error, /uso de CFDI/i)
  assert.match(validarCliente({ ...conFactura, rfc: 'PELJ800101AB1', uso_cfdi: 'Z99' }, { alCrear: true })!.error, /uso de CFDI invalido/i)
})

test('validarCliente: el regimen tiene que cuadrar con el tipo de persona', () => {
  const fisica = { ...base, requiere_factura: true, rfc: 'PELJ800101AB1', razon_social: 'J', uso_cfdi: 'G03' }
  // 612 es de persona fisica.
  assert.equal(validarCliente({ ...fisica, regimen_fiscal: '612' }, { alCrear: true }), null)
  // 601 es de moral: con un RFC de 13 es un dato imposible.
  assert.match(validarCliente({ ...fisica, regimen_fiscal: '601' }, { alCrear: true })!.error, /no corresponde/i)

  const moral = { ...base, requiere_factura: true, rfc: 'ABC800101AB1', razon_social: 'X', uso_cfdi: 'G03' }
  assert.equal(validarCliente({ ...moral, regimen_fiscal: '601' }, { alCrear: true }), null)
  assert.match(validarCliente({ ...moral, regimen_fiscal: '612' }, { alCrear: true })!.error, /no corresponde/i)
})

test('validarCliente: el credito no puede ser negativo', () => {
  assert.equal(validarCliente({ ...base, dias_credito: '30', limite_credito: '50000' }, { alCrear: true }), null)
  assert.equal(validarCliente({ ...base, dias_credito: '', limite_credito: '' }, { alCrear: true }), null)
  assert.match(validarCliente({ ...base, dias_credito: -5 }, { alCrear: true })!.error, /dias/i)
  assert.match(validarCliente({ ...base, limite_credito: -1 }, { alCrear: true })!.error, /limite/i)
})
