import { supabase } from '../supabaseClient'

// Derecho de acceso / portabilidad (RGPD arts. 15 y 20): reúne todo lo que la
// base de datos guarda del atleta en un único JSON descargable. Se apoya en la
// RLS: solo devuelve filas a las que el propio usuario tiene acceso.
async function rows(query) {
  const { data, error } = await query
  // Una tabla aún no creada (migración pendiente) no debe romper la descarga.
  return error ? [] : data || []
}

export async function collectAthleteData(userId) {
  const byAthlete = (table, col = 'athlete_id') => rows(supabase.from(table).select('*').eq(col, userId))

  const [profile, athleteProfile, anamnesis, manualZones, messages, plans, thresholdTests, hrv] = await Promise.all([
    byAthlete('profiles', 'id'),
    byAthlete('athlete_profiles', 'profile_id'),
    byAthlete('anamnesis'),
    byAthlete('athlete_hr_zones'),
    byAthlete('messages'),
    byAthlete('training_plans'),
    byAthlete('threshold_tests'),
    byAthlete('hrv_readings'),
  ])

  const planIds = plans.map((p) => p.id)
  const byPlan = (table) => (planIds.length ? rows(supabase.from(table).select('*').in('plan_id', planIds)) : [])
  const [sessions, hrZones, milestones, tests, macrocycles, mesocycles] = await Promise.all(
    ['sessions', 'hr_zones', 'milestones', 'tests', 'macrocycles', 'mesocycles'].map(byPlan)
  )

  const sessionIds = sessions.map((s) => s.id)
  const bySession = (table) => (sessionIds.length ? rows(supabase.from(table).select('*').in('session_id', sessionIds)) : [])
  const [exercises, evaluations] = await Promise.all([bySession('session_exercises'), bySession('session_evaluations')])

  return {
    exported_at: new Date().toISOString(),
    user_id: userId,
    profile: profile[0] || null,
    athlete_profile: athleteProfile[0] || null,
    anamnesis: anamnesis[0] || null,
    manual_hr_zones: manualZones,
    threshold_tests: thresholdTests,
    hrv_readings: hrv,
    training_plans: plans,
    macrocycles,
    mesocycles,
    sessions,
    session_exercises: exercises,
    session_evaluations: evaluations,
    plan_hr_zones: hrZones,
    milestones,
    field_tests: tests,
    messages,
  }
}

export function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
