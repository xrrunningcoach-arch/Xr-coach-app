import { useEffect, useMemo, useState } from 'react'
import SessionCard from './SessionCard'
import WeekLoadBars from './WeekLoadBars'
import CalendarToolbar from './calendar/CalendarToolbar'
import MonthGrid from './calendar/MonthGrid'
import SessionChip from './calendar/SessionChip'
import useToday from './calendar/useToday'
import { findDiscipline } from '../lib/disciplines'
import { disciplineColor } from '../lib/disciplineColors'
import { weeklyLoad } from '../lib/load'
import { cycleForDate } from '../lib/cycles'
import {
  WEEKDAY_SHORT,
  addDays,
  dayNumber,
  longDayTitle,
  mondayOf,
  monthTitle,
  parseISO,
  shortDate,
  toISO,
  weekDays,
  weekNumberFor,
  weekRangeTitle,
} from '../lib/dates'

const VIEWS = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
]
const VIEW_KEY = 'xr.calendar.view'

function readView() {
  try {
    const v = window.localStorage.getItem(VIEW_KEY)
    return v === 'month' || v === 'week' ? v : 'week'
  } catch {
    return 'week'
  }
}

function sortSessions(list) {
  return [...list].sort(
    (a, b) => (a.block_order || 1) - (b.block_order || 1) || (a.day_number || 0) - (b.day_number || 0) || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  )
}

// Calendario dinámico del atleta. Sustituye a la lista estática de semanas:
// las sesiones se colocan en el día que les asignó el entrenador y las TARJETAS
// de actividad son exactamente las de siempre (SessionCard = la antigua
// SessionRow, sin cambios). Solo cambia el contenedor.
export default function AthleteCalendar({
  plan,
  sessions,
  mesocycles,
  disciplines,
  evaluationsBySession,
  milestones,
  onUpdated,
}) {
  const today = useToday()
  const [view, setView] = useState(readView)
  const [cursor, setCursor] = useState(() => today)
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    try {
      window.localStorage.setItem(VIEW_KEY, view)
    } catch {
      /* sin almacenamiento: se ignora */
    }
  }, [view])

  const planStart = plan?.start_date || null

  const byDate = useMemo(() => {
    const map = new Map()
    sessions.forEach((s) => {
      if (!s.session_date) return
      if (!map.has(s.session_date)) map.set(s.session_date, [])
      map.get(s.session_date).push(s)
    })
    map.forEach((list, key) => map.set(key, sortSessions(list)))
    return map
  }, [sessions])

  const undated = useMemo(() => sortSessions(sessions.filter((s) => !s.session_date)), [sessions])

  // Hitos del plan y fecha de la prueba, por día.
  const eventsByDate = useMemo(() => {
    const map = new Map()
    const push = (iso, ev) => {
      if (!iso) return
      const key = String(iso).slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(ev)
    }
    milestones.forEach((m) => push(m.event_date, { id: m.id, title: m.title, kind: 'hito' }))
    if (plan?.race_date) {
      push(plan.race_date, { id: 'race', title: plan.races?.name || plan.custom_race_name || 'Prueba objetivo', kind: 'prueba' })
    }
    return map
  }, [milestones, plan])

  // Carga (session-RPE) por semana natural, para las mismas barras de siempre.
  const loadByMonday = useMemo(() => {
    const groups = new Map()
    sessions.forEach((s) => {
      if (!s.session_date) return
      const key = mondayOf(s.session_date)
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push({ ...s, week_number: 0 })
    })
    const out = new Map()
    groups.forEach((list, key) => out.set(key, weeklyLoad(list)[0]))
    return out
  }, [sessions])
  const maxLoad = Math.max(1, ...[...loadByMonday.values()].map((w) => w.load))
  const maxImpact = Math.max(1, ...[...loadByMonday.values()].map((w) => w.impactLoad))

  const usedDisciplines = useMemo(() => {
    const ids = new Set(sessions.map((s) => s.discipline_id).filter(Boolean))
    return disciplines.filter((d) => ids.has(d.id))
  }, [sessions, disciplines])

  const weekMonday = mondayOf(cursor)
  const monthStart = toISO(new Date(Date.UTC(parseISO(cursor).getUTCFullYear(), parseISO(cursor).getUTCMonth(), 1)))

  function go(delta) {
    if (view === 'week') setCursor(addDays(weekMonday, delta * 7))
    else {
      const d = parseISO(monthStart)
      setCursor(toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))))
    }
  }

  function goToday() {
    setCursor(today)
    if (view === 'month') setSelectedDay(today)
  }

  function changeView(next) {
    if (next === view) return
    if (next === 'week' && selectedDay) setCursor(selectedDay)
    setView(next)
  }

  const isCurrentPeriod = view === 'week' ? weekMonday === mondayOf(today) : monthStart.slice(0, 7) === today.slice(0, 7)

  const title = view === 'week' ? weekRangeTitle(weekMonday) : monthTitle(monthStart)
  const midWeek = addDays(weekMonday, 3)
  const planWeek = planStart ? weekNumberFor(weekMonday, planStart) : null
  const meso = view === 'week' ? cycleForDate(mesocycles, midWeek, planStart) : cycleForDate(mesocycles, today, planStart)
  const subtitle =
    view === 'week'
      ? [planWeek && planWeek >= 1 ? `Semana ${planWeek} del plan` : null, meso?.name].filter(Boolean).join(' · ')
      : meso
        ? `Ahora: ${meso.name}`
        : ''

  function renderCards(list) {
    return (
      <div className="divide-y divide-mist">
        {list.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            discipline={findDiscipline(disciplines, s.discipline_id)}
            evaluations={evaluationsBySession[s.id] || []}
            onUpdated={onUpdated}
          />
        ))}
      </div>
    )
  }

  function renderEvents(iso) {
    const list = eventsByDate.get(iso)
    if (!list) return null
    return list.map((ev) => (
      <span
        key={ev.id}
        title={ev.title}
        className="inline-block max-w-full truncate rounded-sm bg-red/10 text-red-deep px-1.5 py-0.5 font-mono text-[10px] sm:text-[10px]"
      >
        {ev.kind === 'prueba' ? 'Prueba' : 'Hito'}: {ev.title}
      </span>
    ))
  }

  // ---------------- Vista SEMANA ----------------
  function renderWeek() {
    const days = weekDays(weekMonday)
    const items = days.flatMap((d) => byDate.get(d) || [])
    const done = items.filter((s) => s.status === 'completado').length
    const km = items.reduce((t, s) => t + (Number(s.km_estimated) || 0), 0)
    const weekLoad = loadByMonday.get(weekMonday)
    return (
      <div className="bg-white border border-mist rounded-sm overflow-hidden">
        <div className="bg-bg-dim px-5 py-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg text-navy">
            {planWeek && planWeek >= 1 ? `Semana ${planWeek}` : 'Semana'}
          </h3>
          <span className="font-mono text-[11px] text-slate">
            {done}/{items.length} sesiones · {Math.round(km * 10) / 10} km
          </span>
        </div>
        <WeekLoadBars weekLoad={weekLoad} maxLoad={maxLoad} maxImpact={maxImpact} />
        {days.map((iso, i) => {
          const list = byDate.get(iso) || []
          const isToday = iso === today
          const past = iso < today
          return (
            <section
              key={iso}
              aria-label={longDayTitle(iso)}
              className={`grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[96px_minmax(0,1fr)] border-t border-mist ${isToday ? 'bg-red/[0.04]' : ''}`}
            >
              <div className={`px-2 sm:px-3 py-3 border-r border-mist text-center ${isToday ? 'border-r-2 border-r-red' : ''}`}>
                <p className="font-mono text-[11px] text-slate uppercase">{WEEKDAY_SHORT[i]}</p>
                <p
                  className={`mx-auto mt-1 inline-flex items-center justify-center min-w-[32px] h-8 px-1 rounded-full font-display text-lg ${
                    isToday ? 'bg-red text-white' : past ? 'text-slate' : 'text-navy'
                  }`}
                >
                  {dayNumber(iso)}
                </p>
                {(dayNumber(iso) === 1 || i === 0) && (
                  <p className="font-mono text-[10px] text-navy-light uppercase mt-0.5">{shortDate(iso).split(' ').slice(1).join(' ')}</p>
                )}
              </div>
              <div className="min-w-0">
                {eventsByDate.has(iso) && <div className="px-5 pt-3 flex flex-wrap gap-1">{renderEvents(iso)}</div>}
                {list.length > 0 ? (
                  renderCards(list)
                ) : (
                  <p className={`px-5 py-4 text-xs italic ${past ? 'text-slate/60' : 'text-slate'}`}>Sin entrenamiento programado</p>
                )}
              </div>
            </section>
          )
        })}
      </div>
    )
  }

  // ---------------- Vista MES ----------------
  function renderMonth() {
    const dayList = selectedDay ? byDate.get(selectedDay) || [] : []
    return (
      <div className="space-y-4">
        <MonthGrid
          cursor={monthStart}
          today={today}
          planStart={planStart}
          selectedDay={selectedDay}
          onSelectDay={(iso) => setSelectedDay(iso === selectedDay ? null : iso)}
          renderDay={(iso) => {
            const list = byDate.get(iso) || []
            const shown = list.slice(0, 3)
            return (
              <>
                {renderEvents(iso)}
                {shown.map((s) => {
                  const d = findDiscipline(disciplines, s.discipline_id)
                  return (
                    <SessionChip
                      key={s.id}
                      session={s}
                      discipline={d}
                      color={disciplineColor(d, disciplines)}
                      active={false}
                      onClick={() => setSelectedDay(iso)}
                    />
                  )
                })}
                {list.length > shown.length && (
                  <span className="font-mono text-[10px] text-slate">+{list.length - shown.length} más</span>
                )}
              </>
            )
          }}
        />

        {selectedDay ? (
          <div className="bg-white border border-mist rounded-sm overflow-hidden">
            <div className="bg-bg-dim px-5 py-3 flex items-center justify-between gap-2">
              <h3 className="font-display text-lg text-navy">{longDayTitle(selectedDay)}</h3>
              <button type="button" onClick={() => setSelectedDay(null)} className="text-xs font-semibold text-slate hover:text-red">
                Cerrar
              </button>
            </div>
            {(eventsByDate.get(selectedDay) || []).length > 0 && (
              <div className="px-5 pt-3 flex flex-wrap gap-1">{renderEvents(selectedDay)}</div>
            )}
            {dayList.length > 0 ? (
              renderCards(dayList)
            ) : (
              <p className="px-5 py-5 text-sm text-slate">No hay entrenamientos programados este día.</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-slate">Pulsa un día para ver sus entrenamientos y registrarlos.</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <CalendarToolbar
        title={title}
        subtitle={subtitle}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onToday={goToday}
        todayDisabled={isCurrentPeriod}
        view={view}
        views={VIEWS}
        onView={changeView}
      />

      {usedDisciplines.length > 1 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Leyenda de disciplinas">
          {usedDisciplines.map((d) => (
            <li key={d.id} className="flex items-center gap-1.5 font-mono text-[11px] text-slate">
              <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: disciplineColor(d, disciplines) }} aria-hidden="true" />
              {d.name}
            </li>
          ))}
        </ul>
      )}

      {view === 'week' ? renderWeek() : renderMonth()}

      {undated.length > 0 && (
        <div className="bg-white border border-mist rounded-sm overflow-hidden">
          <div className="bg-bg-dim px-5 py-3">
            <h3 className="font-display text-lg text-navy">Sin día asignado</h3>
            <p className="font-mono text-[11px] text-slate">Tu entrenador aún no les ha puesto fecha en el calendario.</p>
          </div>
          {renderCards(undated)}
        </div>
      )}
    </div>
  )
}
