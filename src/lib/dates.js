// Utilidades de fechas para el calendario. Todo trabaja con cadenas ISO
// "YYYY-MM-DD" y aritmética en UTC, así el horario de verano no desplaza días.
// Las semanas empiezan en lunes (calendario europeo).

const MS_DAY = 86400000

export function parseISO(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function toISO(date) {
  return date.toISOString().slice(0, 10)
}

export function isISO(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parseISO(value).getTime())
}

export function addDays(iso, n) {
  return toISO(new Date(parseISO(iso).getTime() + n * MS_DAY))
}

export function diffDays(a, b) {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / MS_DAY)
}

// 0 = lunes ... 6 = domingo
export function weekdayIndex(iso) {
  return (parseISO(iso).getUTCDay() + 6) % 7
}

export function mondayOf(iso) {
  return addDays(iso, -weekdayIndex(iso))
}

// Fecha de HOY según el reloj del dispositivo (no UTC): a las 00:30 en
// España sigue siendo "hoy", no "ayer".
export function todayISO(now = new Date()) {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function msUntilNextMidnight(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return Math.max(1000, next.getTime() - now.getTime())
}

// Número de semana del plan (1, 2, 3…) al que pertenece una fecha. La semana 1
// es la semana lunes-domingo que contiene la fecha de inicio del plan.
export function weekNumberFor(dateISO, planStartISO) {
  if (!isISO(dateISO) || !isISO(planStartISO)) return null
  return Math.floor(diffDays(mondayOf(dateISO), mondayOf(planStartISO)) / 7) + 1
}

// Fecha de un día concreto de una semana del plan (weekday 0 = lunes).
export function dateForWeekday(planStartISO, week, weekday) {
  return addDays(mondayOf(planStartISO), (week - 1) * 7 + weekday)
}

// Qué columnas de una sesión hay que guardar al colocarla en una fecha.
// day_number pasa a significar "día de la semana" (1 = lunes ... 7 = domingo),
// que es lo que ya sugería la etiqueta «Día N» de las tarjetas.
export function placementFor(dateISO, planStartISO, current = {}) {
  const placement = {
    session_date: dateISO,
    day_number: weekdayIndex(dateISO) + 1,
    week_number: current.week_number ?? 1,
  }
  const week = weekNumberFor(dateISO, planStartISO)
  if (week != null) placement.week_number = Math.max(1, week)
  return placement
}

// Cuadrícula de un mes: array de semanas, cada una con 7 fechas ISO
// (incluye los días de relleno del mes anterior y siguiente).
export function monthMatrix(year, monthIndex) {
  const first = toISO(new Date(Date.UTC(year, monthIndex, 1)))
  let cursor = mondayOf(first)
  const weeks = []
  for (let w = 0; w < 6; w += 1) {
    const row = []
    for (let d = 0; d < 7; d += 1) {
      row.push(cursor)
      cursor = addDays(cursor, 1)
    }
    weeks.push(row)
    // Si la siguiente semana ya es íntegramente del mes siguiente, paramos.
    if (parseISO(cursor).getUTCMonth() !== monthIndex && weeks.length >= 4) break
  }
  return weeks
}

export function weekDays(mondayISO) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayISO, i))
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const fmt = (opts, iso) => new Intl.DateTimeFormat('es-ES', { ...opts, timeZone: 'UTC' }).format(parseISO(iso))

export const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
export const WEEKDAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

export function monthTitle(iso) {
  return cap(fmt({ month: 'long', year: 'numeric' }, iso).replace(' de ', ' '))
}

export function dayNumber(iso) {
  return parseISO(iso).getUTCDate()
}

export function longDayTitle(iso) {
  return cap(fmt({ weekday: 'long', day: 'numeric', month: 'long' }, iso))
}

export function shortDate(iso) {
  return fmt({ day: 'numeric', month: 'short' }, iso).replace('.', '')
}

export function weekRangeTitle(mondayISO) {
  const end = addDays(mondayISO, 6)
  const sameMonth = parseISO(mondayISO).getUTCMonth() === parseISO(end).getUTCMonth()
  const startPart = sameMonth ? String(dayNumber(mondayISO)) : shortDate(mondayISO)
  return `${startPart} – ${shortDate(end)} ${parseISO(end).getUTCFullYear()}`
}

export function monthKey(iso) {
  return String(iso).slice(0, 7)
}
