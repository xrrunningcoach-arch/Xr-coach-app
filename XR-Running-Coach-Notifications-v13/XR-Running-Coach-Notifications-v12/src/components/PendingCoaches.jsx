import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'

// Solo para el administrador: aprobar o rechazar solicitudes de entrenador.
// Si el usuario no es administrador no pinta nada.
export default function PendingCoaches() {
  const t = useT()
  const [isAdmin, setIsAdmin] = useState(false)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(null)

  async function load() {
    const { data: admin } = await supabase.rpc('is_admin_user')
    if (admin !== true) return
    setIsAdmin(true)
    const { data } = await supabase.rpc('list_pending_coaches')
    setRows(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function decide(row, approve) {
    if (!approve && !(await ui.confirm(t('coach.rejectConfirm'), { confirmLabel: t('coach.reject') }))) return
    setBusy(row.id)
    const { error } = await supabase.rpc('approve_coach', { p_coach: row.id, p_approve: approve })
    setBusy(null)
    if (error) return ui.error(error.message)
    ui.success(approve ? t('coach.approvedMsg') : t('coach.rejectedMsg'))
    load()
  }

  if (!isAdmin) return null
  return (
    <section className="bg-surface border border-mist rounded-xl p-5 space-y-3">
      <h2 className="font-display text-lg text-navy">{t('coach.pendingTitle')}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-slate">{t('coach.pendingNone')}</p>
      ) : (
        <ul className="divide-y divide-mist">
          {rows.map((r) => (
            <li key={r.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm">
                <strong>{r.full_name || '—'}</strong> <span className="text-slate">· {r.email}</span>
              </span>
              <span className="flex gap-2">
                <button type="button" disabled={busy === r.id} onClick={() => decide(r, true)} className="px-3 py-1.5 text-sm font-semibold text-white bg-brand hover:bg-brand-deep rounded-sm disabled:opacity-60">{t('coach.approve')}</button>
                <button type="button" disabled={busy === r.id} onClick={() => decide(r, false)} className="px-3 py-1.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red disabled:opacity-60">{t('coach.reject')}</button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
