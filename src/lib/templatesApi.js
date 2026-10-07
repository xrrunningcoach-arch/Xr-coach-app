// Escritura en Supabase de una plantilla aplicada al calendario de un atleta.
import { supabase } from '../supabaseClient'
import { applicationToRpc, buildApplication } from './templates'

async function loadPlanContext(athleteId) {
  const { data: plans, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('athlete_id', athleteId)
    .in('status', ['active', 'draft'])
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const plan = plans?.[0] || null
  if (!plan) return { plan: null, existing: { mesocycles: [], macrocycles: [] } }
  const [{ data: mesocycles }, { data: macrocycles }] = await Promise.all([
    supabase.from('mesocycles').select('*').eq('plan_id', plan.id),
    supabase.from('macrocycles').select('*').eq('plan_id', plan.id),
  ])
  return { plan, existing: { mesocycles: mesocycles || [], macrocycles: macrocycles || [] } }
}

// Vista previa (no escribe): cuántas sesiones, qué fechas, qué avisos.
export async function previewApplication({ item, athleteId, startDate, disciplines, macroChoice }) {
  const { plan, existing } = await loadPlanContext(athleteId)
  const built = buildApplication({ item, startDate, plan, existing, disciplines, macroChoice })
  return { ...built, plan, existing }
}

// Escribe todo en UNA transacción de la base de datos (función
// apply_template_application, migración 0005): o se crea todo o no se crea nada.
export async function applyTemplateToAthlete({ item, athleteId, startDate, disciplines, macroChoice }) {
  const preview = await previewApplication({ item, athleteId, startDate, disciplines, macroChoice })
  if (preview.errors.length) throw new Error(preview.errors[0])

  const { data, error } = await supabase.rpc('apply_template_application', {
    p_athlete_id: athleteId,
    p_application: applicationToRpc({ preview, plan: preview.plan, item }),
  })
  if (error) throw new Error(error.message)

  return { planId: data?.plan_id, sessions: data?.sessions ?? preview.application.sessions.length, first: preview.first, last: preview.last }
}

// Ejercicios de fuerza de varias sesiones, agrupados por sesión (para
// guardarlos dentro de una plantilla).
export async function fetchExercisesBySession(sessionIds) {
  if (!sessionIds.length) return {}
  const { data, error } = await supabase
    .from('session_exercises')
    .select('*')
    .in('session_id', sessionIds)
    .order('order_index')
  if (error) throw new Error(error.message)
  const grouped = {}
  ;(data || []).forEach((e) => {
    if (!grouped[e.session_id]) grouped[e.session_id] = []
    grouped[e.session_id].push(e)
  })
  return grouped
}

export async function saveLibraryItem({ id, coachId, kind, name, description, tags, payload }) {
  const row = {
    coach_id: coachId,
    kind,
    name: String(name).trim(),
    description: String(description || '').trim() || null,
    tags: (tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 12),
    payload,
    updated_at: new Date().toISOString(),
  }
  const query = id
    ? supabase.from('library_items').update(row).eq('id', id)
    : supabase.from('library_items').insert(row)
  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)
  return data
}
