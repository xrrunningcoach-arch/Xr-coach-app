import { TooltipBox, useTooltip } from './tooltip'

// Barras horizontales: una fila por categoría. La barra clara es lo
// programado y la sólida lo completado (mismo color = misma disciplina).
//   rows: [{ key, label, color, total, done }]
export default function HBars({ rows, format = (v) => String(v), unitLabel = '', ariaLabel, totalLabel = 'Programado', doneLabel = 'Completado' }) {
  const { ref, tip, showAtPointer, showAtElement, hide } = useTooltip()
  const max = Math.max(1, ...rows.map((r) => Math.max(r.total, r.done)))

  return (
    <div ref={ref} className="relative" role="img" aria-label={ariaLabel}>
      <ul className="space-y-3">
        {rows.map((r) => {
          const content = {
            title: r.label,
            rows: [
              { color: r.color, label: doneLabel, value: `${format(r.done)}${unitLabel}` },
              { color: `${r.color}55`, label: totalLabel, value: `${format(r.total)}${unitLabel}` },
            ],
          }
          return (
            <li
              key={r.key}
              tabIndex={0}
              onPointerMove={(e) => showAtPointer(e, content)}
              onPointerLeave={hide}
              onFocus={(e) => showAtElement(e, content)}
              onBlur={hide}
              className="grid grid-cols-[minmax(84px,150px)_minmax(0,1fr)_auto] items-center gap-3 outline-none focus-visible:bg-bg rounded-sm"
            >
              <span className="flex items-center gap-2 text-sm text-ink min-w-0">
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ background: r.color }} aria-hidden="true" />
                <span className="truncate">{r.label}</span>
              </span>
              <span className="relative block h-3.5">
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ width: `${(r.total / max) * 100}%`, background: r.color, opacity: 0.25 }}
                />
                <span
                  className="absolute inset-y-0 left-0 rounded-r-[4px]"
                  style={{ width: `${(r.done / max) * 100}%`, background: r.color, minWidth: r.done > 0 ? 3 : 0 }}
                />
              </span>
              <span className="font-mono text-xs text-slate text-right whitespace-nowrap">
                <span className="text-ink font-semibold">{format(r.done)}</span> / {format(r.total)}
                {unitLabel}
              </span>
            </li>
          )
        })}
      </ul>
      <div className="flex gap-4 mt-4 font-mono text-[11px] text-slate">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm bg-navy-mid" aria-hidden="true" /> {doneLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2 rounded-sm bg-navy-mid opacity-25" aria-hidden="true" /> {totalLabel}
        </span>
      </div>
      <TooltipBox tip={tip} />
    </div>
  )
}
