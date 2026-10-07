import test from 'node:test'
import assert from 'node:assert/strict'
import {
  effectiveMaxHr, zoneRange, HR_ZONES, sanitizeManualZones, resolveZones, parseManualForm, manualZoneWarnings,
} from '../src/lib/zones.js'

test('FC máxima: real > estimada (220 - edad)', () => {
  assert.deepEqual(effectiveMaxHr({ maxHrReal: 190, age: 30 }), { value: 190, source: 'real', estimated: 190 })
  assert.equal(effectiveMaxHr({ maxHrReal: '', age: 30 }).value, 190)
  assert.equal(effectiveMaxHr({ maxHrReal: '', age: 30 }).source, 'estimada')
  assert.equal(effectiveMaxHr({}).value, null)
})

test('rango por zona', () => {
  assert.deepEqual(zoneRange(200, HR_ZONES[0]), [100, 120])
  assert.equal(zoneRange(null, HR_ZONES[0]), null)
})

test('las zonas manuales tienen prioridad y el resto sigue automático', () => {
  const z = resolveZones({ maxHr: 200, manualZones: { Z2: { lo: 125, hi: 140 } } })
  assert.equal(z[1].source, 'manual')
  assert.deepEqual(z[1].range, [125, 140])
  assert.equal(z[0].source, 'auto')
  assert.deepEqual(z[0].range, [100, 120])
})

test('sanitizeManualZones descarta datos corruptos', () => {
  assert.deepEqual(sanitizeManualZones({ Z1: { lo: 150, hi: 120 }, Z2: { lo: 10, hi: 50 }, Z3: { lo: 140, hi: 155 }, Z9: { lo: 1, hi: 2 } }), { Z3: { lo: 140, hi: 155 } })
  assert.deepEqual(sanitizeManualZones(null), {})
})

test('parseManualForm valida y avisa por zona', () => {
  const { zones, errors } = parseManualForm({
    Z1: { lo: '', hi: '' },
    Z2: { lo: '120', hi: '' },
    Z3: { lo: '150', hi: '140' },
    Z4: { lo: '155', hi: '170' },
    Z5: { lo: '12.5', hi: '190' },
  })
  assert.deepEqual(zones, { Z4: { lo: 155, hi: 170 } })
  assert.deepEqual(Object.keys(errors).sort(), ['Z2', 'Z3', 'Z5'])
})

test('avisos de solape y desorden', () => {
  assert.equal(manualZoneWarnings({ Z1: { lo: 100, hi: 120 }, Z2: { lo: 125, hi: 140 } }).length, 0)
  assert.equal(manualZoneWarnings({ Z1: { lo: 100, hi: 120 }, Z2: { lo: 110, hi: 140 } }).length, 1)
  assert.equal(manualZoneWarnings({ Z1: { lo: 100, hi: 120 }, Z2: { lo: 90, hi: 95 } }).length, 1)
})
