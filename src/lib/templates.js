// Plantillas de la Biblioteca del entrenador. Funciones puras (sin red):
// convierten sesiones/mesociclos/macrociclos reales en plantillas sin atleta
// y, al revés, calculan qué filas hay que crear para aplicar una plantilla en
// el calendario de un atleta.
//
// Formato del payload (jsonb en library_items.payload):
//   session:    { session: TplSession }
//   mesocycle:  { blocks: [Block] }                     (un bloque)
//   macrocycle: { objective, blocks: [Block, Block…] }  (varios bloques seguidos)
//   Block:      { name, focus, key_objective, weeks, sessions: [TplSession] }
//   TplSession: { week_offset, weekday, discipline_code, session_type,
//                 description, km_estimated, duration_planned_min,
//                 rpe_theoretical, metrics, exercises: [...] }
// week_offset: 0 = primera semana del bloque · weekday: 0 = lunes ... 6 = domingo
import { cycleForDate } from './cycles'
import { addDays, dateForWeekday, isISO, mondayOf, weekNumberFor, weekdayIndex } from './dates'

export const KINDS = [
  { id: 'session', label: 'Sesión suelta', short: 'Sesión' },
  { id: 'mesocycle', label: 'Plan / mesociclo', short: 'Mesociclo' },
  { id: 'macrocycle', label: 'Proyecto / macrociclo', short: 'Macrociclo' },
]

export function kindLabel(kind) {
  return KINDS.find((k) => k.id === kind)?.label || kind
}

export const MAX_BLOCK_WEEKS = 26
export const MAX_BLOCKS = 12

export function emptyTplSession(overrides = {}) {
  return {
    week_offset: 0,
    weekday: 0,
    discipline_code: 'running',
    session_type: '',
    description: '',
    km_estimated: '',
    duration_planned_min: '',
    rpe_theoretical: '',
    metrics: {},
    exercises: [],
    ...overrides,
  }
}

export function emptyBlock(name = 'Bloque 1') {
  return { name, focus: '', key_objective: '', weeks: 4, sessions: [] }
}

export function emptyPayload(kind) {
  if (kind === 'session') return { session: emptyTplSession() }
  if (kind === 'mesocycle') return { blocks: [emptyBlock('Mesociclo 1')] }
  return { objective: '', blocks: [emptyBlock('Mesociclo 1')] }
}

const numOrNull = (v) => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Deja la sesión de plantilla con tipos correctos antes de guardarla.
export function cleanTplSession(s) {
  const exercises = (s.exercises || [])
    .filter((e) => String(e.exercise_name || '').trim())
    .map((e, i) => ({
      order_index: i + 1,
      exercise_name: String(e.exercise_name).trim(),
      sets: numOrNull(e.sets),
      reps: numOrNull(e.reps),
      load_kg: numOrNull(e.load_kg),
      rpe_set: e.rpe_set ? String(e.rpe_set) : null,
    }))
  return {
    week_offset: Math.max(0, Math.round(Number(s.week_offset) || 0)),
    weekday: Math.min(6, Math.max(0, Math.round(Number(s.weekday) || 0))),
    discipline_code: s.discipline_code || null,
    session_type: String(s.session_type || '').trim(),
    description: String(s.description || '').trim(),
    km_estimated: numOrNull(s.km_estimated),
    duration_planned_min: numOrNull(s.duration_planned_min),
    rpe_theoretical: String(s.rpe_theoretical || '').trim(),
    metrics: s.metrics && typeof s.metrics === 'object' ? s.metrics : {},
    exercises,
  }
}

export function cleanPayload(kind, payload) {
  if (kind === 'session') return { session: cleanTplSession(payload.session || emptyTplSession()) }
  const blocks = (payload.blocks || []).map((b, i) => {
    const weeks = Math.min(MAX_BLOCK_WEEKS, Math.max(1, Math.round(Number(b.weeks) || 1)))
    return {
      name: String(b.name || '').trim() || `Mesociclo ${i + 1}`,
      focus: String(b.focus || '').trim(),
      key_objective: String(b.key_objective || '').trim(),
      weeks,
      sessions: (b.sessions || [])
        .map(cleanTplSession)
        .map((s) => ({ ...s, week_offset: Math.min(s.week_offset, weeks - 1) })),
    }
  })
  if (kind === 'mesocycle') return { blocks: blocks.slice(0, 1) }
  return { objective: String(payload.objective || '').trim(), blocks }
}

export function validateTemplate(kind, name, payload) {
  const errors = []
  if (!String(name || '').trim()) errors.push('Ponle un nombre a la plantilla.')
  if (kind === 'session') {
    const s = payload?.session
    if (!s || (!String(s.session_type || '').trim() && !String(s.description || '').trim())) {
      errors.push('Rellena al menos el tipo o la descripción de la sesión.')
    }
    return errors
  }
  const blocks = payload?.blocks || []
  if (blocks.length === 0) errors.push('Añade al menos un bloque.')
  if (blocks.length > MAX_BLOCKS) errors.push(`Máximo ${MAX_BLOCKS} bloques.`)
  if (blocks.every((b) => (b.sessions || []).length === 0)) errors.push('Añade al menos una sesión.')
  const blank = blocks.flatMap((b) => b.sessions || []).filter((s) => !String(s.session_type || '').trim() && !String(s.description || '').trim()).length
  if (blank > 0) errors.push(`${blank === 1 ? 'Hay 1 sesión sin tipo ni descripción' : `Hay ${blank} sesiones sin tipo ni descripción`}: rellénala o elimínala.`)
  return errors
}

export function templateSummary(kind, payload) {
  if (kind === 'session') {
    const s = payload?.session || {}
    return { blocks: 0, weeks: 0, sessions: 1, km: Number(s.km_estimated) || 0 }
  }
  const blocks = payload?.blocks || []
  const sessions = blocks.flatMap((b) => b.sessions || [])
  return {
    blocks: blocks.length,
    weeks: blocks.reduce((t, b) => t + (Number(b.weeks) || 0), 0),
    sessions: sessions.length,
    km: Math.round(sessions.reduce((t, s) => t + (Number(s.km_estimated) || 0), 0) * 10) / 10,
  }
}

// ---------------------------------------------------------------------------
// DESDE DATOS REALES -> PLANTILLA ("Guardar en la biblioteca")
// ---------------------------------------------------------------------------

function disciplineCode(session, disciplines) {
  return disciplines.find((d) => d.id === session.discipline_id)?.code || null
}

export function sessionToTpl(session, disciplines, exercises = []) {
  return cleanTplSession({
    week_offset: 0,
    weekday: session.session_date ? weekdayIndex(session.session_date) : Math.min(6, Math.max(0, (session.day_number || 1) - 1)),
    discipline_code: disciplineCode(session, disciplines),
    session_type: session.session_type,
    description: session.description,
    km_estimated: session.km_estimated,
    duration_planned_min: session.duration_planned_min,
    rpe_theoretical: session.rpe_theoretical,
    metrics: session.metrics,
    exercises,
  })
}

export function serializeSession(session, disciplines, exercises = []) {
  return { session: sessionToTpl(session, disciplines, exercises) }
}

function blockFromMeso(meso, sessions, disciplines, exercisesBySession) {
  const weeks = Math.max(1, meso.week_end - meso.week_start + 1)
  const mine = sessions.filter(
    (s) => s.mesocycle_id === meso.id || (!s.mesocycle_id && s.week_number >= meso.week_start && s.week_number <= meso.week_end)
  )
  return {
    name: meso.name || 'Mesociclo',
    focus: meso.focus || '',
    key_objective: meso.key_objective || '',
    weeks,
    sessions: mine
      .filter((s) => s.week_number >= meso.week_start && s.week_number <= meso.week_end)
      .sort((a, b) => a.week_number - b.week_number || a.day_number - b.day_number)
      .map((s) => ({
        ...sessionToTpl(s, disciplines, exercisesBySession?.[s.id] || []),
        week_offset: s.week_number - meso.week_start,
      })),
  }
}

export function serializeMesocycle(meso, sessions, disciplines, exercisesBySession) {
  return { blocks: [blockFromMeso(meso, sessions, disciplines, exercisesBySession)] }
}

export function serializeMacrocycle(macro, mesos, sessions, disciplines, exercisesBySession) {
  const ordered = [...mesos].sort((a, b) => a.week_start - b.week_start || a.order_index - b.order_index)
  return {
    objective: macro.objective || '',
    blocks: ordered.map((m) => blockFromMeso(m, sessions, disciplines, exercisesBySession)),
  }
}

// ---------------------------------------------------------------------------
// PLANTILLA -> FILAS A CREAR EN EL CALENDARIO DE UN ATLETA
// ---------------------------------------------------------------------------

function sessionRow(tpl, date, planStart, disciplines, extra = {}) {
  const week = weekNumberFor(date, planStart)
  const discipline = disciplines.find((d) => d.code === tpl.discipline_code)
  return {
    session: {
      week_number: week,
      day_number: weekdayIndex(date) + 1,
      session_date: date,
      discipline_id: discipline?.id || null,
      session_type: tpl.session_type || '',
      description: tpl.description || '',
      km_estimated: tpl.km_estimated ?? null,
      duration_planned_min: tpl.duration_planned_min ?? null,
      rpe_theoretical: tpl.rpe_theoretical || '',
      metrics: tpl.metrics || {},
      status: 'pendiente',
    },
    exercises: tpl.exercises || [],
    ...extra,
  }
}

// Calcula todo lo que hay que crear. No escribe nada.
//   item:        { kind, name, payload }
//   startDate:   fecha elegida. Sesión suelta -> ese día exacto. Bloques -> la
//                semana (lunes-domingo) que contiene esa fecha es la semana 1.
//   plan:        plan activo del atleta ({ start_date, duration_weeks }) o null
//   existing:    { mesocycles: [...], macrocycles: [...] } del plan
//   macroChoice: 'auto' | 'none' | <id de macrociclo> (solo para mesociclos)
export function buildApplication({ item, startDate, plan, existing, disciplines, macroChoice = 'auto' }) {
  const result = { errors: [], warnings: [], planStart: null, newPlanStart: false }
  if (!isISO(startDate)) {
    result.errors.push('Elige una fecha de inicio.')
    return result
  }

  const planStart = plan?.start_date || mondayOf(startDate)
  result.planStart = planStart
  result.newPlanStart = !plan?.start_date

  const out = { macrocycle: null, useMacroId: null, mesocycles: [], sessions: [] }
  const kind = item.kind

  if (kind === 'session') {
    // Una sesión suelta cae en el mesociclo que ya cubra ese día (si lo hay).
    const meso = cycleForDate(existing?.mesocycles || [], startDate, planStart)
    const row = sessionRow(item.payload.session, startDate, planStart, disciplines, { mesoKey: null, mesoId: meso?.id || null })
    out.sessions.push(row)
  } else {
    const blocks = item.payload.blocks || []
    const nextMesoOrder = (existing?.mesocycles || []).reduce((m, x) => Math.max(m, x.order_index || 0), 0) + 1
    let cursor = mondayOf(startDate)

    blocks.forEach((block, bi) => {
      const weeks = Number(block.weeks) || 1
      const weekStart = weekNumberFor(cursor, planStart)
      const key = `m${bi}`
      out.mesocycles.push({
        key,
        order_index: nextMesoOrder + bi,
        name: kind === 'mesocycle' && block.name === 'Mesociclo 1' ? item.name : block.name,
        focus: block.focus || null,
        key_objective: block.key_objective || null,
        week_start: weekStart,
        week_end: weekStart + weeks - 1,
        start_date: cursor,
        end_date: addDays(cursor, weeks * 7 - 1),
      })
      ;(block.sessions || []).forEach((tpl) => {
        const date = dateForWeekday(cursor, 1 + (tpl.week_offset || 0), tpl.weekday || 0)
        out.sessions.push(sessionRow(tpl, date, planStart, disciplines, { mesoKey: key }))
      })
      cursor = addDays(cursor, weeks * 7)
    })

    if (kind === 'macrocycle') {
      const first = out.mesocycles[0]
      const last = out.mesocycles[out.mesocycles.length - 1]
      const order = (existing?.macrocycles || []).reduce((m, x) => Math.max(m, x.order_index || 0), 0) + 1
      out.macrocycle = {
        order_index: order,
        name: item.name,
        objective: item.payload.objective || null,
        start_date: first?.start_date || null,
        end_date: last?.end_date || null,
      }
    } else if (macroChoice !== 'none') {
      const macros = [...(existing?.macrocycles || [])].sort((a, b) => b.order_index - a.order_index)
      const chosen = macroChoice === 'auto' ? macros[0] : macros.find((m) => m.id === macroChoice)
      if (chosen) out.useMacroId = chosen.id
      else {
        out.macrocycle = {
          order_index: 1 + macros.reduce((m, x) => Math.max(m, x.order_index || 0), 0),
          name: `Macrociclo ${1 + macros.length}`,
          objective: null,
          start_date: out.mesocycles[0]?.start_date || null,
          end_date: out.mesocycles[out.mesocycles.length - 1]?.end_date || null,
        }
      }
    }
  }

  // Comprobaciones
  const weeks = out.sessions.map((r) => r.session.week_number)
  if (weeks.some((w) => w < 1)) {
    result.errors.push(
      `Alguna sesión caería antes del inicio del plan (${planStart}). Elige una fecha de inicio igual o posterior.`
    )
  }
  if (out.sessions.length === 0 && kind !== 'session') result.errors.push('La plantilla no tiene sesiones.')

  const dates = out.sessions.map((r) => r.session.session_date).sort()
  result.first = dates[0] || null
  result.last = dates[dates.length - 1] || null
  result.lastWeek = Math.max(0, ...weeks, ...out.mesocycles.map((m) => m.week_end))
  result.application = out
  return result
}

// Convierte el resultado de buildApplication al JSON que espera la función SQL
// apply_template_application (supabase/migrations/0005).
export function applicationToRpc({ preview, plan, item }) {
  const app = preview.application
  return {
    plan: {
      id: plan?.id ?? null,
      // Vacío a propósito: el nombre de la plantilla no es una «prueba objetivo».
      custom_race_name: plan?.id ? undefined : '',
      start_date: preview.planStart,
      duration_weeks: Math.max(1, preview.lastWeek),
    },
    macrocycle: app.macrocycle || null,
    use_macro_id: app.useMacroId || null,
    mesocycles: app.mesocycles,
    sessions: app.sessions.map((r) => ({
      session: r.session,
      exercises: r.exercises || [],
      meso_key: r.mesoKey || null,
      meso_id: r.mesoId || null,
    })),
  }
}
