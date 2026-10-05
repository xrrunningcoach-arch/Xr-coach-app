import { useCallback, useRef, useState } from 'react'

// Tooltip compartido por los gráficos: sigue al puntero (o al elemento
// enfocado con teclado) y NUNCA es la única vía de acceso a un dato: cada
// gráfico tiene también su tabla de datos. Los textos se pintan con React
// (texto, no HTML), así que nombres de disciplina o de semana no pueden
// inyectar marcado.
export function useTooltip() {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)

  const showAtPointer = useCallback((event, content) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x: event.clientX - box.left, y: event.clientY - box.top, w: box.width, content })
  }, [])

  const showAtElement = useCallback((event, content) => {
    const box = ref.current?.getBoundingClientRect()
    const el = event.currentTarget.getBoundingClientRect()
    if (!box) return
    setTip({ x: el.left + el.width / 2 - box.left, y: el.top - box.top + 8, w: box.width, content })
  }, [])

  // Posición ya calculada, en píxeles relativos al contenedor (teclado).
  const showAtXY = useCallback((x, y, content) => {
    const box = ref.current?.getBoundingClientRect()
    if (!box) return
    setTip({ x, y, w: box.width, content })
  }, [])

  const hide = useCallback(() => setTip(null), [])

  return { ref, tip, showAtPointer, showAtElement, showAtXY, hide }
}

// content = { title: 'Semana 5 – 11 oct', rows: [{ color, label, value }] }
export function TooltipBox({ tip }) {
  if (!tip) return null
  const flip = tip.x > tip.w * 0.6
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 min-w-[150px] max-w-[260px] rounded-sm border border-mist bg-white px-3 py-2 shadow-md"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
      }}
    >
      {tip.content.title && <p className="font-mono text-[11px] text-slate mb-1">{tip.content.title}</p>}
      <ul className="space-y-0.5">
        {tip.content.rows.map((r) => (
          <li key={r.label} className="flex items-center gap-2 text-xs">
            <span className="inline-block w-3 h-[3px] rounded-full shrink-0" style={{ background: r.color }} aria-hidden="true" />
            <span className="font-semibold text-ink">{r.value}</span>
            <span className="text-slate truncate">{r.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
