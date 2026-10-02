// Funciones puras para agregar la carga de entrenamiento (session_load /
// impact_load) que calcula la base de datos (ver
// supabase/migrations/0002_multidisciplinary.sql). No hacen red: reciben
// las sesiones ya cargadas y devuelven totales por semana.

// Agrupa la carga real (session_load / impact_load) por semana. Las
// sesiones sin rpe_actual_value + duration_actual_min todavía no tienen
// carga calculada (no se ha registrado) y no entran en la suma: no se
// inventa una carga estimada.
export function weeklyLoad(sessions) {
  const byWeek = {}
  sessions.forEach((s) => {
    if (!byWeek[s.week_number]) {
      byWeek[s.week_number] = { week: s.week_number, load: 0, impactLoad: 0, loggedSessions: 0 }
    }
    if (s.session_load != null) {
      byWeek[s.week_number].load += Number(s.session_load)
      byWeek[s.week_number].impactLoad += Number(s.impact_load) || 0
      byWeek[s.week_number].loggedSessions += 1
    }
  })
  return Object.values(byWeek).sort((a, b) => a.week - b.week)
}

// Porcentaje (0-100) respecto al máximo de un conjunto de semanas, para
// dibujar las barras de carga sin depender de un valor absoluto fijo.
export function loadBarWidth(value, maxValue) {
  if (!maxValue || maxValue <= 0) return 0
  return Math.max(4, Math.round((value / maxValue) * 100))
}
