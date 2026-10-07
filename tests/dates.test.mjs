import test from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays, diffDays, mondayOf, weekdayIndex, isISO, weekNumberFor, dateForWeekday, monthMatrix,
  todayISO, setDateLang, longDayTitle, shortDate, monthTitle, WEEKDAY_SHORT, weekRangeTitle,
} from '../src/lib/dates.js'

test('aritmética de fechas no se ve afectada por el cambio de hora', () => {
  assert.equal(addDays('2026-03-28', 2), '2026-03-30') // cambio a verano
  assert.equal(addDays('2026-10-24', 2), '2026-10-26') // cambio a invierno
  assert.equal(diffDays('2026-10-26', '2026-10-24'), 2)
})

test('las semanas empiezan en lunes', () => {
  assert.equal(weekdayIndex('2026-10-05'), 0) // lunes
  assert.equal(weekdayIndex('2026-10-11'), 6) // domingo
  assert.equal(mondayOf('2026-10-11'), '2026-10-05')
  assert.equal(mondayOf('2026-10-05'), '2026-10-05')
})

test('isISO valida formato y fechas reales', () => {
  assert.ok(isISO('2026-02-28'))
  assert.ok(!isISO('2026-13-01'))
  assert.ok(!isISO('2026-02-31'))
  assert.ok(!isISO('28/02/2026'))
  assert.ok(!isISO(null))
})

test('número de semana del plan y vuelta atrás', () => {
  const start = '2026-10-07' // miércoles -> semana 1 empieza el lunes 5
  assert.equal(weekNumberFor('2026-10-07', start), 1)
  assert.equal(weekNumberFor('2026-10-12', start), 2)
  assert.equal(weekNumberFor('2026-10-04', start), 0)
  assert.equal(dateForWeekday(start, 2, 0), '2026-10-12')
  assert.equal(dateForWeekday(start, 1, 6), '2026-10-11')
})

test('monthMatrix devuelve semanas completas lunes-domingo', () => {
  const m = monthMatrix(2026, 9) // octubre
  assert.ok(m.length >= 5)
  m.forEach((week) => assert.equal(week.length, 7))
})

test('todayISO usa la fecha local, no UTC', () => {
  assert.equal(todayISO(new Date(2026, 9, 6, 0, 30)), '2026-10-06')
  assert.equal(todayISO(new Date(2026, 9, 6, 23, 59)), '2026-10-06')
})

test('fechas en euskera y vuelta a castellano', () => {
  setDateLang('eu')
  assert.equal(WEEKDAY_SHORT[0], 'Al')
  assert.equal(longDayTitle('2026-10-06'), 'Asteartea, urriaren 6a')
  assert.equal(shortDate('2026-10-06'), 'urr 6')
  assert.equal(monthTitle('2026-10-06'), '2026ko urria')
  assert.ok(weekRangeTitle('2026-10-05').includes('urr'))
  setDateLang('es')
  assert.equal(WEEKDAY_SHORT[0], 'Lun')
  assert.match(longDayTitle('2026-10-06'), /^Martes/)
})
