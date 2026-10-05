// Escritura en Supabase de una plantilla aplicada al calendario de un atleta.
// Supabase no permite transacciones desde el navegador, así que si algo falla
// a mitad se borra lo que ya se había creado (deshacer manual) para no dejar
// un calendario a medias.
import { supabase } from '../supabaseClient'
import { buildApplication } from './templates'

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

export async function applyTemplateToAthlete({ item, athleteId, coachId, startDate, disciplines, macroChoice }) {
  const preview = await previewApplication({ item, athleteId, startDate, disciplines, macroChoice })
  if (preview.errors.length) throw new Error(preview.errors[0])

  const { application: app, plan: existingPlan } = preview
  const created = { plan: null, macro: null, mesos: [], sessions: [] }

  async function rollback() {
    if (created.sessions.length) await supabase.from('sessions').delete().in('id', created.sessions)
    if (created.mesos.length) await supabase.from('mesocycles').delete().in('id', created.mesos)
    if (created.macro) await supabase.from('macrocycles').delete().eq('id', created.macro)
    if (created.plan) await supabase.from('training_plans').delete().eq('id', created.plan)
  }

  try {
    let plan = existingPlan
    if (!plan) {
      const { data, error } = await supabase
        .from('training_plans')
        .insert({
          athlete_id: athleteId,
          coach_id: coachId,
          custom_race_name: item.name,
          start_date: preview.planStart,
          duration_weeks: Math.max(1, preview.lastWeek),
          status: 'active',
        })
        .select()
        .single()
      if (error) throw new Error(error.message)
      plan = data
      created.plan = data.id
    }

    let macroId = app.useMacroId
    if (app.macrocycle) {
      const { data, error } = await supabase
        .from('macrocycles')
        .insert({ ...app.macrocycle, plan_id: plan.id })
        .select()
        .single()
      if (error) throw new Error(error.message)
      macroId = data.id
      created.macro = data.id
    }

    const mesoIdByKey = {}
    if (app.mesocycles.length) {
      const { data, error } = await supabase
        .from('mesocycles')
        .insert(
          app.mesocycles.map(({ key, ...m }) => ({ ...m, plan_id: plan.id, macrocycle_id: macroId || null }))
        )
        .select()
      if (error) throw new Error(error.message)
      data.forEach((row) => {
        created.mesos.push(row.id)
        const src = app.mesocycles.find((m) => m.order_index === row.order_index)
        if (src) mesoIdByKey[src.key] = row.id
      })
    }

    const { data: sessionRows, error: sessErr } = await supabase
      .from('sessions')
      .insert(
        app.sessions.map((r) => ({
          ...r.session,
          plan_id: plan.id,
          mesocycle_id: r.mesoKey ? mesoIdByKey[r.mesoKey] || null : r.mesoId || null,
        }))
      )
      .select('id, session_date, day_number, week_number, created_at')
    if (sessErr) throw new Error(sessErr.message)
    sessionRows.forEach((row) => created.sessions.push(row.id))

    // Ejercicios de fuerza: se emparejan por posición (el insert devuelve las
    // filas en el mismo orden en que se enviaron).
    const exercisePayload = []
    app.sessions.forEach((r, i) => {
      const sessionId = sessionRows[i]?.id
      if (!sessionId) return
      ;(r.exercises || []).forEach((e) => exercisePayload.push({ ...e, session_id: sessionId }))
    })
    if (exercisePayload.length) {
      const { error } = await supabase.from('session_exercises').insert(exercisePayload)
      if (error) throw new Error(error.message)
    }

    const planUpdate = {}
    if (!plan.start_date) planUpdate.start_date = preview.planStart
    if (preview.lastWeek > (plan.duration_weeks || 0)) planUpdate.duration_weeks = preview.lastWeek
    if (Object.keys(planUpdate).length && !created.plan) {
      const { error } = await supabase.from('training_plans').update(planUpdate).eq('id', plan.id)
      if (error) throw new Error(error.message)
    }

    return { planId: plan.id, sessions: sessionRows.length, first: preview.first, last: preview.last }
  } catch (e) {
    await rollback()
    throw e
  }
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
