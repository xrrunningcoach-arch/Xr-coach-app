import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HR_ZONES, sanitizeManualZones, resolveZones, parseManualForm, manualZoneWarnings, parsePace, formatPaceSec,
} from '../src/lib/zones.js'

test('solo existen las zonas escritas por el entrenador; no hay cálculo automático', () => {
  const z = resolveZones({ maxHr: 200, manualZones: { Z2: { lo: 125, hi: 140 } } })
  assert.equal(z[1].source, 'manual')
  assert.deepEqual(z[1].range, [125, 140])
  assert.equal(z[1].pctLabel, '63% - 70%')
  assert.equal(z[0].source, 'empty')
  assert.equal(z[0].range, null)
  assert.ok(resolveZones({ maxHr: 200 }).every((x) => x.range === null))
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

test('no existe ningún cálculo 220 - edad', async () => {
  const mod = await import('../src/lib/zones.js')
  assert.equal(mod.effectiveMaxHr, undefined)
})

test('ritmos m:ss: se leen, se validan y se muestran', () => {
  assert.equal(parsePace('4:25'), 265)
  assert.equal(parsePace(' 5:00 '), 300)
  assert.equal(parsePace('4:60'), null)
  assert.equal(parsePace('425'), null)
  assert.equal(parsePace('1:00'), null)
  assert.equal(formatPaceSec(265), '4:25')
  assert.equal(formatPaceSec(null), '—')
})

test('las zonas pueden llevar ritmo y se conserva al limpiar y resolver', () => {
  const { zones, errors } = parseManualForm({ Z2: { lo: '125', hi: '140', pace_from: '5:10', pace_to: '5:40' } })
  assert.deepEqual(errors, {})
  assert.deepEqual(zones.Z2, { lo: 125, hi: 140, pace_from: 310, pace_to: 340 })
  assert.deepEqual(sanitizeManualZones(zones).Z2, zones.Z2)
  assert.deepEqual(resolveZones({ maxHr: 190, manualZones: zones })[1].pace, [310, 340])
  assert.equal(resolveZones({ maxHr: 190, manualZones: { Z1: { lo: 100, hi: 120 } } })[0].pace, null)
})

test('errores de ritmo: uno solo, formato y orden', () => {
  const e = (f) => parseManualForm({ Z1: { lo: '100', hi: '120', ...f } }).errors.Z1?.key
  assert.equal(e({ pace_from: '5:00' }), 'zones.err.pacePair')
  assert.equal(e({ pace_from: '5', pace_to: '6' }), 'zones.err.paceFormat')
  assert.equal(e({ pace_from: '6:00', pace_to: '5:00' }), 'zones.err.paceOrder')
  assert.equal(e({}), undefined)
})

test('avisos de solape y desorden', () => {
  assert.equal(manualZoneWarnings({ Z1: { lo: 100, hi: 120 }, Z2: { lo: 125, hi: 140 } }).length, 0)
  assert.equal(manualZoneWarnings({ Z1: { lo: 100, hi: 120 }, Z2: { lo: 110, hi: 140 } }).length, 1)
  assert.equal(manualZoneWarnings({ Z1: { lo: 100, hi: 120 }, Z2: { lo: 90, hi: 95 } }).length, 1)
})

import { pickMaxHr } from '../src/lib/zones.js'
import { hrvTrend } from '../src/lib/hrv.js'

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
