import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../supabaseClient'
import StatusBadge from './StatusBadge'

// Semáforo de macrociclos y mesociclos: rojo = pendiente, ámbar = en curso,
// verde = completado. Se cambia a mano.
const CYCLE_STATUS = {
  pendiente: { label: 'Pendiente', color: '#c1392b' },
  en_curso: { label: 'En curso', color: '#d99a1e' },
  completado: { label: 'Completado', color: '#2e8b57' },
}
const STATUS_ORDER = ['pendiente', 'en_curso', 'completado']
const GREY = '#9aa8a1'

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
  return (
    <div role="group" aria-label="Estado" className="inline-flex border border-mist rounded-sm overflow-hidden bg-white">
      {STATUS_ORDER.map((key) => {
        const st = CYCLE_STATUS[key]
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            onClick={() => !active && onChange(key)}
            title={st.label}
            aria-pressed={active}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs transition-colors ${
              active ? 'bg-bg-dim font-semibold text-navy' : 'text-slate hover:bg-bg'
            }`}
          >
            <Dot color={active ? st.color : '#d7e3dd'} size={10} />
            <span className={active ? '' : 'hidden sm:inline'}>{st.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Estado "derivado" de una semana (microciclo) según sus sesiones.
function weekState(items) {
  if (items.length === 0) return { color: GREY, label: 'Sin sesiones' }
  const done = items.filter((s) => s.status === 'completado').length
  if (done === items.length) return { color: CYCLE_STATUS.completado.color, label: 'Completada' }
  if (done > 0) return { color: CYCLE_STATUS.en_curso.color, label: 'En curso' }
  return { color: CYCLE_STATUS.pendiente.color, label: 'Pendiente' }
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
  const [name, setName] = useState(initial.name || '')
  const [objective, setObjective] = useState(initial.objective || '')
  return (
    <div className="bg-white border-2 border-navy rounded-sm p-4 space-y-3">
      <h4 className="font-display text-lg text-navy">{initial.id ? 'Editar macrociclo' : 'Nuevo macrociclo'}</h4>
      <div>
        <label className={labelCls}>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={initial.placeholder} />
      </div>
      <div>
        <label className={labelCls}>Objetivo (opcional)</label>
        <textarea value={objective} onChange={(e) => setObjective(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ ...initial, name, objective })}
          className="px-4 py-2 bg-navy hover:bg-navy-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
        >
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function MesoForm({ initial, macros, onSave, onCancel, busy }) {
  const [name, setName] = useState(initial.name || '')
  const [macroId, setMacroId] = useState(initial.macrocycle_id || '')
  const [weekStart, setWeekStart] = useState(initial.week_start ?? 1)
  const [weekEnd, setWeekEnd] = useState(initial.week_end ?? 4)
  const [focus, setFocus] = useState(initial.focus || '')
  const [keyObjective, setKeyObjective] = useState(initial.key_objective || '')
  return (
    <div className="bg-white border-2 border-navy rounded-sm p-4 space-y-3">
      <h4 className="font-display text-lg text-navy">{initial.id ? 'Editar mesociclo' : 'Nuevo mesociclo'}</h4>
      <div>
        <label className={labelCls}>Nombre</label>
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder={initial.placeholder} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>Semana de inicio</label>
          <input type="number" min={1} value={weekStart} onChange={(e) => setWeekStart(e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Semana final</label>
          <input type="number" min={1} value={weekEnd} onChange={(e) => setWeekEnd(e.target.value)} className={inputCls} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Macrociclo</label>
        <select value={macroId} onChange={(e) => setMacroId(e.target.value)} className={`${inputCls} bg-white`}>
          <option value="">Sin macrociclo</option>
          {macros.map((mc) => (
            <option key={mc.id} value={mc.id}>{mc.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelCls}>Enfoque principal</label>
        <input value={focus} onChange={(e) => setFocus(e.target.value)} className={inputCls} />
      </div>
      <div>
        <label className={labelCls}>Objetivo clave</label>
        <input value={keyObjective} onChange={(e) => setKeyObjective(e.target.value)} className={inputCls} />
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => onSave({ ...initial, name, macrocycle_id: macroId, week_start: weekStart, week_end: weekEnd, focus, key_objective: keyObjective })}
          className="px-4 py-2 bg-navy hover:bg-navy-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
        >
          Guardar
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// Panel "Macrociclos y mesociclos": macrociclo > mesociclos > semanas
// (microciclos) > sesiones. Los macrociclos y los mesociclos se muestran del
// último al primero (el 1 queda abajo del todo).
export default function MacroMesoPanel({ plan, macrocycles, mesocycles, sessions, disciplines, onReload, onGoToPlan }) {
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
      km += items.reduce((sum, s) => sum + (Number(s.km_estimated) || 0), 0)
    }
    return { total, done, km }
  }

  async function run(request) {
    setBusy(true)
    const { error } = await request
    setBusy(false)
    if (error) {
      alert(error.message)
      return false
    }
    await onReload(true)
    return true
  }

  const setMacroStatus = (id, status) => run(supabase.from('macrocycles').update({ status }).eq('id', id))
  const setMesoStatus = (id, status) => run(supabase.from('mesocycles').update({ status }).eq('id', id))

  async function saveMacro(f) {
    const name = f.name.trim() || `Macrociclo ${nextMacroOrder}`
    const objective = f.objective.trim() || null
    const ok = f.id
      ? await run(supabase.from('macrocycles').update({ name, objective }).eq('id', f.id))
      : await run(
          supabase.from('macrocycles').insert({ plan_id: plan.id, order_index: nextMacroOrder, name, objective })
        )
    if (ok) setForm(null)
  }

  async function deleteMacro(mc) {
    const count = (mesosByMacro[mc.id] || []).length
    const extra = count > 0 ? ` Sus ${count} mesociclos NO se borran: pasarán a "Sin macrociclo".` : ''
    if (!confirm(`¿Eliminar el macrociclo "${mc.name}"?${extra}`)) return
    await run(supabase.from('macrocycles').delete().eq('id', mc.id))
  }

  async function saveMeso(f) {
    const weekStart = Number(f.week_start)
    const weekEnd = Number(f.week_end)
    if (!Number.isInteger(weekStart) || !Number.isInteger(weekEnd) || weekStart < 1 || weekEnd < weekStart || weekEnd > 104) {
      alert('Revisa las semanas: deben ser números enteros, la final igual o mayor que la inicial.')
      return
    }
    const order = f.id ? f.order_index : nextMesoOrder
    const payload = {
      name: f.name.trim() || `Mesociclo ${order}`,
      week_start: weekStart,
      week_end: weekEnd,
      focus: f.focus.trim() || null,
      key_objective: f.key_objective.trim() || null,
      macrocycle_id: f.macrocycle_id || null,
    }
    const ok = f.id
      ? await run(supabase.from('mesocycles').update(payload).eq('id', f.id))
      : await run(supabase.from('mesocycles').insert({ ...payload, plan_id: plan.id, order_index: order }))
    if (!ok) return
    if (weekEnd > plan.duration_weeks) {
      await run(supabase.from('training_plans').update({ duration_weeks: weekEnd }).eq('id', plan.id))
    }
    setForm(null)
  }

  async function deleteMeso(m) {
    if (!confirm(`¿Eliminar el mesociclo "${m.name}"? Sus sesiones NO se borran (se conservan en "Plan y sesiones").`)) return
    await run(supabase.from('mesocycles').delete().eq('id', m.id))
  }

  async function addSession(week, meso) {
    const items = sessionsByWeek[week] || []
    const day = items.length ? Math.max(...items.map((s) => s.day_number)) + 1 : 1
    const runningId = disciplines.find((d) => d.code === 'running')?.id || null
    await run(
      supabase.from('sessions').insert({
        plan_id: plan.id,
        mesocycle_id: meso.id,
        week_number: week,
        day_number: day,
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
    const km = items.reduce((sum, s) => sum + (Number(s.km_estimated) || 0), 0)
    return (
      <div key={key} className="border border-mist rounded-sm bg-white">
        <button
          type="button"
          onClick={() => toggleIn(setOpenWeeks, key)}
          aria-expanded={open}
          className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm"
        >
          <span className="font-mono text-xs text-slate">{open ? '▾' : '▸'}</span>
          <Dot color={state.color} size={10} />
          <span className="font-semibold text-navy">Semana {week}</span>
          <span className="font-mono text-[11px] text-slate ml-auto">
            {done}/{items.length} ses. · {Math.round(km * 10) / 10} km
          </span>
        </button>
        {open && (
          <div className="border-t border-mist px-3 py-2 space-y-2">
            {items.length === 0 && <p className="text-xs text-slate italic">Esta semana todavía no tiene sesiones.</p>}
            {items.map((s) => (
              <div key={s.id} className="flex items-start gap-2 text-sm">
                <span className="font-mono text-xs text-slate w-10 shrink-0 pt-0.5">Día {s.day_number}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold">{s.session_type || <span className="text-slate italic font-normal">Sin tipo</span>}</p>
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
                + Añadir sesión
              </button>
              <button type="button" onClick={onGoToPlan} className="text-xs font-semibold text-slate hover:text-red underline underline-offset-2">
                Editar contenido en «Plan y sesiones»
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
          Sem {meso.week_start} - {meso.week_end} · {stats.done}/{stats.total} sesiones · {Math.round(stats.km * 10) / 10} km
        </p>
        {open && (
          <div className="border-t border-mist px-3 py-3 space-y-3">
            {(meso.focus || meso.key_objective) && (
              <div className="text-sm space-y-1">
                {meso.focus && (
                  <p><span className="font-mono text-xs text-slate">Enfoque: </span>{meso.focus}</p>
                )}
                {meso.key_objective && (
                  <p><span className="font-mono text-xs text-slate">Objetivo clave: </span>{meso.key_objective}</p>
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
                Editar mesociclo
              </button>
              <button type="button" onClick={() => deleteMeso(meso)} className="text-xs font-semibold text-slate hover:text-red">
                Eliminar
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
      placeholder: `Mesociclo ${nextMesoOrder}`,
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-xl text-navy">Macrociclos y mesociclos</h3>
          <p className="font-mono text-[11px] text-slate">Del más reciente al primero · pulsa para desplegar</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm({ kind: 'macro', placeholder: `Macrociclo ${nextMacroOrder}` })}
            className="px-3 py-2 bg-red hover:bg-red-deep text-white text-xs font-semibold rounded-sm"
          >
            + Macrociclo
          </button>
          <button
            type="button"
            onClick={() => setForm(newMesoDefaults(sortedMacros[0]?.id))}
            className="px-3 py-2 bg-navy hover:bg-navy-deep text-white text-xs font-semibold rounded-sm"
          >
            + Mesociclo
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
              busy={busy}
              onSave={saveMeso}
              onCancel={() => setForm(null)}
            />
          )}
        </div>
      )}

      {sortedMacros.length === 0 && orphanMesos.length === 0 && (
        <p className="text-sm text-slate bg-white border border-mist rounded-sm p-5">
          Todavía no hay macrociclos ni mesociclos. Pulsa «+ Macrociclo» para empezar.
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
          <div key={mc.id} className="bg-white border border-mist rounded-sm">
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
              {mesos.length} {mesos.length === 1 ? 'mesociclo' : 'mesociclos'}
              {mesos.length > 0 && ` · Sem ${Math.min(...starts)} - ${Math.max(...ends)} · ${stats.done}/${stats.total} sesiones`}
            </p>
            {open && (
              <div className="border-t border-mist px-4 py-4 space-y-3">
                {mc.objective && (
                  <p className="text-sm"><span className="font-mono text-xs text-slate">Objetivo: </span>{mc.objective}</p>
                )}
                {mesos.length === 0 && (
                  <p className="text-sm text-slate italic">Este macrociclo todavía no tiene mesociclos.</p>
                )}
                {mesos.map(renderMeso)}
                <div className="flex flex-wrap gap-4 pt-1">
                  <button type="button" onClick={() => setForm(newMesoDefaults(mc.id))} className="text-xs font-semibold text-navy hover:text-red">
                    + Mesociclo en este macrociclo
                  </button>
                  <button type="button" onClick={() => setForm({ kind: 'macro', ...mc })} className="text-xs font-semibold text-navy hover:text-red">
                    Editar macrociclo
                  </button>
                  <button type="button" onClick={() => deleteMacro(mc)} className="text-xs font-semibold text-slate hover:text-red">
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {orphanMesos.length > 0 && (
        <div className="bg-white border border-mist rounded-sm p-4 space-y-3">
          <h4 className="font-display text-lg text-navy">Sin macrociclo</h4>
          <p className="text-xs text-slate">Estos mesociclos no pertenecen a ningún macrociclo. Edítalos para asignarles uno.</p>
          {orphanMesos.map(renderMeso)}
        </div>
      )}
    </div>
  )
}
