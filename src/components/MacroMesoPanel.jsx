import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import StatusBadge from './StatusBadge'
import { dateForWeekday, mondayOf, shortDate } from '../lib/dates'
import { cycleDatesFromWeeks, cycleRange, cycleWeeksFromDates, overlappingCycles } from '../lib/cycles'
import { ui } from '../ui/ui'
import { useT } from '../i18n'
import { sessionKm } from '../lib/stats'

// Semáforo de macrociclos y mesociclos: rojo = pendiente, ámbar = en curso,
// verde = completado. Se cambia a mano.
const CYCLE_STATUS = {
  pendiente: { labelKey: 'status.pending', color: 'var(--st-pend)' },
  en_curso: { labelKey: 'mm.inProgress', color: 'var(--st-curso)' },
  completado: { labelKey: 'status.done', color: 'var(--st-done)' },
}
const STATUS_ORDER = ['pendiente', 'en_curso', 'completado']
const GREY = 'var(--chart-muted)'

function Dot({ color, size = 12 }) {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{ width: size, height: size, background: color }}
      aria-hidden="true"
    />
  )
}

function StatusPicker({ value, onChange, disabled }) {
  const t = useT()
  return (
    <div role="group" aria-label={t('zones.col.status')} className="inline-flex border border-mist rounded-sm overflow-hidden bg-surface">
      {STATUS_ORDER.map((key) => {
        const st = CYCLE_STATUS[key]
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => !active && onChange(key)}
            title={t(st.labelKey)}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
              active ? 'bg-bg-dim font-semibold text-navy' : 'text-slate hover:bg-bg'
            }`}
          >
            <Dot color={active ? st.color : 'var(--st-idle)'} size={10} />
            <span className={active ? '' : 'hidden sm:inline'}>{t(st.labelKey)}</span>
          </button>
        )
      })}
    </div>
  )
}

// Estado "derivado" de una semana (microciclo) según sus sesiones.
function weekState(items) {
  if (items.length === 0) return { color: GREY, labelKey: 'mm.noSessions' }
  const done = items.filter((s) => s.status === 'completado').length
  if (done === items.length) return { color: CYCLE_STATUS.completado.color, labelKey: 'mm.weekDone' }
  if (done > 0) return { color: CYCLE_STATUS.en_curso.color, labelKey: 'mm.inProgress' }
  return { color: CYCLE_STATUS.pendiente.color, labelKey: 'status.pending' }
}

function toggleIn(setFn, key) {
  setFn((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })
}

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

function MacroForm({ initial, onSave, onCancel, busy }) {
  const t = useT()
  const [name, setName] = useState(initial.name || '')
  const [objective, setObjective] = useState(initial.objective || '')
  const [startDate, setStartDate] = useState(initial.start_date || '')
  const [endDate, setEndDate] = useState(initial.end_date || '')
  return (
    <div className="bg-surface border-2 border-navy rounded-sm p-4 space-y-3">
      <h4 className="font-display text-lg text-navy">{initial.id ? t('mm.macro.edit') : t('mm.macro.new')}</h4>
      <div>
        <label className={labelCls}>{t('c.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={initial.placeholder} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('c.startDate')}</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('c.endDate')}</label>
          <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
        </div>
      </div>
      <p className="text-xs text-slate -mt-1">{t('mm.macro.autoDates')}</p>
      <div>
        <label className={labelCls}>{t('mm.objectiveOpt')}</label>
        <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ ...initial, name, objective, start_date: startDate, end_date: endDate })}
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60"
        >
          {t('common.save')}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

function MesoForm({ initial, macros, planStart, onSave, onCancel, busy }) {
  const t = useT()
  const [name, setName] = useState(initial.name || '')
  const [macroId, setMacroId] = useState(initial.macrocycle_id || '')
  const [weekStart, setWeekStart] = useState(initial.week_start ?? 1)
  const [weekEnd, setWeekEnd] = useState(initial.week_end ?? 4)
  const [startDate, setStartDate] = useState(() => initial.start_date || cycleDatesFromWeeks(planStart, initial.week_start ?? 1, initial.week_end ?? 4).start_date || '')
  const [endDate, setEndDate] = useState(() => initial.end_date || cycleDatesFromWeeks(planStart, initial.week_start ?? 1, initial.week_end ?? 4).end_date || '')
  const [focus, setFocus] = useState(initial.focus || '')
  const [keyObjective, setKeyObjective] = useState(initial.key_objective || '')
  // Fechas y semanas se mantienen sincronizadas cuando el plan tiene inicio.
  function changeDates(nextStart, nextEnd) {
    setStartDate(nextStart)
    setEndDate(nextEnd)
    const w = cycleWeeksFromDates(planStart, nextStart, nextEnd)
    if (w) {
      setWeekStart(w.week_start)
      setWeekEnd(w.week_end)
    }
  }
  function changeWeeks(nextStart, nextEnd) {
    setWeekStart(nextStart)
    setWeekEnd(nextEnd)
    const d = cycleDatesFromWeeks(planStart, nextStart, nextEnd)
    if (d.start_date) {
      setStartDate(d.start_date)
      setEndDate(d.end_date)
    }
  }
  return (
    <div className="bg-surface border-2 border-navy rounded-sm p-4 space-y-3">
      <h4 className="font-display text-lg text-navy">{initial.id ? t('mm.meso.edit') : t('mm.meso.new')}</h4>
      <div>
        <label className={labelCls}>{t('c.name')}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={initial.placeholder} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('c.startDate')}</label>
          <input type="date" value={startDate} onChange={(e) => changeDates(e.target.value, endDate)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('c.endDate')}</label>
          <input type="date" value={endDate} min={startDate || undefined} onChange={(e) => changeDates(startDate, e.target.value)} className={inputCls} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>{t('mm.weekStart')}</label>
          <input type="number" min={1} value={weekStart} onChange={(e) => changeWeeks(e.target.value, weekEnd)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>{t('mm.weekEnd')}</label>
          <input type="number" min={1} value={weekEnd} onChange={(e) => changeWeeks(weekStart, e.target.value)} className={inputCls} />
        </div>
      </div>
      <p className="text-xs text-slate -mt-1">
        {planStart
          ? t('mm.datesSynced', { date: shortDate(mondayOf(planStart)) })
          : t('mm.noPlanStart')}
      </p>
      <div>
        <label className={labelCls}>{t('mm.macroField')}</label>
        <select value={macroId} onChange={(e) => setMacroId(e.target.value)} className={`${inputCls} bg-surface`}>
          <option value="">{t('mm.noMacro')}</option>
          {macros.map((mc) => (
            <option key={mc.id} value={mc.id}>{mc.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>{t('mm.focus')}</label>
        <input value={focus} onChange={(e) => setFocus(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>{t('mm.keyObjective')}</label>
        <input value={keyObjective} onChange={(e) => setKeyObjective(e.target.value)} className={inputCls} />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ ...initial, name, macrocycle_id: macroId, week_start: weekStart, week_end: weekEnd, start_date: startDate, end_date: endDate, focus, key_objective: keyObjective })}
          className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60"
        >
          {t('common.save')}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

// Panel "Macrociclos y mesociclos": macrociclo > mesociclos > semanas
// (microciclos) > sesiones. Los macrociclos y los mesociclos se muestran del
// último al primero (el 1 queda abajo del todo).
export default function MacroMesoPanel({ plan, macrocycles, mesocycles, sessions, disciplines, onReload, onGoToPlan, onSaveToLibrary }) {
  const t = useT()
  const sortedMacros = useMemo(
    () => [...macrocycles].sort((a, b) => b.order_index - a.order_index),
    [macrocycles]
  )

  const [openMacros, setOpenMacros] = useState(() => {
    const current = macrocycles.find((m) => m.status === 'en_curso')
    const top = [...macrocycles].sort((a, b) => b.order_index - a.order_index)[0]
    const first = current || top
    return new Set(first ? [first.id] : [])
  })
  const [openMesos, setOpenMesos] = useState(() => new Set())
  const [openWeeks, setOpenWeeks] = useState(() => new Set())
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const formRef = useRef(null)

  useEffect(() => {
    if (form && formRef.current) formRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [form])

  const macroIds = useMemo(() => new Set(macrocycles.map((m) => m.id)), [macrocycles])

  const sortMesos = (list) =>
    [...list].sort((a, b) => b.order_index - a.order_index || b.week_start - a.week_start)

  const mesosByMacro = useMemo(() => {
    const map = {}
    mesocycles.forEach((m) => {
      if (m.macrocycle_id && macroIds.has(m.macrocycle_id)) {
        if (!map[m.macrocycle_id]) map[m.macrocycle_id] = []
        map[m.macrocycle_id].push(m)
      }
    })
    Object.keys(map).forEach((k) => {
      map[k] = sortMesos(map[k])
    })
    return map
  }, [mesocycles, macroIds])

  const orphanMesos = useMemo(
    () => sortMesos(mesocycles.filter((m) => !m.macrocycle_id || !macroIds.has(m.macrocycle_id))),
    [mesocycles, macroIds]
  )

  const sessionsByWeek = useMemo(() => {
    const map = {}
    sessions.forEach((s) => {
      if (!map[s.week_number]) map[s.week_number] = []
      map[s.week_number].push(s)
    })
    Object.values(map).forEach((list) => list.sort((a, b) => a.day_number - b.day_number))
    return map
  }, [sessions])

  const nextMacroOrder = macrocycles.length ? Math.max(...macrocycles.map((m) => m.order_index)) + 1 : 1
  const nextMesoOrder = mesocycles.length ? Math.max(...mesocycles.map((m) => m.order_index)) + 1 : 1

  function rangeStats(weekStart, weekEnd) {
    let total = 0
    let done = 0
    let km = 0
    for (let w = weekStart; w <= weekEnd; w += 1) {
      const items = sessionsByWeek[w] || []
      total += items.length
      done += items.filter((s) => s.status === 'completado').length
      km += items.reduce((sum, s) => sum + sessionKm(s), 0)
    }
    return { total, done, km }
  }

  async function run(request) {
    setBusy(true)
    const { error } = await request
    setBusy(false)
    if (error) {
      ui.error(error.message)
      return false
    }
    await onReload(true)
    return true
  }

  const setMacroStatus = (id, status) => run(supabase.from('macrocycles').update({ status }).eq('id', id))
  const setMesoStatus = (id, status) => run(supabase.from('mesocycles').update({ status }).eq('id', id))

  async function saveMacro(f) {
    const name = f.name.trim() || t('mm.macroName', { n: nextMacroOrder })
    const objective = f.objective.trim() || null
    let start_date = f.start_date || null
    let end_date = f.end_date || null
    if (start_date && end_date && end_date < start_date) {
      ui.error(t('mm.err.endBeforeStart'))
      return
    }
    // Sin fechas propias, el macrociclo abarca las de sus mesociclos.
    if (f.id && !start_date && !end_date) {
      const ranges = (mesosByMacro[f.id] || []).map((m) => cycleRange(m, plan.start_date)).filter(Boolean)
      if (ranges.length) {
        start_date = ranges.map((r) => r[0]).sort()[0]
        end_date = ranges.map((r) => r[1]).sort().at(-1)
      }
    }
    const ok = f.id
      ? await run(supabase.from('macrocycles').update({ name, objective, start_date, end_date }).eq('id', f.id))
      : await run(
          supabase.from('macrocycles').insert({ plan_id: plan.id, order_index: nextMacroOrder, name, objective, start_date, end_date })
        )
    if (ok) setForm(null)
  }

  async function deleteMacro(mc) {
    const count = (mesosByMacro[mc.id] || []).length
    const extra = count > 0 ? ` ${t('mm.deleteMacroExtra', { count })}` : ''
    if (!(await ui.confirm(`${t('mm.confirmDeleteMacro', { name: mc.name })}${extra}`, { danger: true, confirmLabel: t('c.delete') }))) return
    await run(supabase.from('macrocycles').delete().eq('id', mc.id))
  }

  async function saveMeso(f) {
    let weekStart = Number(f.week_start)
    let weekEnd = Number(f.week_end)
    let start_date = f.start_date || null
    let end_date = f.end_date || null
    if (start_date && end_date && end_date < start_date) {
      ui.error(t('mm.err.endBeforeStart'))
      return
    }

    // Plan sin fecha de inicio: el inicio de este mesociclo fija la semana 1.
    let planStart = plan.start_date
    if (!planStart && start_date) {
      planStart = mondayOf(start_date)
      const { error } = await supabase.from('training_plans').update({ start_date: planStart }).eq('id', plan.id)
      if (error) {
        ui.error(error.message)
        return
      }
    }

    if (planStart && start_date && end_date) {
      const w = cycleWeeksFromDates(planStart, start_date, end_date)
      if (!w) {
        ui.error(t('mm.err.beforePlan', { date: planStart }))
        return
      }
      weekStart = w.week_start
      weekEnd = w.week_end
    } else if (planStart && !start_date) {
      const d = cycleDatesFromWeeks(planStart, weekStart, weekEnd)
      start_date = d.start_date
      end_date = d.end_date
    }

    if (!Number.isInteger(weekStart) || !Number.isInteger(weekEnd) || weekStart < 1 || weekEnd < weekStart || weekEnd > 104) {
      ui.error(t('mm.err.weeks'))
      return
    }

    const clash = overlappingCycles(mesocycles, start_date && end_date ? [start_date, end_date] : null, planStart, f.id)
    if (clash.length && !(await ui.confirm(t('mm.confirmOverlap', { names: clash.map((c) => c.name).join(', ') }), { confirmLabel: t('mm.saveAnyway') }))) return

    const order = f.id ? f.order_index : nextMesoOrder
    const payload = {
      name: f.name.trim() || t('mm.mesoName', { n: order }),
      week_start: weekStart,
      week_end: weekEnd,
      start_date,
      end_date,
      focus: f.focus.trim() || null,
      key_objective: f.key_objective.trim() || null,
      macrocycle_id: f.macrocycle_id || null,
    }
    const ok = f.id
      ? await run(supabase.from('mesocycles').update(payload).eq('id', f.id))
      : await run(supabase.from('mesocycles').insert({ ...payload, plan_id: plan.id, order_index: order }))
    if (!ok) return

    // El macrociclo se ensancha para abarcar a su mesociclo.
    const macro = macrocycles.find((m) => m.id === payload.macrocycle_id)
    if (macro && start_date && end_date) {
      const nextStart = !macro.start_date || start_date < macro.start_date ? start_date : macro.start_date
      const nextEnd = !macro.end_date || end_date > macro.end_date ? end_date : macro.end_date
      if (nextStart !== macro.start_date || nextEnd !== macro.end_date) {
        await run(supabase.from('macrocycles').update({ start_date: nextStart, end_date: nextEnd }).eq('id', macro.id))
      }
    }

    if (weekEnd > plan.duration_weeks) {
      await run(supabase.from('training_plans').update({ duration_weeks: weekEnd }).eq('id', plan.id))
    }
    setForm(null)
  }

  async function deleteMeso(m) {
    if (!(await ui.confirm(t('mm.confirmDeleteMeso', { name: m.name }), { danger: true, confirmLabel: t('c.delete') }))) return
    await run(supabase.from('mesocycles').delete().eq('id', m.id))
  }

  async function addSession(week, meso) {
    const items = sessionsByWeek[week] || []
    const day = items.length ? Math.max(...items.map((s) => s.day_number)) + 1 : 1
    const runningId = disciplines.find((d) => d.code === 'running')?.id || null
    // La sesión nueva se coloca en el primer día libre de esa semana del
    // calendario, así aparece ya en el calendario del atleta.
    let session_date = null
    if (plan.start_date) {
      const taken = new Set(items.map((x) => x.session_date).filter(Boolean))
      for (let d = 0; d < 7; d += 1) {
        session_date = dateForWeekday(plan.start_date, week, d)
        if (!taken.has(session_date)) break
      }
    }
    await run(
      supabase.from('sessions').insert({
        plan_id: plan.id,
        mesocycle_id: meso.id,
        week_number: week,
        day_number: day,
        session_date,
        discipline_id: runningId,
        session_type: '',
        description: '',
        km_estimated: null,
        rpe_theoretical: '',
        status: 'pendiente',
      })
    )
  }

  function renderWeek(meso, week) {
    const items = sessionsByWeek[week] || []
    const key = `${meso.id}-${week}`
    const open = openWeeks.has(key)
    const state = weekState(items)
    const done = items.filter((s) => s.status === 'completado').length
    const km = items.reduce((sum, s) => sum + sessionKm(s), 0)
    return (
      <div key={key} className="border border-mist rounded-sm bg-surface">
        <button
          type="button"
          onClick={() => toggleIn(setOpenWeeks, key)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm"
        >
          <span className="font-mono text-xs text-slate">{open ? '▾' : '▸'}</span>
          <Dot color={state.color} size={10} />
          <span className="font-semibold text-navy">{t('cal.weekN', { n: week })}</span>
          <span className="font-mono text-[11px] text-slate ml-auto">
            {t('mm.doneKm', { done, total: items.length, km: Math.round(km * 10) / 10 })}
          </span>
        </button>
        {open && (
          <div className="border-t border-mist px-3 py-2 space-y-2">
            {items.length === 0 && <p className="text-xs text-slate italic">{t('mm.emptyWeek')}</p>}
            {items.map((s) => (
              <div key={s.id} className="flex items-start gap-2 text-sm">
                <span className="font-mono text-xs text-slate w-10 shrink-0 pt-0.5">{t('common.day', { n: s.day_number })}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{s.session_type || <span className="text-slate italic font-normal">{t('cc.noType')}</span>}</p>
                  {s.description && <p className="text-xs text-slate break-words">{s.description}</p>}
                </div>
                <span className="font-mono text-[11px] text-slate shrink-0">
                  {s.km_estimated != null ? `${s.km_estimated} km` : ''}
                </span>
                <StatusBadge status={s.status} />
              </div>
            ))}
            <div className="flex flex-wrap gap-4 pt-1">
              <button type="button" disabled={busy} onClick={() => addSession(week, meso)} className="text-xs font-semibold text-navy hover:text-red">
                {t('mm.addSession')}
              </button>
              <button type="button" onClick={onGoToPlan} className="text-xs font-semibold text-slate hover:text-red underline underline-offset-2">
                {t('mm.editInPlan')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function renderMeso(meso) {
    const open = openMesos.has(meso.id)
    const stats = rangeStats(meso.week_start, meso.week_end)
    const weeks = []
    for (let w = meso.week_start; w <= Math.min(meso.week_end, meso.week_start + 103); w += 1) weeks.push(w)
    const color = (CYCLE_STATUS[meso.status] || CYCLE_STATUS.pendiente).color
    return (
      <div key={meso.id} className="border border-mist rounded-sm bg-bg">
        <div className="px-3 py-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleIn(setOpenMesos, meso.id)}
            aria-expanded={open}
            className="flex items-center gap-2 text-left flex-1 min-w-0"
          >
            <span className="font-mono text-xs text-slate">{open ? '▾' : '▸'}</span>
            <Dot color={color} />
            <span className="font-semibold text-navy truncate">{meso.name}</span>
          </button>
          <StatusPicker value={meso.status || 'pendiente'} onChange={(s) => setMesoStatus(meso.id, s)} disabled={busy} />
        </div>
        <p className="px-3 pb-2 font-mono text-[11px] text-slate">
          {t('mm.mesoMeta', { from: meso.week_start, to: meso.week_end })}
          {cycleRange(meso, plan.start_date) ? ` · ${shortDate(cycleRange(meso, plan.start_date)[0])} → ${shortDate(cycleRange(meso, plan.start_date)[1])}` : ''}
          {' '}· {t('mm.doneKm', { done: stats.done, total: stats.total, km: Math.round(stats.km * 10) / 10 })}
        </p>
        {open && (
          <div className="border-t border-mist px-3 py-3 space-y-3">
            {(meso.focus || meso.key_objective) && (
              <div className="text-sm space-y-1">
                {meso.focus && (
                  <p><span className="font-mono text-xs text-slate">{t('mm.focusLabel')}</span>{meso.focus}</p>
                )}
                {meso.key_objective && (
                  <p><span className="font-mono text-xs text-slate">{t('mm.keyObjLabel')}</span>{meso.key_objective}</p>
                )}
              </div>
            )}
            <div className="space-y-2">{weeks.map((w) => renderWeek(meso, w))}</div>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setForm({ kind: 'meso', ...meso })}
                className="text-xs font-semibold text-navy hover:text-red"
              >
                {t('mm.editMeso')}
              </button>
              {onSaveToLibrary && (
                <button type="button" onClick={() => onSaveToLibrary('mesocycle', meso)} className="text-xs font-semibold text-navy hover:text-red">
                  {t('csr.toLibrary')}
                </button>
              )}
              <button type="button" onClick={() => deleteMeso(meso)} className="text-xs font-semibold text-slate hover:text-red">
                {t('c.delete')}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  function newMesoDefaults(macroId) {
    const lastEnd = mesocycles.length ? Math.max(...mesocycles.map((m) => m.week_end)) : 0
    return {
      kind: 'meso',
      macrocycle_id: macroId || '',
      week_start: lastEnd + 1,
      week_end: lastEnd + 4,
      placeholder: t('mm.mesoName', { n: nextMesoOrder }),
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-navy">{t('sum.macroMeso')}</h3>
          <p className="font-mono text-[11px] text-slate">{t('mm.sub')}</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm({ kind: 'macro', placeholder: t('mm.macroName', { n: nextMacroOrder }) })}
            className="px-3 py-2 bg-brand hover:bg-brand-deep text-white text-xs font-semibold rounded-sm"
          >
            {t('mm.newMacroBtn')}
          </button>
          <button
            type="button"
            onClick={() => setForm(newMesoDefaults(sortedMacros[0]?.id))}
            className="px-3 py-2 bg-primary hover:bg-primary-hover text-white text-xs font-semibold rounded-sm"
          >
            {t('mm.newMesoBtn')}
          </button>
        </div>
      </div>

      {form && (
        <div ref={formRef}>
          {form.kind === 'macro' ? (
            <MacroForm key={form.id || 'new-macro'} initial={form} busy={busy} onSave={saveMacro} onCancel={() => setForm(null)} />
          ) : (
            <MesoForm
              key={form.id || 'new-meso'}
              initial={form}
              macros={sortedMacros}
              planStart={plan.start_date}
              busy={busy}
              onSave={saveMeso}
              onCancel={() => setForm(null)}
            />
          )}
        </div>
      )}

      {sortedMacros.length === 0 && orphanMesos.length === 0 && (
        <p className="text-sm text-slate bg-surface border border-mist rounded-sm p-5">
          {t('mm.emptyAll')}
        </p>
      )}

      {sortedMacros.map((mc) => {
        const open = openMacros.has(mc.id)
        const mesos = mesosByMacro[mc.id] || []
        const starts = mesos.map((m) => m.week_start)
        const ends = mesos.map((m) => m.week_end)
        const stats = mesos.length ? rangeStats(Math.min(...starts), Math.max(...ends)) : { total: 0, done: 0 }
        const color = (CYCLE_STATUS[mc.status] || CYCLE_STATUS.pendiente).color
        return (
          <div key={mc.id} className="bg-surface border border-mist rounded-sm">
            <div className="px-4 py-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => toggleIn(setOpenMacros, mc.id)}
                aria-expanded={open}
                className="flex items-center gap-2 text-left flex-1 min-w-0"
              >
                <span className="font-mono text-xs text-slate">{open ? '▾' : '▸'}</span>
                <Dot color={color} size={14} />
                <span className="font-display text-lg text-navy truncate">{mc.name}</span>
              </button>
              <StatusPicker value={mc.status || 'pendiente'} onChange={(s) => setMacroStatus(mc.id, s)} disabled={busy} />
            </div>
            <p className="px-4 pb-3 font-mono text-[11px] text-slate">
              {t('apply.mesos', { count: mesos.length })}
              {mesos.length > 0 && t('mm.weeksRange', { from: Math.min(...starts), to: Math.max(...ends), done: stats.done, total: stats.total })}
              {mc.start_date && mc.end_date ? ` · ${shortDate(mc.start_date)} → ${shortDate(mc.end_date)}` : ''}
            </p>
            {open && (
              <div className="border-t border-mist px-4 py-4 space-y-3">
                {mc.objective && (
                  <p className="text-sm"><span className="font-mono text-xs text-slate">{t('mm.objectiveLabel')}</span>{mc.objective}</p>
                )}
                {mesos.length === 0 && (
                  <p className="text-sm text-slate italic">{t('mm.macroNoMeso')}</p>
                )}
                {mesos.map(renderMeso)}
                <div className="flex flex-wrap gap-4 pt-1">
                  <button type="button" onClick={() => setForm(newMesoDefaults(mc.id))} className="text-xs font-semibold text-navy hover:text-red">
                    {t('mm.mesoInMacro')}
                  </button>
                  <button type="button" onClick={() => setForm({ kind: 'macro', ...mc })} className="text-xs font-semibold text-navy hover:text-red">
                    {t('mm.editMacro')}
                  </button>
                  {onSaveToLibrary && mesos.length > 0 && (
                    <button type="button" onClick={() => onSaveToLibrary('macrocycle', mc)} className="text-xs font-semibold text-navy hover:text-red">
                      {t('csr.toLibrary')}
                    </button>
                  )}
                  <button type="button" onClick={() => deleteMacro(mc)} className="text-xs font-semibold text-slate hover:text-red">
                    {t('c.delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {orphanMesos.length > 0 && (
        <div className="bg-surface border border-mist rounded-sm p-4 space-y-3">
          <h4 className="font-display text-lg text-navy">{t('mm.noMacro')}</h4>
          <p className="text-xs text-slate">{t('mm.orphanHelp')}</p>
          {orphanMesos.map(renderMeso)}
        </div>
      )}
    </div>
  )
}
