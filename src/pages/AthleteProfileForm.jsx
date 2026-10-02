import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import LoadingScreen from '../components/LoadingScreen'

const EMPTY = {
  main_goal: '',
  sport_history: '',
  injury_history: '',
  weekly_run_frequency: '',
  weekly_strength_frequency: '',
  resting_hr: '',
  max_hr_real: '',
  notes: '',
}

// profileId opcional: si no se pasa, se usa el usuario autenticado (vista del propio atleta).
export default function AthleteProfileForm({ profileId, basicProfile }) {
  const { user, profile: myProfile } = useAuth()
  const targetId = profileId || user?.id

  const [basic, setBasic] = useState(basicProfile || null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetId])

  async function loadAll() {
    if (!targetId) return
    setLoading(true)

    if (!basicProfile) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', targetId).single()
      setBasic(p)
    }

    const { data } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('profile_id', targetId)
      .maybeSingle()

    if (data) {
      setForm({
        main_goal: data.main_goal || '',
        sport_history: data.sport_history || '',
        injury_history: data.injury_history || '',
        weekly_run_frequency: data.weekly_run_frequency || '',
        weekly_strength_frequency: data.weekly_strength_frequency || '',
        resting_hr: data.resting_hr ?? '',
        max_hr_real: data.max_hr_real ?? '',
        notes: data.notes || '',
      })
    } else {
      setForm(EMPTY)
    }
    setLoading(false)
  }

  function set(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      profile_id: targetId,
      main_goal: form.main_goal,
      sport_history: form.sport_history,
      injury_history: form.injury_history,
      weekly_run_frequency: form.weekly_run_frequency,
      weekly_strength_frequency: form.weekly_strength_frequency,
      resting_hr: form.resting_hr === '' ? null : Number(form.resting_hr),
      max_hr_real: form.max_hr_real === '' ? null : Number(form.max_hr_real),
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('athlete_profiles').upsert(payload, { onConflict: 'profile_id' })
    setSaving(false)

    if (error) {
      alert('Error al guardar: ' + error.message)
      return
    }
    setSavedAt(new Date())
  }

  if (loading) return <LoadingScreen label="Cargando perfil…" />

  const isCoachEditingOther = myProfile?.role === 'coach' && targetId !== user?.id

  return (
    <form onSubmit={handleSave} className="bg-white border border-mist rounded-sm p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl text-navy">
          {isCoachEditingOther ? `Perfil de ${basic?.full_name || basic?.email}` : 'Tu perfil / anamnesis'}
        </h2>
        <p className="text-sm text-slate mt-1">
          Estos datos son la base sobre la que se diseña el plan de entrenamiento.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Objetivo principal" value={form.main_goal} onChange={(v) => set('main_goal', v)} placeholder="Ej. 10K en menos de 45'" />
        <Field label="Historial deportivo" value={form.sport_history} onChange={(v) => set('sport_history', v)} />
      </div>

      <Field
        label="Historial de lesiones"
        value={form.injury_history}
        onChange={(v) => set('injury_history', v)}
        textarea
      />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Frecuencia de carrera / semana" value={form.weekly_run_frequency} onChange={(v) => set('weekly_run_frequency', v)} placeholder="Ej. 3 días/semana" />
        <Field label="Frecuencia de fuerza / semana" value={form.weekly_strength_frequency} onChange={(v) => set('weekly_strength_frequency', v)} placeholder="Ej. 2 días/semana" />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="FC de reposo (ppm)" type="number" value={form.resting_hr} onChange={(v) => set('resting_hr', v)} />
        <Field label="FC máxima real (test de campo)" type="number" value={form.max_hr_real} onChange={(v) => set('max_hr_real', v)} />
      </div>

      <Field label="Notas adicionales" value={form.notes} onChange={(v) => set('notes', v)} textarea />

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 bg-navy hover:bg-navy-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Guardar perfil'}
        </button>
        {savedAt && <span className="text-sm text-navy-light font-mono">Guardado ✓</span>}
      </div>
    </form>
  )
}

function Field({ label, value, onChange, textarea, type = 'text', placeholder }) {
  return (
    <div>
      <label className="block font-mono text-xs text-slate mb-1.5">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={placeholder}
          className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy resize-none"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full border border-mist rounded-sm px-3 py-2.5 focus:outline-none focus:border-navy"
        />
      )}
    </div>
  )
}
