const STYLES = {
  pendiente: 'bg-mist text-slate',
  completado: 'bg-navy text-white',
  saltado: 'bg-red/15 text-red-deep',
}

const LABELS = {
  pendiente: 'Pendiente',
  completado: 'Completado',
  saltado: 'Saltado',
}

export default function StatusBadge({ status }) {
  const style = STYLES[status] || STYLES.pendiente
  const label = LABELS[status] || status
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold ${style}`}>
      {label}
    </span>
  )
}
