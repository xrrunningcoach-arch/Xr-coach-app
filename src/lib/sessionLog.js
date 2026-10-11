// Registro del entrenamiento por el atleta: SOLO esfuerzo (RPE), enlace y notas.
// Funciones puras (sin red) para poder probarlas. Los componentes llaman a
// supabase.rpc('submit_session', buildSubmitParams(...)).

// El atleta pega a veces «strava.com/activities/123» sin https://.
export function cleanLink(value) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  return /^https?:\/\//i.test(s) ? s : `https://${s}`
}

// status = 'completado' | 'saltado'. Al guardar un registro la sesión pasa a
// «completado» sin que el atleta tenga que tocar ningún estado.
export function buildSubmitParams(session, { status, rpe = '', notes = '', link = '' }) {
  const done = status === 'completado'
  const hasRpe = rpe !== '' && rpe != null && Number.isFinite(Number(rpe))
  return {
    p_session_id: session.id,
    p_status: status,
    p_rpe_actual: done && hasRpe ? `RPE ${Number(rpe)}` : session.rpe_actual || '',
    p_notes: String(notes ?? '').trim(),
    p_link_url: cleanLink(link),
    // null = no cambia lo que ya hubiera (la función SQL usa coalesce).
    p_duration_actual_min: null,
    p_rpe_actual_value: done && hasRpe ? Number(rpe) : null,
    // La función SQL sustituye metrics_actual: se reenvía el valor actual.
    p_metrics: session.metrics_actual || {},
    p_distance_actual_km: null,
    p_avg_hr_actual: null,
  }
}
