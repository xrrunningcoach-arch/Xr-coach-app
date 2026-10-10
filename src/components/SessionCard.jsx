import { useState } from 'react'
import { supabase } from '../supabaseClient'
import StatusBadge from './StatusBadge'
import DisciplineFields from './DisciplineFields'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import ExerciseList from './ExerciseList'
import { formatPace } from '../lib/stats'

// Tarjeta de actividad del atleta. Movida SIN CAMBIOS desde AthleteDashboard.jsx
// (mismo HTML y mismas clases CSS) para poder renderizarla dentro del
// calendario. Si tocas esta tarjeta, tócala aquí: la usan Semana, Mes y Día.
export default function SessionRow({ session, discipline, evaluations, onUpdated }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(session.status)
  const [rpeActual, setRpeActual] = useState(session.rpe_actual || '')
  const [rpeValue, setRpeValue] = useState(session.rpe_actual_value ?? '')
  const [durationActual, setDurationActual] = useState(session.duration_actual_min ?? '')
  const [notes, setNotes] = useState(session.athlete_notes || '')
  const [link, setLink] = useState(session.link_url || '')
  const [distance, setDistance] = useState(session.distance_actual_km ?? '')
  const [avgHr, setAvgHr] = useState(session.avg_hr_actual ?? '')
  const [metrics, setMetrics] = useState(session.metrics_actual || {})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.rpc('submit_session', {
      p_session_id: session.id,
      p_status: status,
      p_rpe_actual: rpeActual,
      p_notes: notes,
      p_link_url: link,
      p_duration_actual_min: durationActual === '' ? null : Number(durationActual),
      p_rpe_actual_value: rpeValue === '' ? null : Number(rpeValue),
      p_metrics: metrics,
      p_distance_actual_km: distance === '' ? null : Number(distance),
      p_avg_hr_actual: avgHr === '' ? null : Number(avgHr),
    })
    setSaving(false)
    if (error) {
      ui.error(t('card.saveError', { msg: error.message }))
      return
    }
    setOpen(false)
    onUpdated()
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-slate">{t('common.day', { n: session.day_number })}</span>
            {discipline && (
              <span className="font-mono text-[11px] uppercase text-navy-light border border-mist rounded-full px-2 py-0.5">
                {discipline.name}
              </span>
            )}
            <StatusBadge status={session.status} />
          </div>
          <p className="font-semibold text-sm">{session.session_type || t('common.session')}</p>
          <p className="text-sm text-slate mt-0.5">{session.description || t('card.noDescription')}</p>
          <p className="font-mono text-xs text-navy-light mt-1">
            {session.km_estimated ? `${session.km_estimated} km` : ''}
            {session.duration_planned_min ? ` · ${t('today.plannedMin', { min: session.duration_planned_min })}` : ''}
            {session.rpe_theoretical ? ` · ${t('card.theoretical', { v: session.rpe_theoretical })}` : ''}
          </p>
          {discipline && <DisciplineFields discipline={discipline} values={session.metrics} readOnly />}
          {discipline?.metrics_schema?.has_exercises && <ExerciseList sessionId={session.id} />}
          {(session.distance_actual_km != null || session.avg_hr_actual != null) && (
            <p className="font-mono text-xs text-navy-light mt-1">
              {session.distance_actual_km != null ? t('card.distanceDone', { km: session.distance_actual_km }) : ''}
              {session.distance_actual_km != null && session.duration_actual_min
                ? ` · ${formatPace(session.duration_actual_min, session.distance_actual_km)}`
                : ''}
              {session.avg_hr_actual != null ? ` · ${t('card.avgHrDone', { bpm: session.avg_hr_actual })}` : ''}
            </p>
          )}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1.5 text-sm border border-navy text-navy rounded-sm hover:bg-primary hover:text-white transition-colors"
        >
          {open ? t('common.close') : t('card.register')}
        </button>
      </div>

      {evaluations.length > 0 && (
        <div className="mt-3 space-y-2">
          {evaluations.map((ev) => (
            <div key={ev.id} className="bg-bg-dim rounded-sm px-3 py-2">
              <span className="font-mono text-xs text-navy-light" aria-label={t('card.rating', { n: ev.rating })}>
                {'★'.repeat(ev.rating)}
                {'☆'.repeat(5 - ev.rating)}
              </span>
              {ev.comment && <p className="text-sm text-slate mt-0.5">{ev.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 bg-bg-dim rounded-sm p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">{t('card.status')}</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
              >
                <option value="pendiente">{t('status.pending')}</option>
                <option value="completado">{t('status.done')}</option>
                <option value="saltado">{t('status.skipped')}</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">{t('card.rpeNote')}</label>
              <input
                value={rpeActual}
                onChange={(e) => setRpeActual(e.target.value)}
                placeholder={t('card.rpePlaceholder')}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">{t('log.duration')}</label>
              <input
                type="number"
                min={0}
                max={720}
                value={durationActual}
                onChange={(e) => setDurationActual(e.target.value)}
                placeholder="Ej. 55"
                className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">{t('card.rpeLoad')}</label>
              <select
                value={rpeValue}
                onChange={(e) => setRpeValue(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
              >
                <option value="">{t('card.unrated')}</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">{t('card.distanceActual')}</label>
              <input
                type="number"
                min={0}
                max={500}
                step="0.01"
                value={distance}
                onChange={(e) => setDistance(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">{t('card.avgHrActual')}</label>
              <input
                type="number"
                min={30}
                max={240}
                step="1"
                value={avgHr}
                onChange={(e) => setAvgHr(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
              />
            </div>
          </div>

          {discipline && (
            <div>
              <p className="font-mono text-xs text-slate mb-1">{t('card.discData', { name: discipline.name })}</p>
              <DisciplineFields discipline={discipline} values={metrics} onChange={setMetrics} />
            </div>
          )}

          <div>
            <label className="block font-mono text-xs text-slate mb-1">{t('card.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-mist rounded-sm px-3 py-2 bg-surface resize-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-slate mb-1">{t('card.link')}</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            {saving ? t('common.saving') : t('card.saveBtn')}
          </button>
        </div>
      )}
    </div>
  )
}
