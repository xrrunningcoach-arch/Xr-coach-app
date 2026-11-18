// Plan y calendario son los MISMOS datos (sessions.session_date). Estas utilidades
// ayudan a que ambas pestañas del entrenador se mantengan enlazadas.
import { addDays, dateForWeekday, mondayOf, todayISO } from './dates'

// Lunes de la próxima semana: fecha de inicio por defecto de un plan nuevo.
export const nextMondayISO = (today = todayISO()) => addDays(mondayOf(today), 7)

// Primer y último día (lunes y domingo) de una semana del plan.
export function weekBounds(planStart, week) {
  return { from: dateForWeekday(planStart, week, 0), to: dateForWeekday(planStart, week, 6) }
}

// Ordena las sesiones de una semana por fecha y, a igualdad, por «Día N».
export const sortByDate = (list) =>
  [...list].sort(
    (a, b) => String(a.session_date || '9999').localeCompare(String(b.session_date || '9999')) || (a.day_number || 0) - (b.day_number || 0)
  )
