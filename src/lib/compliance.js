// Cumplimiento y alertas del entrenador. Funciones puras (sin red): reciben
// los atletas, sus planes y sus sesiones recientes y devuelven, por atleta, qué
// pasa y con qué urgencia. Así se pueden probar y ajustar los umbrales aquí.
import { addDays, diffDays, mondayOf } from './dates'

export const THRESHOLDS = {
  windowDays: 14, // ventana de cumplimiento
  overdueHigh: 3, // sesiones sin registrar para alerta roja
  overdueGraceDays: 1, // una sesión de ayer aún no cuenta como "olvidada"
  complianceHigh: 0.5, // < 50 % = rojo
  complianceMedium: 0.75, // < 75 % = ámbar
  minSessionsForRate: 3, // con menos sesiones no se calcula porcentaje
  inactiveHigh: 7, // días sin completar nada = rojo
  inactiveMedium: 4,
  highRpe: 9,
  highRpeCount: 2,
}

const LEVEL_ORDER = { high: 0, medium: 1, ok: 2, none: 3 }

// athletes: [{ id, ... }]   plans: [{ athlete_id, status, id }]
// sessions: [{ plan_id, session_date, status, completed_at, rpe_actual_value }]
export function computeCompliance({ athletes, plans, sessions, today, t = THRESHOLDS }) {
  const from = addDays(today, -t.windowDays)
  const monday = mondayOf(today)
  const sunday = addDays(monday, 6)
  const horizon = addDays(today, 7)

  return athletes.map((athlete) => {
    const plan = plans.find((p) => p.athlete_id === athlete.id && p.status === 'active') || null
    const reasons = []
    if (!plan) {
      return { athlete, plan: null, level: 'none', reasons: [{ code: 'noPlan' }], overdue: 0, rate: null, lastActivityDays: null, week: { done: 0, total: 0 } }
    }

    const mine = sessions.filter((s) => s.plan_id === plan.id && s.session_date)
    const past = mine.filter((s) => s.session_date >= from && s.session_date < today)
    const done = past.filter((s) => s.status === 'completado').length
    const skipped = past.filter((s) => s.status === 'saltado').length
    const rate = past.length >= t.minSessionsForRate ? done / past.length : null

    const overdueAll = past.filter((s) => s.status === 'pendiente')
    const overdue = overdueAll.filter((s) => diffDays(today, s.session_date) > t.overdueGraceDays).length

    const completedDates = mine
      .filter((s) => s.status === 'completado')
      .map((s) => String(s.completed_at || s.session_date).slice(0, 10))
      .sort()
    const last = completedDates[completedDates.length - 1] || null
    const lastActivityDays = last ? Math.max(0, diffDays(today, last)) : null

    const weekSessions = mine.filter((s) => s.session_date >= monday && s.session_date <= sunday)
    const week = { done: weekSessions.filter((s) => s.status === 'completado').length, total: weekSessions.length }

    const upcoming = mine.filter((s) => s.session_date >= today && s.session_date <= horizon).length
    const hardWeek = mine.filter(
      (s) => s.status === 'completado' && s.session_date > addDays(today, -7) && Number(s.rpe_actual_value) >= t.highRpe
    ).length

    let level = 'ok'
    const raise = (l) => {
      if (LEVEL_ORDER[l] < LEVEL_ORDER[level]) level = l
    }

    if (overdue > 0) {
      reasons.push({ code: 'overdue', count: overdue })
      raise(overdue >= t.overdueHigh ? 'high' : 'medium')
    }
    if (rate !== null && rate < t.complianceMedium) {
      reasons.push({ code: 'lowCompliance', pct: Math.round(rate * 100) })
      raise(rate < t.complianceHigh ? 'high' : 'medium')
    }
    if (skipped >= 2) {
      reasons.push({ code: 'skipped', count: skipped })
      raise('medium')
    }
    // Inactividad: solo si había sesiones esperadas en la ventana.
    if (past.length > 0 && (lastActivityDays === null || lastActivityDays >= t.inactiveMedium)) {
      const days = lastActivityDays === null ? t.windowDays : lastActivityDays
      reasons.push({ code: 'inactive', days })
      raise(days >= t.inactiveHigh ? 'high' : 'medium')
    }
    if (hardWeek >= t.highRpeCount) {
      reasons.push({ code: 'highRpe', count: hardWeek })
      raise('medium')
    }
    if (upcoming === 0) {
      reasons.push({ code: 'noUpcoming' })
      raise('medium')
    }

    return { athlete, plan, level, reasons, overdue, rate, lastActivityDays, week }
  })
}

// Más urgentes primero; a igualdad, más sesiones sin registrar.
export function sortByUrgency(rows) {
  return [...rows].sort(
    (a, b) =>
      LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] ||
      b.overdue - a.overdue ||
      String(a.athlete.full_name || '').localeCompare(String(b.athlete.full_name || ''))
  )
}
