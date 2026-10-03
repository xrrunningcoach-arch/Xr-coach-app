import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ANAMNESIS_QUESTIONS } from '../lib/anamnesis'

// Carga las respuestas de un atleta. Devuelve { answers, answeredAt }.
async function fetchAnamnesis(athleteId) {
  const { data, error } = await supabase
    .from('anamnesis')
    .select('*')
    .eq('athlete_id', athleteId)
    .maybeSingle()
  if (error) return { error: error.message, answers: {}, answeredAt: null }
  return { answers: data?.answers || {}, answeredAt: data?.answered_at || null }
}

// ---------------------------------------------------------------------------
// Vista de solo lectura (para el panel del entrenador)
// ---------------------------------------------------------------------------
export function AnamnesisReadOnly({ athleteId, refreshKey = 0 }) {
  const [state, setState] = useState({ loading: true, answers: {}, answeredAt: null, error: null })

  useEffect(() => {
    let active = true
    setState((s) => ({ ...s, loading: true }))
    fetchAnamnesis(athleteId).then((r) => {
      if (active) setState({ loading: false, answers: r.answers, answeredAt: r.answeredAt, error: r.error || null })
    })
    return () => {
      active = false
    }
  }, [athleteId, refreshKey])

  if (state.loading) return <p className="text-sm text-slate">Cargando anamnesis…</p>
  if (state.error) return <p className="text-sm text-red">{state.error}</p>

  const answered = ANAMNESIS_QUESTIONS.filter((q) => (state.answers[q.n] || '').trim() !== '').length

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-slate">
        {answered === 0
          ? 'El atleta todavía no ha respondido el cuestionario.'
          : `${answered} de ${ANAMNESIS_QUESTIONS.length} preguntas respondidas${
              state.answeredAt ? ` · primera respuesta el ${new Date(state.answeredAt).toLocaleDateString('es-ES')}` : ''
            }`}
      </p>
      <div className="divide-y divide-mist border border-mist rounded-sm">
        {ANAMNESIS_QUESTIONS.map((q) => {
          const value = (state.answers[q.n] || '').trim()
          return (
            <div key={q.n} className="px-4 py-3">
              <p className="text-sm font-semibold text-navy">
                {q.n}. {q.es}
              </p>
              <p className="text-sm mt-1 whitespace-pre-wrap">
                {value || <span className="text-slate italic">Sin respuesta</span>}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Formulario editable (atleta rellena la suya; el entrenador puede editarla)
// ---------------------------------------------------------------------------
export default function AnamnesisForm({ athleteId, basicProfile, onSaved }) {
  const [answers, setAnswers] = useState({})
  const [answeredAt, setAnsweredAt] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetchAnamnesis(athleteId).then((r) => {
      if (!active) return
      const loaded = { ...r.answers }
      // Se precargan nombre y edad del perfil si todavía no hay respuesta.
      if (!loaded[1] && basicProfile?.full_name) loaded[1] = basicProfile.full_name
      if (!loaded[2] && basicProfile?.age) loaded[2] = String(basicProfile.age)
      setAnswers(loaded)
      setAnsweredAt(r.answeredAt)
      if (r.error) setError(r.error)
      setLoading(false)
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId])

  function setAnswer(n, value) {
    setAnswers((a) => ({ ...a, [n]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const now = new Date().toISOString()
    const { error: err } = await supabase.from('anamnesis').upsert(
      {
        athlete_id: athleteId,
        answers,
        answered_at: answeredAt || now,
        updated_at: now,
      },
      { onConflict: 'athlete_id' }
    )
    setSaving(false)
    if (err) {
      setError(err.message)
      return
    }
    if (!answeredAt) setAnsweredAt(now)
    setSavedAt(new Date())
    if (onSaved) onSaved()
  }

  if (loading) return <p className="text-sm text-slate">Cargando anamnesis…</p>

  return (
    <form onSubmit={handleSave} className="space-y-5">
      <p className="text-sm text-slate">
        Responde con tus palabras (en castellano o euskera, como prefieras). Puedes guardar y volver a completarlo más tarde.
      </p>

      {ANAMNESIS_QUESTIONS.map((q) => (
        <div key={q.n}>
          <label className="block text-sm font-semibold text-navy" htmlFor={`anamnesis-${q.n}`}>
            {q.n}. {q.es}
          </label>
          <p className="text-xs text-slate italic mb-1.5">{q.eu}</p>
          {q.type === 'long' ? (
            <textarea
              id={`anamnesis-${q.n}`}
              value={answers[q.n] || ''}
              onChange={(e) => setAnswer(q.n, e.target.value)}
              rows={3}
              maxLength={3000}
              className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy resize-y"
            />
          ) : (
            <input
              id={`anamnesis-${q.n}`}
              value={answers[q.n] || ''}
              onChange={(e) => setAnswer(q.n, e.target.value)}
              maxLength={500}
              className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy"
            />
          )}
        </div>
      ))}

      {error && <p className="text-sm text-red">{error}</p>}

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-navy hover:bg-navy-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar anamnesis'}
        </button>
        {savedAt && <span className="text-sm text-navy-light font-mono">Guardado ✓</span>}
      </div>
    </form>
  )
}
