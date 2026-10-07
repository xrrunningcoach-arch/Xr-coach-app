import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseNum, sessionKm, sessionElevation, sessionMinutes, resolveWindow, inWindow, kmByDiscipline,
  weeklySeries, cumulative, sum, formatDuration,
} from '../src/lib/stats.js'

test('parseNum entiende formatos españoles', () => {
  assert.equal(parseNum('12,5'), 12.5)
  assert.equal(parseNum('1.200'), 1200)
  assert.equal(parseNum('1.200,5'), 1200.5)
  assert.equal(parseNum(''), null)
  assert.equal(parseNum('abc'), null)
  assert.equal(parseNum(7), 7)
})

test('km: directo > bici > natación', () => {
  assert.equal(sessionKm({ km_estimated: '10' }), 10)
  assert.equal(sessionKm({ metrics: { distancia_km: '40' } }), 40)
  assert.equal(sessionKm({ metrics: { distancia_m: '1500' } }), 1.5)
  assert.equal(sessionKm({}), 0)
  assert.equal(sessionElevation({ metrics: { desnivel_m: '350' } }), 350)
})

test('minutos hechos: real si existe, prevista marcada como estimada', () => {
  assert.deepEqual(sessionMinutes({ duration_planned_min: 60, status: 'completado', duration_actual_min: 55 }), { planned: 60, done: 55, estimatedDone: false })
  assert.deepEqual(sessionMinutes({ duration_planned_min: 60, status: 'completado' }), { planned: 60, done: 60, estimatedDone: true })
  assert.deepEqual(sessionMinutes({ duration_planned_min: 60, status: 'pendiente' }), { planned: 60, done: 0, estimatedDone: false })
})

test('ventanas de tiempo', () => {
  assert.equal(resolveWindow('plan', '2026-10-07'), null)
  assert.deepEqual(resolveWindow('month', '2026-10-07'), { from: '2026-10-01', to: '2026-10-31' })
  assert.deepEqual(resolveWindow('4w', '2026-10-07'), { from: '2026-09-14', to: '2026-10-11' })
  const win = { from: '2026-10-01', to: '2026-10-31' }
  assert.ok(inWindow({ session_date: '2026-10-31' }, win))
  assert.ok(!inWindow({ session_date: '2026-11-01' }, win))
  assert.ok(!inWindow({}, win))
  assert.ok(inWindow({}, null))
})

test('serie semanal rellena semanas vacías y suma hecho/previsto', () => {
  const sessions = [
    { session_date: '2026-10-05', km_estimated: 10, duration_planned_min: 60, status: 'completado', duration_actual_min: 58 },
    { session_date: '2026-10-07', km_estimated: 5, duration_planned_min: 30, status: 'pendiente' },
    { session_date: '2026-10-19', km_estimated: 8, duration_planned_min: 50, status: 'completado' },
  ]
  const rows = weeklySeries(sessions, null)
  assert.equal(rows.length, 3)
  assert.equal(rows[0].plannedKm, 15)
  assert.equal(rows[0].doneKm, 10)
  assert.equal(rows[1].sessions, 0)
  assert.equal(rows[2].estimatedMin, 50)
  assert.deepEqual(cumulative(rows, 'plannedKm'), [15, 15, 23])
  assert.equal(sum(rows, 'doneSessions'), 2)
})

test('km por disciplina', () => {
  const ds = [{ id: 'r', name: 'Carrera', code: 'running' }]
  const out = kmByDiscipline([
    { discipline_id: 'r', km_estimated: 10, status: 'completado' },
    { discipline_id: 'r', km_estimated: 5, status: 'pendiente' },
    { discipline_id: null, km_estimated: 2, status: 'pendiente' },
  ], ds)
  assert.equal(out[0].planned, 15)
  assert.equal(out[0].done, 10)
  assert.equal(out[1].key, 'none')
})

test('formatDuration', () => {
  assert.equal(typeof formatDuration(95), 'string')
  assert.match(formatDuration(95), /1/)
})
