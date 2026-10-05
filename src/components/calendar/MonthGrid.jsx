import { WEEKDAY_SHORT, dayNumber, mondayOf, monthMatrix, parseISO, weekNumberFor } from '../../lib/dates'

// Cuadrícula de un mes, como un calendario de ordenador: semanas de lunes a
// domingo, días de relleno del mes anterior/siguiente atenuados y el día de
// hoy resaltado. Es genérica: el contenido de cada celda lo pone `renderDay`.
export default function MonthGrid({
  cursor,
  today,
  planStart,
  selectedDay,
  onSelectDay,
  renderDay,
  renderDayAction,
  onDropDay,
  onDragOverDay,
  cellMinHeight = 'min-h-[88px] sm:min-h-[110px]',
}) {
  const d = parseISO(cursor)
  const month = d.getUTCMonth()
  const weeks = monthMatrix(d.getUTCFullYear(), month)

  return (
    <div className="bg-white border border-mist rounded-sm overflow-hidden" role="grid" aria-label="Calendario mensual">
      <div className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] sm:grid-cols-[36px_repeat(7,minmax(0,1fr))] bg-bg-dim border-b border-mist" role="row">
        <div className="py-2 text-center font-mono text-[10px] text-navy-light" role="columnheader">Sem</div>
        {WEEKDAY_SHORT.map((w) => (
          <div key={w} className="py-2 text-center font-mono text-[11px] text-slate" role="columnheader">
            <span className="sm:hidden">{w.charAt(0)}</span>
            <span className="hidden sm:inline">{w}</span>
          </div>
        ))}
      </div>

      {weeks.map((row) => {
        const planWeek = planStart ? weekNumberFor(mondayOf(row[0]), planStart) : null
        return (
          <div key={row[0]} className="grid grid-cols-[28px_repeat(7,minmax(0,1fr))] sm:grid-cols-[36px_repeat(7,minmax(0,1fr))] border-b border-mist last:border-b-0" role="row">
            <div className="flex items-start justify-center pt-2 font-mono text-[10px] text-navy-light border-r border-mist bg-bg/60">
              {planWeek && planWeek >= 1 ? planWeek : ''}
            </div>
            {row.map((iso) => {
              const inMonth = parseISO(iso).getUTCMonth() === month
              const isToday = iso === today
              const isSelected = iso === selectedDay
              return (
                <div
                  key={iso}
                  role="gridcell"
                  tabIndex={0}
                  aria-selected={isSelected}
                  aria-label={iso}
                  onClick={() => onSelectDay?.(iso)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelectDay?.(iso)
                    }
                  }}
                  onDragOver={onDragOverDay ? (e) => onDragOverDay(e, iso) : undefined}
                  onDrop={onDropDay ? (e) => onDropDay(e, iso) : undefined}
                  className={`${cellMinHeight} p-1 sm:p-1.5 border-r border-mist last:border-r-0 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-navy-light focus-visible:ring-inset transition-colors ${
                    isSelected ? 'bg-bg-dim' : inMonth ? 'bg-white hover:bg-bg' : 'bg-bg/60 hover:bg-bg'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full text-xs font-mono ${
                        isToday ? 'bg-red text-white font-bold' : inMonth ? 'text-ink' : 'text-slate/50'
                      }`}
                    >
                      {dayNumber(iso)}
                    </span>
                    {renderDayAction?.(iso)}
                  </div>
                  <div className="flex flex-wrap sm:flex-col gap-1">{renderDay(iso, { inMonth, isToday, isSelected })}</div>
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
