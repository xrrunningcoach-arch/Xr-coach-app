import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'

// El entrenador puede marcar a mano una sesión como completada (p. ej. si el
// atleta entrenó pero no la registró) o devolverla a pendiente.
export default function CoachStatusControl({ session, onChanged }) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const done = session.status === 'completado'

  async function setStatus(status) {
    setBusy(true)
    // La fecha de «completada» es la de la propia sesión, así «última actividad»
    // del panel de cumplimiento no se falsea si se marca días después.
    const completedAt =
      status === 'completado' ? (session.session_date ? `${session.session_date}T12:00:00Z` : new Date().toISOString()) : null
    const { error } = await supabase
      .from('sessions')
      .update({ status, completed_at: completedAt, updated_at: new Date().toISOString() })
      .eq('id', session.id)
    setBusy(false)
    if (error) return ui.error(error.message)
    ui.success(t('coach.statusSaved'))
    onChanged?.()
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => setStatus(done ? 'pendiente' : 'completado')}
      className="text-xs font-semibold text-navy hover:text-red disabled:opacity-60"
    >
      {done ? t('coach.markPending') : t('log.done')}
    </button>
  )
}
