import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../Modal'
import { supabase } from '../../supabaseClient'
import { useT } from '../../i18n'
import { fetchDisciplines } from '../../lib/disciplines'
import { longDayTitle, mondayOf, shortDate, todayISO } from '../../lib/dates'
import { kindLabel, templateSummary } from '../../lib/templates'
import { applyTemplateToAthlete, previewApplication } from '../../lib/templatesApi'

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

const nameOf = (a) => a?.full_name || a?.email || ''

// Importar una plantilla de la biblioteca al calendario de UNO O VARIOS atletas.
//   item        plantilla fija (desde la Biblioteca) o null (se elige de una lista)
//   athlete     atleta fijo (desde su calendario) o null (se eligen de una lista)
//   defaultDate fecha inicial (p. ej. el día seleccionado en el calendario)
// Cada atleta se aplica por separado y de forma atómica (todo o nada): si falla
// uno, los demás se aplican igualmente y se ve cuál ha fallado y por qué.
export default function ApplyTemplateModal({ item: fixedItem = null, athlete: fixedAthlete = null, defaultDate, onClose, onDone }) {
  const t = useT()
  const [disciplines, setDisciplines] = useState([])
  const [items, setItems] = useState([])
  const [athletes, setAthletes] = useState([])
  const [itemId, setItemId] = useState(fixedItem?.id || '')
  const [selected, setSelected] = useState(() => (fixedAthlete ? [fixedAthlete.id] : []))
  const [startDate, setStartDate] = useState(defaultDate || todayISO())
  const [macroChoice, setMacroChoice] = useState('auto')
  const [previews, setPreviews] = useState({}) // athleteId -> { loading } | { data } | { error }
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState(null)
  const token = useRef(0)

  // Datos de apoyo: disciplinas, y las listas que falten (plantillas / atletas).
  useEffect(() => {
    let active = true
    ;(async () => {
      const d = await fetchDisciplines()
      if (active) setDisciplines(d)
      if (!fixedItem) {
        const { data } = await supabase.from('library_items').select('*').order('updated_at', { ascending: false })
        if (active) setItems(data || [])
      }
      if (!fixedAthlete) {
        const { data } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .eq('role', 'athlete')
          .eq('is_active', true)
          .order('full_name')
        if (active) setAthletes(data || [])
      }
    })()
    return () => {
      active = false
    }
  }, [fixedItem, fixedAthlete])

  const item = fixedItem || items.find((i) => i.id === itemId) || null
  const single = selected.length === 1
  // Un macrociclo concreto solo vale para un atleta; con varios se usa «más reciente» o «ninguno».
  const effMacro = single || macroChoice === 'auto' || macroChoice === 'none' ? macroChoice : 'auto'

  // Vista previa de cada atleta elegido: se recalcula al cambiar plantilla, atletas, fecha o macrociclo.
  useEffect(() => {
    if (!item || selected.length === 0 || !startDate || disciplines.length === 0) {
      setPreviews({})
      return undefined
    }
    const mine = ++token.current
    setPreviews(Object.fromEntries(selected.map((id) => [id, { loading: true }])))
    selected.forEach((athleteId) => {
      previewApplication({ item, athleteId, startDate, disciplines, macroChoice: effMacro })
        .then((data) => mine === token.current && setPreviews((p) => ({ ...p, [athleteId]: { data } })))
        .catch((e) => mine === token.current && setPreviews((p) => ({ ...p, [athleteId]: { error: e.message } })))
    })
    return () => {
      token.current += 1
    }
  }, [item, selected, startDate, disciplines, effMacro])

  const summary = useMemo(() => (item ? templateSummary(item.kind, item.payload) : null), [item])
  const nameById = useMemo(() => {
    const map = Object.fromEntries(athletes.map((a) => [a.id, nameOf(a)]))
    if (fixedAthlete) map[fixedAthlete.id] = nameOf(fixedAthlete)
    return map
  }, [athletes, fixedAthlete])

  const validIds = selected.filter((id) => previews[id]?.data && previews[id].data.errors.length === 0)
  const loading = selected.some((id) => previews[id]?.loading)
  const canApply = validIds.length > 0 && !loading && !busy
  const macros = single ? previews[selected[0]]?.data?.existing?.macrocycles || [] : []

  const errText = (e) => (e?.key ? t(e.key, e.params) : String(e))

  async function handleApply() {
    setBusy(true)
    const out = []
    for (const athleteId of validIds) {
      try {
        const r = await applyTemplateToAthlete({ item, athleteId, startDate, disciplines, macroChoice: effMacro })
        out.push({ athleteId, ok: true, ...r })
      } catch (e) {
        out.push({ athleteId, ok: false, error: e.i18n ? errText(e.i18n) : e.message })
      }
    }
    setBusy(false)
    setResults(out)
    if (out.some((r) => r.ok)) onDone?.(out)
  }

  const rangeText = (r) => (r.first && r.last ? t('apply.range', { from: shortDate(r.first), to: shortDate(r.last) }) : '')

  // ---------------- Resultado ----------------
  if (results) {
    const okList = results.filter((r) => r.ok)
    const only = results.length === 1 ? results[0] : null
    return (
      <Modal title={t('apply.titleDone')} onClose={onClose}>
        <div className="space-y-4">
          {only ? (
            only.ok ? (
              <p className="text-sm">{t('apply.doneOne', { count: only.sessions, range: rangeText(only) })}</p>
            ) : (
              <p className="text-sm text-red">{t('apply.failed', { msg: only.error })}</p>
            )
          ) : (
            <>
              <p className="text-sm font-semibold">{t('apply.doneMany', { ok: okList.length, total: results.length })}</p>
              <ul className="divide-y divide-mist border border-mist rounded-sm">
                {results.map((r) => (
                  <li key={r.athleteId} className="px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold">{nameById[r.athleteId]}</span>
                    {r.ok ? (
                      <span className="font-mono text-xs text-slate">
                        {t('apply.rowOk', { count: r.sessions })}
                        {rangeText(r)}
                      </span>
                    ) : (
                      <span className="text-xs text-red">{r.error}</span>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="flex flex-wrap gap-3">
            {only?.ok && (
              <Link
                to={`/coach/atleta/${only.athleteId}`}
                onClick={onClose}
                className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm"
              >
                {t('apply.viewAthlete')}
              </Link>
            )}
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
              {t('common.close')}
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  const isSession = item?.kind === 'session'

  // Detalle de la vista previa de UN atleta.
  function PreviewDetail({ p }) {
    const n = p.application.sessions.length
    const between =
      p.first && p.last && p.first !== p.last
        ? t('apply.between', { from: longDayTitle(p.first), to: longDayTitle(p.last) })
        : p.first
          ? t('apply.on', { day: longDayTitle(p.first) })
          : '.'
    const mesos = p.application.mesocycles.length
    return (
      <>
        <p>
          {t('apply.willCreate', { count: n })}
          {between}
        </p>
        {mesos > 0 && (
          <p className="text-slate">
            {t('apply.mesos', { count: mesos })}
            {p.application.macrocycle ? t('apply.newMacro', { name: p.application.macrocycle.name }) : ''}.
          </p>
        )}
        {!p.plan && <p className="text-slate">{t('apply.noPlan')}</p>}
        {p.plan && p.plan.status === 'draft' && <p className="text-slate">{t('apply.draft')}</p>}
        {p.shiftWeeks > 0 && (
          <p className="text-slate">
            {t('apply.shiftLong', { old: shortDate(p.oldPlanStart), new: shortDate(p.planStart), count: p.shiftWeeks })}
          </p>
        )}
        {p.newPlanStart && p.plan && <p className="text-slate">{t('apply.newStart', { date: shortDate(p.planStart) })}</p>}
        <p className="text-slate">{t('apply.addNote')}</p>
      </>
    )
  }

  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))

  return (
    <Modal title={t('apply.title')} onClose={onClose} wide>
      <div className="space-y-4">
        {!fixedItem && (
          <div>
            <label className={labelCls}>{t('apply.template')}</label>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
              <option value="">{t('apply.pickTemplate')}</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {kindLabel(i.kind, t)}
                </option>
              ))}
            </select>
            {items.length === 0 && <p className="text-xs text-slate mt-1">{t('apply.emptyLibrary')}</p>}
          </div>
        )}
        {fixedItem && (
          <p className="text-sm">
            <span className="font-semibold">{fixedItem.name}</span>
            <span className="text-slate"> · {kindLabel(fixedItem.kind, t)}</span>
            {summary && (
              <span className="font-mono text-xs text-slate">
                {' '}· {t('lib.sessionsCount', { count: summary.sessions })}
                {summary.weeks ? ` · ${t('lib.weeks', { count: summary.weeks })}` : ''}
              </span>
            )}
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>{fixedAthlete ? t('apply.athlete') : t('apply.athletes')}</label>
            {fixedAthlete ? (
              <p className="text-sm py-2">{nameOf(fixedAthlete)}</p>
            ) : (
              <div className="border border-mist rounded-sm bg-surface">
                <div className="flex items-center justify-between gap-2 px-3 py-1.5 border-b border-mist bg-bg-dim">
                  <span className="font-mono text-[11px] text-slate">{t('apply.selected', { count: selected.length })}</span>
                  <span className="flex gap-3">
                    <button type="button" onClick={() => setSelected(athletes.map((a) => a.id))} className="text-xs font-semibold text-navy hover:text-red">
                      {t('apply.selectAll')}
                    </button>
                    <button type="button" onClick={() => setSelected([])} className="text-xs font-semibold text-slate hover:text-red">
                      {t('apply.selectNone')}
                    </button>
                  </span>
                </div>
                <ul className="max-h-48 overflow-y-auto divide-y divide-mist">
                  {athletes.length === 0 && <li className="px-3 py-3 text-xs text-slate">{t('apply.noAthletes')}</li>}
                  {athletes.map((a) => (
                    <li key={a.id}>
                      <label className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-bg">
                        <input type="checkbox" checked={selected.includes(a.id)} onChange={() => toggle(a.id)} />
                        <span className="truncate">{nameOf(a)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>{isSession ? t('apply.sessionDay') : t('apply.startDate')}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            {!isSession && startDate && <p className="text-xs text-slate mt-1">{t('apply.week1', { date: shortDate(mondayOf(startDate)) })}</p>}
          </div>
        </div>

        {item?.kind === 'mesocycle' && selected.length > 0 && (
          <div>
            <label className={labelCls}>{t('apply.macro')}</label>
            <select value={effMacro} onChange={(e) => setMacroChoice(e.target.value)} className={inputCls}>
              <option value="auto">{t('apply.macroLatest')}</option>
              {macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="none">{t('apply.macroNone')}</option>
            </select>
          </div>
        )}

        {selected.length > 0 && item && (
          <div className="bg-bg rounded-sm px-4 py-3 text-sm space-y-2">
            {single ? (
              (() => {
                const p = previews[selected[0]]
                if (!p || p.loading) return <p className="text-slate">{t('common.loading')}</p>
                if (p.error) return <p className="text-red">{p.error}</p>
                if (p.data.errors.length > 0) return p.data.errors.map((m) => <p key={m.key} className="text-red">{errText(m)}</p>)
                return <div className="space-y-1"><PreviewDetail p={p.data} /></div>
              })()
            ) : (
              <ul className="divide-y divide-mist">
                {selected.map((id) => {
                  const p = previews[id]
                  const d = p?.data
                  return (
                    <li key={id} className="py-1.5 flex flex-wrap items-baseline justify-between gap-x-3">
                      <span className="font-semibold">{nameById[id]}</span>
                      {!p || p.loading ? (
                        <span className="text-xs text-slate">…</span>
                      ) : p.error ? (
                        <span className="text-xs text-red">{p.error}</span>
                      ) : d.errors.length > 0 ? (
                        <span className="text-xs text-red">{t('apply.skipped', { msg: errText(d.errors[0]) })}</span>
                      ) : (
                        <span className="font-mono text-xs text-slate">
                          {t('apply.rowOk', { count: d.application.sessions.length })}
                          {!d.plan ? ` · ${t('apply.noPlanShort')}` : d.shiftWeeks > 0 ? ` · ${t('apply.shiftShort')}` : ''}
                        </span>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            {busy ? t('apply.applying') : selected.length > 1 ? t('apply.buttonMany', { count: validIds.length }) : t('apply.button')}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
