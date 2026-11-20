import { INK, niceMax, ticks } from './scale'
import { TooltipBox, useTooltip } from './tooltip'

// Columnas agrupadas (SVG puro). Cada fila de `data` es una semana; `series`
// define las barras de cada grupo. Barras finas, extremo superior redondeado
// de 4 px y base recta, separadas 2 px.
//   data:   [{ label, tooltipTitle, current?, ...valores }]
//   series: [{ key, label, color }]
export default function ColumnChart({ data, series, format = (v) => String(v), axisFormat, axisUnit = 1, ariaLabel, height = 260 }) {
  const { ref, tip, showAtPointer, showAtElement, hide } = useTooltip()
  const W = 680
  const H = height
  const m = { l: 48, r: 12, t: 14, b: 38 }
  const innerW = W - m.l - m.r
  const innerH = H - m.t - m.b
  // axisUnit: valores por unidad del eje (60 si los datos son minutos y el eje va en horas)
  const max = niceMax((Math.max(...data.flatMap((d) => series.map((s) => d[s.key] || 0)), 1) * 1.05) / axisUnit) * axisUnit
  const band = innerW / Math.max(data.length, 1)
  const barW = Math.min(14, (band * 0.7) / series.length - 2)
  const x0 = (i) => m.l + band * i + band / 2 - ((barW + 2) * series.length - 2) / 2
  const y = (v) => m.t + innerH - (v / max) * innerH
  const labelEvery = data.length <= 12 ? 1 : data.length <= 24 ? 2 : data.length <= 48 ? 4 : 8
  const axis = axisFormat || format

  // Barra con extremo superior redondeado y base recta.
  const barPath = (x, w, top, base) => {
    const h = base - top
    if (h <= 0) return ''
    const r = Math.min(4, w / 2, h)
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`
  }

  return (
    <div ref={ref} className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={ariaLabel}>
        {ticks(max).map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? INK.axis : INK.grid} strokeWidth="1" />
            <text x={m.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill={INK.muted} fontFamily="JetBrains Mono, monospace">
              {axis(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => (
          <g key={d.label + i}>
            {d.current && <rect x={m.l + band * i} y={m.t} width={band} height={innerH} fill="var(--chart-accent)" opacity="0.1" />}
            {series.map((s, si) => (
              <path key={s.key} d={barPath(x0(i) + si * (barW + 2), barW, y(d[s.key] || 0), y(0))} fill={s.color} />
            ))}
            {i % labelEvery === 0 && (
              <text
                x={m.l + band * i + band / 2}
                y={H - 14}
                textAnchor="middle"
                fontSize="10"
                fill={d.current ? 'var(--chart-accent)' : INK.text}
                fontWeight={d.current ? 700 : 400}
                fontFamily="JetBrains Mono, monospace"
              >
                {d.label}
              </text>
            )}
            {/* Zona de hover/foco: más grande que las barras */}
            <rect
              x={m.l + band * i}
              y={m.t}
              width={band}
              height={innerH}
              fill="transparent"
              tabIndex={0}
              role="img"
              aria-label={`${d.tooltipTitle || d.label}: ${series.map((s) => `${s.label} ${format(d[s.key] || 0)}`).join(', ')}`}
              onPointerMove={(e) => showAtPointer(e, content(d))}
              onPointerLeave={hide}
              onFocus={(e) => showAtElement(e, content(d))}
              onBlur={hide}
              style={{ outline: 'none' }}
              className="focus-visible:stroke-navy-light"
              strokeWidth="1"
            />
          </g>
        ))}
      </svg>

      <ul className="flex flex-wrap gap-4 mt-2 font-mono text-[11px] text-slate">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            {s.label}
          </li>
        ))}
      </ul>
      <TooltipBox tip={tip} />
    </div>
  )

  function content(d) {
    return {
      title: d.tooltipTitle || d.label,
      rows: series.map((s) => ({ color: s.color, label: s.label, value: format(d[s.key] || 0) })),
    }
  }
}
