import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'

const W = 720
const H = 218
const PAD = { top: 18, right: 18, bottom: 30, left: 48 }
const formatTime = (seconds) => {
  const n = Math.max(0, Math.round(Number(seconds) || 0))
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`
}
const paceText = (secondsPerKm) => {
  if (!Number.isFinite(secondsPerKm) || secondsPerKm <= 0) return '—'
  const rounded = Math.round(secondsPerKm)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}`
}

function splitByKm(streams) {
  const distance = streams?.distance
  if (!Array.isArray(distance) || distance.length < 3 || !Array.isArray(streams?.time)) return []
  const recordedTime = streams.time
  const moving = streams.moving
  const time = Array.isArray(moving) && moving.length === distance.length
    ? recordedTime.map((_, i) => i === 0 ? 0 : (Number(recordedTime[i - 1]) || 0) + ((moving[i] === true || Number(moving[i]) === 1) ? Math.max(0, (Number(recordedTime[i]) || 0) - (Number(recordedTime[i - 1]) || 0)) : 0))
    : recordedTime
  const hr = streams.heartrate || []
  const rows = []
  const startDistance = Number(distance[0]) || 0
  let boundary = startDistance + 1000
  let lastTime = Number(time[0]) || 0
  let lastIndex = 0
  let lastDist = Number(distance[0]) || 0
  for (let i = 1; i < distance.length; i++) {
    if (distance[i] == null || time[i] == null) continue
    const currentDist = Number(distance[i])
    if (!Number.isFinite(currentDist) || currentDist <= lastDist) continue
    const currentTime = Number(time[i])
    if (!Number.isFinite(currentTime)) continue
    while (currentDist >= boundary) {
      const fraction = Math.max(0, Math.min(1, (boundary - lastDist) / (currentDist - lastDist)))
      const boundaryTime = lastTime + (currentTime - lastTime) * fraction
      const hrValues = hr.slice(lastIndex, i + 1).map(Number).filter((v) => Number.isFinite(v) && v >= 30 && v <= 240)
      const seconds = boundaryTime - (rows.length ? rows[rows.length - 1].time_end : (Number(time[0]) || 0))
      rows.push({ km: rows.length + 1, seconds, pace: seconds, avgHr: hrValues.length ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null, time_end: boundaryTime })
      boundary += 1000
    }
    lastTime = currentTime
    lastDist = currentDist
    if (currentDist < boundary) lastIndex = i
  }
  const finalDistance = Number(distance.at(-1)) || 0
  const finalTime = Number(time.at(-1)) || 0
  const remainder = finalDistance - startDistance - (rows.length * 1000)
  if (remainder >= 200 && finalTime > (rows.at(-1)?.time_end ?? (Number(time[0]) || 0))) {
    const avgHrValues = hr.slice(lastIndex).map(Number).filter((v) => Number.isFinite(v) && v >= 30 && v <= 240)
    const elapsed = finalTime - (rows.at(-1)?.time_end ?? (Number(time[0]) || 0))
    rows.push({ km: rows.length + 1, seconds: elapsed, pace: elapsed / (remainder / 1000), avgHr: avgHrValues.length ? Math.round(avgHrValues.reduce((a, b) => a + b, 0) / avgHrValues.length) : null, partialKm: remainder / 1000 })
  }
  return rows
}

function ActivityChart({ title, values, color, unit, pace = false }) {
  const [hover, setHover] = useState(null)
  const points = useMemo(() => {
    const time = values.time || []
    const raw = values.data || []
    const result = []
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] == null || time[i] == null) continue
      const v = Number(raw[i])
      const x = Number(time[i] ?? i)
      if (!Number.isFinite(v) || !Number.isFinite(x)) continue
      const y = pace ? (v > 0.5 ? 1000 / v : null) : v
      const minAllowed = pace ? 150 : unit === 'bpm' ? 30 : unit === 'spm' ? 0 : -1000
      const maxAllowed = pace ? 1500 : unit === 'bpm' || unit === 'spm' ? 260 : 9000
      if (y == null || y < minAllowed || y > maxAllowed) continue
      result.push({ x, y, raw: v, index: i })
    }
    return result
  }, [values, pace, unit])
  if (points.length < 3) return null
  const xMin = points[0].x
  const xMax = points.at(-1).x || xMin + 1
  const sortedY = points.map((p) => p.y).sort((a, b) => a - b)
  const lo = sortedY[Math.floor(sortedY.length * 0.03)]
  const hi = sortedY[Math.floor(sortedY.length * 0.97)]
  const minAllowed = pace ? 150 : unit === 'bpm' ? 30 : unit === 'spm' ? 0 : -1000
  const maxAllowed = pace ? 1500 : unit === 'bpm' || unit === 'spm' ? 260 : 9000
  const yMin = pace ? Math.max(minAllowed, lo - 30) : Math.max(minAllowed, lo - (unit === 'm' ? 5 : 5))
  const yMax = pace ? Math.min(maxAllowed, hi + 30) : Math.min(maxAllowed, hi + 5)
  const xAt = (x) => PAD.left + ((x - xMin) / Math.max(1, xMax - xMin)) * (W - PAD.left - PAD.right)
  const yAt = (y) => {
    const fraction = (y - yMin) / Math.max(1, yMax - yMin)
    return pace ? PAD.top + fraction * (H - PAD.top - PAD.bottom) : H - PAD.bottom - fraction * (H - PAD.top - PAD.bottom)
  }
  const sampled = points.filter((_, i) => i % Math.max(1, Math.ceil(points.length / 500)) === 0)
  if (sampled.at(-1) !== points.at(-1)) sampled.push(points.at(-1))
  const line = sampled.map((p) => `${xAt(p.x).toFixed(1)},${yAt(p.y).toFixed(1)}`).join(' ')
  const active = hover == null ? null : points[Math.min(points.length - 1, Math.round(hover * (points.length - 1)))]
  return <section className="rounded-xl border border-mist bg-surface p-3 sm:p-4">
    <div className="flex items-center justify-between gap-3">
      <h4 className="font-display text-lg text-navy">{title}</h4>
      <span className="inline-flex items-center gap-2 text-xs text-slate"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />{unit}</span>
    </div>
    <div className="mt-2 relative touch-pan-y" onPointerMove={(event) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left - PAD.left / W * rect.width) / (rect.width * (W - PAD.left - PAD.right) / W)))
      setHover(ratio)
    }} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={title}>
        {[0, 1, 2, 3].map((step) => {
          const y = PAD.top + step * (H - PAD.top - PAD.bottom) / 3
          const value = pace ? yMin + step * (yMax - yMin) / 3 : yMax - step * (yMax - yMin) / 3
          return <g key={step}><line x1={PAD.left} x2={W - PAD.right} y1={y} y2={y} stroke="#e5ece9" strokeDasharray="4 5" /><text x={PAD.left - 8} y={y + 4} textAnchor="end" fill="#6b7f78" fontSize="11">{pace ? paceText(value) : Math.round(value)}</text></g>
        })}
        <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#cbd7d2" />
        <text x={PAD.left} y={H - 7} fill="#6b7f78" fontSize="11">0:00</text>
        <text x={W - PAD.right} y={H - 7} textAnchor="end" fill="#6b7f78" fontSize="11">{formatTime(xMax)}</text>
        <polyline points={line} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {active && <g><line x1={xAt(active.x)} x2={xAt(active.x)} y1={PAD.top} y2={H - PAD.bottom} stroke={color} strokeDasharray="4 4" /><circle cx={xAt(active.x)} cy={yAt(active.y)} r="5" fill={color} stroke="white" strokeWidth="2" /><rect x={Math.max(PAD.left, Math.min(W - 144, xAt(active.x) - 60))} y={PAD.top - 6} width="126" height="24" rx="6" fill="#10231e" /><text x={Math.max(PAD.left + 63, Math.min(W - 81, xAt(active.x) + 3))} y={PAD.top + 10} textAnchor="middle" fill="white" fontSize="11">{formatTime(active.x)} · {pace ? paceText(active.y) : Math.round(active.y)} {pace ? '' : unit}</text></g>}
      </svg>
    </div>
  </section>
}

export default function IntervalsActivityAnalysis({ activityId }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [details, setDetails] = useState(null)
  useEffect(() => { setOpen(false); setDetails(null); setError('') }, [activityId])

  async function showDetails() {
    const next = !open
    setOpen(next)
    if (!next || details || loading) return
    setLoading(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('intervals-activity-detail', { body: { activity_id: activityId } })
      if (invokeError) throw invokeError
      if (!data?.details) throw new Error(t('intervals.detailUnavailable'))
      setDetails(data.details)
    } catch (cause) {
      setError(cause?.message || t('intervals.detailUnavailable'))
    } finally {
      setLoading(false)
    }
  }

  const streams = details?.streams || {}
  const chartValues = (key) => ({ time: streams.time || [], data: streams[key] || [] })
  const splits = useMemo(() => splitByKm(streams), [streams])
  const intervals = details?.intervals || []
  return <div className="mt-3">
    <button type="button" onClick={showDetails} aria-expanded={open} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-brand/60 bg-brand/10 px-3 py-2 text-sm font-semibold text-navy hover:bg-brand/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand">
      <span aria-hidden="true">{open ? '−' : '＋'}</span>{open ? t('intervals.hideAnalysis') : t('intervals.showAnalysis')}
    </button>
    {open && <div className="mt-3 space-y-3">
      {loading && <p className="text-sm text-slate animate-pulse">{t('intervals.loadingAnalysis')}</p>}
      {error && <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error}</p>}
      {details && !details.has_streams && <p className="rounded-lg border border-mist bg-bg-dim p-3 text-sm text-slate">{t('intervals.noStreams')}</p>}
      {details?.has_streams && <>
        <div className="grid gap-3 lg:grid-cols-2">
          <ActivityChart title={t('intervals.heartRateChart')} values={chartValues('heartrate')} color="#e5484d" unit="bpm" />
          <ActivityChart title={t('intervals.paceChart')} values={chartValues('velocity_smooth')} color="#7dbe32" unit="min/km" pace />
          <ActivityChart title={t('intervals.elevationChart')} values={chartValues('altitude')} color="#3a91d8" unit="m" />
          <ActivityChart title={t('intervals.cadenceChart')} values={chartValues('cadence')} color="#9866d8" unit="spm" />
        </div>
        {splits.length > 0 && <section className="overflow-hidden rounded-xl border border-mist bg-surface">
          <div className="border-b border-mist px-4 py-3"><h4 className="font-display text-lg text-navy">{t('intervals.kilometerSplits')}</h4><p className="text-xs text-slate">{t('intervals.splitsHelp')}</p></div>
          <div className="overflow-x-auto"><table className="w-full min-w-[420px] text-sm"><thead className="bg-bg-dim text-left text-xs uppercase text-slate"><tr><th className="px-4 py-2">{t('intervals.km')}</th><th className="px-4 py-2">{t('intervals.splitTime')}</th><th className="px-4 py-2">{t('intervals.pace')}</th><th className="px-4 py-2">{t('intervals.hr')}</th></tr></thead><tbody>{splits.map((split) => <tr key={split.km} className="border-t border-mist"><td className="px-4 py-2 font-semibold text-navy">{split.partialKm ? `${(split.km - 1)}+${split.partialKm.toFixed(1)}` : split.km}</td><td className="px-4 py-2 font-mono">{formatTime(split.seconds)}</td><td className="px-4 py-2 font-mono text-brand-deep">{paceText(split.pace)}</td><td className="px-4 py-2 font-mono text-red-600">{split.avgHr ? `${split.avgHr} bpm` : '—'}</td></tr>)}</tbody></table></div>
        </section>}
      </>}
      {intervals.length > 0 && <details className="rounded-xl border border-mist bg-surface p-4"><summary className="cursor-pointer font-semibold text-navy">{t('intervals.detectedIntervals', { count: intervals.length })}</summary><div className="mt-3 space-y-2">{intervals.slice(0, 12).map((row, i) => <div key={`${row.id ?? i}`} className="flex flex-wrap justify-between gap-2 border-t border-mist pt-2 text-sm"><span>{row.type || t('intervals.interval')} {row.distance ? `· ${(row.distance / 1000).toFixed(2)} km` : ''}</span><span className="font-mono text-slate">{row.average_heartrate ? `${row.average_heartrate} bpm` : ''}{row.moving_time ? ` · ${formatTime(row.moving_time)}` : ''}</span></div>)}</div></details>}
    </div>}
  </div>
}
