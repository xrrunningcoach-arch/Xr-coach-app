import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'

const EMPTY = {
  full_name: '',
  age: '',
  main_goal: '',
  long_term_goal: '',
  sport_history: '',
  personal_bests: '',
  weekly_run_frequency: '',
  weekly_strength_frequency: '',
  injury_history: '',
  resources: '',
  load_control: '',
  resting_hr: '',
  max_hr_real: '',
  notes: '',
}

// profileId opcional: si no se pasa, se usa el usuario autenticado (vista del propio atleta).
// onSaved opcional: se llama cuando se guarda correctamente.
export default function AthleteProfileForm({ profileId, basicProfile, onSaved }) {
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

    let base = basicProfile
    if (!base) {
      const { data: p } = await supabase.from('profiles').select('*').eq('id', targetId).single()
      base = p
      setBasic(p)
    }

    const { data } = await supabase
      .from('athlete_profiles')
      .select('*')
      .eq('profile_id', targetId)
      .maybeSingle()

    setForm({
      full_name: base?.full_name || '',
      age: base?.age ?? '',
      main_goal: data?.main_goal || '',
      long_term_goal: data?.long_term_goal || '',
      sport_history: data?.sport_history || '',
      personal_bests: data?.personal_bests || '',
      weekly_run_frequency: data?.weekly_run_frequency || '',
      weekly_strength_frequency: data?.weekly_strength_frequency || '',
      injury_history: data?.injury_history || '',
      resources: data?.resources || '',
      load_control: data?.load_control || '',
      resting_hr: data?.resting_hr ?? '',
      max_hr_real: data?.max_hr_real ?? '',
      notes: data?.notes || '',
    })
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
      long_term_goal: form.long_term_goal,
      sport_history: form.sport_history,
      personal_bests: form.personal_bests,
      weekly_run_frequency: form.weekly_run_frequency,
      weekly_strength_frequency: form.weekly_strength_frequency,
      injury_history: form.injury_history,
      resources: form.resources,
      load_control: form.load_control,
      resting_hr: form.resting_hr === '' ? null : Number(form.resting_hr),
      max_hr_real: form.max_hr_real === '' ? null : Number(form.max_hr_real),
      notes: form.notes,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase.from('athlete_profiles').upsert(payload, { onConflict: 'profile_id' })
    if (error) {
      setSaving(false)
      alert('Error al guardar: ' + error.message)
      return
    }

    // Nombre y edad viven en la tabla "profiles".
    const basicUpdate = { age: form.age === '' ? null : Number(form.age) }
    if (form.full_name.trim()) basicUpdate.full_name = form.full_name.trim()
    const { error: basicErr } = await supabase.from('profiles').update(basicUpdate).eq('id', targetId)
    setSaving(false)
    if (basicErr) {
      alert('Error al guardar el nombre o la edad: ' + basicErr.message)
      return
    }

    setSavedAt(new Date())
    if (onSaved) onSaved()
  }

  if (loading) return <p className="text-sm text-slate">Cargando perfil…</p>

  const isCoachEditingOther = myProfile?.role === 'coach' && targetId !== user?.id

  return (
    <form onSubmit={handleSave} className="bg-white border border-mist rounded-sm p-6 space-y-5">
      <div>
        <h2 className="font-display text-xl text-navy">
          {isCoachEditingOther ? `Perfil de ${basic?.full_name || basic?.email}` : 'Tu perfil'}
        </h2>
        <p className="text-sm text-slate mt-1">
          Estos datos son la base sobre la que se diseña el plan de entrenamiento.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nombre del atleta" value={form.full_name} onChange={(v) => set('full_name', v)} />
        <Field label="Edad" type="number" value={form.age} onChange={(v) => set('age', v)} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Objetivo principal" value={form.main_goal} onChange={(v) => set('main_goal', v)} placeholder="Ej. Retomar la carrera y crear rutina" />
        <Field label="Objetivo a largo plazo" value={form.long_term_goal} onChange={(v) => set('long_term_goal', v)} placeholder="Ej. 21K y luego mejorar marcas" />
      </div>

      <Field label="Experiencia en carrera" value={form.sport_history} onChange={(v) => set('sport_history', v)} textarea />
      <Field label="Marcas personales" value={form.personal_bests} onChange={(v) => set('personal_bests', v)} placeholder="Ej. 21K: 1h23' · Maratón: 2h57'" />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Frecuencia de carrera" value={form.weekly_run_frequency} onChange={(v) => set('weekly_run_frequency', v)} placeholder="Ej. Disponible: 3 días/semana" />
        <Field label="Frecuencia de fuerza / gym" value={form.weekly_strength_frequency} onChange={(v) => set('weekly_strength_frequency', v)} placeholder="Ej. 1 gym (lunes o miércoles)" />
      </div>

      <Field label="Historial de lesiones" value={form.injury_history} onChange={(v) => set('injury_history', v)} textarea />
      <Field label="Material y recursos" value={form.resources} onChange={(v) => set('resources', v)} textarea />
      <Field label="Control de carga" value={form.load_control} onChange={(v) => set('load_control', v)} textarea />

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
