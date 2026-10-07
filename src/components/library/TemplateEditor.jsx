import { useMemo, useRef, useState } from 'react'
import DisciplineFields from '../DisciplineFields'
import { useAuth } from '../../auth/AuthProvider'
import { SESSION_TYPES_SUGGESTED } from '../../lib/planGenerator'
import { WEEKDAY_LONG, WEEKDAY_SHORT } from '../../lib/dates'
import {
  KINDS,
  MAX_BLOCKS,
  MAX_BLOCK_WEEKS,
  cleanPayload,
  emptyBlock,
  emptyPayload,
  emptyTplSession,
  validateTemplate,
} from '../../lib/templates'
import { saveLibraryItem } from '../../lib/templatesApi'
import { ui } from '../../ui/ui'

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:border-navy'
const smallInput = 'w-full border border-mist rounded-sm px-2 py-1.5 text-sm bg-surface focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

let uid = 0
const withId = (s) => ({ ...s, _id: s._id || `t${(uid += 1)}` })

// Añade identificadores solo para las claves de React (se descartan al guardar).
function hydrate(kind, payload) {
  if (kind === 'session') return { session: withId(payload.session || emptyTplSession()) }
  return { ...payload, blocks: (payload.blocks || []).map((b) => ({ ...b, _id: b._id || `b${(uid += 1)}`, sessions: (b.sessions || []).map(withId) })) }
}

// Ejercicios de fuerza dentro de la plantilla (series x reps x carga).
function ExercisesInline({ exercises, onChange }) {
  const update = (i, patch) => onChange(exercises.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs text-slate">Ejercicios</p>
      {exercises.map((e, i) => (
        <div key={i} className="grid grid-cols-[1fr_60px_60px_70px_auto] gap-2 items-center">
          <input value={e.exercise_name ?? ''} onChange={(ev) => update(i, { exercise_name: ev.target.value })} placeholder="Ejercicio" className={smallInput} />
          <input type="number" min={0} value={e.sets ?? ''} onChange={(ev) => update(i, { sets: ev.target.value })} placeholder="Series" aria-label="Series" className={smallInput} />
          <input type="number" min={0} value={e.reps ?? ''} onChange={(ev) => update(i, { reps: ev.target.value })} placeholder="Reps" aria-label="Repeticiones" className={smallInput} />
          <input type="number" min={0} step="0.5" value={e.load_kg ?? ''} onChange={(ev) => update(i, { load_kg: ev.target.value })} placeholder="kg" aria-label="Carga en kg" className={smallInput} />
          <button type="button" onClick={() => onChange(exercises.filter((_, idx) => idx !== i))} className="text-xs text-red hover:text-red-deep">
            Quitar
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...exercises, { exercise_name: '', sets: '', reps: '', load_kg: '' }])} className="text-xs font-semibold text-navy hover:text-red">
        + Añadir ejercicio
      </button>
    </div>
  )
}

// Campos de una sesión de plantilla. `weekdays` = mostrar el selector de día.
function SessionFields({ value, onChange, disciplines, weekdays = false }) {
  const set = (patch) => onChange({ ...value, ...patch })
  const discipline = disciplines.find((d) => d.code === value.discipline_code) || null
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-12 gap-3">
        {weekdays && (
          <div className="sm:col-span-3">
            <label className={labelCls}>Día</label>
            <select value={value.weekday} onChange={(e) => set({ weekday: Number(e.target.value) })} className={smallInput}>
              {WEEKDAY_LONG.map((w, i) => (
                <option key={w} value={i}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className={weekdays ? 'sm:col-span-4' : 'sm:col-span-5'}>
          <label className={labelCls}>Disciplina</label>
          <select value={value.discipline_code || ''} onChange={(e) => set({ discipline_code: e.target.value || null, metrics: {}, exercises: [] })} className={smallInput}>
            <option value="">Sin disciplina</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.code}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
        <div className={weekdays ? 'sm:col-span-5' : 'sm:col-span-7'}>
          <label className={labelCls}>Tipo de sesión</label>
          <input list="tpl-session-types" value={value.session_type} onChange={(e) => set({ session_type: e.target.value })} placeholder="Rodaje suave, Series…" className={smallInput} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Descripción</label>
        <textarea value={value.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={`${smallInput} resize-none`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Km</label>
          <input type="number" min={0} step="0.1" value={value.km_estimated ?? ''} onChange={(e) => set({ km_estimated: e.target.value })} className={smallInput} />
        </div>
        <div>
          <label className={labelCls}>Duración (min)</label>
          <input type="number" min={0} value={value.duration_planned_min ?? ''} onChange={(e) => set({ duration_planned_min: e.target.value })} className={smallInput} />
        </div>
        <div>
          <label className={labelCls}>RPE teórico</label>
          <input value={value.rpe_theoretical} onChange={(e) => set({ rpe_theoretical: e.target.value })} placeholder="RPE 6" className={smallInput} />
        </div>
      </div>
      {discipline && <DisciplineFields discipline={discipline} values={value.metrics || {}} onChange={(metrics) => set({ metrics })} />}
      {discipline?.metrics_schema?.has_exercises && <ExercisesInline exercises={value.exercises || []} onChange={(exercises) => set({ exercises })} />}
    </div>
  )
}

function sessionSummary(s, disciplines) {
  const d = disciplines.find((x) => x.code === s.discipline_code)
  return [WEEKDAY_SHORT[s.weekday], d?.name, s.session_type || s.description?.slice(0, 40), s.km_estimated ? `${s.km_estimated} km` : null]
    .filter(Boolean)
    .join(' · ')
}

// Un bloque (mesociclo): semanas, y en cada semana las sesiones por día.
function BlockEditor({ block, index, total, disciplines, onChange, onRemove }) {
  const [open, setOpen] = useState(() => new Set())
  const set = (patch) => onChange({ ...block, ...patch })
  const toggle = (id) =>
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  async function setWeeks(raw) {
    const weeks = Math.min(MAX_BLOCK_WEEKS, Math.max(1, Number(raw) || 1))
    const lost = block.sessions.filter((s) => s.week_offset >= weeks)
    if (lost.length && !(await ui.confirm(`Al reducir a ${weeks} semanas se eliminarán ${lost.length} sesiones de las últimas semanas. ¿Continuar?`, { danger: true, confirmLabel: 'Reducir' }))) return
    set({ weeks, sessions: block.sessions.filter((s) => s.week_offset < weeks) })
  }

  function addSession(week) {
    const used = block.sessions.filter((s) => s.week_offset === week).map((s) => s.weekday)
    const free = [0, 1, 2, 3, 4, 5, 6].find((d) => !used.includes(d)) ?? 0
    const s = withId(emptyTplSession({ week_offset: week, weekday: free }))
    set({ sessions: [...block.sessions, s] })
    setOpen((prev) => new Set(prev).add(s._id))
  }

  async function duplicateWeek(week) {
    if (week + 1 >= block.weeks) {
      ui.error('Es la última semana del bloque. Aumenta el número de semanas para duplicarla.')
      return
    }
    const target = week + 1
    if (block.sessions.some((s) => s.week_offset === target) && !(await ui.confirm(`La semana ${target + 1} ya tiene sesiones; se añadirán las de la semana ${week + 1}. ¿Continuar?`, { confirmLabel: 'Duplicar' }))) return
    const copies = block.sessions
      .filter((s) => s.week_offset === week)
      .map((s) => withId({ ...s, _id: undefined, week_offset: target, metrics: { ...s.metrics }, exercises: (s.exercises || []).map((e) => ({ ...e })) }))
    set({ sessions: [...block.sessions, ...copies] })
  }

  const updateSession = (id, next) => set({ sessions: block.sessions.map((s) => (s._id === id ? next : s)) })
  const removeSession = (id) => set({ sessions: block.sessions.filter((s) => s._id !== id) })

  return (
    <div className="border-2 border-navy rounded-sm bg-surface">
      <div className="p-4 space-y-3 border-b border-mist">
        <div className="flex items-center justify-between gap-3">
          <h4 className="font-display text-lg text-navy">{total > 1 ? `Mesociclo ${index + 1}` : 'Contenido del plan'}</h4>
          {total > 1 && (
            <button type="button" onClick={onRemove} className="text-xs text-red hover:text-red-deep">
              Quitar este mesociclo
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6">
            <label className={labelCls}>Nombre</label>
            <input value={block.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelCls}>Semanas (1-{MAX_BLOCK_WEEKS})</label>
            <input type="number" min={1} max={MAX_BLOCK_WEEKS} value={block.weeks} onChange={(e) => setWeeks(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Enfoque principal</label>
            <input value={block.focus} onChange={(e) => set({ focus: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Objetivo clave</label>
            <input value={block.key_objective} onChange={(e) => set({ key_objective: e.target.value })} className={inputCls} />
          </div>
        </div>
      </div>

      <div className="divide-y divide-mist">
        {Array.from({ length: block.weeks }, (_, w) => {
          const list = block.sessions.filter((s) => s.week_offset === w).sort((a, b) => a.weekday - b.weekday)
          return (
            <div key={w} className="px-4 py-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-sm text-navy">Semana {w + 1}</p>
                <div className="flex gap-4">
                  <button type="button" onClick={() => addSession(w)} className="text-xs font-semibold text-navy hover:text-red">
                    + Sesión
                  </button>
                  {list.length > 0 && (
                    <button type="button" onClick={() => duplicateWeek(w)} className="text-xs font-semibold text-slate hover:text-red">
                      Duplicar en la siguiente
                    </button>
                  )}
                </div>
              </div>
              {list.length === 0 && <p className="text-xs text-slate italic">Sin sesiones (semana de descanso).</p>}
              {list.map((s) => {
                const isOpen = open.has(s._id)
                return (
                  <div key={s._id} className="border border-mist rounded-sm">
                    <button type="button" onClick={() => toggle(s._id)} aria-expanded={isOpen} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm">
                      <span className="font-mono text-xs text-slate">{isOpen ? '▾' : '▸'}</span>
                      <span className="truncate">{sessionSummary(s, disciplines) || 'Sesión sin definir'}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-mist p-3 space-y-3 bg-bg/50">
                        <SessionFields value={s} onChange={(next) => updateSession(s._id, next)} disciplines={disciplines} weekdays />
                        <button type="button" onClick={() => removeSession(s._id)} className="text-xs text-red hover:text-red-deep">
                          Eliminar sesión
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Crear o editar una plantilla de la biblioteca.
//   initial: fila existente de library_items (editar) o null (nueva)
export default function TemplateEditor({ initial, defaultKind = 'session', disciplines, onSaved, onCancel }) {
  const { user } = useAuth()
  const [kind, setKind] = useState(initial?.kind || defaultKind)
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [tags, setTags] = useState((initial?.tags || []).join(', '))
  const [payload, setPayload] = useState(() => hydrate(initial?.kind || defaultKind, initial?.payload || emptyPayload(initial?.kind || defaultKind)))
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState([])
  const topRef = useRef(null)

  const blocks = payload.blocks || []

  async function changeKind(next) {
    if (next === kind) return
    const hasContent = kind === 'session' ? !!(payload.session?.session_type || payload.session?.description) : blocks.some((b) => b.sessions.length)
    if (hasContent && !(await ui.confirm('Al cambiar el tipo se pierde el contenido que has escrito. ¿Continuar?', { danger: true, confirmLabel: 'Cambiar' }))) return
    setKind(next)
    setPayload(hydrate(next, emptyPayload(next)))
  }

  const setBlock = (i, next) => setPayload({ ...payload, blocks: blocks.map((b, idx) => (idx === i ? next : b)) })

  const sessionCount = useMemo(() => (kind === 'session' ? 1 : blocks.reduce((t, b) => t + b.sessions.length, 0)), [kind, blocks])

  async function handleSave(e) {
    e.preventDefault()
    const cleaned = cleanPayload(kind, payload)
    const problems = validateTemplate(kind, name, kind === 'session' ? cleaned : cleaned)
    if (problems.length) {
      setErrors(problems)
      topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      return
    }
    setSaving(true)
    setErrors([])
    try {
      const saved = await saveLibraryItem({
        id: initial?.id,
        coachId: user.id,
        kind,
        name,
        description,
        tags: tags.split(','),
        payload: cleaned,
      })
      onSaved(saved)
    } catch (err) {
      setErrors([err.message])
    }
    setSaving(false)
  }

  return (
    <form onSubmit={handleSave} className="space-y-5" ref={topRef}>
      <datalist id="tpl-session-types">
        {SESSION_TYPES_SUGGESTED.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <div className="bg-surface border border-mist rounded-sm p-5 space-y-4">
        <h2 className="font-display text-xl text-navy">{initial ? 'Editar plantilla' : 'Nueva plantilla'}</h2>

        {!initial && (
          <div role="group" aria-label="Tipo de plantilla" className="inline-flex flex-wrap border border-mist rounded-sm overflow-hidden">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => changeKind(k.id)}
                aria-pressed={kind === k.id}
                className={`px-3 py-2 text-sm ${kind === k.id ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Nombre</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputCls} placeholder={kind === 'session' ? 'Series 6x1000 al umbral' : 'Base aeróbica 4 semanas'} />
          </div>
          <div>
            <label className={labelCls}>Etiquetas (separadas por comas)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder="base, 10K, invierno" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Descripción (opcional)</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>
        {kind === 'macrocycle' && (
          <div>
            <label className={labelCls}>Objetivo del proyecto</label>
            <textarea value={payload.objective || ''} onChange={(e) => setPayload({ ...payload, objective: e.target.value })} rows={2} className={`${inputCls} resize-none`} />
          </div>
        )}
      </div>

      {kind === 'session' ? (
        <div className="bg-surface border border-mist rounded-sm p-5">
          <SessionFields value={payload.session} onChange={(session) => setPayload({ session })} disciplines={disciplines} />
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.map((b, i) => (
            <BlockEditor
              key={b._id}
              block={b}
              index={i}
              total={blocks.length}
              disciplines={disciplines}
              onChange={(next) => setBlock(i, next)}
              onRemove={() => setPayload({ ...payload, blocks: blocks.filter((_, idx) => idx !== i) })}
            />
          ))}
          {kind === 'macrocycle' && blocks.length < MAX_BLOCKS && (
            <button
              type="button"
              onClick={() => setPayload({ ...payload, blocks: [...blocks, { ...emptyBlock(`Mesociclo ${blocks.length + 1}`), _id: `b${(uid += 1)}` }] })}
              className="px-4 py-2 text-sm font-semibold text-navy border border-navy rounded-sm hover:bg-primary hover:text-white"
            >
              + Añadir mesociclo
            </button>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-red text-sm space-y-0.5" role="alert">
          {errors.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
          {saving ? 'Guardando…' : 'Guardar en la biblioteca'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
          Cancelar
        </button>
        <span className="font-mono text-[11px] text-slate">{sessionCount} {sessionCount === 1 ? 'sesión' : 'sesiones'}</span>
      </div>
    </form>
  )
}
