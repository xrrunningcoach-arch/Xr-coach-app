import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'

// El atleta ve con qué entrenador trabaja y puede cambiarlo.
export default function CoachChooser() {
  const t = useT()
  const [coaches, setCoaches] = useState([])
  const [current, setCurrent] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: list }, { data: mine }] = await Promise.all([supabase.rpc('list_coaches'), supabase.rpc('my_coach')])
      if (!alive) return
      setCoaches(list || [])
      setCurrent(mine?.[0]?.id || '')
    })()
    return () => {
      alive = false
    }
  }, [])

  async function change(id) {
    if (!id || id === current) return
    if (!(await ui.confirm(t('prof.coachConfirm'), { confirmLabel: t('prof.coachChange') }))) return
    setBusy(true)
    const { error } = await supabase.rpc('choose_coach', { p_coach: id })
    setBusy(false)
    if (error) return ui.error(error.message)
    setCurrent(id)
    ui.success(t('prof.coachSaved'))
  }

  if (coaches.length === 0) return null
  return (
    <div className="bg-surface border border-mist rounded-xl p-6 space-y-3">
      <h2 className="font-display text-xl text-navy">{t('prof.coachTitle')}</h2>
      <select value={current} disabled={busy} onChange={(e) => change(e.target.value)} className="w-full max-w-sm border border-mist rounded-sm px-3 py-2.5 bg-surface">
        {!current && <option value="">{t('auth.chooseCoachPlaceholder')}</option>}
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name}</option>
        ))}
      </select>
    </div>
  )
}
