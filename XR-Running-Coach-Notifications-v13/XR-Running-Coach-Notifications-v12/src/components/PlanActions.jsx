import { useState } from 'react'
import { supabase } from '../supabaseClient'
import Modal from './Modal'
import { useT } from '../i18n'
import { ui } from '../ui/ui'

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm bg-surface text-navy focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

// Editar el objetivo de un plan (p. ej. pasar de 5K a 10K sin empezar de cero)
// o eliminarlo entero. Cambiar el objetivo NO toca las sesiones ya creadas.
export default function PlanActions({ plan, races, sessionCount, onChanged }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [useCustom, setUseCustom] = useState(!plan.race_id)
  const [raceId, setRaceId] = useState(plan.race_id || races[0]?.id || '')
  const [customName, setCustomName] = useState(plan.custom_race_name || '')
  const [raceDate, setRaceDate] = useState(plan.race_date || '')
  const [currentPace, setCurrentPace] = useState(plan.current_pace || '')
  const [targetPace, setTargetPace] = useState(plan.target_pace || '')
  const [weeks, setWeeks] = useState(plan.duration_weeks)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('training_plans')
      .update({
        race_id: useCustom ? null : raceId || null,
        custom_race_name: useCustom ? customName.trim() || null : null,
        race_date: raceDate || null,
        current_pace: currentPace,
        target_pace: targetPace,
        duration_weeks: Math.max(1, Number(weeks) || plan.duration_weeks),
      })
      .eq('id', plan.id)
    setBusy(false)
    if (error) return ui.error(error.message)
    ui.success(t('plan.saved'))
    setEditing(false)
    onChanged()
  }

  async function remove() {
    const ok = await ui.confirm(t('plan.deleteConfirm', { count: sessionCount }), { confirmLabel: t('plan.delete') })
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('training_plans').delete().eq('id', plan.id)
    setBusy(false)
    if (error) return ui.error(error.message)
    ui.success(t('plan.deleted'))
    onChanged()
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setEditing(true)} className="px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-sm hover:bg-white/20">
          {t('plan.edit')}
        </button>
        <button type="button" onClick={remove} disabled={busy} className="px-3 py-2 text-sm bg-white/10 border border-white/20 rounded-sm hover:bg-red/60 disabled:opacity-60">
          {t('plan.delete')}
        </button>
      </div>

      {editing && (
        <Modal title={t('plan.editTitle')} onClose={() => setEditing(false)}>
          <form onSubmit={save} className="space-y-4 text-navy">
            <p className="text-sm text-slate">{t('plan.editHelp')}</p>
            <div>
              <label className={labelCls}>{t('plan.goal')}</label>
              <label className="flex items-center gap-2 text-sm mb-2">
                <input type="checkbox" checked={useCustom} onChange={(e) => setUseCustom(e.target.checked)} /> {t('plan.customGoal')}
              </label>
              {useCustom ? (
                <input value={customName} onChange={(e) => setCustomName(e.target.value)} maxLength={200} placeholder={t('plan.customGoalPh')} className={inputCls} />
              ) : (
                <select value={raceId} onChange={(e) => setRaceId(e.target.value)} className={inputCls}>
                  {races.map((r) => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
              )}
            </div>
            <div className="grid sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>{t('plan.raceDate')}</label><input type="date" value={raceDate} onChange={(e) => setRaceDate(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>{t('plan.weeks')}</label><input type="number" min={1} max={104} value={weeks} onChange={(e) => setWeeks(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>{t('plan.currentPace')}</label><input value={currentPace} onChange={(e) => setCurrentPace(e.target.value)} className={inputCls} /></div>
              <div><label className={labelCls}>{t('plan.targetPace')}</label><input value={targetPace} onChange={(e) => setTargetPace(e.target.value)} className={inputCls} /></div>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={busy} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">{busy ? t('common.saving') : t('plan.save')}</button>
              <button type="button" onClick={() => setEditing(false)} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm">{t('common.cancel')}</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  )
}
