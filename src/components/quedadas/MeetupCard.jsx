import { useState } from 'react'
import { useLang } from '../../i18n'
import { ui } from '../../ui/ui'
import { disciplineColor } from '../../lib/disciplineColors'
import { disciplineName } from '../../lib/disciplines'
import { REPORT_REASONS, formatWhen, joinState, mapsDirectionsUrl, mapsViewUrl, paceRangeParts, spotsLeft } from '../../lib/meetups'
import { cancelMeetup, joinMeetup, leaveMeetup, reportMeetup } from '../../lib/quedadasApi'

const btn = 'px-4 py-2 text-sm font-semibold rounded-md disabled:opacity-60'

// Tarjeta de una quedada: cuándo, dónde (Google Maps), ritmo, plazas y apuntados.
export default function MeetupCard({ meetup, me, community, disciplines, onChanged }) {
  const { t, lang } = useLang()
  const [busy, setBusy] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [reason, setReason] = useState('spam')
  const [details, setDetails] = useState('')

  const count = meetup.people.length
  const joined = meetup.people.some((p) => p.user_id === me)
  const state = joinState({ meetup, userId: me, count, joined })
  const canSeeLocation = meetup.location_visible ?? (joined || meetup.organizer_id === me)
  const discipline = disciplines.find((d) => d.code === meetup.discipline_code) || null
  const color = disciplineColor(discipline, disciplines)
  const pace = paceRangeParts(meetup)
  const area = community?.name || ''

  const meta = [
    t('qd.durationMin', { min: meetup.duration_min }),
    meetup.distance_km != null ? `${meetup.distance_km} km` : null,
    pace ? t('qd.paceRange', pace) : null,
    t(`qd.level.${meetup.level}`),
  ].filter(Boolean)

  async function run(action, okKey) {
    setBusy(true)
    try {
      await action()
      ui.success(t(okKey))
      await onChanged()
    } catch (err) {
      ui.error(t('qd.err.generic', { msg: err.message }))
    }
    setBusy(false)
  }

  async function handleCancel() {
    if (!(await ui.confirm(t('qd.confirmCancel'), { danger: true, confirmLabel: t('qd.cancel') }))) return
    await run(() => cancelMeetup(meetup.id), 'qd.cancelledMsg')
  }

  async function handleReport(e) {
    e.preventDefault()
    setBusy(true)
    try {
      await reportMeetup({ meetupId: meetup.id, reporterId: me, reason, details })
      ui.success(t('qd.report.sent'))
      setReporting(false)
      setDetails('')
    } catch (err) {
      ui.error(t('qd.err.generic', { msg: err.message }))
    }
    setBusy(false)
  }

  return (
    <article
      className={`bg-surface border border-mist rounded-xl overflow-hidden ${state === 'cancelled' ? 'opacity-60' : ''}`}
      style={{ borderLeft: `4px solid ${color}` }}
    >
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase text-navy-light">
              {disciplineName(discipline) || meetup.discipline_code} · {formatWhen(meetup.starts_at, lang)}
            </p>
            <h3 className="font-display text-xl text-navy mt-0.5">{meetup.title}</h3>
            {meetup.organizerName && <p className="text-xs text-slate mt-0.5">{t('qd.organizer', { name: meetup.organizerName })}</p>}
          </div>
          {state === 'cancelled' && <span className="font-mono text-[11px] text-red">{t('qd.cancelled')}</span>}
          {state === 'past' && <span className="font-mono text-[11px] text-slate">{t('qd.past')}</span>}
          {state === 'joined' && <span className="font-mono text-[11px] text-[var(--st-done)]">{t('qd.joined')}</span>}
        </div>

        {meetup.description && <p className="text-sm text-ink/90 whitespace-pre-line">{meetup.description}</p>}
        <p className="font-mono text-xs text-navy-light">{meta.join(' · ')}</p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="font-semibold">{canSeeLocation ? (meetup.exact_place_name || meetup.place_name) : area}</span>
          {canSeeLocation ? (
            <>
              <a href={mapsViewUrl({ ...meetup, place_name: meetup.exact_place_name || meetup.place_name }, area)} target="_blank" rel="noreferrer" className="text-navy underline underline-offset-2 hover:text-red">
                {t('qd.viewMap')}
              </a>
              <a href={mapsDirectionsUrl({ ...meetup, place_name: meetup.exact_place_name || meetup.place_name }, area)} target="_blank" rel="noreferrer" className="text-navy underline underline-offset-2 hover:text-red">
                {t('qd.directions')}
              </a>
            </>
          ) : <span className="text-xs text-slate">{t('qd.locationHidden')}</span>}
        </div>

        <div>
          <p className="font-mono text-[11px] uppercase text-slate">
            {t('qd.people')} · {count}/{meetup.max_participants}
            {state === 'open' || state === 'joined' || state === 'organizer'
              ? ` · ${t('qd.spots', { count: spotsLeft(meetup, count) })}`
              : state === 'full'
                ? ` · ${t('qd.full')}`
                : ''}
          </p>
          <ul className="flex flex-wrap gap-1.5 mt-1.5">
            {meetup.people.map((p) => (
              <li key={p.user_id} className="text-xs bg-bg-dim text-ink rounded-full px-2.5 py-1">
                {p.display_name}
                {p.user_id === me ? ` (${t('qd.you')})` : ''}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state === 'open' && (
            <button type="button" disabled={busy} onClick={() => run(() => joinMeetup(meetup.id), 'qd.joinedMsg')} className={`${btn} bg-brand hover:bg-brand-deep text-white`}>
              {t('qd.join')}
            </button>
          )}
          {state === 'joined' && (
            <button type="button" disabled={busy} onClick={() => run(() => leaveMeetup(meetup.id), 'qd.leftMsg')} className={`${btn} text-slate border border-mist hover:border-red hover:text-red`}>
              {t('qd.leave')}
            </button>
          )}
          {state === 'organizer' && (
            <button type="button" disabled={busy} onClick={handleCancel} className={`${btn} text-slate border border-mist hover:border-red hover:text-red`}>
              {t('qd.cancel')}
            </button>
          )}
          {state === 'full' && <span className="text-sm text-slate">{t('qd.full')}</span>}
          {meetup.organizer_id !== me && (
            <button type="button" onClick={() => setReporting((v) => !v)} className="ml-auto text-xs text-slate hover:text-red">
              {t('qd.report')}
            </button>
          )}
        </div>

        {reporting && (
          <form onSubmit={handleReport} className="bg-bg-dim rounded-lg p-3 space-y-2">
            <label className="block">
              <span className="block font-mono text-[11px] text-slate mb-1">{t('qd.report.reason')}</span>
              <select value={reason} onChange={(e) => setReason(e.target.value)} className="w-full border border-mist rounded-md px-3 py-2 text-sm">
                {REPORT_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(`qd.report.${r}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block font-mono text-[11px] text-slate mb-1">{t('qd.report.details')}</span>
              <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={2} maxLength={500} className="w-full border border-mist rounded-md px-3 py-2 text-sm resize-none" />
            </label>
            <button type="submit" disabled={busy} className={`${btn} bg-primary hover:bg-primary-hover text-white`}>
              {t('qd.report.send')}
            </button>
          </form>
        )}
      </div>
    </article>
  )
}
