import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSubmitParams, cleanLink } from '../src/lib/sessionLog.js'

test('cleanLink añade https:// cuando falta y respeta el resto', () => {
  assert.equal(cleanLink(''), '')
  assert.equal(cleanLink(null), '')
  assert.equal(cleanLink('  strava.com/activities/1 '), 'https://strava.com/activities/1')
  assert.equal(cleanLink('http://x.org/a'), 'http://x.org/a')
  assert.equal(cleanLink('HTTPS://x.org'), 'HTTPS://x.org')
})

test('guardar el registro completa la sesión con RPE, notas y enlace', () => {
  const s = { id: 's1', rpe_actual: '', metrics_actual: { ritmo: '4:30' } }
  const p = buildSubmitParams(s, { status: 'completado', rpe: 7, notes: ' piernas pesadas ', link: 'strava.com/a/1' })
  assert.equal(p.p_status, 'completado')
  assert.equal(p.p_rpe_actual, 'RPE 7')
  assert.equal(p.p_rpe_actual_value, 7)
  assert.equal(p.p_notes, 'piernas pesadas')
  assert.equal(p.p_link_url, 'https://strava.com/a/1')
  // lo que no se pide no se borra: null -> la función SQL conserva lo anterior
  assert.equal(p.p_duration_actual_min, null)
  assert.equal(p.p_distance_actual_km, null)
  assert.equal(p.p_avg_hr_actual, null)
  assert.deepEqual(p.p_metrics, { ritmo: '4:30' })
})

test('RPE 0 es un valor válido; sin RPE no se inventa ninguno', () => {
  assert.equal(buildSubmitParams({ id: 's' }, { status: 'completado', rpe: 0 }).p_rpe_actual_value, 0)
  const none = buildSubmitParams({ id: 's' }, { status: 'completado', rpe: '' })
  assert.equal(none.p_rpe_actual_value, null)
  assert.equal(none.p_rpe_actual, '')
})

test('saltada: no registra esfuerzo pero conserva las notas', () => {
  const p = buildSubmitParams({ id: 's', rpe_actual: 'RPE 5' }, { status: 'saltado', rpe: 9, notes: 'lesión leve' })
  assert.equal(p.p_status, 'saltado')
  assert.equal(p.p_rpe_actual_value, null)
  assert.equal(p.p_rpe_actual, 'RPE 5')
  assert.equal(p.p_notes, 'lesión leve')
})
