import { loadBarWidth } from '../lib/load'
import { useT } from '../i18n'

// Misma pareja de barras que en el panel del coach: carga total (session-RPE)
// y carga de impacto, para que el atleta vea también si una semana mezclando
// deportes se le está acumulando, no solo el coach.
export default function WeekLoadBars({ weekLoad, maxLoad, maxImpact }) {
  const t = useT()
  if (!weekLoad || weekLoad.loggedSessions === 0) {
    return (
      <div className="px-5 py-2 text-xs text-slate italic border-b border-mist">
        {t('load.empty')}
      </div>
    )
  }
  return (
    <div className="px-5 py-3 border-b border-mist space-y-1.5">
      <LoadBar label={t('load.total')} value={weekLoad.load} max={maxLoad} colorClass="bg-primary" />
      <LoadBar label={t('load.impact')} value={weekLoad.impactLoad} max={maxImpact} colorClass="bg-brand" />
    </div>
  )
}

function LoadBar({ label, value, max, colorClass }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] text-slate w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-mist rounded-full overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${loadBarWidth(value, max)}%` }} />
      </div>
      <span className="font-mono text-[11px] text-navy-light w-12 text-right shrink-0">{Math.round(value)}</span>
    </div>
  )
}
