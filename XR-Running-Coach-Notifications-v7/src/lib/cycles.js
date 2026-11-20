// Fechas de macrociclos y mesociclos. Un ciclo puede tener fechas propias
// (start_date / end_date) y/o semanas del plan (week_start / week_end). Si el
// plan tiene fecha de inicio, ambas formas se convierten entre sí.
import { dateForWeekday, isISO, weekNumberFor } from './dates'

export function cycleDatesFromWeeks(planStart, weekStart, weekEnd) {
  const ws = Number(weekStart)
  const we = Number(weekEnd)
  if (!isISO(planStart) || !Number.isInteger(ws) || !Number.isInteger(we) || ws < 1 || we < ws) {
    return { start_date: null, end_date: null }
  }
  return { start_date: dateForWeekday(planStart, ws, 0), end_date: dateForWeekday(planStart, we, 6) }
}

export function cycleWeeksFromDates(planStart, startISO, endISO) {
  if (!isISO(planStart) || !isISO(startISO) || !isISO(endISO)) return null
  const ws = weekNumberFor(startISO, planStart)
  const we = weekNumberFor(endISO, planStart)
  if (ws < 1 || we < ws) return null
  return { week_start: ws, week_end: we }
}

// Rango [desde, hasta] de fechas de un ciclo: las suyas propias o, si no las
// tiene, las derivadas de sus semanas.
export function cycleRange(cycle, planStart) {
  if (!cycle) return null
  if (isISO(cycle.start_date) && isISO(cycle.end_date)) return [cycle.start_date, cycle.end_date]
  if (isISO(planStart) && cycle.week_start >= 1 && cycle.week_end >= cycle.week_start) {
    const { start_date, end_date } = cycleDatesFromWeeks(planStart, cycle.week_start, cycle.week_end)
    if (start_date) return [start_date, end_date]
  }
  return null
}

export function cycleContains(cycle, iso, planStart) {
  const range = cycleRange(cycle, planStart)
  return !!range && iso >= range[0] && iso <= range[1]
}

// Ciclo que contiene una fecha. Si hay solapes, gana el más corto (el más
// concreto); si siguen empatando, el de mayor order_index (el más reciente).
export function cycleForDate(cycles, iso, planStart) {
  const hits = (cycles || []).filter((c) => cycleContains(c, iso, planStart))
  if (hits.length === 0) return null
  const span = (c) => {
    const [a, b] = cycleRange(c, planStart)
    return b < a ? 0 : (new Date(b) - new Date(a)) / 86400000
  }
  return hits.sort((a, b) => span(a) - span(b) || (b.order_index || 0) - (a.order_index || 0))[0]
}

// Otros ciclos del mismo tipo con los que se solapa un rango (aviso, no error).
export function overlappingCycles(cycles, range, planStart, ignoreId) {
  if (!range) return []
  return (cycles || []).filter((c) => {
    if (c.id === ignoreId) return false
    const r = cycleRange(c, planStart)
    return !!r && r[0] <= range[1] && r[1] >= range[0]
  })
}
