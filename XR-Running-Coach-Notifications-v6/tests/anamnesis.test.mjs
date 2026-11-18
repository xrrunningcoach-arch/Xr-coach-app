import test from 'node:test'
import assert from 'node:assert/strict'
import { profileFromAnamnesis, PROFILE_FIELD_SOURCES, ANAMNESIS_QUESTIONS } from '../src/lib/anamnesis.js'

test('cada pregunta alimenta como mucho un campo del perfil y existe', () => {
  const seen = new Set()
  Object.values(PROFILE_FIELD_SOURCES).flat().forEach((n) => {
    assert.ok(ANAMNESIS_QUESTIONS.some((q) => q.n === n), `la pregunta ${n} existe`)
    assert.ok(!seen.has(n), `la pregunta ${n} no se repite`)
    seen.add(n)
  })
})

test('un campo con una sola pregunta se copia tal cual', () => {
  const { profile } = profileFromAnamnesis({ 3: ' Bajar de 40 min en 10K ', 6: '21K: 1h40' })
  assert.equal(profile.main_goal, 'Bajar de 40 min en 10K')
  assert.equal(profile.personal_bests, '21K: 1h40')
})

test('varios campos agrupados llevan etiqueta, en el idioma pedido, y solo lo respondido', () => {
  const answers = { 10: 'Rodilla derecha', 12: '', 11: 'Fascitis en 2025' }
  const es = profileFromAnamnesis(answers, 'es').profile.injury_history
  assert.equal(es, 'Molestia actual: Rodilla derecha\nLesión en los últimos 2 años: Fascitis en 2025')
  const eu = profileFromAnamnesis(answers, 'eu').profile.injury_history
  assert.ok(eu.startsWith('Egungo molestia: Rodilla derecha'))
})

test('lo que no se responde no se toca (ningún campo vacío en el resultado)', () => {
  assert.deepEqual(profileFromAnamnesis({}), { profile: {}, basic: {} })
  assert.deepEqual(profileFromAnamnesis({ 3: '   ', 9: '' }).profile, {})
})

test('nombre y edad salen de las preguntas 1 y 2', () => {
  assert.deepEqual(profileFromAnamnesis({ 1: ' Maite Etxeberria ', 2: '34 años' }).basic, { full_name: 'Maite Etxeberria', age: 34 })
  assert.deepEqual(profileFromAnamnesis({ 2: 'treinta' }).basic, {})
  assert.deepEqual(profileFromAnamnesis({ 2: '250' }).basic, {})
})
