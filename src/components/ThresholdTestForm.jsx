import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'

const toSec = (v) => {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(v).trim())
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

// Entrenador: registra un test de umbrales de un atleta. Las zonas del atleta
// se derivan del test más reciente (ver zonesFromThresholds).
export default function ThresholdTestForm({ athleteId, coachId, today, history, onSaved }) {
  const t = useT()
  const [f, setF] = useState({ test_date: today, test_type: 'campo', vt1_hr: '', vt2_hr: '', vt1_pace: '', vt2_pace: '', vam: '', lactate: '', max_hr: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const num = (v) => (v === '' ? null : Number(v))

  async function submit(e) {
    e.preventDefault()
    if (f.vt1_pace && toSec(f.vt1_pace) == null) return ui.error(t('thr.paceFormat'))
    if (f.vt2_pace && toSec(f.vt2_pace) == null) return ui.error(t('thr.paceFormat'))
    setSaving(true)
    const { error } = await supabase.from('threshold_tests').insert({
      athlete_id: athleteId, created_by: coachId, test_date: f.test_date, test_type: f.test_type,
      vt1_hr: num(f.vt1_hr), vt2_hr: num(f.vt2_hr),
      vt1_pace_s_km: f.vt1_pace ? toSec(f.vt1_pace) : null, vt2_pace_s_km: f.vt2_pace ? toSec(f.vt2_pace) : null,
      vam_kmh: num(f.vam), lactate_threshold_mmol: num(f.lactate), max_hr: num(f.max_hr), notes: f.notes || null,
    })
    setSaving(false)
    if (error) return ui.error(t('thr.error', { msg: error.message }))
    ui.success(t('thr.saved'))
    onSaved?.()
  }

  async function remove(id) {
    if (!(await ui.confirm(t('thr.confirmDelete')))) return
    const { error } = await supabase.from('threshold_tests').delete().eq('id', id)
    if (error) return ui.error(error.message)
    onSaved?.()
  }

  const input = 'w-full border border-mist rounded-sm px-3 py-2 bg-surface text-sm'
  const L = ({ label, children }) => (
    <label className="block"><span className="block font-mono text-[11px] text-slate mb-1">{label}</span>{children}</label>
  )
  return (
    <div className="bg-surface border border-mist rounded-sm p-5 space-y-4">
      <h3 className="font-display text-lg text-navy">{t('thr.formTitle')}</h3>
      <form onSubmit={submit} className="grid sm:grid-cols-4 gap-3">
        <L label={t('thr.date')}><input type="date" required value={f.test_date} onChange={(e) => set('test_date', e.target.value)} className={input} /></L>
        <L label={t('thr.typeLabel')}>
          <select value={f.test_type} onChange={(e) => set('test_type', e.target.value)} className={input}>
            {['campo', 'laboratorio', 'rampa', 'lactato'].map((k) => <option key={k} value={k}>{t('thr.type.' + k)}</option>)}
          </select>
        </L>
        <L label="VT1 (ppm)"><input type="number" min={30} max={250} value={f.vt1_hr} onChange={(e) => set('vt1_hr', e.target.value)} className={input} /></L>
        <L label="VT2 (ppm)"><input type="number" min={30} max={250} value={f.vt2_hr} onChange={(e) => set('vt2_hr', e.target.value)} className={input} /></L>
        <L label={t('thr.vt1Pace')}><input placeholder="5:10" value={f.vt1_pace} onChange={(e) => set('vt1_pace', e.target.value)} className={input} /></L>
        <L label={t('thr.vt2Pace')}><input placeholder="4:25" value={f.vt2_pace} onChange={(e) => set('vt2_pace', e.target.value)} className={input} /></L>
        <L label="vAM (km/h)"><input type="number" step="0.1" min={5} max={40} value={f.vam} onChange={(e) => set('vam', e.target.value)} className={input} /></L>
        <L label={t('thr.lactate') + ' (mmol/l)'}><input type="number" step="0.1" min={0.5} max={12} value={f.lactate} onChange={(e) => set('lactate', e.target.value)} className={input} /></L>
        <L label={t('thr.maxHr')}><input type="number" min={100} max={250} value={f.max_hr} onChange={(e) => set('max_hr', e.target.value)} className={input} /></L>
        <div className="sm:col-span-3"><L label={t('thr.notes')}><input maxLength={2000} value={f.notes} onChange={(e) => set('notes', e.target.value)} className={input} /></L></div>
        <button type="submit" disabled={saving} className="sm:col-span-4 px-4 py-2 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
          {saving ? t('common.saving') : t('thr.save')}
        </button>
      </form>
      {history.length > 0 && (
        <ul className="divide-y divide-mist text-sm">
          {history.map((h) => (
            <li key={h.id} className="py-2 flex justify-between gap-3">
              <span className="font-mono text-xs">{h.test_date} · {t('thr.type.' + h.test_type)} · VT1 {h.vt1_hr ?? '—'} / VT2 {h.vt2_hr ?? '—'}</span>
              <button type="button" onClick={() => remove(h.id)} className="text-red text-xs">{t('common.delete')}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
