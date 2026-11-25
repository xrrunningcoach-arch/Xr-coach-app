import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'

function value(row, field, suffix = '') {
  const v = row?.[field]
  if (v == null || v === '') return '—'
  return `${Number.isInteger(Number(v)) ? Number(v) : Number(v).toFixed(1)}${suffix}`
}

export default function IntervalsWellnessPanel({ athleteId, readOnly = false, syncAthleteId = null }) {
  const t = useT()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncMessage, setSyncMessage] = useState('')

  async function loadRows(active = () => true, force = false) {
      setLoading(true)
      setError('')
      setSyncMessage('')
      if (!readOnly) {
        const requestBody = { ...(force ? { force_wellness: true } : {}), ...(syncAthleteId ? { athlete_id: syncAthleteId } : {}) }
        const { data: syncData, error: syncError } = await supabase.functions.invoke('intervals-sync', { body: requestBody })
        if (syncError) {
          console.warn('Intervals wellness refresh failed:', syncError.message)
          setSyncMessage(syncError.message)
        } else if (syncData?.wellness_error) setSyncMessage(syncData.wellness_error)
        else if (syncData?.connected === false) setSyncMessage(t('wellness.notConnected'))
        else if (syncData?.wellness_synced > 0) setSyncMessage(t('wellness.synced', { count: syncData.wellness_synced }))
      }
      const { data, error: queryError } = await supabase.from('intervals_wellness').select('*')
        .eq('profile_id', athleteId).order('wellness_date', { ascending: false }).limit(30)
      if (!active()) return
      if (queryError) setError(queryError.message)
      setRows(data || [])
      setLoading(false)
  }

  useEffect(() => {
    let mounted = true
    const channel = supabase.channel(`intervals-wellness-${athleteId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intervals_wellness', filter: `profile_id=eq.${athleteId}` }, () => loadRows(() => mounted))
      .subscribe()
    if (athleteId) loadRows(() => mounted)
    return () => { mounted = false; supabase.removeChannel(channel) }
  }, [athleteId, readOnly])

  const columns = [
    [t('wellness.hrv'), 'hrv_rmssd', ' ms', 'text-purple-700'],
    [t('wellness.restingHr'), 'resting_hr', ' bpm', 'text-red-600'],
    [t('wellness.sleepingHr'), 'average_sleeping_hr', ' bpm', 'text-rose-600'],
    [t('wellness.sleep'), 'sleep_seconds', 's', 'text-blue-600', true],
    [t('wellness.weight'), 'weight_kg', ' kg', 'text-slate'],
    [t('wellness.sleepScore'), 'sleep_score', '', 'text-indigo-600'],
    [t('wellness.spo2'), 'spo2', '%', 'text-cyan-700'],
    [t('wellness.readiness'), 'readiness', '', 'text-emerald-700'],
    [t('wellness.fatigue'), 'fatigue', '', 'text-amber-700'],
    [t('wellness.stress'), 'stress', '', 'text-orange-700'],
  ]
  const fmt = (row, col) => {
    if (col[4] && row[col[1]] != null) {
      const mins = Math.round(Number(row[col[1]]) / 60)
      return `${Math.floor(mins / 60)} h ${mins % 60} min`
    }
    return value(row, col[1], col[2])
  }

  return <section className="rounded-xl border border-mist bg-surface overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mist bg-bg-dim px-4 py-4 sm:px-5">
      <div><h2 className="font-display text-xl text-navy">{t('wellness.title')}</h2><p className="mt-1 text-xs text-slate">{t('wellness.source')}</p></div>
      {!readOnly && <button type="button" disabled={loading} onClick={() => loadRows(() => true, true)} className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-navy disabled:opacity-60">{t('wellness.refresh')}</button>}
    </div>
    {syncMessage && <p role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{syncMessage}</p>}
    {loading ? <p className="p-5 text-sm text-slate">{t('wellness.loading')}</p> : error ? <p className="p-5 text-sm text-red">{error}</p> : rows.length === 0 ? <div className="p-5 text-sm text-slate"><p>{t('wellness.empty')}</p>{!readOnly && <p className="mt-2">{t('wellness.permissionHint')}</p>}</div> :
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm"><thead className="bg-surface text-left text-xs uppercase text-slate"><tr><th className="px-4 py-3">{t('wellness.date')}</th>{columns.map((col) => <th key={col[0]} className="px-4 py-3">{col[0]}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-mist"><td className="whitespace-nowrap px-4 py-3 font-medium">{new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(`${row.wellness_date}T12:00:00`))}</td>{columns.map((col) => <td key={col[0]} className={`px-4 py-3 font-mono ${col[3]}`}>{fmt(row, col)}</td>)}</tr>)}</tbody></table></div>}
  </section>
}
