import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cycleDatesFromWeeks, cycleWeeksFromDates, cycleRange, cycleContains, cycleForDate, overlappingCycles,
} from '../src/lib/cycles.js'

const planStart = '2026-10-05'

test('semanas <-> fechas son inversas', () => {
  const d = cycleDatesFromWeeks(planStart, 2, 4)
  assert.deepEqual(d, { start_date: '2026-10-12', end_date: '2026-11-01' })
  assert.deepEqual(cycleWeeksFromDates(planStart, d.start_date, d.end_date), { week_start: 2, week_end: 4 })
})

test('entradas inválidas no explotan', () => {
  assert.deepEqual(cycleDatesFromWeeks(null, 1, 2), { start_date: null, end_date: null })
  assert.deepEqual(cycleDatesFromWeeks(planStart, 3, 2), { start_date: null, end_date: null })
  assert.equal(cycleWeeksFromDates(planStart, '2026-10-12', '2026-10-01'), null)
})

test('cycleRange prefiere fechas propias y cae a semanas', () => {
  assert.deepEqual(cycleRange({ start_date: '2026-11-02', end_date: '2026-11-08', week_start: 1, week_end: 1 }, planStart), ['2026-11-02', '2026-11-08'])
  assert.deepEqual(cycleRange({ week_start: 1, week_end: 2 }, planStart), ['2026-10-05', '2026-10-18'])
  assert.equal(cycleRange({}, planStart), null)
  assert.equal(cycleRange(null, planStart), null)
})

test('cycleForDate: gana el ciclo más corto si se solapan', () => {
  const long = { id: 'a', start_date: '2026-10-05', end_date: '2026-11-29', order_index: 1 }
  const short = { id: 'b', start_date: '2026-10-12', end_date: '2026-10-18', order_index: 2 }
  assert.equal(cycleForDate([long, short], '2026-10-14', planStart).id, 'b')
  assert.equal(cycleForDate([long, short], '2026-10-06', planStart).id, 'a')
  assert.equal(cycleForDate([long, short], '2027-01-01', planStart), null)
  assert.ok(cycleContains(long, '2026-11-29', planStart))
})

test('overlappingCycles ignora el propio ciclo', () => {
  const a = { id: 'a', start_date: '2026-10-05', end_date: '2026-10-18' }
  const b = { id: 'b', start_date: '2026-10-12', end_date: '2026-10-25' }
  const c = { id: 'c', start_date: '2026-11-02', end_date: '2026-11-08' }
  assert.deepEqual(overlappingCycles([a, b, c], ['2026-10-12', '2026-10-25'], planStart, 'b').map((x) => x.id), ['a'])
  assert.deepEqual(overlappingCycles([a, b, c], null, planStart), [])
})
