import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import { hrvTrend } from '../lib/hrv'

const fmtPace = (s) => (s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} /km` : '—')

// Último test de umbrales (solo lectura) + registro y tendencia de HRV del atleta.
export default function ThresholdsPanel({ test, hrv, athleteId, today, onChanged }) {
  const t = useT()
  const [date, setDate] = useState(today)
  const [rmssd, setRmssd] = useState('')
  const [resting, setResting] = useState('')
  const [saving, setSaving] = useState(false)
  const trend = hrvTrend(hrv, today)

  async function saveHrv(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('hrv_readings').upsert(
      { athlete_id: athleteId, reading_date: date, rmssd_ms: Number(rmssd), resting_hr: resting === '' ? null : Number(resting) },
      { onConflict: 'athlete_id,reading_date' }
    )
    setSaving(false)
    if (error) return ui.error(t('hrv.error', { msg: error.message }))
    setRmssd('')
    setResting('')
    onChanged?.()
  }

  const row = (label, value) => (
    <div>
      <div className="font-mono text-[11px] text-navy-light uppercase">{label}</div>
      <div className="text-lg font-semibold">{value ?? '—'}</div>
    </div>
  )
  const input = 'w-full border border-mist rounded-sm px-3 py-2 bg-surface text-sm'

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="bg-surface border border-mist rounded-sm p-5 space-y-3">
        <h3 className="font-display text-lg text-navy">{t('thr.title')}</h3>
        {test ? (
          <>
            <p className="font-mono text-xs text-slate">{t('thr.dated', { date: test.test_date, type: t('thr.type.' + test.test_type) })}</p>
            <div className="grid grid-cols-2 gap-3">
              {row('VT1', test.vt1_hr ? `${test.vt1_hr} ppm · ${fmtPace(test.vt1_pace_s_km)}` : null)}
              {row('VT2', test.vt2_hr ? `${test.vt2_hr} ppm · ${fmtPace(test.vt2_pace_s_km)}` : null)}
              {row('vAM', test.vam_kmh ? `${test.vam_kmh} km/h` : null)}
              {row(t('thr.lactate'), test.lactate_threshold_mmol ? `${test.lactate_threshold_mmol} mmol/l` : null)}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate">{t('thr.none')}</p>
        )}
      </div>

      <div className="bg-surface border border-mist rounded-sm p-5 space-y-3">
        <h3 className="font-display text-lg text-navy">{t('hrv.title')}</h3>
        <p className="text-sm text-slate">
          {trend.status === 'insufficient'
            ? t('hrv.insufficient')
            : t('hrv.trend.' + trend.status, { recent: trend.recentMean, base: trend.baseMean, pct: trend.pct })}
        </p>
        <form onSubmit={saveHrv} className="grid grid-cols-3 gap-2 items-end">
          <label className="block"><span className="block font-mono text-[11px] text-slate mb-1">{t('hrv.date')}</span>
            <input type="date" required max={today} value={date} onChange={(e) => setDate(e.target.value)} className={input} /></label>
          <label className="block"><span className="block font-mono text-[11px] text-slate mb-1">rMSSD (ms)</span>
            <input type="number" required min={1} max={400} step="0.1" value={rmssd} onChange={(e) => setRmssd(e.target.value)} className={input} /></label>
          <label className="block"><span className="block font-mono text-[11px] text-slate mb-1">{t('hrv.resting')}</span>
            <input type="number" min={25} max={150} value={resting} onChange={(e) => setResting(e.target.value)} className={input} /></label>
          <button type="submit" disabled={saving} className="col-span-3 px-4 py-2 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
            {saving ? t('common.saving') : t('hrv.save')}
          </button>
        </form>
      </div>
    </div>
  )
}
