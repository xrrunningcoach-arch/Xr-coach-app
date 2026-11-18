// Tendencia de HRV (rMSSD, ms). Funciones puras.
// Se compara la media de los últimos 7 días con la línea base de los 28 días
// anteriores. Es una señal de contexto, no un diagnóstico.
import { addDays, diffDays } from './dates'

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length

export function hrvTrend(readings, today) {
  const rows = (readings || [])
    .map((r) => ({ date: r.reading_date, v: Number(r.rmssd_ms) }))
    .filter((r) => r.date && Number.isFinite(r.v) && r.date <= today)
  const recent = rows.filter((r) => diffDays(today, r.date) < 7).map((r) => r.v)
  const base = rows.filter((r) => diffDays(today, r.date) >= 7 && diffDays(today, r.date) < 35).map((r) => r.v)
  if (recent.length < 3 || base.length < 7) return { status: 'insufficient', recent: recent.length, base: base.length }
  const r = mean(recent)
  const b = mean(base)
  const pct = ((r - b) / b) * 100
  return {
    status: pct <= -10 ? 'below' : pct >= 10 ? 'above' : 'stable',
    recentMean: Math.round(r * 10) / 10,
    baseMean: Math.round(b * 10) / 10,
    pct: Math.round(pct * 10) / 10,
  }
}

export const lastNDays = (today, n) => addDays(today, -n)
