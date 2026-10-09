import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { useT } from '../i18n'
import LoadingScreen from '../components/LoadingScreen'
import InvitePanel from '../components/InvitePanel'
import { IconAlert, IconUsers } from '../components/icons'
import { ui } from '../ui/ui'
import { addDays, todayISO } from '../lib/dates'
import { computeCompliance, sortByUrgency } from '../lib/compliance'

const LEVEL_DOT = { high: 'bg-[var(--st-pend)]', medium: 'bg-[var(--st-curso)]', ok: 'bg-[var(--st-done)]', none: 'bg-[var(--st-idle)]' }

function reasonText(t, r) {
  switch (r.code) {
    case 'overdue': return t('reason.overdue', { count: r.count })
    case 'lowCompliance': return t('reason.lowCompliance', { pct: r.pct })
    case 'skipped': return t('reason.skipped', { count: r.count })
    case 'inactive': return t('reason.inactive', { days: r.days })
    case 'highRpe': return t('reason.highRpe')
    case 'noUpcoming': return t('reason.noUpcoming')
    default: return t('reason.noPlan')
  }
}

function lastText(t, days) {
  if (days === null) return t('coach.never')
  if (days === 0) return t('coach.today')
  return t('coach.daysAgo', { count: days })
}

export default function CoachHome() {
  const { user } = useAuth()
  const t = useT()
  const [recent, setRecent] = useState([])
  const [showInvite, setShowInvite] = useState(false)
  const [showAllPending, setShowAllPending] = useState(false)
  const today = todayISO()
  const [loading, setLoading] = useState(true)
  const [athletes, setAthletes] = useState([])
  const [pending, setPending] = useState([])
  const [unread, setUnread] = useState({})
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data: rosterRaw, error: rosterErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'athlete')
      .order('created_at', { ascending: false })

    if (rosterErr) {
      setError(rosterErr.message)
      setLoading(false)
      return
    }

    const { data: plans } = await supabase
      .from('training_plans')
      .select('id, athlete_id, status, duration_weeks, race_id, custom_race_name, races(name)')

    const roster = (rosterRaw || []).map((a) => ({
      ...a,
      plan: (plans || []).find((p) => p.athlete_id === a.id && p.status !== 'completed') || null,
    }))
    setAthletes(roster)

    // Sesiones de las últimas 2 semanas y la próxima: base del panel de cumplimiento.
    const { data: windowRows } = await supabase
      .from('sessions')
      .select('id, plan_id, session_date, status, completed_at, rpe_actual_value')
      .gte('session_date', addDays(todayISO(), -14))
      .lte('session_date', addDays(todayISO(), 7))
    setRecent(windowRows || [])

    // Sesiones completadas sin evaluación del entrenador todavía
    // Anti-join en la propia consulta: solo las NO evaluadas, así el límite de 30
    // no se llena con sesiones que ya tienen valoración.
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*, training_plans(athlete_id, profiles:athlete_id(full_name,email,is_active)), session_evaluations!left(id)')
      .eq('status', 'completado')
      .is('session_evaluations', null)
      .order('completed_at', { ascending: false })
      .limit(30)

    setPending((sessions || []).filter((s) => s.training_plans?.profiles?.is_active !== false))

    // Mensajes del chat que los atletas te han enviado y aún no has leído.
    // Si todavía no se ha ejecutado la migración 0003, esta consulta falla y
    // simplemente no se muestran avisos.
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('athlete_id, sender_id')
      .is('read_at', null)
    const counts = {}
    ;(unreadRows || []).forEach((m) => {
      if (m.sender_id === m.athlete_id) counts[m.athlete_id] = (counts[m.athlete_id] || 0) + 1
    })
    setUnread(counts)

    setLoading(false)
  }

  async function handleArchive(a) {
    const name = a.full_name || a.email
    const ok = await ui.confirm(t('coach.archiveBody'), { title: t('coach.archiveTitle', { name }), confirmLabel: t('coach.archive') })
    if (!ok) return
    setBusyId(a.id)
    const { error: err } = await supabase.rpc('set_athlete_active', { p_athlete_id: a.id, p_active: false })
    setBusyId(null)
    if (err) ui.error(err.message)
    else loadData()
  }

  async function handleRestore(a) {
    setBusyId(a.id)
    const { error: err } = await supabase.rpc('set_athlete_active', { p_athlete_id: a.id, p_active: true })
    setBusyId(null)
    if (err) ui.error(err.message)
    else loadData()
  }

  async function handleDelete(a) {
    const name = a.full_name || a.email
    const ok = await ui.confirm(t('coach.deleteBody'), { title: t('coach.deleteTitle', { name }), danger: true, confirmLabel: t('coach.deleteConfirm'), requireText: 'ELIMINAR' })
    if (!ok) return
    setBusyId(a.id)
    const { error: err } = await supabase.rpc('delete_athlete', { p_athlete_id: a.id })
    setBusyId(null)
    if (err) ui.error(err.message)
    else loadData()
  }

  const active = athletes.filter((a) => a.is_active !== false)
  const archived = athletes.filter((a) => a.is_active === false)

  const rows = useMemo(
    () => sortByUrgency(computeCompliance({ athletes: active, plans: athletes.map((a) => a.plan).filter(Boolean), sessions: recent, today })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [athletes, recent, today]
  )
  const flagged = rows.filter((r) => r.level === 'high' || r.level === 'medium')

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-3xl text-navy">{t('coach.title')}</h1>
        <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-md">
          <IconUsers width={18} height={18} /> {t('coach.invite')}
        </button>
      </div>
      {showInvite && <InvitePanel onClose={() => setShowInvite(false)} />}

      {error && <p className="text-red text-sm">{error}</p>}

      <section aria-label={t('coach.attention')}>
        <div className="mb-3">
          <h2 className="font-display text-xl text-navy flex items-center gap-2">
            <IconAlert width={20} height={20} className="text-red" /> {t('coach.attention')}
            {flagged.length > 0 && <span className="font-mono text-xs bg-brand text-white rounded-full px-2 py-0.5">{flagged.length}</span>}
          </h2>
          <p className="text-xs text-slate mt-0.5">{t('coach.attentionHelp')}</p>
        </div>
        {flagged.length === 0 ? (
          <div className="bg-surface border border-mist rounded-xl p-5 text-sm text-slate">{t('coach.attentionEmpty')}</div>
        ) : (
          <ul className="grid md:grid-cols-2 gap-3">
            {flagged.map((r) => (
              <li key={r.athlete.id}>
                <Link
                  to={`/coach/atleta/${r.athlete.id}`}
                  className={`block bg-surface border rounded-xl p-4 hover:border-navy-light transition-colors ${r.level === 'high' ? 'border-brand/70' : 'border-mist'}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${LEVEL_DOT[r.level]}`} aria-hidden="true" />
                    <p className="font-semibold text-navy truncate">{r.athlete.full_name || r.athlete.email}</p>
                  </div>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {r.reasons.map((reason) => (
                      <li key={reason.code} className="text-xs bg-bg-dim text-ink rounded-full px-2.5 py-1">{reasonText(t, reason)}</li>
                    ))}
                  </ul>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('coach.compliance')}>
        <div className="mb-3">
          <h2 className="font-display text-xl text-navy">{t('coach.compliance')}</h2>
          <p className="text-xs text-slate mt-0.5">{t('coach.complianceHelp')}</p>
        </div>
        <div className="bg-surface border border-mist rounded-xl overflow-hidden">
          <div className="hidden md:grid grid-cols-[minmax(0,2fr)_1fr_1.4fr_1fr] gap-4 px-5 py-2.5 bg-bg-dim font-mono text-[11px] uppercase text-slate">
            <span>{t('coach.col.athlete')}</span><span>{t('coach.col.week')}</span><span>{t('coach.col.rate')}</span><span>{t('coach.col.last')}</span>
          </div>
          <ul className="divide-y divide-mist">
            {rows.map((r) => (
              <li key={r.athlete.id}>
                <Link to={`/coach/atleta/${r.athlete.id}`} className="grid md:grid-cols-[minmax(0,2fr)_1fr_1.4fr_1fr] gap-x-4 gap-y-1 px-5 py-3.5 items-center hover:bg-bg-dim transition-colors">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${LEVEL_DOT[r.level]}`} aria-hidden="true" />
                    <span className="font-semibold text-sm text-navy truncate">{r.athlete.full_name || r.athlete.email}</span>
                  </span>
                  <span className="font-mono text-xs text-slate"><span className="md:hidden">{t('coach.col.week')}: </span>{r.plan ? `${r.week.done} / ${r.week.total}` : '—'}</span>
                  <span className="flex items-center gap-2">
                    {r.rate === null ? (
                      <span className="font-mono text-xs text-slate">{t('coach.noData')}</span>
                    ) : (
                      <>
                        <span className="flex-1 h-2 rounded-full bg-bg-dim overflow-hidden max-w-[140px]" role="progressbar" aria-valuenow={Math.round(r.rate * 100)} aria-valuemin={0} aria-valuemax={100}>
                          <span className="block h-full rounded-full" style={{ width: `${Math.round(r.rate * 100)}%`, background: r.rate < 0.5 ? 'var(--st-pend)' : r.rate < 0.75 ? 'var(--st-curso)' : 'var(--st-done)' }} />
                        </span>
                        <span className="font-mono text-xs text-ink w-10">{Math.round(r.rate * 100)}%</span>
                      </>
                    )}
                  </span>
                  <span className="font-mono text-xs text-slate"><span className="md:hidden">{t('coach.col.last')}: </span>{r.plan ? lastText(t, r.lastActivityDays) : '—'}</span>
                </Link>
              </li>
            ))}
            {rows.length === 0 && <li className="px-5 py-5 text-sm text-slate">{t('coach.noAthletes')}</li>}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl text-navy mb-3">{t('coach.pendingReview')}</h2>
        {pending.length === 0 ? (
          <div className="bg-surface border border-mist rounded-xl p-5 text-sm text-slate">{t('coach.noPending')}</div>
        ) : (
          <div className="bg-surface border border-mist rounded-xl divide-y divide-mist">
            {(showAllPending ? pending : pending.slice(0, 6)).map((s) => (
              <div key={s.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">
                    {s.training_plans?.profiles?.full_name || s.training_plans?.profiles?.email} · {t('coach.weekDay', { w: s.week_number, d: s.day_number })}
                  </p>
                  <p className="text-sm text-slate">{s.session_type} — {t('coach.rpeReal', { v: s.rpe_actual || '—' })}</p>
                </div>
                <Link to={`/coach/atleta/${s.training_plans.athlete_id}`} className="text-sm font-semibold text-navy hover:text-red underline underline-offset-4">
                  {t('coach.review')}
                </Link>
              </div>
            ))}
            {pending.length > 6 && (
              <button onClick={() => setShowAllPending((v) => !v)} className="w-full px-5 py-3 text-sm font-semibold text-navy-light hover:text-navy">
                {showAllPending ? t('coach.less') : t('coach.more', { count: pending.length - 6 })}
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-xl text-navy">{t('coach.yourAthletes', { count: active.length })}</h2>
          {archived.length > 0 && (
            <button onClick={() => setShowArchived((v) => !v)} className="text-sm font-semibold text-slate hover:text-red">
              {showArchived ? t('coach.hideArchived') : t('coach.showArchived', { count: archived.length })}
            </button>
          )}
        </div>

        <div className="bg-surface border border-mist rounded-xl divide-y divide-mist">
          {active.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate">{athletes.length === 0 ? t('coach.noAthletes') : t('coach.noActive')}</p>
          )}
          {active.map((a) => (
            <div key={a.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-bg-dim transition-colors">
              <Link to={`/coach/atleta/${a.id}`} className="flex-1 min-w-[200px]">
                <p className="font-semibold text-sm">
                  {a.full_name || a.email}
                  {unread[a.id] > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-brand text-white">
                      {t('coach.newMsgs', { count: unread[a.id] })}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate">{a.email}</p>
              </Link>
              <div className="flex items-center gap-4">
                {a.plan ? (
                  <span className="font-mono text-xs text-navy-light">
                    {t('coach.planActive', { name: a.plan.races?.name || a.plan.custom_race_name, weeks: a.plan.duration_weeks })}
                  </span>
                ) : (
                  <span className="font-mono text-xs text-red">{t('coach.noPlan')}</span>
                )}
                <button onClick={() => handleArchive(a)} disabled={busyId === a.id} className="text-xs font-semibold text-slate hover:text-red border border-mist rounded-md px-3 py-1.5 disabled:opacity-60">
                  {t('coach.archive')}
                </button>
              </div>
            </div>
          ))}
        </div>

        {showArchived && archived.length > 0 && (
          <div className="mt-6">
            <h3 className="font-display text-base text-slate mb-2">{t('coach.archivedTitle', { count: archived.length })}</h3>
            <div className="bg-surface border border-mist rounded-xl divide-y divide-mist opacity-90">
              {archived.map((a) => (
                <div key={a.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <Link to={`/coach/atleta/${a.id}`} className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-sm text-slate">{a.full_name || a.email}</p>
                    <p className="text-sm text-slate">{a.email}</p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <button onClick={() => handleRestore(a)} disabled={busyId === a.id} className="text-xs font-semibold text-navy hover:text-red border border-mist rounded-md px-3 py-1.5 disabled:opacity-60">
                      {t('coach.restore')}
                    </button>
                    <button onClick={() => handleDelete(a)} disabled={busyId === a.id} className="text-xs font-semibold text-red hover:text-red-deep border border-red/40 rounded-md px-3 py-1.5 disabled:opacity-60">
                      {t('coach.deleteForever')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
