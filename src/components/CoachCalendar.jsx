import { useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import CalendarToolbar from './calendar/CalendarToolbar'
import MonthGrid from './calendar/MonthGrid'
import SessionChip from './calendar/SessionChip'
import useToday from './calendar/useToday'
import CoachSessionRow from './CoachSessionRow'
import ApplyTemplateModal from './library/ApplyTemplateModal'
import { IconPlus } from './icons'
import { findDiscipline } from '../lib/disciplines'
import { disciplineColor } from '../lib/disciplineColors'
import { cycleForDate } from '../lib/cycles'
import {
  WEEKDAY_SHORT,
  addDays,
  dateForWeekday,
  dayNumber,
  longDayTitle,
  mondayOf,
  monthTitle,
  parseISO,
  placementFor,
  shortDate,
  toISO,
  weekDays,
  weekNumberFor,
  weekRangeTitle,
} from '../lib/dates'
import { ui } from '../ui/ui'

const VIEWS = [
  { id: 'week', label: 'Semana' },
  { id: 'month', label: 'Mes' },
]

function sortSessions(list) {
  return [...list].sort(
    (a, b) => (a.block_order || 1) - (b.block_order || 1) || (a.day_number || 0) - (b.day_number || 0) || String(a.created_at || '').localeCompare(String(b.created_at || ''))
  )
}

// Calendario del atleta visto por el entrenador. Es el mismo calendario que ve
// el atleta, pero editable: "+" crea una sesión en ese día, arrastrar una
// sesión a otro día la mueve, y pulsar una sesión abre su editor completo.
// Todo lo que se coloca aquí aparece en el calendario del atleta.
export default function CoachCalendar({ athlete, plan, sessions, mesocycles, disciplines, milestones, onReload, onSaveSessionToLibrary }) {
  const today = useToday()
  const [view, setView] = useState('week')
  const [cursor, setCursor] = useState(() => today)
  const [selectedDay, setSelectedDay] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [dragId, setDragId] = useState(null)
  const [overDay, setOverDay] = useState(null)
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [startInput, setStartInput] = useState('')

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
  const selected = sessions.find((s) => s.id === selectedId) || null

  const eventsByDate = useMemo(() => {
    const map = new Map()
    milestones.forEach((m) => {
      if (!m.event_date) return
      const key = String(m.event_date).slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ id: m.id, title: m.title, kind: 'hito' })
    })
    if (plan?.race_date) {
      const key = String(plan.race_date).slice(0, 10)
      if (!map.has(key)) map.set(key, [])
      map.get(key).push({ id: 'race', title: plan.races?.name || plan.custom_race_name || 'Prueba', kind: 'prueba' })
    }
    return map
  }, [milestones, plan])

  if (!plan) return <p className="text-sm text-slate">Crea primero un plan en la pestaña «Plan y sesiones».</p>

  // ---- Plan sin fecha de inicio: sin ella no se puede colocar nada ----
  if (!planStart) {
    return (
      <div className="bg-surface border border-mist rounded-sm p-6 space-y-3 max-w-xl">
        <h2 className="font-display text-xl text-navy">Falta la fecha de inicio del plan</h2>
        <p className="text-sm text-slate">
          El calendario necesita saber cuándo empieza la semana 1 para colocar las sesiones en sus días. Si el plan ya tiene sesiones, se colocarán según su semana y su «Día N» (Día 1 = lunes).
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={startInput} onChange={(e) => setStartInput(e.target.value)} className="border border-mist rounded-sm px-3 py-2 text-sm" aria-label="Fecha de inicio del plan" />
          <button
            type="button"
            disabled={!startInput || busy}
            onClick={() => setPlanStart(startInput)}
            className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            Fijar inicio y colocar sesiones
          </button>
        </div>
      </div>
    )
  }

  async function setPlanStart(dateISO) {
    setBusy(true)
    const { error } = await supabase.from('training_plans').update({ start_date: dateISO }).eq('id', plan.id)
    if (error) {
      setBusy(false)
      ui.error(error.message)
      return
    }
    await placeUndated(dateISO)
    setBusy(false)
    await onReload(true)
  }

  // Sesiones sin fecha -> fecha según su semana y "Día N" (1 = lunes).
  async function placeUndated(startISO = planStart) {
    const targets = sessions.filter((s) => !s.session_date)
    const results = await Promise.all(
      targets.map((s) =>
        supabase
          .from('sessions')
          .update({ session_date: dateForWeekday(startISO, Math.max(1, s.week_number), Math.min(6, Math.max(0, (s.day_number || 1) - 1))) })
          .eq('id', s.id)
      )
    )
    const failed = results.find((r) => r.error)
    if (failed) ui.error(failed.error.message)
  }

  async function handlePlaceUndated() {
    setBusy(true)
    await placeUndated()
    setBusy(false)
    await onReload(true)
  }

  async function addSession(iso) {
    setBusy(true)
    const meso = cycleForDate(mesocycles, iso, planStart)
    const runningId = disciplines.find((d) => d.code === 'running')?.id || null
    const { data, error } = await supabase
      .from('sessions')
      .insert({
        plan_id: plan.id,
        mesocycle_id: meso?.id || null,
        ...placementFor(iso, planStart),
        discipline_id: runningId,
        session_type: '',
        description: '',
        km_estimated: null,
        rpe_theoretical: '',
        status: 'pendiente',
      })
      .select()
      .single()
    if (error) {
      setBusy(false)
      ui.error(error.message)
      return
    }
    // El plan crece si la sesión cae después de su última semana.
    if (data.week_number > plan.duration_weeks) {
      await supabase.from('training_plans').update({ duration_weeks: data.week_number }).eq('id', plan.id)
    }
    await onReload(true)
    setBusy(false)
    setSelectedId(data.id)
    setSelectedDay(iso)
  }

  async function moveSession(sessionId, iso) {
    const s = sessions.find((x) => x.id === sessionId)
    if (!s || s.session_date === iso) return
    if (weekNumberFor(iso, planStart) < 1) {
      ui.error(`Esa fecha es anterior al inicio del plan (${planStart}).`)
      return
    }
    setBusy(true)
    const placement = placementFor(iso, planStart, s)
    const meso = cycleForDate(mesocycles, iso, planStart)
    if (meso) placement.mesocycle_id = meso.id
    const { error } = await supabase.from('sessions').update({ ...placement, updated_at: new Date().toISOString() }).eq('id', sessionId)
    if (error) ui.error(error.message)
    else if (placement.week_number > plan.duration_weeks) {
      await supabase.from('training_plans').update({ duration_weeks: placement.week_number }).eq('id', plan.id)
    }
    await onReload(true)
    setBusy(false)
  }

  // ---- navegación ----
  const weekMonday = mondayOf(cursor)
  const monthStart = toISO(new Date(Date.UTC(parseISO(cursor).getUTCFullYear(), parseISO(cursor).getUTCMonth(), 1)))

  function go(delta) {
    if (view === 'week') setCursor(addDays(weekMonday, delta * 7))
    else {
      const d = parseISO(monthStart)
      setCursor(toISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + delta, 1))))
    }
  }

  const isCurrentPeriod = view === 'week' ? weekMonday === mondayOf(today) : monthStart.slice(0, 7) === today.slice(0, 7)
  const planWeek = weekNumberFor(weekMonday, planStart)
  const meso = cycleForDate(mesocycles, view === 'week' ? addDays(weekMonday, 3) : today, planStart)
  const subtitle =
    view === 'week'
      ? [planWeek >= 1 ? `Semana ${planWeek} del plan` : null, meso?.name].filter(Boolean).join(' · ')
      : meso
        ? `Ahora: ${meso.name}`
        : ''

  // ---- arrastrar y soltar ----
  const dnd = {
    onDragOverDay: (e, iso) => {
      if (!dragId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overDay !== iso) setOverDay(iso)
    },
    onDropDay: (e, iso) => {
      e.preventDefault()
      const id = dragId || e.dataTransfer.getData('text/plain')
      setDragId(null)
      setOverDay(null)
      if (id) moveSession(id, iso)
    },
  }

  const chip = (s, full) => {
    const d = findDiscipline(disciplines, s.discipline_id)
    return (
      <SessionChip
        key={s.id}
        session={s}
        discipline={d}
        color={disciplineColor(d, disciplines)}
        full={full}
        active={s.id === selectedId}
        draggable={!busy}
        onClick={() => {
          setSelectedId(s.id === selectedId ? null : s.id)
          if (s.session_date) setSelectedDay(s.session_date)
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', s.id)
          e.dataTransfer.effectAllowed = 'move'
          setDragId(s.id)
        }}
        onDragEnd={() => {
          setDragId(null)
          setOverDay(null)
        }}
      />
    )
  }

  const addButton = (iso) => (
    <button
      type="button"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation()
        addSession(iso)
      }}
      aria-label={`Añadir sesión el ${longDayTitle(iso)}`}
      title="Añadir sesión"
      className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-slate hover:bg-primary hover:text-white opacity-60 hover:opacity-100 focus:opacity-100 transition-colors disabled:opacity-30"
    >
      <IconPlus width={14} height={14} />
    </button>
  )

  const eventTags = (iso) =>
    (eventsByDate.get(iso) || []).map((ev) => (
      <span key={ev.id} title={ev.title} className="inline-block max-w-full truncate rounded-sm bg-red/10 text-red-deep px-1.5 py-0.5 font-mono text-[10px]">
        {ev.kind === 'prueba' ? 'Prueba' : 'Hito'}: {ev.title}
      </span>
    ))

  function renderWeek() {
    const days = weekDays(weekMonday)
    return (
      <div className="bg-surface border border-mist rounded-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-7">
          {days.map((iso, i) => {
            const list = byDate.get(iso) || []
            const isToday = iso === today
            return (
              <div
                key={iso}
                onDragOver={(e) => dnd.onDragOverDay(e, iso)}
                onDrop={(e) => dnd.onDropDay(e, iso)}
                className={`min-h-[120px] md:min-h-[260px] border-b md:border-b-0 md:border-r border-mist last:border-0 p-2 space-y-1.5 transition-colors ${
                  overDay === iso ? 'bg-bg-dim' : isToday ? 'bg-red/[0.04]' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-slate uppercase">{WEEKDAY_SHORT[i]}</span>
                    <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1 rounded-full font-display text-sm ${isToday ? 'bg-brand text-white' : 'text-navy'}`}>
                      {dayNumber(iso)}
                    </span>
                  </span>
                  {addButton(iso)}
                </div>
                {eventTags(iso)}
                {list.map((s) => chip(s, true))}
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  function renderMonth() {
    return (
      <MonthGrid
        cursor={monthStart}
        today={today}
        planStart={planStart}
        selectedDay={selectedDay}
        onSelectDay={(iso) => setSelectedDay(iso)}
        onDragOverDay={dnd.onDragOverDay}
        onDropDay={dnd.onDropDay}
        renderDayAction={addButton}
        renderDay={(iso) => {
          const list = byDate.get(iso) || []
          const shown = list.slice(0, 3)
          return (
            <>
              {eventTags(iso)}
              {shown.map((s) => chip(s, false))}
              {list.length > shown.length && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedDay(iso)
                    setView('week')
                    setCursor(iso)
                  }}
                  className="font-mono text-[10px] text-slate hover:text-red text-left"
                >
                  +{list.length - shown.length} más
                </button>
              )}
            </>
          )
        }}
      />
    )
  }

  return (
    <div className="space-y-4">
      <CalendarToolbar
        title={view === 'week' ? weekRangeTitle(weekMonday) : monthTitle(monthStart)}
        subtitle={subtitle}
        onPrev={() => go(-1)}
        onNext={() => go(1)}
        onToday={() => setCursor(today)}
        todayDisabled={isCurrentPeriod}
        view={view}
        views={VIEWS}
        onView={setView}
        right={
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="px-3 py-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-white rounded-sm"
          >
            Importar de la biblioteca
          </button>
        }
      />

      <p className="text-xs text-slate">
        Pulsa «+» para crear una sesión en ese día, arrastra una sesión a otro día para moverla y pulsa una sesión para editarla. Los cambios se ven al instante en el calendario de {athlete.full_name || 'tu atleta'}.
      </p>

      {undated.length > 0 && (
        <div className="bg-surface border border-mist rounded-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">
            <strong>{undated.length}</strong> {undated.length === 1 ? 'sesión no tiene' : 'sesiones no tienen'} día asignado y el atleta las ve en «Sin día asignado».
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={handlePlaceUndated}
            className="px-3 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-white rounded-sm disabled:opacity-60"
          >
            Colocar según su semana y día
          </button>
        </div>
      )}

      {view === 'week' ? renderWeek() : renderMonth()}

      {selected ? (
        <div className="bg-surface border-2 border-navy rounded-sm">
          <div className="px-5 py-3 bg-bg-dim flex items-center justify-between gap-3">
            <h3 className="font-display text-lg text-navy">
              {selected.session_date ? longDayTitle(selected.session_date) : 'Sesión sin día asignado'}
            </h3>
            <button type="button" onClick={() => setSelectedId(null)} className="text-xs font-semibold text-slate hover:text-red">
              Cerrar
            </button>
          </div>
          <CoachSessionRow
            key={selected.id + (selected.updated_at || '')}
            session={selected}
            disciplines={disciplines}
            mesocycles={mesocycles}
            planStart={planStart}
            onChanged={() => onReload(true)}
            onSaveToLibrary={onSaveSessionToLibrary}
          />
        </div>
      ) : (
        undated.length > 0 && (
          <div className="bg-surface border border-mist rounded-sm">
            <div className="px-5 py-3 bg-bg-dim">
              <h3 className="font-display text-lg text-navy">Sin día asignado</h3>
            </div>
            <ul className="divide-y divide-mist">
              {undated.map((s) => (
                <li key={s.id} className="px-5 py-2.5 flex items-center justify-between gap-3 text-sm">
                  <span>
                    Semana {s.week_number} · Día {s.day_number} · <strong>{s.session_type || 'Sin tipo'}</strong>
                  </span>
                  <button type="button" onClick={() => setSelectedId(s.id)} className="text-xs font-semibold text-navy hover:text-red">
                    Editar y asignar fecha
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )
      )}

      {importing && (
        <ApplyTemplateModal
          athlete={athlete}
          defaultDate={selectedDay || (view === 'week' ? weekMonday : today)}
          onClose={() => setImporting(false)}
          onDone={() => onReload(true)}
        />
      )}
    </div>
  )
}
