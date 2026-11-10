import { useState } from 'react'
import { useLang } from '../../i18n'
import { ui } from '../../ui/ui'
import { disciplineName } from '../../lib/disciplines'
import { LEVELS, buildMeetupRow, defaultStartLocal } from '../../lib/meetups'
import { createMeetup } from '../../lib/quedadasApi'

const inputCls = 'w-full border border-mist rounded-md px-3 py-2.5 text-sm'
const labelCls = 'block font-mono text-xs text-slate mb-1'

// Crear una quedada: qué, cuándo, a qué ritmo y dónde.
export default function MeetupForm({ user, social, points, disciplines, onCreated }) {
  const { t } = useLang()
  const [f, setF] = useState(() => ({
    title: '',
    description: '',
    discipline_code: 'running',
    starts_local: defaultStartLocal(),
    duration_min: 60,
    distance_km: '',
    pace_from: '',
    pace_to: '',
    level: 'all',
    max_participants: 8,
    point_id: '',
    place_name: '',
    coords: '',
  }))
  const [errors, setErrors] = useState([])
  const [busy, setBusy] = useState(false)
  const set = (key, value) => setF((prev) => ({ ...prev, [key]: value }))

  async function submit(e) {
    e.preventDefault()
    const { errors: found, row } = buildMeetupRow(f, { organizerId: user.id, communityId: social.community_id, points })
    if (found.length) {
      setErrors(found)
      return
    }
    setErrors([])
    setBusy(true)
    try {
      await createMeetup(row)
      ui.success(t('qd.createdMsg'))
      onCreated()
    } catch (err) {
      setErrors([{ key: 'qd.err.generic', params: { msg: err.message } }])
    }
    setBusy(false)
  }

  const disciplineOptions = disciplines.length ? disciplines : [{ id: 'running', code: 'running', name: 'Carrera a pie' }]

  return (
    <form onSubmit={submit} className="bg-surface border border-mist rounded-xl p-5 space-y-4 max-w-2xl">
      <label className="block">
        <span className={labelCls}>{t('qd.f.title')}</span>
        <input value={f.title} onChange={(e) => set('title', e.target.value)} maxLength={80} placeholder={t('qd.f.titlePh')} className={inputCls} />
      </label>

      <div className="grid sm:grid-cols-2 gap-4">
        <label className="block">
          <span className={labelCls}>{t('qd.f.discipline')}</span>
          <select value={f.discipline_code} onChange={(e) => set('discipline_code', e.target.value)} className={inputCls}>
            {disciplineOptions.map((d) => (
              <option key={d.id} value={d.code}>
                {disciplineName(d)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={labelCls}>{t('qd.f.start')}</span>
          <input type="datetime-local" value={f.starts_local} onChange={(e) => set('starts_local', e.target.value)} className={inputCls} />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block">
          <span className={labelCls}>{t('qd.f.duration')}</span>
          <input type="number" min={10} max={600} value={f.duration_min} onChange={(e) => set('duration_min', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('qd.f.distance')}</span>
          <input inputMode="decimal" value={f.distance_km} onChange={(e) => set('distance_km', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('qd.f.max')}</span>
          <input type="number" min={2} max={50} value={f.max_participants} onChange={(e) => set('max_participants', e.target.value)} className={inputCls} />
        </label>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <label className="block">
          <span className={labelCls}>{t('qd.f.paceFrom')}</span>
          <input placeholder="5:10" maxLength={5} value={f.pace_from} onChange={(e) => set('pace_from', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('qd.f.paceTo')}</span>
          <input placeholder="5:40" maxLength={5} value={f.pace_to} onChange={(e) => set('pace_to', e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>{t('qd.f.level')}</span>
          <select value={f.level} onChange={(e) => set('level', e.target.value)} className={inputCls}>
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {t(`qd.level.${l}`)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-slate -mt-2">{t('qd.f.paceHelp')}</p>

      <label className="block">
        <span className={labelCls}>{t('qd.f.point')}</span>
        <select value={f.point_id} onChange={(e) => set('point_id', e.target.value)} className={inputCls}>
          <option value="">{t('qd.f.otherPlace')}</option>
          {points.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      {!f.point_id && (
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block">
            <span className={labelCls}>{t('qd.f.placeName')}</span>
            <input value={f.place_name} onChange={(e) => set('place_name', e.target.value)} maxLength={120} className={inputCls} />
          </label>
          <label className="block">
            <span className={labelCls}>{t('qd.f.coords')}</span>
            <input value={f.coords} onChange={(e) => set('coords', e.target.value)} placeholder="43.2831, -2.1234" className={inputCls} />
          </label>
          <p className="sm:col-span-2 text-xs text-slate -mt-2">{t('qd.f.coordsHelp')}</p>
        </div>
      )}

      <label className="block">
        <span className={labelCls}>{t('qd.f.description')}</span>
        <textarea value={f.description} onChange={(e) => set('description', e.target.value)} rows={2} maxLength={1000} className={`${inputCls} resize-none`} />
      </label>

      {errors.length > 0 && (
        <ul className="text-red text-sm space-y-0.5" role="alert">
          {errors.map((e) => {
            const text = t(e.key, e.params)
            return <li key={text}>{text}</li>
          })}
        </ul>
      )}

      <button type="submit" disabled={busy} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-md disabled:opacity-60">
        {busy ? t('common.saving') : t('qd.f.save')}
      </button>
    </form>
  )
}
