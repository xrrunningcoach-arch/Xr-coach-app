import test from 'node:test'
import assert from 'node:assert/strict'
import es from '../src/i18n/es.js'
import eu from '../src/i18n/eu.js'

const placeholders = (v) => (typeof v === 'string' ? v : Object.values(v).join(' ')).match(/\{\w+\}/g)?.sort().join(',') || ''

test('euskera y castellano tienen exactamente las mismas claves', () => {
  const missingEu = Object.keys(es).filter((k) => !(k in eu))
  const extraEu = Object.keys(eu).filter((k) => !(k in es))
  assert.deepEqual(missingEu, [], `Faltan en euskera: ${missingEu.join(', ')}`)
  assert.deepEqual(extraEu, [], `Sobran en euskera: ${extraEu.join(', ')}`)
})

test('ninguna traducción está vacía', () => {
  for (const [name, d] of [['es', es], ['eu', eu]]) {
    for (const [k, v] of Object.entries(d)) {
      const text = typeof v === 'string' ? v : Object.values(v).join('')
      assert.ok(text.trim().length > 0, `${name}:${k} vacía`)
    }
  }
})

test('los marcadores {param} coinciden entre idiomas', () => {
  for (const k of Object.keys(es)) {
    if (!(k in eu)) continue
    assert.equal(placeholders(eu[k]), placeholders(es[k]), `marcadores distintos en "${k}"`)
  }
})

test('los plurales tienen one y other en ambos idiomas', () => {
  for (const [name, d] of [['es', es], ['eu', eu]]) {
    for (const [k, v] of Object.entries(d)) {
      if (typeof v === 'object') {
        assert.ok('one' in v && 'other' in v, `${name}:${k} plural incompleto`)
      }
    }
  }
})
