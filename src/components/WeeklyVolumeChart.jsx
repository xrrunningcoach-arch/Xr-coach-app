import { useMemo } from 'react'
import { sessionKm, sessionKmDone } from '../lib/stats'

const COLORS = { grid: 'var(--chart-grid)', axis: 'var(--chart-text)', planned: 'var(--chart-accent)', done: 'var(--chart-done)' }

// Redondea hacia arriba a un número "bonito" para el eje vertical.
function niceMax(value) {
  if (value <= 0) return 10
  const exp = Math.pow(10, Math.floor(Math.log10(value)))
  const f = value / exp
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10
  return nice * exp
}

// Gráfico "Semanas y volumen": línea con los km planificados por semana y
// barras con los km ya completados. Es SVG puro, sin librerías externas.
export default function WeeklyVolumeChart({ sessions, totalWeeks }) {
  const data = useMemo(() => {
    const maxSessionWeek = sessions.reduce((m, s) => Math.max(m, s.week_number || 0), 0)
    const weeks = Math.max(Number(totalWeeks) || 0, maxSessionWeek, 1)
    const rows = Array.from({ length: weeks }, (_, i) => ({ week: i + 1, planned: 0, done: 0 }))
    sessions.forEach((s) => {
      const row = rows[(s.week_number || 1) - 1]
      if (!row) return
      row.planned += sessionKm(s)
      row.done += sessionKmDone(s)
    })
    return rows
  }, [sessions, totalWeeks])

  const totalPlanned = data.reduce((sum, r) => sum + r.planned, 0)
  const totalDone = data.reduce((sum, r) => sum + r.done, 0)

  const W = 640
  const H = 280
  const m = { l: 44, r: 16, t: 24, b: 36 }
  const innerW = W - m.l - m.r
  const innerH = H - m.t - m.b
  const maxValue = niceMax(Math.max(...data.map((r) => r.planned), 1) * 1.05)
  const band = innerW / data.length
  const barW = Math.min(30, band * 0.55)
  const x = (i) => m.l + band * (i + 0.5)
  const y = (v) => m.t + innerH - (v / maxValue) * innerH
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxValue * f * 10) / 10)
  const labelEvery = data.length <= 16 ? 1 : data.length <= 30 ? 2 : 4
  const showValues = data.length <= 16

  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy">Semanas y volumen</h3>
        <span className="font-mono text-[11px] text-slate">
          {Math.round(totalDone * 10) / 10} / {Math.round(totalPlanned * 10) / 10} km completados
        </span>
      </div>

      {totalPlanned === 0 ? (
        <p className="px-5 py-6 text-sm text-slate">
          Todavía no hay kilómetros planificados. Añade los km estimados a las sesiones y aquí verás el volumen de cada semana.
        </p>
      ) : (
        <div className="p-4">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-auto"
            role="img"
            aria-label="Gráfico del volumen semanal en kilómetros: planificado y completado"
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={COLORS.grid} strokeWidth="1" />
                <text x={m.l - 6} y={y(t) + 3} textAnchor="end" fontSize="10" fill={COLORS.axis}>
                  {t}
                </text>
              </g>
            ))}
            <text x={m.l - 36} y={m.t - 10} fontSize="10" fill={COLORS.axis}>km</text>

            {data.map((r, i) => (
              <g key={r.week}>
                {r.done > 0 && (
                  <rect
                    x={x(i) - barW / 2}
                    y={y(r.done)}
                    width={barW}
                    height={Math.max(0, m.t + innerH - y(r.done))}
                    fill={COLORS.done}
                  >
                    <title>{`Semana ${r.week}: ${Math.round(r.done * 10) / 10} km completados`}</title>
                  </rect>
                )}
                {i % labelEvery === 0 && (
                  <text x={x(i)} y={H - m.b + 16} textAnchor="middle" fontSize="10" fill={COLORS.axis}>
                    S{r.week}
                  </text>
                )}
              </g>
            ))}

            <polyline
              fill="none"
              stroke={COLORS.planned}
              strokeWidth="2"
              points={data.map((r, i) => `${x(i)},${y(r.planned)}`).join(' ')}
            />
            {data.map((r, i) => (
              <g key={`p${r.week}`}>
                <circle cx={x(i)} cy={y(r.planned)} r="3.5" fill={COLORS.planned}>
                  <title>{`Semana ${r.week}: ${Math.round(r.planned * 10) / 10} km planificados`}</title>
                </circle>
                {showValues && r.planned > 0 && (
                  <text x={x(i)} y={y(r.planned) - 8} textAnchor="middle" fontSize="10" fill={COLORS.planned}>
                    {Math.round(r.planned * 10) / 10}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <div className="flex flex-wrap gap-5 mt-2 text-xs text-slate font-mono">
            <span className="flex items-center gap-2">
              <span className="inline-block w-5 h-0.5" style={{ background: COLORS.planned }} /> Km planificados
            </span>
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3" style={{ background: COLORS.done }} /> Km completados
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
