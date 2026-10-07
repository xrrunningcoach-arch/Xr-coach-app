import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import { addDays, diffDays, longDayTitle, mondayOf } from '../lib/dates'
import { sessionKm } from '../lib/stats'
import { disciplineColor } from '../lib/disciplineColors'
import { findDiscipline } from '../lib/disciplines'
import SessionCard from './SessionCard'
import StatusBadge from './StatusBadge'
import { IconCheck } from './icons'

const RPE_GROUPS = [
  { from: 0, to: 3, key: 'log.easy' },
  { from: 4, to: 5, key: 'log.moderate' },
  { from: 6, to: 7, key: 'log.hard' },
  { from: 8, to: 9, key: 'log.veryHard' },
  { from: 10, to: 10, key: 'log.max' },
]
const rpeWord = (n) => RPE_GROUPS.find((g) => n >= g.from && n <= g.to).key

// Registro en 3 toques: esfuerzo (0-10) + duración + «completada».
// Usa el mismo RPC (submit_session) que la tarjeta completa.
function QuickLog({ session, onSaved }) {
  const t = useT()
  const [rpe, setRpe] = useState('')
  const [minutes, setMinutes] = useState(session.duration_planned_min ?? '')
  const [saving, setSaving] = useState(false)

  async function submit(status) {
    if (status === 'saltado' && !(await ui.confirm(t('log.confirmSkip'), { confirmLabel: t('log.skip') }))) return
    setSaving(true)
    const { error } = await supabase.rpc('submit_session', {
      p_session_id: session.id,
      p_status: status,
      p_rpe_actual: status === 'completado' && rpe !== '' ? `RPE ${rpe}` : '',
      p_notes: session.athlete_notes || '',
      p_link_url: session.link_url || '',
      p_duration_actual_min: status === 'completado' && minutes !== '' ? Number(minutes) : null,
      p_rpe_actual_value: status === 'completado' && rpe !== '' ? Number(rpe) : null,
      p_metrics: session.metrics || {},
    })
    setSaving(false)
    if (error) {
      ui.error(t('log.error', { msg: error.message }))
      return
    }
    ui.success(status === 'completado' ? t('log.saved') : t('log.skippedMsg'))
    onSaved()
  }

  return (
    <div className="mt-4 rounded-lg bg-bg-dim p-4 space-y-4">
      <div>
        <p className="font-mono text-[11px] uppercase text-navy-light mb-2">{t('log.rpe')}</p>
        <div className="grid grid-cols-6 sm:grid-cols-11 gap-1.5 sm:gap-1" role="radiogroup" aria-label={t('log.rpe')}>
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={String(rpe) === String(n)}
              onClick={() => setRpe(String(rpe) === String(n) ? '' : n)}
              className={`h-11 rounded-md text-sm font-mono font-semibold border transition-colors ${
                String(rpe) === String(n)
                  ? 'bg-brand border-brand text-white'
                  : 'bg-surface border-mist text-ink hover:border-navy-light'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="mt-1.5 h-4 text-xs text-slate">{rpe !== '' ? t(rpeWord(Number(rpe))) : ''}</p>
      </div>
      <label className="block">
        <span className="block font-mono text-[11px] uppercase text-navy-light mb-1">{t('log.duration')}</span>
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={720}
          value={minutes}
          onChange={(e) => setMinutes(e.target.value)}
          className="w-full border border-mist rounded-md px-3 py-3 text-base"
        />
      </label>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => submit('completado')}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-deep text-white font-semibold rounded-md py-3.5 disabled:opacity-60"
        >
          <IconCheck width={18} height={18} /> {saving ? t('common.saving') : t('log.done')}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => submit('saltado')}
          className="sm:w-auto px-4 py-3.5 text-sm text-slate border border-mist rounded-md hover:text-navy hover:border-navy-light disabled:opacity-60"
        >
          {t('log.skip')}
        </button>
      </div>
    </div>
  )
}

function SessionBlock({ session, discipline, color, evaluations, onUpdated, today, quick = true, showDate = false }) {
  const t = useT()
  const [details, setDetails] = useState(false)
  const pending = session.status === 'pendiente'
  const meta = [
    sessionKm(session) ? `${Math.round(sessionKm(session) * 10) / 10} km` : null,
    session.duration_planned_min ? t('today.plannedMin', { min: session.duration_planned_min }) : null,
    session.rpe_theoretical ? `RPE ${session.rpe_theoretical}` : null,
  ].filter(Boolean)

  return (
    <article className="bg-surface border border-mist rounded-xl overflow-hidden" style={{ borderLeft: `4px solid ${color}` }}>
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase text-navy-light">
              {discipline?.name || t('common.session')}
              {showDate && session.session_date ? ` · ${longDayTitle(session.session_date)}` : ''}
            </p>
            <h3 className="font-display text-xl text-navy mt-0.5">{session.session_type || t('common.session')}</h3>
          </div>
          <StatusBadge status={session.status} />
        </div>
        {session.description && <p className="text-sm text-ink/90 mt-2 whitespace-pre-line">{session.description}</p>}
        {meta.length > 0 && <p className="font-mono text-xs text-navy-light mt-2">{meta.join(' · ')}</p>}

        {pending && quick && <QuickLog session={session} onSaved={onUpdated} />}

        <button
          type="button"
          onClick={() => setDetails((v) => !v)}
          aria-expanded={details}
          className="mt-3 text-sm font-semibold text-navy-light hover:text-navy underline-offset-4 hover:underline"
        >
          {details ? t('log.hideDetails') : t('log.details')}
        </button>
      </div>
      {details && (
        <div className="border-t border-mist">
          <SessionCard session={session} discipline={discipline} evaluations={evaluations} onUpdated={onUpdated} />
        </div>
      )}
    </article>
  )
}

// Pantalla «Hoy»: lo que el atleta necesita al abrir la app, en una sola columna.
export default function TodayView({ today, profile, plan, race, sessions, disciplines, evaluationsBySession, unread, onUpdated, onNavigate }) {
  const t = useT()

  const data = useMemo(() => {
    const todays = sessions.filter((s) => s.session_date === today)
    const overdue = sessions
      .filter((s) => s.session_date && s.session_date < today && s.status === 'pendiente')
      .sort((a, b) => (a.session_date < b.session_date ? 1 : -1))
      .slice(0, 5)
    const upcoming = sessions
      .filter((s) => s.session_date && s.session_date > today && s.status === 'pendiente')
      .sort((a, b) => (a.session_date > b.session_date ? 1 : a.session_date < b.session_date ? -1 : (a.block_order || 0) - (b.block_order || 0)))
    const monday = mondayOf(today)
    const sunday = addDays(monday, 6)
    const week = sessions.filter((s) => s.session_date && s.session_date >= monday && s.session_date <= sunday)
    return {
      todays,
      overdue,
      next: upcoming[0] || null,
      week: {
        total: week.length,
        done: week.filter((s) => s.status === 'completado').length,
        km: week.reduce((n, s) => n + sessionKm(s), 0),
        kmDone: week.filter((s) => s.status === 'completado').reduce((n, s) => n + sessionKm(s), 0),
      },
    }
  }, [sessions, today])

  const firstName = (profile?.full_name || '').trim().split(/\s+/)[0] || ''
  const raceName = race?.name || plan?.custom_race_name
  const daysToRace = plan?.race_date ? diffDays(plan.race_date, today) : null
  const allDone = data.todays.length > 0 && data.todays.every((s) => s.status !== 'pendiente')

  const renderSession = (s, extra = {}) => {
    const d = findDiscipline(disciplines, s.discipline_id)
    return (
      <SessionBlock
        key={s.id}
        session={s}
        discipline={d}
        color={disciplineColor(d, disciplines)}
        evaluations={evaluationsBySession[s.id] || []}
        onUpdated={onUpdated}
        today={today}
        {...extra}
      />
    )
  }

  const pct = data.week.total ? Math.round((data.week.done / data.week.total) * 100) : 0

  return (
    <div className="space-y-6 max-w-3xl mx-auto md:mx-0">
      <header className="xr-rise">
        <p className="font-mono text-xs uppercase text-navy-light">{longDayTitle(today)}</p>
        <h1 className="font-display text-3xl sm:text-4xl text-navy mt-1">
          {firstName ? t('today.hello', { name: firstName }) : t('today.title')}
        </h1>
      </header>

      {unread > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('chat')}
          className="w-full flex items-center justify-between gap-3 text-left bg-surface border border-brand/60 rounded-xl px-4 py-3"
        >
          <span className="text-sm text-ink">{t('today.unread', { count: unread })}</span>
          <span className="font-semibold text-sm text-red whitespace-nowrap">{t('today.openChat')} →</span>
        </button>
      )}

      {data.todays.length > 0 ? (
        <section className="space-y-4" aria-label={t('today.title')}>
          {allDone && (
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--st-done)]">
              <IconCheck width={18} height={18} /> {t('today.allDone')}
            </p>
          )}
          {data.todays.map((s) => renderSession(s))}
        </section>
      ) : (
        <section className="bg-surface border border-mist rounded-xl p-6 text-center">
          <h2 className="font-display text-2xl text-navy">{t('today.rest')}</h2>
          <p className="text-sm text-slate mt-1">{t('today.restBody')}</p>
        </section>
      )}

      {data.overdue.length > 0 && (
        <section className="space-y-3" aria-label={t('today.overdue')}>
          <div>
            <h2 className="font-display text-xl text-navy">{t('today.overdue')}</h2>
            <p className="text-xs text-slate">{t('today.overdueHelp')}</p>
          </div>
          {data.overdue.map((s) => renderSession(s, { showDate: true }))}
        </section>
      )}

      {data.next && (data.todays.length === 0 || allDone) && (
        <section className="space-y-3" aria-label={t('today.next')}>
          <h2 className="font-display text-xl text-navy">{t('today.next')}</h2>
          {renderSession(data.next, { showDate: true, quick: false })}
        </section>
      )}

      <section className="grid sm:grid-cols-2 gap-4" aria-label={t('today.week')}>
        <div className="bg-surface border border-mist rounded-xl p-4">
          <p className="font-mono text-[11px] uppercase text-navy-light">{t('today.week')}</p>
          <p className="font-display text-3xl text-navy mt-1">
            {data.week.done}<span className="text-slate text-xl"> / {data.week.total}</span>
          </p>
          <div className="mt-2 h-2 rounded-full bg-bg-dim overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-brand rounded-full transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-slate mt-2">
            {t('today.weekSessions', { done: data.week.done, total: data.week.total })} ·{' '}
            {t('today.weekKm', { done: Math.round(data.week.kmDone * 10) / 10, total: Math.round(data.week.km * 10) / 10 })}
          </p>
        </div>

        {raceName && (
          <div className="bg-navy-deep text-white rounded-xl p-4">
            <p className="font-mono text-[11px] uppercase text-navy-light">{t('today.race')}</p>
            <p className="font-display text-xl mt-1 leading-tight">{raceName}</p>
            {daysToRace !== null && (
              <p className="mt-2 text-sm text-white/80">
                {daysToRace === 0
                  ? t('today.raceToday')
                  : daysToRace > 0
                    ? t('today.daysToRace', { count: daysToRace })
                    : ''}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}
