import test from 'node:test'
import assert from 'node:assert/strict'
import { nextMondayISO, weekBounds, sortByDate } from '../src/lib/planCalendar.js'

test('el inicio por defecto es el lunes de la semana siguiente', () => {
  assert.equal(nextMondayISO('2026-10-07'), '2026-10-12') // miércoles -> lunes siguiente
  assert.equal(nextMondayISO('2026-10-05'), '2026-10-12') // lunes -> el siguiente lunes
  assert.equal(nextMondayISO('2026-10-11'), '2026-10-12') // domingo
})

test('límites de una semana del plan (lunes a domingo)', () => {
  assert.deepEqual(weekBounds('2026-10-07', 1), { from: '2026-10-05', to: '2026-10-11' })
  assert.deepEqual(weekBounds('2026-10-07', 3), { from: '2026-10-19', to: '2026-10-25' })
})

test('las sesiones se ordenan por fecha y las que no tienen fecha van al final', () => {
  const l = [
    { id: 'c', day_number: 1 },
    { id: 'b', session_date: '2026-10-08', day_number: 4 },
    { id: 'a', session_date: '2026-10-06', day_number: 2 },
    { id: 'd', session_date: '2026-10-06', day_number: 1 },
  ]
  assert.deepEqual(sortByDate(l).map((x) => x.id), ['d', 'a', 'b', 'c'])
  assert.equal(l[0].id, 'c') // no muta la entrada
})
