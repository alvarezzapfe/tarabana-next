import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ventana, indiceDia, recortar, asignarCarriles, tramosPorTanque,
  carrilesDe, hayTraslape, diaDeEtapa, estaOcupando,
  type TramoCrudo,
} from './calendario-tanques.ts'

const HOY = '2026-11-18'

test('la ventana cubre atras + adelante + hoy', () => {
  const v = ventana(HOY, 30, 45)
  assert.equal(v.desde, '2026-10-19')
  assert.equal(v.hasta, '2027-01-02')
  assert.equal(v.dias, 76)
})

test('hoy cae en la columna que le toca', () => {
  const v = ventana(HOY, 30, 45)
  assert.equal(indiceDia(v, HOY), 30)
  assert.equal(indiceDia(v, v.desde), 0)
  assert.equal(indiceDia(v, v.hasta), 75)
})

const V = ventana(HOY, 10, 10)   // 2026-11-08 .. 2026-11-28, 21 dias

const crudo = (p: Partial<TramoCrudo> = {}): TramoCrudo => ({
  id: 't1', lote_id: 'l1', tanque_id: 'FV1', folio: 'BRA-26-001',
  producto_nombre: 'Brasa', etapa: 'fermentacion',
  desde: '2026-11-10', hasta: null, fin: '2026-11-14',
  estimado: true, tiene_receta: true, ...p,
})

test('un tramo dentro de la ventana toma su columna y su ancho', () => {
  // 11-10 es indice 2; 11-14 es 6, inclusive -> ancho 5
  const r = recortar(crudo(), V)
  assert.ok(r)
  assert.equal(r!.col, 2)
  assert.equal(r!.ancho, 5)
  assert.equal(r!.cortadoIzq, false)
  assert.equal(r!.cortadoDer, false)
})

test('un tramo de un solo dia ocupa una columna, no cero', () => {
  const r = recortar(crudo({ desde: '2026-11-12', fin: '2026-11-12' }), V)
  assert.ok(r)
  assert.equal(r!.ancho, 1)
})

test('un tramo que empieza antes de la ventana se recorta y lo dice', () => {
  const r = recortar(crudo({ desde: '2026-09-01', fin: '2026-11-12' }), V)
  assert.ok(r)
  assert.equal(r!.col, 0)
  assert.equal(r!.cortadoIzq, true)
})

test('un tramo que acaba despues se recorta por la derecha', () => {
  const r = recortar(crudo({ desde: '2026-11-25', fin: '2027-03-01' }), V)
  assert.ok(r)
  assert.equal(r!.cortadoDer, true)
  assert.equal(r!.col + r!.ancho, V.dias)
})

test('un tramo fuera de la ventana es null, no una barra invisible', () => {
  assert.equal(recortar(crudo({ desde: '2026-01-01', fin: '2026-01-10' }), V), null)
  assert.equal(recortar(crudo({ desde: '2027-06-01', fin: '2027-06-10' }), V), null)
})

test('un tramo SIN fin llega al borde derecho y queda marcado', () => {
  // El lote sigue en el tanque —eso es un hecho— pero no se sabe hasta
  // cuando. Cortarlo en hoy afirmaria que se libera hoy.
  const r = recortar(crudo({ fin: null }), V)
  assert.ok(r)
  assert.equal(r!.sinFin, true)
  assert.equal(r!.cortadoDer, false)
  assert.equal(r!.col + r!.ancho, V.dias)
})

test('una ventana de cero dias no produce barras', () => {
  assert.equal(recortar(crudo(), { desde: HOY, hasta: HOY, dias: 0 }), null)
})

test('el tramo conserva sus fechas reales para el tooltip', () => {
  const r = recortar(crudo({ desde: '2026-09-01', fin: '2027-03-01' }), V)
  assert.equal(r!.inicioReal, '2026-09-01')
  assert.equal(r!.finReal, '2027-03-01')
})

// ── Carriles ────────────────────────────────────────────────

test('dos tramos consecutivos comparten carril', () => {
  // Lo normal en un tanque: un lote sale y entra el siguiente.
  const c = asignarCarriles([
    { col: 0, ancho: 5 },
    { col: 5, ancho: 5 },
  ])
  assert.deepEqual(c, [0, 0])
})

test('dos tramos traslapados van a carriles distintos', () => {
  const c = asignarCarriles([
    { col: 0, ancho: 6 },
    { col: 3, ancho: 6 },
  ])
  assert.deepEqual(c, [0, 1])
})

test('tres traslapados dan tres carriles', () => {
  const c = asignarCarriles([
    { col: 0, ancho: 10 },
    { col: 1, ancho: 10 },
    { col: 2, ancho: 10 },
  ])
  assert.deepEqual(c, [0, 1, 2])
})

test('el carril se reusa en cuanto se libera', () => {
  const c = asignarCarriles([
    { col: 0, ancho: 3 },   // 0..3
    { col: 1, ancho: 3 },   // 1..4  -> carril 1
    { col: 4, ancho: 3 },   // 4..7  -> cabe en el 0
  ])
  assert.deepEqual(c, [0, 1, 0])
})

test('el orden de entrada no cambia el resultado', () => {
  // Se ordena por inicio adentro, asi que da igual como llegue el arreglo.
  const c = asignarCarriles([
    { col: 5, ancho: 5 },
    { col: 0, ancho: 6 },
  ])
  assert.deepEqual(c, [1, 0])
})

test('sin tramos, un tanque sigue teniendo una fila', () => {
  // Si devolviera 0, la fila del tanque desapareceria del calendario y
  // parecería que el tanque no existe.
  assert.equal(carrilesDe(undefined), 1)
  assert.equal(carrilesDe([]), 1)
})

// ── Traslape real ───────────────────────────────────────────

const tramo = (col: number, ancho: number) => ({
  id: 'x', loteId: 'l', tanqueId: 'FV1', folio: null, producto: null,
  etapa: 'fermentacion' as const, col, ancho,
  cortadoIzq: false, cortadoDer: false, estimado: false, sinFin: false,
  carril: 0, inicioReal: HOY, finReal: null,
})

test('dos tramos consecutivos NO son un traslape', () => {
  // Esto importa: avisar de conflicto cada vez que un tanque se reutiliza
  // entrenaria a ignorar el aviso.
  assert.equal(hayTraslape([tramo(0, 5), tramo(5, 5)]), false)
})

test('dos tramos encimados SI son un traslape', () => {
  assert.equal(hayTraslape([tramo(0, 6), tramo(3, 6)]), true)
})

test('un solo tramo nunca se traslapa', () => {
  assert.equal(hayTraslape([tramo(0, 5)]), false)
  assert.equal(hayTraslape([]), false)
})

// ── Agrupado ────────────────────────────────────────────────

test('agrupa por tanque y descarta lo que no entra en la ventana', () => {
  const m = tramosPorTanque([
    crudo({ id: 'a', tanque_id: 'FV1', desde: '2026-11-10', fin: '2026-11-12' }),
    crudo({ id: 'b', tanque_id: 'FV1', desde: '2026-11-11', fin: '2026-11-15' }),
    crudo({ id: 'c', tanque_id: 'FV2', desde: '2026-11-10', fin: '2026-11-12' }),
    crudo({ id: 'd', tanque_id: 'FV3', desde: '2020-01-01', fin: '2020-02-01' }),
  ], V)

  assert.equal(m.get('FV1')!.length, 2)
  assert.equal(m.get('FV2')!.length, 1)
  assert.equal(m.has('FV3'), false)
  // Los dos de FV1 se traslapan -> dos carriles.
  assert.equal(carrilesDe(m.get('FV1')), 2)
  assert.equal(carrilesDe(m.get('FV2')), 1)
})

// ── La trampa de la zona horaria ────────────────────────────

test('el dia de una etapa sale en la zona del negocio, no en UTC', () => {
  // 2026-11-19 03:30 UTC son las 21:30 del 18 en CDMX. Un `.slice(0,10)`
  // diria 19 y correria la barra un dia entero.
  assert.equal(diaDeEtapa('2026-11-19T03:30:00Z'), '2026-11-18')
  assert.notEqual(diaDeEtapa('2026-11-19T03:30:00Z'), '2026-11-19T03:30:00Z'.slice(0, 10))
})

test('un instante de media tarde cae en su propio dia', () => {
  assert.equal(diaDeEtapa('2026-11-18T20:00:00Z'), '2026-11-18')
})

test('ocupa el tanque solo si el tramo esta abierto y el lote no termino', () => {
  assert.equal(estaOcupando({ hasta: null, etapa: 'fermentacion' }), true)
  assert.equal(estaOcupando({ hasta: '2026-11-20', etapa: 'fermentacion' }), false)
  assert.equal(estaOcupando({ hasta: null, etapa: 'liberado' }), false)
})
