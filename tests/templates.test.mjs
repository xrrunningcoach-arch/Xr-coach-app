import test from 'node:test'
import assert from 'node:assert/strict'
import {
  emptyPayload, emptyBlock, emptyTplSession, validateTemplate, cleanPayload, buildApplication, applicationToRpc,
} from '../src/lib/templates.js'

const disciplines = [{ id: 'd-run', code: 'running', name: 'Carrera' }]

function mesoItem() {
  const payload = emptyPayload('mesocycle')
  payload.blocks[0].weeks = 2
  payload.blocks[0].sessions = [
    emptyTplSession({ week_offset: 0, weekday: 1, session_type: 'Rodaje', km_estimated: 8, duration_planned_min: 50 }),
    emptyTplSession({ week_offset: 1, weekday: 5, session_type: 'Tirada larga', km_estimated: 16 }),
  ]
  return { kind: 'mesocycle', name: 'Base', payload }
}

test('plantilla vacía no valida', () => {
  const v = validateTemplate('mesocycle', 'Base', emptyPayload('mesocycle'))
  assert.deepEqual(v, ['Añade al menos una sesión.'])
  assert.deepEqual(validateTemplate('session', '', { session: emptyTplSession() }).length, 2)
  const ok = emptyPayload('mesocycle')
  ok.blocks[0].sessions = [emptyTplSession({ session_type: 'Rodaje' })]
  assert.deepEqual(validateTemplate('mesocycle', 'Base', ok), [])
})

test('buildApplication coloca sesiones por semana y día', () => {
  const r = buildApplication({ item: mesoItem(), startDate: '2026-10-07', plan: null, existing: { mesocycles: [], macrocycles: [] }, disciplines })
  assert.deepEqual(r.errors, [])
  assert.equal(r.planStart, '2026-10-05')
  assert.equal(r.newPlanStart, true)
  const dates = r.application.sessions.map((x) => x.session.session_date)
  assert.deepEqual(dates, ['2026-10-06', '2026-10-17'])
  assert.deepEqual(r.application.sessions.map((x) => x.session.week_number), [1, 2])
  assert.equal(r.application.sessions[0].session.discipline_id, 'd-run')
  assert.equal(r.application.mesocycles[0].start_date, '2026-10-05')
  assert.equal(r.application.mesocycles[0].end_date, '2026-10-18')
  assert.ok(r.application.macrocycle, 'crea un macrociclo contenedor si no existe')
  assert.equal(r.lastWeek, 2)
})

test('reutiliza el macrociclo existente', () => {
  const r = buildApplication({
    item: mesoItem(), startDate: '2026-10-07', plan: { start_date: '2026-09-28' },
    existing: { mesocycles: [{ order_index: 2 }], macrocycles: [{ id: 'm1', order_index: 1 }] }, disciplines,
  })
  assert.equal(r.application.useMacroId, 'm1')
  assert.equal(r.application.macrocycle, null)
  assert.equal(r.application.mesocycles[0].order_index, 3)
})

test('fecha de inicio anterior al plan -> error y no se aplica', () => {
  const r = buildApplication({
    item: mesoItem(), startDate: '2026-09-01', plan: { start_date: '2026-10-05' }, existing: { mesocycles: [], macrocycles: [] }, disciplines,
  })
  assert.ok(r.errors.length > 0, 'un bloque que empieza antes del plan se rechaza')
  const session = buildApplication({
    item: { kind: 'session', name: 'x', payload: { session: emptyTplSession() } },
    startDate: '2026-09-01', plan: { start_date: '2026-10-05' }, existing: { mesocycles: [] }, disciplines,
  })
  assert.ok(session.errors.length > 0)
})

test('sin fecha -> error', () => {
  assert.ok(buildApplication({ item: mesoItem(), startDate: '', plan: null, existing: {}, disciplines }).errors.length > 0)
})

test('sesión suelta cae en el mesociclo que cubre ese día', () => {
  const r = buildApplication({
    item: { kind: 'session', name: 'Series', payload: { session: emptyTplSession({ session_type: 'Series' }) } },
    startDate: '2026-10-08', plan: { start_date: '2026-10-05' },
    existing: { mesocycles: [{ id: 'meso-1', start_date: '2026-10-05', end_date: '2026-10-18' }] }, disciplines,
  })
  assert.equal(r.application.sessions[0].mesoId, 'meso-1')
  assert.equal(r.application.sessions[0].session.session_date, '2026-10-08')
})

test('applicationToRpc produce el JSON que espera SQL', () => {
  const item = mesoItem()
  const preview = buildApplication({ item, startDate: '2026-10-07', plan: null, existing: { mesocycles: [], macrocycles: [] }, disciplines })
  const rpc = applicationToRpc({ preview, plan: { id: 'plan-1' }, item })
  assert.equal(rpc.plan.id, 'plan-1')
  assert.equal(rpc.plan.start_date, '2026-10-05')
  assert.equal(rpc.plan.duration_weeks, 2)
  assert.equal(rpc.sessions.length, 2)
  assert.equal(rpc.sessions[0].meso_key, 'm0')
  assert.equal(rpc.sessions[0].meso_id, null)
  assert.ok(Array.isArray(rpc.sessions[0].exercises))
  JSON.stringify(rpc) // serializable
})
