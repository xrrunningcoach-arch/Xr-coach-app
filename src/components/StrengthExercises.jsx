import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ui } from '../ui/ui'

// Fuerza se modela como tabla relacional (session_exercises) y no como
// metrics jsonb, porque es estructuralmente repetitiva (series x reps x
// carga) y conviene poder sumarla/consultarla como filas, no como texto.
export default function StrengthExercises({ sessionId }) {
  const [exercises, setExercises] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function load() {
    const { data, error } = await supabase
      .from('session_exercises')
      .select('*')
      .eq('session_id', sessionId)
      .order('order_index')
    if (error) {
      console.error(error.message)
      setExercises([])
      return
    }
    setExercises(data || [])
  }

  async function handleAdd() {
    setSaving(true)
    const nextOrder = (exercises?.length || 0) + 1
    const { error } = await supabase.from('session_exercises').insert({
      session_id: sessionId,
      order_index: nextOrder,
      exercise_name: '',
      sets: null,
      reps: null,
      load_kg: null,
      rpe_set: '',
    })
    setSaving(false)
    if (error) ui.error(error.message)
    else load()
  }

  async function handleUpdate(id, patch) {
    const { error } = await supabase.from('session_exercises').update(patch).eq('id', id)
    if (error) ui.error(error.message)
    else load()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('session_exercises').delete().eq('id', id)
    if (error) ui.error(error.message)
    else load()
  }

  if (exercises === null) return <p className="text-xs text-slate">Cargando ejercicios…</p>

  return (
    <div className="space-y-2">
      {exercises.map((ex) => (
        <ExerciseRow key={ex.id} exercise={ex} onSave={handleUpdate} onDelete={() => handleDelete(ex.id)} />
      ))}
      <button
        type="button"
        onClick={handleAdd}
        disabled={saving}
        className="text-xs font-semibold text-navy hover:text-red disabled:opacity-60"
      >
        + Añadir ejercicio
      </button>
    </div>
  )
}

function ExerciseRow({ exercise, onSave, onDelete }) {
  const [name, setName] = useState(exercise.exercise_name || '')
  const [sets, setSets] = useState(exercise.sets ?? '')
  const [reps, setReps] = useState(exercise.reps ?? '')
  const [loadKg, setLoadKg] = useState(exercise.load_kg ?? '')
  const [rpeSet, setRpeSet] = useState(exercise.rpe_set || '')

  function handleBlur() {
    onSave(exercise.id, {
      exercise_name: name,
      sets: sets === '' ? null : Number(sets),
      reps: reps === '' ? null : Number(reps),
      load_kg: loadKg === '' ? null : Number(loadKg),
      rpe_set: rpeSet,
    })
  }

  return (
    <div className="grid grid-cols-12 gap-2 items-center bg-bg-dim rounded-sm px-3 py-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={handleBlur}
        placeholder="Ejercicio (ej. Sentadilla trasera)"
        className="col-span-5 border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface"
      />
      <input
        type="number"
        value={sets}
        onChange={(e) => setSets(e.target.value)}
        onBlur={handleBlur}
        placeholder="Series"
        className="col-span-2 border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface"
      />
      <input
        type="number"
        value={reps}
        onChange={(e) => setReps(e.target.value)}
        onBlur={handleBlur}
        placeholder="Reps"
        className="col-span-2 border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface"
      />
      <input
        type="number"
        value={loadKg}
        onChange={(e) => setLoadKg(e.target.value)}
        onBlur={handleBlur}
        placeholder="Kg"
        className="col-span-2 border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface"
      />
      <button type="button" onClick={onDelete} className="col-span-1 text-xs text-red hover:text-red-deep">
        ✕
      </button>
    </div>
  )
}
