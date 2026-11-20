// Estadísticas del atleta a partir de sus sesiones. Funciones puras: reciben
// las sesiones ya cargadas y devuelven totales; no hacen red.
//
// De dónde sale cada dato (no se inventa ninguno):
//   Km          -> km_estimated; si no existe, metrics.distancia_km (bici) o
//                  metrics.distancia_m / 1000 (natación).
//   Tiempo      -> duration_planned_min (previsto). "Hecho" = sesiones
//                  completadas con duration_actual_min; si falta la real, se
//                  cuenta la prevista y se marca como estimada.
//   Desnivel +  -> metrics.desnivel_m (campo de la disciplina Carrera).
// "Hecho" siempre significa status = 'completado'.
import { addDays, diffDays, mondayOf, parseISO, shortDate, toISO } from './dates'

export function parseNum(value) {
  if (value == null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let s = String(value).trim().replace(/\s/g, '')
  // "1.200" o "1.200,5" -> separador de miles español
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.')
  else s = s.replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

export function sessionKm(s) {
  const direct = parseNum(s.km_estimated)
  if (direct != null) return direct
  const m = s.metrics || {}
  const km = parseNum(m.distancia_km)
  if (km != null) return km
  const meters = parseNum(m.distancia_m)
  return meters != null ? meters / 1000 : 0
}

// Km realmente hechos: si el atleta registró distancia real, esa; si no, lo previsto.
export function sessionKmDone(s) {
  if (s.status !== 'completado') return 0
  const actual = parseNum(s.distance_actual_km)
  return actual != null ? actual : sessionKm(s)
}

export function sessionElevation(s) {
  const m = s.metrics || {}
  return parseNum(m.desnivel_m) ?? parseNum(m.desnivel_positivo_m) ?? 0
}

export function sessionMinutes(s) {
  const planned = parseNum(s.duration_planned_min) ?? 0
  const isDone = s.status === 'completado'
  const actual = parseNum(s.duration_actual_min)
  return {
    planned,
    done: isDone ? (actual ?? planned) : 0,
    estimatedDone: isDone && actual == null && planned > 0,
  }
}

export const RANGE_OPTIONS = [
  { key: 'plan', label: 'Plan completo' },
  { key: 'month', label: 'Mes actual' },
  { key: '8w', label: 'Últimas 8 semanas' },
  { key: '4w', label: 'Últimas 4 semanas' },
]

// Ventana [from, to] de fechas para un rango, o null = sin límite.
export function resolveWindow(rangeKey, today) {
  if (rangeKey === 'month') {
    const d = parseISO(today)
    const from = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))
    const to = toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))
    return { from, to }
  }
  const weeks = rangeKey === '4w' ? 4 : rangeKey === '8w' ? 8 : null
  if (!weeks) return null
  const thisMonday = mondayOf(today)
  return { from: addDays(thisMonday, -(weeks - 1) * 7), to: addDays(thisMonday, 6) }
}

export function inWindow(s, win) {
  if (!win) return true
  if (!s.session_date) return false
  return s.session_date >= win.from && s.session_date <= win.to
}

export const NO_DISCIPLINE = { key: 'none', name: 'Sin disciplina', code: null }

function disciplineOf(s, disciplines) {
  const d = disciplines.find((x) => x.id === s.discipline_id)
  return d ? { key: d.id, name: d.name, code: d.code } : NO_DISCIPLINE
}

function round1(n) {
  return Math.round(n * 10) / 10
}

export function kmByDiscipline(sessions, disciplines) {
  const map = new Map()
  sessions.forEach((s) => {
    const km = sessionKm(s)
    if (km <= 0) return
    const d = disciplineOf(s, disciplines)
    if (!map.has(d.key)) map.set(d.key, { ...d, planned: 0, done: 0, count: 0, doneCount: 0 })
    const row = map.get(d.key)
    row.planned += km
    row.count += 1
    if (s.status === 'completado') {
      row.done += sessionKmDone(s)
      row.doneCount += 1
    }
  })
  return [...map.values()]
    .map((r) => ({ ...r, planned: round1(r.planned), done: round1(r.done) }))
    .sort((a, b) => b.planned - a.planned)
}

export function minutesByDiscipline(sessions, disciplines) {
  const map = new Map()
  sessions.forEach((s) => {
    const mins = sessionMinutes(s)
    if (mins.planned <= 0 && mins.done <= 0) return
    const d = disciplineOf(s, disciplines)
    if (!map.has(d.key)) map.set(d.key, { ...d, planned: 0, done: 0 })
    const row = map.get(d.key)
    row.planned += mins.planned
    row.done += mins.done
  })
  return [...map.values()].sort((a, b) => b.planned - a.planned)
}

// Serie semanal (lunes a domingo) de las sesiones con fecha. Rellena con ceros
// las semanas vacías entre la primera y la última para que el eje sea continuo.
export function weeklySeries(sessions, win) {
  const dated = sessions.filter((s) => s.session_date)
  if (dated.length === 0 && !win) return []
  const mondays = dated.map((s) => mondayOf(s.session_date)).sort()
  const first = win ? mondayOf(win.from) : mondays[0]
  const last = win ? mondayOf(win.to) : mondays[mondays.length - 1]
  const weeksCount = Math.min(104, Math.floor(diffDays(last, first) / 7) + 1)
  const rows = Array.from({ length: Math.max(weeksCount, 0) }, (_, i) => {
    const weekStart = addDays(first, i * 7)
    return {
      weekStart,
      label: shortDate(weekStart),
      plannedMin: 0, doneMin: 0, estimatedMin: 0,
      plannedKm: 0, doneKm: 0,
      plannedElev: 0, doneElev: 0,
      sessions: 0, doneSessions: 0,
    }
  })
  const index = new Map(rows.map((r, i) => [r.weekStart, i]))
  dated.forEach((s) => {
    const i = index.get(mondayOf(s.session_date))
    if (i == null) return
    const row = rows[i]
    const mins = sessionMinutes(s)
    const km = sessionKm(s)
    const elev = sessionElevation(s)
    row.plannedMin += mins.planned
    row.doneMin += mins.done
    if (mins.estimatedDone) row.estimatedMin += mins.done
    row.plannedKm += km
    row.plannedElev += elev
    row.sessions += 1
    if (s.status === 'completado') {
      row.doneKm += sessionKmDone(s)
      row.doneElev += elev
      row.doneSessions += 1
    }
  })
  return rows
}

export function cumulative(rows, key) {
  let acc = 0
  return rows.map((r) => {
    acc += r[key]
    return acc
  })
}

export function sum(rows, key) {
  return rows.reduce((t, r) => t + (r[key] || 0), 0)
}

// Sesiones con más desnivel positivo (para el detalle de la métrica).
export function topElevationSessions(sessions, limit = 5) {
  return sessions
    .map((s) => ({ s, elev: sessionElevation(s) }))
    .filter((x) => x.elev > 0)
    .sort((a, b) => b.elev - a.elev)
    .slice(0, limit)
}

export function formatDuration(minutes) {
  const total = Math.round(minutes || 0)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m} min`
  return `${h} h ${String(m).padStart(2, '0')} min`
}

// Ritmo medio "m:ss /km" a partir de minutos y km reales. '' si no hay datos.
export function formatPace(minutes, km) {
  const m = parseNum(minutes)
  const d = parseNum(km)
  if (m == null || d == null || d <= 0 || m <= 0) return ''
  const secPerKm = Math.round((m * 60) / d)
  return `${Math.floor(secPerKm / 60)}:${String(secPerKm % 60).padStart(2, '0')} /km`
}
