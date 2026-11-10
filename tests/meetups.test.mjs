import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseCoords, mapsViewUrl, mapsDirectionsUrl, suggestDisplayName, buildMeetupRow, joinState, spotsLeft,
  filterMeetups, localInputToISO, isoToLocalInput, defaultStartLocal, paceRangeParts, formatWhen,
} from '../src/lib/meetups.js'
import esQd from '../src/i18n/quedadas.es.js'
import euQd from '../src/i18n/quedadas.eu.js'
import esBase from '../src/i18n/es.js'
import euBase from '../src/i18n/eu.js'

const now = new Date(2026, 10, 7, 12, 0).getTime() // 7 nov 2026, 12:00 locales
const good = {
  title: ' Rodaje suave ', description: '', discipline_code: 'running', starts_local: '2026-11-10T19:00',
  duration_min: '60', distance_km: '8,5', pace_from: '5:10', pace_to: '5:40', level: 'all',
  max_participants: '8', point_id: '', place_name: 'Plaza', coords: '43.2831, -2.1234',
}
const ctx = { organizerId: 'u1', communityId: 'c1', points: [], now }
const keys = (form, extra = {}) => buildMeetupRow({ ...good, ...form }, { ...ctx, ...extra }).errors.map((e) => e.key)

test('nombre visible: nombre + inicial del primer apellido', () => {
  assert.equal(suggestDisplayName('Xabat Elortza Rubio'), 'Xabat E.')
  assert.equal(suggestDisplayName('  Maite  '), 'Maite')
  assert.equal(suggestDisplayName(null), '')
})

test('coordenadas pegadas desde Google Maps', () => {
  assert.deepEqual(parseCoords('43.2831, -2.1234'), { lat: 43.2831, lng: -2.1234 })
  assert.deepEqual(parseCoords('43.2831 -2.1234'), { lat: 43.2831, lng: -2.1234 })
  assert.equal(parseCoords('abc'), null)
  assert.equal(parseCoords('95, 10'), null)
  assert.equal(parseCoords(''), null)
})

test('enlaces de Google Maps: con coordenadas o con nombre del lugar', () => {
  const withCoords = { lat: 43.2831, lng: -2.1234, place_name: 'Plaza' }
  assert.equal(mapsViewUrl(withCoords), 'https://www.google.com/maps/search/?api=1&query=43.2831%2C-2.1234')
  assert.ok(mapsDirectionsUrl(withCoords).startsWith('https://www.google.com/maps/dir/?api=1&destination=43.2831%2C-2.1234'))
  const byName = { lat: null, lng: null, place_name: 'Frontón' }
  assert.ok(mapsViewUrl(byName, 'Orio').includes(encodeURIComponent('Frontón, Orio')))
})

test('formulario válido produce la fila esperada', () => {
  const { errors, row } = buildMeetupRow(good, ctx)
  assert.deepEqual(errors, [])
  assert.equal(row.title, 'Rodaje suave')
  assert.equal(row.distance_km, 8.5)
  assert.equal(row.pace_min_s_km, 310)
  assert.equal(row.pace_max_s_km, 340)
  assert.equal(row.max_participants, 8)
  assert.equal(row.lat, 43.2831)
  assert.equal(row.starts_at, new Date(2026, 10, 10, 19, 0).toISOString())
  assert.equal(row.organizer_id, 'u1')
  assert.equal(row.description, null)
})

test('errores del formulario', () => {
  assert.deepEqual(keys({ title: 'ab' }), ['qd.err.title'])
  assert.deepEqual(keys({ starts_local: '' }), ['qd.err.start'])
  assert.deepEqual(keys({ starts_local: '2026-11-06T19:00' }), ['qd.err.startPast'])
  assert.deepEqual(keys({ starts_local: '2027-03-01T19:00' }), ['qd.err.startFar'])
  assert.deepEqual(keys({ duration_min: '5' }), ['qd.err.duration'])
  assert.deepEqual(keys({ distance_km: '0' }), ['qd.err.distance'])
  assert.deepEqual(keys({ pace_to: '' }), ['qd.err.pacePair'])
  assert.deepEqual(keys({ pace_from: '5', pace_to: '6' }), ['qd.err.paceFormat'])
  assert.deepEqual(keys({ pace_from: '6:00', pace_to: '5:00' }), ['qd.err.paceOrder'])
  assert.deepEqual(keys({ max_participants: '1' }), ['qd.err.max'])
  assert.deepEqual(keys({ place_name: '' }), ['qd.err.place'])
  assert.deepEqual(keys({ coords: 'xx' }), ['qd.err.coords'])
})

test('ritmos y distancia son opcionales', () => {
  const { errors, row } = buildMeetupRow({ ...good, pace_from: '', pace_to: '', distance_km: '' }, ctx)
  assert.deepEqual(errors, [])
  assert.equal(row.pace_min_s_km, null)
  assert.equal(row.distance_km, null)
})

test('un punto de encuentro curado manda sobre el lugar escrito', () => {
  const points = [{ id: 'p1', name: 'Frontón', lat: '43.1', lng: '-2.1' }]
  const { errors, row } = buildMeetupRow({ ...good, point_id: 'p1', place_name: '', coords: '' }, { ...ctx, points })
  assert.deepEqual(errors, [])
  assert.equal(row.meeting_point_id, 'p1')
  assert.equal(row.place_name, 'Frontón')
  assert.equal(row.lat, 43.1)
})

test('fecha local <-> ISO es ida y vuelta y la de por defecto es futura', () => {
  assert.equal(isoToLocalInput(localInputToISO('2026-11-10T19:00')), '2026-11-10T19:00')
  assert.equal(localInputToISO('nada'), null)
  assert.equal(defaultStartLocal(new Date(2026, 10, 7, 12, 0)), '2026-11-08T19:00')
  assert.match(formatWhen(new Date(2026, 10, 14, 19, 0).toISOString(), 'es'), /19:00/)
})

test('estado de una quedada y plazas', () => {
  const m = { status: 'open', starts_at: new Date(now + 3600e3).toISOString(), organizer_id: 'u1', max_participants: 3 }
  const st = (extra, count = 1, joined = false, userId = 'u2') => joinState({ meetup: { ...m, ...extra }, userId, count, joined, now })
  assert.equal(st({}), 'open')
  assert.equal(st({}, 1, true), 'joined')
  assert.equal(st({}, 3), 'full')
  assert.equal(st({}, 1, true, 'u1'), 'organizer')
  assert.equal(st({ status: 'cancelled' }), 'cancelled')
  assert.equal(st({ starts_at: new Date(now - 1000).toISOString() }), 'past')
  assert.equal(spotsLeft(m, 2), 1)
  assert.equal(spotsLeft(m, 5), 0)
  assert.deepEqual(paceRangeParts({ pace_min_s_km: 310, pace_max_s_km: 340 }), { from: '5:10', to: '5:40' })
  assert.equal(paceRangeParts({ pace_min_s_km: null, pace_max_s_km: null }), null)
})

test('filtros por día y disciplina', () => {
  const at = (d, h, code) => ({ discipline_code: code, starts_at: new Date(2026, 10, d, h, 0).toISOString() })
  const list = [at(7, 19, 'running'), at(9, 19, 'swim'), at(20, 19, 'running')]
  const today = new Date(2026, 10, 7, 12, 0)
  assert.equal(filterMeetups(list, { day: 'today' }, today).length, 1)
  assert.equal(filterMeetups(list, { day: 'week' }, today).length, 2)
  assert.equal(filterMeetups(list, { discipline: 'running' }, today).length, 2)
  assert.equal(filterMeetups(list, {}, today).length, 3)
})

// --------------------------------------------------------------- traducciones
const placeholders = (v) => (typeof v === 'string' ? v : Object.values(v).join(' ')).match(/\{\w+\}/g)?.sort().join(',') || ''

test('quedadas: euskera y castellano tienen las mismas claves y marcadores', () => {
  assert.deepEqual(Object.keys(esQd).filter((k) => !(k in euQd)), [])
  assert.deepEqual(Object.keys(euQd).filter((k) => !(k in esQd)), [])
  for (const k of Object.keys(esQd)) assert.equal(placeholders(euQd[k]), placeholders(esQd[k]), `marcadores distintos en "${k}"`)
})

test('quedadas: sin textos vacíos, plurales completos y sin pisar claves existentes', () => {
  for (const [name, d] of [['es', esQd], ['eu', euQd]]) {
    for (const [k, v] of Object.entries(d)) {
      const text = typeof v === 'string' ? v : Object.values(v).join('')
      assert.ok(text.trim().length > 0, `${name}:${k} vacía`)
      if (typeof v === 'object') assert.ok('one' in v && 'other' in v, `${name}:${k} plural incompleto`)
    }
  }
  assert.deepEqual(Object.keys(esQd).filter((k) => k in esBase), [])
  assert.deepEqual(Object.keys(euQd).filter((k) => k in euBase), [])
})
