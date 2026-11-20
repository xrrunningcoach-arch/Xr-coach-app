import test from 'node:test'
import assert from 'node:assert/strict'
import { computeCompliance, sortByUrgency } from '../src/lib/compliance.js'

const today = '2026-10-07' // miércoles
const athletes = [{ id: 'a1', full_name: 'Maite' }, { id: 'a2', full_name: 'Jon' }, { id: 'a3', full_name: 'Leire' }]
const plans = [
  { id: 'p1', athlete_id: 'a1', status: 'active' },
  { id: 'p2', athlete_id: 'a2', status: 'active' },
]
const s = (plan, date, status, extra = {}) => ({ plan_id: plan, session_date: date, status, ...extra })

test('atleta sin plan activo -> nivel none', () => {
  const [, , r] = computeCompliance({ athletes, plans, sessions: [], today })
  assert.equal(r.level, 'none')
  assert.equal(r.reasons[0].code, 'noPlan')
})

test('atleta al día -> ok', () => {
  const sessions = [
    s('p1', '2026-10-01', 'completado', { completed_at: '2026-10-01T18:00:00Z' }),
    s('p1', '2026-10-03', 'completado', { completed_at: '2026-10-03T18:00:00Z' }),
    s('p1', '2026-10-05', 'completado', { completed_at: '2026-10-05T18:00:00Z' }),
    s('p1', '2026-10-06', 'completado', { completed_at: '2026-10-06T18:00:00Z' }),
    s('p1', '2026-10-09', 'pendiente'),
  ]
  const [r] = computeCompliance({ athletes, plans, sessions, today })
  assert.equal(r.level, 'ok')
  assert.deepEqual(r.reasons, [])
  assert.equal(r.rate, 1)
})

test('sesión de ayer pendiente aún no es "olvidada"; las de hace 3+ días sí', () => {
  const base = [s('p1', '2026-10-09', 'pendiente'), s('p1', '2026-10-02', 'completado', { completed_at: '2026-10-06' })]
  const [a] = computeCompliance({ athletes, plans, sessions: [...base, s('p1', '2026-10-06', 'pendiente')], today })
  assert.equal(a.overdue, 0)
  const [b] = computeCompliance({
    athletes, plans, today,
    sessions: [...base, s('p1', '2026-10-01', 'pendiente'), s('p1', '2026-10-02', 'pendiente'), s('p1', '2026-10-03', 'pendiente')],
  })
  assert.equal(b.overdue, 3)
  assert.equal(b.level, 'high')
})

test('cumplimiento bajo e inactividad prolongada -> rojo', () => {
  const sessions = [
    s('p2', '2026-09-28', 'completado', { completed_at: '2026-09-28' }),
    s('p2', '2026-09-30', 'saltado'),
    s('p2', '2026-10-01', 'saltado'),
    s('p2', '2026-10-02', 'pendiente'),
    s('p2', '2026-10-09', 'pendiente'),
  ]
  const [, r] = computeCompliance({ athletes, plans, sessions, today })
  const codes = r.reasons.map((x) => x.code)
  assert.ok(codes.includes('lowCompliance'))
  assert.ok(codes.includes('skipped'))
  assert.ok(codes.includes('inactive'))
  assert.equal(r.level, 'high')
})

test('dos sesiones muy duras en 7 días -> aviso ámbar', () => {
  const sessions = [
    s('p1', '2026-10-03', 'completado', { completed_at: '2026-10-03', rpe_actual_value: 9 }),
    s('p1', '2026-10-05', 'completado', { completed_at: '2026-10-05', rpe_actual_value: 10 }),
    s('p1', '2026-10-06', 'completado', { completed_at: '2026-10-06', rpe_actual_value: 5 }),
    s('p1', '2026-10-09', 'pendiente'),
  ]
  const [r] = computeCompliance({ athletes, plans, sessions, today })
  assert.ok(r.reasons.some((x) => x.code === 'highRpe'))
  assert.equal(r.level, 'medium')
})

test('sin sesiones próximas -> aviso', () => {
  const [r] = computeCompliance({ athletes, plans, sessions: [s('p1', '2026-10-06', 'completado', { completed_at: '2026-10-06' })], today })
  assert.ok(r.reasons.some((x) => x.code === 'noUpcoming'))
})

test('sortByUrgency: rojo > ámbar > ok > sin plan, y no muta la entrada', () => {
  const rows = [
    { level: 'ok', overdue: 0, athlete: { full_name: 'B' } },
    { level: 'none', overdue: 0, athlete: { full_name: 'A' } },
    { level: 'high', overdue: 1, athlete: { full_name: 'C' } },
    { level: 'high', overdue: 4, athlete: { full_name: 'D' } },
    { level: 'medium', overdue: 0, athlete: { full_name: 'E' } },
  ]
  const copy = [...rows]
  assert.deepEqual(sortByUrgency(rows).map((r) => r.athlete.full_name), ['D', 'C', 'E', 'B', 'A'])
  assert.deepEqual(rows, copy)
})
