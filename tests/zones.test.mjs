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

import { zonesFromThresholds, pickMaxHr } from '../src/lib/zones.js'
import { hrvTrend } from '../src/lib/hrv.js'

test('zonas derivadas del test de umbrales (VT1/VT2)', () => {
  const z = zonesFromThresholds({ vt1Hr: 150, vt2Hr: 170, maxHr: 188 })
  assert.deepEqual(z.Z2, { lo: 135, hi: 150 })
  assert.deepEqual(z.Z3, { lo: 150, hi: 160 })
  assert.deepEqual(z.Z4, { lo: 160, hi: 170 })
  assert.deepEqual(z.Z5, { lo: 170, hi: 188 })
  assert.deepEqual(sanitizeManualZones(z), z)
  assert.deepEqual(zonesFromThresholds({ vt1Hr: 170, vt2Hr: 150 }), {})
  assert.deepEqual(zonesFromThresholds({}), {})
})

test('prioridad: manual > test > % FC máx', () => {
  const testZones = zonesFromThresholds({ vt1Hr: 150, vt2Hr: 170, maxHr: 188 })
  const z = resolveZones({ maxHr: 188, manualZones: { Z4: { lo: 158, hi: 168 } }, testZones })
  assert.equal(z[3].source, 'manual')
  assert.equal(z[2].source, 'test')
  assert.equal(resolveZones({ maxHr: 188 })[3].source, 'auto')
})

test('pickMaxHr toma la primera FC máx válida', () => {
  assert.equal(pickMaxHr(null, '', 190, 200), 190)
  assert.equal(pickMaxHr(50, undefined), null)
})

test('tendencia de HRV: insuficiente, estable y a la baja', () => {
  const day = (n) => `2026-10-${String(n).padStart(2, '0')}`
  const mk = (from, to, v) => Array.from({ length: to - from + 1 }, (_, i) => ({ reading_date: day(from + i), rmssd_ms: v }))
  assert.equal(hrvTrend(mk(8, 9, 60), '2026-10-09').status, 'insufficient')
  // base: 1-2 oct (<7 días) no alcanza; se usa un rango amplio con septiembre
  const base = Array.from({ length: 14 }, (_, i) => ({ reading_date: `2026-09-${String(10 + i).padStart(2, '0')}`, rmssd_ms: 60 }))
  assert.equal(hrvTrend([...base, ...mk(4, 9, 60)], '2026-10-09').status, 'stable')
  assert.equal(hrvTrend([...base, ...mk(4, 9, 50)], '2026-10-09').status, 'below')
})
