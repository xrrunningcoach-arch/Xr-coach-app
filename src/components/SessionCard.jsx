import { disciplineName } from '../lib/disciplines'
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import StatusBadge from './StatusBadge'
import DisciplineFields from './DisciplineFields'
import RpeSelector from './RpeSelector'
import { buildSubmitParams } from '../lib/sessionLog'
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
  const [rpe, setRpe] = useState(session.rpe_actual_value ?? '')
  const [notes, setNotes] = useState(session.athlete_notes || '')
  const [link, setLink] = useState(session.link_url || '')
  const [saving, setSaving] = useState(false)

  // Guardar el registro = sesión completada (sin tocar ningún estado).
  // «No pude hacerla» la marca como saltada.
  async function submit(status) {
    if (status === 'saltado' && !(await ui.confirm(t('log.confirmSkip'), { confirmLabel: t('log.skip') }))) return
    setSaving(true)
    const { error } = await supabase.rpc('submit_session', buildSubmitParams(session, { status, rpe, notes, link }))
    setSaving(false)
    if (error) {
      ui.error(t('card.saveError', { msg: error.message }))
      return
    }
    ui.success(status === 'completado' ? t('log.saved') : t('log.skippedMsg'))
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
                {disciplineName(discipline)}
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
        <div className="mt-4 bg-bg-dim rounded-sm p-4 space-y-4">
          <RpeSelector value={rpe} onChange={setRpe} />

          <div>
            <label className="block font-mono text-xs text-slate mb-1">{t('card.link')}</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              inputMode="url"
              className="w-full border border-mist rounded-sm px-3 py-2 bg-surface"
            />
          </div>

          <div>
            <label className="block font-mono text-xs text-slate mb-1">{t('card.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              className="w-full border border-mist rounded-sm px-3 py-2 bg-surface resize-none"
            />
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={() => submit('completado')}
              disabled={saving}
              className="flex-1 px-4 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
            >
              {saving ? t('common.saving') : t('card.saveBtn')}
            </button>
            <button
              type="button"
              onClick={() => submit('saltado')}
              disabled={saving}
              className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:text-navy hover:border-navy-light disabled:opacity-60"
            >
              {t('log.skip')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
