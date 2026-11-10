/**
 * Tests del mensaje de error de una respuesta.
 *
 *   npm test
 *
 * El caso que importa es el 500 con HTML: es el que el patron anterior
 * (`res.json().catch(() => ({}))` y `json.error || 'generico'`) convertia en
 * "No se pudo guardar." sin mas, y el error real solo existia en los logs.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mensajeDeError } from './respuesta.ts'

const respuesta = (status: number, cuerpo: string, tipo = 'application/json') =>
  new Response(cuerpo, { status, headers: { 'content-type': tipo } })

test('mensajeDeError: usa el error del JSON y siempre dice el status', async () => {
  const m = await mensajeDeError(
    respuesta(409, JSON.stringify({ error: 'Ya existe un usuario con ese correo.' })),
    'No se pudo guardar el cliente'
  )
  assert.equal(m, 'No se pudo guardar el cliente (HTTP 409): Ya existe un usuario con ese correo.')
})

test('mensajeDeError: de un 500 en HTML saca el error, no un generico', async () => {
  // Lo que devuelve Next en dev cuando la ruta lanza.
  const html = `<!DOCTYPE html><html><head><title>Error</title>
    <style>body{color:red}</style><script>console.log("x")</script></head>
    <body><h1>Unhandled Runtime Error</h1>
    <p>TypeError: Cannot read properties of undefined (reading 'includes')</p>
    </body></html>`

  const m = await mensajeDeError(respuesta(500, html, 'text/html'), 'No se pudo guardar el cliente')

  assert.match(m, /HTTP 500/)
  assert.match(m, /Cannot read properties of undefined/)
  // Que no se cuele el contenido de <script> ni de <style>.
  assert.doesNotMatch(m, /console\.log/)
  assert.doesNotMatch(m, /color:red/)
})

test('mensajeDeError: un cuerpo vacio manda a los logs en vez de callarse', async () => {
  const m = await mensajeDeError(respuesta(502, ''), 'No se pudo guardar el cliente')
  assert.match(m, /HTTP 502/)
  assert.match(m, /logs del servidor/)
})

test('mensajeDeError: tambien lee `message`, que es lo que traen otros errores', async () => {
  const m = await mensajeDeError(
    respuesta(400, JSON.stringify({ message: 'column "giro" does not exist' })),
    'No se pudo guardar el cliente'
  )
  assert.match(m, /column "giro" does not exist/)
})

test('mensajeDeError: HTML sin nada util igual reporta el status', async () => {
  const m = await mensajeDeError(respuesta(504, '<html><body></body></html>', 'text/html'), 'Falló')
  assert.match(m, /HTTP 504/)
  assert.match(m, /logs del servidor/)
})
