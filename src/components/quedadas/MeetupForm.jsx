import { useState } from 'react'
import { useLang } from '../../i18n'
import { ui } from '../../ui/ui'
import { disciplineName, findDiscipline } from '../../lib/disciplines'
import { buildMeetupRow, defaultStartLocal, isoToLocalInput } from '../../lib/meetups'
import { formatPace, sessionKm } from '../../lib/stats'
import { createMeetup } from '../../lib/quedadasApi'

const inputCls = 'w-full border border-mist rounded-md px-3 py-2.5 text-sm'
const labelCls = 'block font-mono text-xs text-slate mb-1'

function initialForm(draftSession, disciplines, t) {
  const nowLocal = defaultStartLocal()
  let startLocal = draftSession?.session_date ? `${draftSession.session_date}T${nowLocal.slice(11, 16)}` : nowLocal
  if (draftSession?.session_date) {
    const proposedStart = new Date(startLocal)
    if (proposedStart.getTime() <= Date.now()) {
      proposedStart.setHours(proposedStart.getHours() + 1, 0, 0, 0)
      const pad = (value) => String(value).padStart(2, '0')
      startLocal = `${draftSession.session_date}T${pad(proposedStart.getHours())}:${pad(proposedStart.getMinutes())}`
    }
  }
  const km = draftSession ? sessionKm(draftSession) : 0
  const discipline = draftSession ? findDiscipline(disciplines, draftSession.discipline_id) : null
  const derivedPace = discipline?.code === 'running' && km > 0 && Number(draftSession?.duration_planned_min) > 0
    ? formatPace(draftSession.duration_planned_min, km).replace(' /km', '')
    : ''
  const title = String(draftSession?.session_type || '').trim().slice(0, 80)
  return {
    title: title || (draftSession ? t('qd.f.planTitle') : ''),
    discipline_code: discipline?.code || 'running',
    starts_local: startLocal,
    distance_km: km > 0 ? String(Math.round(km * 10) / 10) : '',
    pace: derivedPace,
    description: String(draftSession?.description || '').trim().slice(0, 1000),
    place_name: '',
    session_id: draftSession?.id || null,
    repeat_weeks: 1,
  }
}

export default function MeetupForm({ user, social, disciplines, draftSession = null, remainingSeriesSlots = 5, onCreated }) {
  const { t } = useLang()
  const [f, setF] = useState(() => initialForm(draftSession, disciplines, t))
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    const weeks = Math.max(1, Math.min(Number(f.repeat_weeks) || 1, remainingSeriesSlots || 1))
    const seriesId = weeks > 1 ? (globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`) : null
    const rows = []
    let found = []
    for (let index = 0; index < weeks; index += 1) {
      const start = new Date(f.starts_local)
      start.setDate(start.getDate() + index * 7)
      const instance = { ...f, starts_local: isoToLocalInput(start.toISOString()) }
      const built = buildMeetupRow(instance, { organizerId: user.id, communityId: social.community_id })
      if (built.errors.length) {
        found = built.errors
        break
      }
      rows.push({ ...built.row, ...(seriesId ? { series_id: seriesId, series_index: index + 1, series_total: weeks } : {}) })
    }
    if (found.length) {
      setErrors(found)
      return
    }
    setErrors([])
    setBusy(true)
    try {
      await createMeetup(rows)
      ui.success(t('qd.createdMsg'))
      onCreated()
    } catch (err) {
      const message = String(err.message || '')
      setErrors([/session_id|series_id|series_index|series_total|duration_min|max_participants|schema cache|not-null|cannot be null/i.test(message)
        ? { key: 'qd.needMigration015' }
        : { key: 'qd.err.generic', params: { msg: message } }])
    }
    setBusy(false)
  }

  const disciplineOptions = disciplines.length ? disciplines : [{ id: 'running', code: 'running', name: 'Carrera a pie' }]
  const planDiscipline = draftSession ? findDiscipline(disciplines, draftSession.discipline_id) : null
  const plannedKm = draftSession ? sessionKm(draftSession) : 0
  const showPace = f.discipline_code === 'running'
  const sessionSummary = [
    disciplineName(planDiscipline) || t('common.session'),
    plannedKm > 0 ? `${Math.round(plannedKm * 10) / 10} km` : null,
    f.pace ? `${f.pace} /km` : null,
  ].filter(Boolean).join(' · ')

  return (
    <form onSubmit={submit} className="bg-surface border border-mist rounded-xl p-5 sm:p-6 space-y-4 max-w-2xl">
      {draftSession ? (
        <div className="rounded-xl border border-brand/50 bg-brand/10 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-navy-light">{t('qd.f.fromPlan')}</p>
          <h2 className="mt-1 font-display text-xl text-navy">{f.title}</h2>
          <p className="mt-1 text-sm text-slate">{sessionSummary || t('qd.f.planNoMetrics')}</p>
          {f.description && <div className="mt-3 border-t border-brand/20 pt-3"><p className="font-mono text-[10px] uppercase tracking-wide text-slate">{t('qd.f.workoutDetails')}</p><p className="mt-1 whitespace-pre-line text-sm text-ink">{f.description}</p></div>}
          <p className="mt-2 text-xs text-slate">{t('qd.f.planSharedHelp')}</p>
        </div>
      ) : (
        <>
          <label className="block">
            <span className={labelCls}>{t('qd.f.title')}</span>
            <input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={80} placeholder={t('qd.f.titlePh')} className={inputCls} required />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block sm:col-span-1">
              <span className={labelCls}>{t('qd.f.discipline')}</span>
              <select value={f.discipline_code} onChange={(e) => setF((prev) => ({ ...prev, discipline_code: e.target.value, pace: e.target.value === 'running' ? prev.pace : '' }))} className={inputCls}>
                {disciplineOptions.map((d) => <option key={d.id} value={d.code}>{disciplineName(d)}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelCls}>{t('qd.f.distance')}</span>
              <input inputMode="decimal" value={f.distance_km} onChange={(e) => set('distance_km', e.target.value)} className={inputCls} />
            </label>
            {showPace && <label className="block">
              <span className={labelCls}>{t('qd.f.pace')}</span>
              <input placeholder="5:30" maxLength={5} value={f.pace} onChange={(e) => set('pace', e.target.value)} className={inputCls} />
            </label>}
          </div>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>{t('qd.f.start')}</span>
          <input type="datetime-local" value={f.starts_local} onChange={(e) => set('starts_local', e.target.value)} className={inputCls} required />
        </label>
        <label className="block">
          <span className={labelCls}>{t('qd.f.placeName')}</span>
          <input value={f.place_name} onChange={(e) => set('place_name', e.target.value)} maxLength={120} placeholder={t('qd.f.placePh')} className={inputCls} required />
        </label>
      </div>

      <label className="block max-w-sm">
        <span className={labelCls}>{t('qd.f.repeat')}</span>
        <select value={f.repeat_weeks} onChange={(e) => set('repeat_weeks', Number(e.target.value))} className={inputCls}>
          {Array.from({ length: Math.max(1, remainingSeriesSlots) }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? t('qd.f.once') : t('qd.f.weeklyCount', { count: n })}</option>)}
        </select>
        {f.repeat_weeks > 1 && <span className="mt-1 block text-xs text-slate">{t('qd.f.repeatHelp')}</span>}
      </label>
      {remainingSeriesSlots === 0 && <p className="rounded-lg border border-brand/50 bg-brand/10 p-3 text-sm text-navy" role="status">{t('qd.f.limitReached')}</p>}
      <p className="text-xs text-slate">{t('qd.f.locationPrivacy')}</p>

      {errors.length > 0 && <ul className="text-red text-sm space-y-0.5" role="alert">{errors.map((e) => {
        const text = t(e.key, e.params)
        return <li key={text}>{text}</li>
      })}</ul>}

      <button type="submit" disabled={busy || remainingSeriesSlots === 0} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-md disabled:opacity-60">
        {busy ? t('common.saving') : t('qd.f.save')}
      </button>
    </form>
  )
}
