import { useT } from '../i18n'

const STYLES = {
  pendiente: 'bg-mist text-slate',
  completado: 'bg-primary text-white',
  saltado: 'bg-red/15 text-red-deep',
}

const LABELS = { pendiente: 'status.pending', completado: 'status.done', saltado: 'status.skipped' }

export default function StatusBadge({ status }) {
  const t = useT()
  const style = STYLES[status] || STYLES.pendiente
  const label = LABELS[status] ? t(LABELS[status]) : status
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold ${style}`}>
      {label}
    </span>
  )
}
