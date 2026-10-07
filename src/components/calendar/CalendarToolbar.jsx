import { IconChevronLeft, IconChevronRight } from '../icons'
import { useT } from '../../i18n'

// Barra superior de un calendario: anterior / hoy / siguiente, título del
// periodo y selector de vista. `right` admite botones extra (p. ej. del
// entrenador).
export default function CalendarToolbar({ title, subtitle, onPrev, onNext, onToday, todayDisabled, view, views, onView, right }) {
  const t = useT()
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        <div className="inline-flex border border-mist rounded-md bg-surface overflow-hidden">
          <button type="button" onClick={onPrev} aria-label={t('cal.prev')} className="px-2 py-2 text-slate hover:bg-bg hover:text-navy">
            <IconChevronLeft />
          </button>
          <button type="button" onClick={onNext} aria-label={t('cal.next')} className="px-2 py-2 text-slate hover:bg-bg hover:text-navy border-l border-mist">
            <IconChevronRight />
          </button>
        </div>
        <button
          type="button"
          onClick={onToday}
          disabled={todayDisabled}
          className="px-3 py-2 text-sm border border-mist rounded-sm bg-surface text-navy font-semibold hover:bg-bg disabled:opacity-50 disabled:hover:bg-surface"
        >
          {t('cal.today')}
        </button>
        <div className="ml-1 min-w-0">
          <h2 className="font-display text-xl text-navy leading-tight truncate" aria-live="polite">{title}</h2>
          {subtitle && <p className="font-mono text-[11px] text-slate truncate">{subtitle}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {right}
        <div role="group" aria-label={t('cal.viewGroup')} className="inline-flex border border-mist rounded-sm bg-surface overflow-hidden">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => onView(v.id)}
              aria-pressed={view === v.id}
              className={`px-3 py-2 text-sm transition-colors ${
                view === v.id ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'
              }`}
            >
              {v.key ? t(v.key) : v.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
