import { useState } from 'react'
import { INK, niceMax, ticks } from './scale'
import { TooltipBox, useTooltip } from './tooltip'

// Líneas de 2 px con retícula discreta, cursor vertical que se ajusta al punto
// más cercano y etiqueta directa al final de cada serie.
//   labels: ['28 sep', ...]  ·  series: [{ key, label, color, values, area? }]
export default function LineChart({ labels, tooltipTitles, series, format = (v) => String(v), ariaLabel, height = 260 }) {
  const { ref, tip, showAtPointer, showAtXY, hide } = useTooltip()
  const [hover, setHover] = useState(null)
  const W = 680
  const H = height
  const m = { l: 52, r: 64, t: 14, b: 38 }
  const innerW = W - m.l - m.r
  const innerH = H - m.t - m.b
  const n = labels.length
  const max = niceMax(Math.max(...series.flatMap((s) => s.values), 1) * 1.05)
  const x = (i) => (n === 1 ? m.l + innerW / 2 : m.l + (innerW * i) / (n - 1))
  const y = (v) => m.t + innerH - (v / max) * innerH
  const labelEvery = n <= 12 ? 1 : n <= 24 ? 2 : n <= 48 ? 4 : 8

  const path = (values) => values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  function indexFromEvent(e) {
    const svg = e.currentTarget.ownerSVGElement
    const rect = svg.getBoundingClientRect()
    const px = ((e.clientX - rect.left) / rect.width) * W
    const i = Math.round(((px - m.l) / innerW) * (n - 1))
    return Math.min(n - 1, Math.max(0, n === 1 ? 0 : i))
  }

  function content(i) {
    return {
      title: tooltipTitles?.[i] || labels[i],
      rows: series.map((s) => ({ color: s.color, label: s.label, value: format(s.values[i]) })),
    }
  }

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {ticks(max).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth="1" />
            <text x={m.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={INK.muted} fontFamily="JetBrains Mono, monospace">
              {format(t)}
            </text>
          </g>
        ))}

        {labels.map((l, i) =>
          i % labelEvery === 0 ? (
            <text key={l + i} x={x(i)} y={H - 14} textAnchor="middle" fontSize="10" fill={INK.text} fontFamily="JetBrains Mono, monospace">
              {l}
            </text>
          ) : null
        )}

        {series.map((s) => (
          <g key={s.key}>
            {s.area && n > 1 && (
              <path d={`${path(s.values)} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={s.color} opacity="0.1" />
            )}
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={x(n - 1)} cy={y(s.values[n - 1])} r="4" fill={s.color} stroke="var(--c-surface)" strokeWidth="2" />
          </g>
        ))}

        {/* Etiquetas directas al final (si no chocan entre sí) */}
        {series.length <= 2 &&
          series.map((s, si) => {
            const ys = series.map((o) => y(o.values[n - 1]))
            const collide = series.length === 2 && Math.abs(ys[0] - ys[1]) < 14
            if (collide && si === 1) return null
            return (
              <text key={s.key} x={x(n - 1) + 10} y={y(s.values[n - 1]) + 3.5} fontSize="10.5" fontWeight="600" fill={INK.text} fontFamily="JetBrains Mono, monospace">
                {format(s.values[n - 1])}
              </text>
            )
          })}

        {hover != null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={m.t} y2={y(0)} stroke={INK.axis} strokeWidth="1" />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(s.values[hover])} r="4" fill={s.color} stroke="var(--c-surface)" strokeWidth="2" />
            ))}
          </g>
        )}

        <rect
          x={m.l - 6}
          y={m.t}
          width={innerW + 12}
          height={innerH}
          fill="transparent"
          tabIndex={0}
          aria-label={`${ariaLabel}. Usa las flechas izquierda y derecha para recorrer los puntos.`}
          onPointerMove={(e) => {
            const i = indexFromEvent(e)
            setHover(i)
            showAtPointer(e, content(i))
          }}
          onPointerLeave={() => {
            setHover(null)
            hide()
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
            e.preventDefault()
            const next = Math.min(n - 1, Math.max(0, (hover ?? (e.key === 'ArrowRight' ? -1 : n)) + (e.key === 'ArrowRight' ? 1 : -1)))
            setHover(next)
            const box = ref.current.getBoundingClientRect()
            const svgBox = e.currentTarget.ownerSVGElement.getBoundingClientRect()
            showAtXY(
              svgBox.left - box.left + (x(next) / W) * svgBox.width,
              svgBox.top - box.top + (y(series[0].values[next]) / H) * svgBox.height,
              content(next)
            )
          }}
          onBlur={() => {
            setHover(null)
            hide()
          }}
          style={{ outline: 'none' }}
        />
      </svg>

      {series.length > 1 && (
        <ul className="flex flex-wrap gap-4 mt-2 font-mono text-[11px] text-slate">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-[2px] rounded-full" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </li>
          ))}
        </ul>
      )}
      <TooltipBox tip={tip} />
    </div>
  )
}
