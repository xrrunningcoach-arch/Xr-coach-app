import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { SESSION_TYPES_SUGGESTED } from '../lib/planGenerator'
import { toSafeHref } from '../lib/safeUrl'
import { findDiscipline } from '../lib/disciplines'
import { placementFor } from '../lib/dates'
import { cycleForDate } from '../lib/cycles'
import StatusBadge from './StatusBadge'
import DisciplineFields from './DisciplineFields'
import StrengthExercises from './StrengthExercises'
import { ui } from '../ui/ui'

// Fila de edición de una sesión (vista del entrenador). Movida desde
// CoachAthlete.jsx para poder usarla también desde el calendario; añade el
// campo «Fecha» (la que coloca la tarjeta en el calendario del atleta) y el
// botón «Guardar en biblioteca».
export default function CoachSessionRow({ session, disciplines, mesocycles = [], planStart = null, onChanged, onSaveToLibrary }) {
  const [type, setType] = useState(session.session_type || '')
  const [description, setDescription] = useState(session.description || '')
  const [km, setKm] = useState(session.km_estimated ?? '')
  const [rpeTheo, setRpeTheo] = useState(session.rpe_theoretical || '')
  const [disciplineId, setDisciplineId] = useState(session.discipline_id || '')
  const [durationPlanned, setDurationPlanned] = useState(session.duration_planned_min ?? '')
  const [metrics, setMetrics] = useState(session.metrics || {})
  const [date, setDate] = useState(session.session_date || '')
  const [saving, setSaving] = useState(false)
  const [evaluations, setEvaluations] = useState(null)
  const [showEval, setShowEval] = useState(false)

  const discipline = findDiscipline(disciplines, disciplineId)

  async function handleSave() {
    setSaving(true)
    // Si cambia la fecha, la sesión se recoloca: semana del plan, día de la
    // semana y mesociclo se recalculan a partir del día elegido.
    let placement = {}
    if (date && date !== session.session_date) {
      placement = placementFor(date, planStart, session)
      const meso = cycleForDate(mesocycles, date, planStart)
      if (meso) placement.mesocycle_id = meso.id
    } else if (!date && session.session_date) {
      placement = { session_date: null }
    }
    const { error } = await supabase
      .from('sessions')
      .update({
        ...placement,
        session_type: type,
        description,
        km_estimated: km === '' ? null : Number(km),
        rpe_theoretical: rpeTheo,
        discipline_id: disciplineId || null,
        duration_planned_min: durationPlanned === '' ? null : Number(durationPlanned),
        metrics,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.id)
    setSaving(false)
    if (error) ui.error(error.message)
    else onChanged()
  }

  async function handleDelete() {
    if (!(await ui.confirm('¿Eliminar esta sesión?', { danger: true, confirmLabel: 'Eliminar' }))) return
    const { error } = await supabase.from('sessions').delete().eq('id', session.id)
    if (error) ui.error(error.message)
    else onChanged()
  }

  async function loadEvaluations() {
    const { data } = await supabase
      .from('session_evaluations')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
    setEvaluations(data || [])
  }

  function toggleEval() {
    setShowEval((v) => !v)
    if (!evaluations) loadEvaluations()
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="font-mono text-xs text-slate">Día {session.day_number}</span>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Fecha de la sesión en el calendario"
          title="Fecha en el calendario del atleta"
          className="border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface"
        />
        <select
          value={disciplineId}
          onChange={(e) => setDisciplineId(e.target.value)}
          className="border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface"
        >
          <option value="">Disciplina…</option>
          {disciplines.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        <input
          type="number"
          value={durationPlanned}
          onChange={(e) => setDurationPlanned(e.target.value)}
          placeholder="Duración prevista (min)"
          className="w-44 border border-mist rounded-sm px-2 py-1.5 text-sm"
        />
        {session.session_load != null && (
          <span className="font-mono text-[11px] text-navy-light ml-auto">
            Carga: {Math.round(session.session_load)} · Impacto: {Math.round(session.impact_load)}
          </span>
        )}
      </div>

      {discipline && (
        <div className="mb-3">
          <DisciplineFields discipline={discipline} values={metrics} onChange={setMetrics} />
          {discipline.metrics_schema?.has_exercises && (
            <div className="mt-3">
              <StrengthExercises sessionId={session.id} />
            </div>
          )}
        </div>
      )}

      <div className="grid sm:grid-cols-12 gap-3 items-start">
        <div className="sm:col-span-4">
          <input
            list="session-types"
            value={type}
            onChange={(e) => setType(e.target.value)}
            placeholder="Tipo de sesión"
            className="w-full border border-mist rounded-sm px-3 py-2 text-sm"
          />
          <datalist id="session-types">
            {SESSION_TYPES_SUGGESTED.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>

        <div className="sm:col-span-4">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción del entrenamiento"
            rows={2}
            className="w-full border border-mist rounded-sm px-3 py-2 text-sm resize-none"
          />
        </div>

        <div className="sm:col-span-1">
          <input
            type="number"
            step="0.1"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="Km"
            className="w-full border border-mist rounded-sm px-2 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-1">
          <input
            value={rpeTheo}
            onChange={(e) => setRpeTheo(e.target.value)}
            placeholder="RPE"
            className="w-full border border-mist rounded-sm px-2 py-2 text-sm"
          />
        </div>

        <div className="sm:col-span-2 flex flex-col items-end gap-1.5">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-semibold text-white bg-primary hover:bg-primary-hover px-3 py-1.5 rounded-sm disabled:opacity-60 w-full sm:w-auto"
          >
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          {onSaveToLibrary && (
            <button type="button" onClick={() => onSaveToLibrary(session)} className="text-xs font-semibold text-navy hover:text-red">
              A la biblioteca
            </button>
          )}
          <button onClick={handleDelete} className="text-xs text-red hover:text-red-deep">
            Eliminar
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-3 pl-0 sm:pl-[calc(8.3%)]">
        <StatusBadge status={session.status} />
        {session.rpe_actual && <span className="text-xs font-mono text-slate">RPE real: {session.rpe_actual}</span>}
        {toSafeHref(session.link_url) && (
          <a href={toSafeHref(session.link_url)} target="_blank" rel="noreferrer" className="text-xs text-navy underline underline-offset-2">
            Ver entrenamiento
          </a>
        )}
        {session.athlete_notes && <span className="text-xs text-slate italic">"{session.athlete_notes}"</span>}
        <button onClick={toggleEval} className="text-xs font-semibold text-red hover:text-red-deep ml-auto">
          {showEval ? 'Ocultar valoración' : 'Valorar sesión'}
        </button>
      </div>

      {showEval && <EvaluationBox sessionId={session.id} evaluations={evaluations} onAdded={loadEvaluations} />}
    </div>
  )
}

export function EvaluationBox({ sessionId, evaluations, onAdded }) {
  const { user } = useAuth()
  const [rating, setRating] = useState(3)
  const [comment, setComment] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleAdd() {
    setSaving(true)
    const { error } = await supabase.from('session_evaluations').insert({
      session_id: sessionId,
      coach_id: user.id,
      rating: Number(rating),
      comment,
    })
    setSaving(false)
    if (error) {
      ui.error(error.message)
      return
    }
    setComment('')
    onAdded()
  }

  return (
    <div className="mt-3 bg-bg-dim rounded-sm p-4 space-y-3">
      {evaluations === null ? (
        <p className="text-xs text-slate">Cargando valoraciones…</p>
      ) : evaluations.length === 0 ? (
        <p className="text-xs text-slate">Todavía no has valorado esta sesión.</p>
      ) : (
        <div className="space-y-2">
          {evaluations.map((ev) => (
            <div key={ev.id} className="text-sm">
              <span className="font-mono text-xs text-navy-light">{'★'.repeat(ev.rating)}{'☆'.repeat(5 - ev.rating)}</span>
              <p className="text-slate">{ev.comment}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <select value={rating} onChange={(e) => setRating(e.target.value)} className="border border-mist rounded-sm px-2 py-1.5 text-sm">
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} ★</option>)}
        </select>
        <input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Comentario para el atleta…"
          className="flex-1 min-w-[180px] border border-mist rounded-sm px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={saving || !comment}
          className="text-xs font-semibold text-white bg-brand hover:bg-brand-deep px-3 py-1.5 rounded-sm disabled:opacity-60"
        >
          Añadir valoración
        </button>
      </div>
    </div>
  )
}

