// Escritura en Supabase de una plantilla aplicada al calendario de un atleta.
import { supabase } from '../supabaseClient'
import { dateForWeekday } from './dates'
import { applicationToRpc, buildApplication } from './templates'

async function loadPlanContext(athleteId) {
  const { data: plans, error } = await supabase
    .from('training_plans')
    .select('*')
    .eq('athlete_id', athleteId)
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
  if (preview.errors.length) {
    // El error lleva la clave de traducción: la pantalla lo muestra en el idioma activo.
    throw Object.assign(new Error(preview.errors[0].key), { i18n: preview.errors[0] })
  }

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

// folderId: undefined = no cambia la carpeta · null = sin carpeta · uuid = esa carpeta
export async function saveLibraryItem({ id, coachId, kind, name, description, tags, payload, folderId }) {
  const row = {
    coach_id: coachId,
    kind,
    name: String(name).trim(),
    description: String(description || '').trim() || null,
    tags: (tags || []).map((t) => t.trim()).filter(Boolean).slice(0, 12),
    payload,
    updated_at: new Date().toISOString(),
  }
  if (folderId !== undefined) row.folder_id = folderId || null
  const query = id
    ? supabase.from('library_items').update(row).eq('id', id)
    : supabase.from('library_items').insert(row)
  const { data, error } = await query.select().single()
  if (error) throw new Error(error.message)
  return data
}

// ---------------------------------------------------------------------------
// Carpetas de la biblioteca (migración 0011)
// ---------------------------------------------------------------------------
export async function fetchFolders() {
  const { data, error } = await supabase.from('library_folders').select('*').order('name')
  if (error) return { folders: [], available: false }
  return { folders: data || [], available: true }
}

export async function createFolder(coachId, name) {
  const { data, error } = await supabase
    .from('library_folders')
    .insert({ coach_id: coachId, name: String(name).trim() })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function renameFolder(id, name) {
  const { error } = await supabase.from('library_folders').update({ name: String(name).trim() }).eq('id', id)
  if (error) throw error
}

export async function deleteFolder(id) {
  const { error } = await supabase.from('library_folders').delete().eq('id', id)
  if (error) throw error
}

export async function moveItemToFolder(itemId, folderId) {
  const { error } = await supabase.from('library_items').update({ folder_id: folderId || null }).eq('id', itemId)
  if (error) throw error
}

// Sesiones sin fecha -> fecha según su semana y «Día N» (Día 1 = lunes). Devuelve el error o null.
export async function placeUndatedSessions(sessions, startISO) {
  const targets = sessions.filter((s) => !s.session_date)
  const results = await Promise.all(
    targets.map((s) =>
      supabase
        .from('sessions')
        .update({ session_date: dateForWeekday(startISO, Math.max(1, s.week_number), Math.min(6, Math.max(0, (s.day_number || 1) - 1))) })
        .eq('id', s.id)
    )
  )
  return results.find((r) => r.error)?.error || null
}
