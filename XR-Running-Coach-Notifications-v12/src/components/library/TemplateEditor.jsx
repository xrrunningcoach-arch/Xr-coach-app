import { disciplineName } from '../../lib/disciplines'
import { useMemo, useRef, useState } from 'react'
import DisciplineFields from '../DisciplineFields'
import { useAuth } from '../../auth/AuthProvider'
import { suggestedSessionTypes } from '../../lib/planGenerator'
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
import { useT } from '../../i18n'

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
  const t = useT()
  const update = (i, patch) => onChange(exercises.map((e, idx) => (idx === i ? { ...e, ...patch } : e)))
  return (
    <div className="space-y-2">
      <p className="font-mono text-xs text-slate">{t('te.exercises')}</p>
      {exercises.map((e, i) => (
        <div key={i} className="grid grid-cols-[1fr_60px_60px_70px_auto] gap-2 items-center">
          <input value={e.exercise_name ?? ''} onChange={(ev) => update(i, { exercise_name: ev.target.value })} placeholder={t('te.exercise')} className={smallInput} />
          <input type="number" min={0} value={e.sets ?? ''} onChange={(ev) => update(i, { sets: ev.target.value })} placeholder={t('ex.sets')} aria-label={t('ex.sets')} className={smallInput} />
          <input type="number" min={0} value={e.reps ?? ''} onChange={(ev) => update(i, { reps: ev.target.value })} placeholder={t('ex.reps')} aria-label={t('te.repsAria')} className={smallInput} />
          <input type="number" min={0} step="0.5" value={e.load_kg ?? ''} onChange={(ev) => update(i, { load_kg: ev.target.value })} placeholder="kg" aria-label={t('te.loadAria')} className={smallInput} />
          <button type="button" onClick={() => onChange(exercises.filter((_, idx) => idx !== i))} className="text-xs text-red hover:text-red-deep">
            {t('te.remove')}
          </button>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...exercises, { exercise_name: '', sets: '', reps: '', load_kg: '' }])} className="text-xs font-semibold text-navy hover:text-red">
        {t('ex.add')}
      </button>
    </div>
  )
}

// Campos de una sesión de plantilla. `weekdays` = mostrar el selector de día.
function SessionFields({ value, onChange, disciplines, weekdays = false }) {
  const t = useT()
  const set = (patch) => onChange({ ...value, ...patch })
  const discipline = disciplines.find((d) => d.code === value.discipline_code) || null
  return (
    <div className="space-y-3">
      <div className="grid sm:grid-cols-12 gap-3">
        {weekdays && (
          <div className="sm:col-span-3">
            <label className={labelCls}>{t('te.day')}</label>
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
          <label className={labelCls}>{t('te.discipline')}</label>
          <select value={value.discipline_code || ''} onChange={(e) => set({ discipline_code: e.target.value || null, metrics: {}, exercises: [] })} className={smallInput}>
            <option value="">{t('te.noDiscipline')}</option>
            {disciplines.map((d) => (
              <option key={d.id} value={d.code}>
                {disciplineName(d)}
              </option>
            ))}
          </select>
        </div>
        <div className={weekdays ? 'sm:col-span-5' : 'sm:col-span-7'}>
          <label className={labelCls}>{t('te.sessionType')}</label>
          <input list="tpl-session-types" value={value.session_type} onChange={(e) => set({ session_type: e.target.value })} placeholder={t('te.sessionTypePh')} className={smallInput} />
        </div>
      </div>
      <div>
        <label className={labelCls}>{t('te.description')}</label>
        <textarea value={value.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={`${smallInput} resize-none`} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className={labelCls}>Km</label>
          <input type="number" min={0} step="0.1" value={value.km_estimated ?? ''} onChange={(e) => set({ km_estimated: e.target.value })} className={smallInput} />
        </div>
        <div>
          <label className={labelCls}>{t('te.duration')}</label>
          <input type="number" min={0} value={value.duration_planned_min ?? ''} onChange={(e) => set({ duration_planned_min: e.target.value })} className={smallInput} />
        </div>
        <div>
          <label className={labelCls}>{t('te.rpeTheo')}</label>
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
  return [WEEKDAY_SHORT[s.weekday], d ? disciplineName(d) : null, s.session_type || s.description?.slice(0, 40), s.km_estimated ? `${s.km_estimated} km` : null]
    .filter(Boolean)
    .join(' · ')
}

// Un bloque (mesociclo): semanas, y en cada semana las sesiones por día.
function BlockEditor({ block, index, total, disciplines, onChange, onRemove }) {
  const t = useT()
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
    if (lost.length && !(await ui.confirm(t('te.confirmReduce', { weeks, count: lost.length }), { danger: true, confirmLabel: t('te.reduce') }))) return
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
      ui.error(t('te.lastWeek'))
      return
    }
    const target = week + 1
    if (block.sessions.some((s) => s.week_offset === target) && !(await ui.confirm(t('te.confirmDup', { to: target + 1, from: week + 1 }), { confirmLabel: t('te.duplicate') }))) return
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
          <h4 className="font-display text-lg text-navy">{total > 1 ? t('te.blockTitle', { n: index + 1 }) : t('te.planContent')}</h4>
          {total > 1 && (
            <button type="button" onClick={onRemove} className="text-xs text-red hover:text-red-deep">
              {t('te.removeBlock')}
            </button>
          )}
        </div>
        <div className="grid sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6">
            <label className={labelCls}>{t('c.name')}</label>
            <input value={block.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelCls}>{t('te.weeksLabel', { max: MAX_BLOCK_WEEKS })}</label>
            <input type="number" min={1} max={MAX_BLOCK_WEEKS} value={block.weeks} onChange={(e) => setWeeks(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t('mm.focus')}</label>
            <input value={block.focus} onChange={(e) => set({ focus: e.target.value })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>{t('mm.keyObjective')}</label>
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
                <p className="font-semibold text-sm text-navy">{t('cal.weekN', { n: w + 1 })}</p>
                <div className="flex gap-4">
                  <button type="button" onClick={() => addSession(w)} className="text-xs font-semibold text-navy hover:text-red">
                    {t('te.addSession')}
                  </button>
                  {list.length > 0 && (
                    <button type="button" onClick={() => duplicateWeek(w)} className="text-xs font-semibold text-slate hover:text-red">
                      {t('te.dupNext')}
                    </button>
                  )}
                </div>
              </div>
              {list.length === 0 && <p className="text-xs text-slate italic">{t('te.restWeek')}</p>}
              {list.map((s) => {
                const isOpen = open.has(s._id)
                return (
                  <div key={s._id} className="border border-mist rounded-sm">
                    <button type="button" onClick={() => toggle(s._id)} aria-expanded={isOpen} className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm">
                      <span className="font-mono text-xs text-slate">{isOpen ? '▾' : '▸'}</span>
                      <span className="truncate">{sessionSummary(s, disciplines) || t('te.undefinedSession')}</span>
                    </button>
                    {isOpen && (
                      <div className="border-t border-mist p-3 space-y-3 bg-bg/50">
                        <SessionFields value={s} onChange={(next) => updateSession(s._id, next)} disciplines={disciplines} weekdays />
                        <button type="button" onClick={() => removeSession(s._id)} className="text-xs text-red hover:text-red-deep">
                          {t('te.removeSession')}
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
export default function TemplateEditor({ initial, defaultKind = 'session', disciplines, folders = null, defaultFolderId = '', onSaved, onCancel }) {
  const { user } = useAuth()
  const t = useT()
  const [folderId, setFolderId] = useState(initial ? initial.folder_id || '' : defaultFolderId)
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
    if (hasContent && !(await ui.confirm(t('te.confirmKind'), { danger: true, confirmLabel: t('te.change') }))) return
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
        folderId: folders ? folderId || null : undefined,
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
        {suggestedSessionTypes(t).map((ty) => (
          <option key={ty} value={ty} />
        ))}
      </datalist>

      <div className="bg-surface border border-mist rounded-sm p-5 space-y-4">
        <h2 className="font-display text-xl text-navy">{initial ? t('te.edit') : t('te.new')}</h2>

        {!initial && (
          <div role="group" aria-label={t('te.kindAria')} className="inline-flex flex-wrap border border-mist rounded-sm overflow-hidden">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => changeKind(k.id)}
                aria-pressed={kind === k.id}
                className={`px-3 py-2 text-sm ${kind === k.id ? 'bg-primary text-white font-semibold' : 'text-slate hover:bg-bg'}`}
              >
                {t(k.key)}
              </button>
            ))}
          </div>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{t('c.name')}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputCls} placeholder={kind === 'session' ? t('te.namePhSession') : t('te.namePhMeso')} />
          </div>
          <div>
            <label className={labelCls}>{t('save.tags')}</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder={t('save.tagsPh')} />
          </div>
        </div>
        <div>
          <label className={labelCls}>{t('save.description')}</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${inputCls} resize-none`} />
        </div>
        {folders && (
          <div>
            <label className={labelCls}>{t('lib.folder.field')}</label>
            <select value={folderId} onChange={(e) => setFolderId(e.target.value)} className={inputCls}>
              <option value="">{t('lib.folder.none')}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
        )}
        {kind === 'macrocycle' && (
          <div>
            <label className={labelCls}>{t('te.projectObjective')}</label>
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
              {t('te.addMeso')}
            </button>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="text-red text-sm space-y-0.5" role="alert">
          {errors.map((m) => {
            const text = typeof m === 'string' ? m : t(m.key, m.params)
            return <li key={text}>{text}</li>
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60">
          {saving ? t('common.saving') : t('save.title')}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
          {t('common.cancel')}
        </button>
        <span className="font-mono text-[11px] text-slate">{t('lib.sessionsCount', { count: sessionCount })}</span>
      </div>
    </form>
  )
}
