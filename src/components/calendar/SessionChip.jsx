import { IconCheck } from '../icons'
import { tr } from '../../i18n'

// Marcador compacto de una sesión dentro de la celda de un día. NO es la
// tarjeta de actividad: es solo un indicador (disciplina, tipo, estado) para
// la vista de mes; la tarjeta completa se muestra en el panel del día y en la
// vista Semana.
export function chipLabel(session, discipline) {
  const base = session.session_type || discipline?.name || tr('common.session')
  const km = session.km_estimated ? ` · ${session.km_estimated} km` : ''
  return `${base}${km}`
}

export default function SessionChip({ session, discipline, color, active, draggable, full = false, onClick, onDragStart, onDragEnd }) {
  const label = chipLabel(session, discipline)
  const done = session.status === 'completado'
  const skipped = session.status === 'saltado'
  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={(e) => {
        e.stopPropagation()
        onClick?.(session)
      }}
      title={`${label}${done ? ` (${tr('chip.done')})` : skipped ? ` (${tr('chip.skipped')})` : ''}`}
      aria-label={`${label}, ${done ? tr('chip.done') : skipped ? tr('chip.skipped') : tr('chip.pending')}`}
      className={`group flex items-center gap-1 max-w-full text-left rounded-sm border transition-colors
        ${full ? 'w-full pl-1.5 pr-1 py-1' : 'w-2.5 h-2.5 sm:w-full sm:h-auto p-0 sm:pl-1.5 sm:pr-1 sm:py-0.5'}
        ${active ? 'border-navy bg-bg-dim' : full ? 'border-mist bg-surface hover:border-navy' : 'border-transparent sm:border-mist sm:bg-surface sm:hover:border-navy'}
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >
      <span
        className={`${full ? 'hidden' : 'sm:hidden block'} w-2.5 h-2.5 rounded-full`}
        style={{ background: color, opacity: skipped ? 0.4 : 1 }}
        aria-hidden="true"
      />
      <span
        className={`${full ? 'block' : 'hidden sm:block'} w-1 self-stretch rounded-full shrink-0 -ml-0.5`}
        style={{ background: color, opacity: skipped ? 0.4 : 1 }}
        aria-hidden="true"
      />
      <span
        className={`${full ? 'block' : 'hidden sm:block'} truncate text-[11px] leading-tight ${skipped ? 'line-through text-slate' : done ? 'text-slate' : 'text-ink font-medium'}`}
      >
        {label}
      </span>
      {done && <IconCheck width={12} height={12} className={`${full ? 'block' : 'hidden sm:block'} shrink-0 text-navy ml-auto`} />}
    </button>
  )
}
