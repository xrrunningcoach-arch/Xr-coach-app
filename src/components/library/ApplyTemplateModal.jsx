import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Modal from '../Modal'
import { supabase } from '../../supabaseClient'
import { useAuth } from '../../auth/AuthProvider'
import { fetchDisciplines } from '../../lib/disciplines'
import { longDayTitle, mondayOf, shortDate, todayISO } from '../../lib/dates'
import { kindLabel, templateSummary } from '../../lib/templates'
import { applyTemplateToAthlete, previewApplication } from '../../lib/templatesApi'

const inputCls = 'w-full border border-mist rounded-sm px-3 py-2 text-sm bg-surface focus:outline-none focus:border-navy'
const labelCls = 'block font-mono text-xs text-slate mb-1'

// Importar una plantilla de la biblioteca al calendario de un atleta.
//   item        plantilla fija (desde la Biblioteca) o null (se elige de una lista)
//   athlete     atleta fijo (desde su calendario) o null (se elige de una lista)
//   defaultDate fecha inicial (p. ej. el día seleccionado en el calendario)
export default function ApplyTemplateModal({ item: fixedItem = null, athlete: fixedAthlete = null, defaultDate, onClose, onDone }) {
  const { user } = useAuth()
  const [disciplines, setDisciplines] = useState([])
  const [items, setItems] = useState([])
  const [athletes, setAthletes] = useState([])
  const [itemId, setItemId] = useState(fixedItem?.id || '')
  const [athleteId, setAthleteId] = useState(fixedAthlete?.id || '')
  const [startDate, setStartDate] = useState(defaultDate || todayISO())
  const [macroChoice, setMacroChoice] = useState('auto')
  const [preview, setPreview] = useState(null)
  const [previewError, setPreviewError] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)
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

  // Vista previa: se recalcula al cambiar plantilla, atleta, fecha o macrociclo.
  useEffect(() => {
    if (!item || !athleteId || !startDate || disciplines.length === 0) {
      setPreview(null)
      return undefined
    }
    const mine = ++token.current
    setPreviewError(null)
    previewApplication({ item, athleteId, startDate, disciplines, macroChoice })
      .then((p) => {
        if (mine === token.current) setPreview(p)
      })
      .catch((e) => {
        if (mine === token.current) {
          setPreview(null)
          setPreviewError(e.message)
        }
      })
    return () => {
      token.current += 1
    }
  }, [item, athleteId, startDate, disciplines, macroChoice])

  const summary = useMemo(() => (item ? templateSummary(item.kind, item.payload) : null), [item])
  const macros = preview?.existing?.macrocycles || []
  const canApply = !!preview && preview.errors.length === 0 && !busy

  async function handleApply() {
    setBusy(true)
    setError(null)
    try {
      const r = await applyTemplateToAthlete({ item, athleteId, coachId: user.id, startDate, disciplines, macroChoice })
      setResult(r)
      onDone?.(r)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  if (result) {
    return (
      <Modal title="Plantilla aplicada" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm">
            Se han colocado <strong>{result.sessions}</strong> {result.sessions === 1 ? 'sesión' : 'sesiones'} en el calendario del atleta
            {result.first && result.last ? ` (del ${shortDate(result.first)} al ${shortDate(result.last)})` : ''}. Las verá en cuanto abra su calendario.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              to={`/coach/atleta/${athleteId}`}
              onClick={onClose}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm"
            >
              Ver el atleta
            </Link>
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
              Cerrar
            </button>
          </div>
        </div>
      </Modal>
    )
  }

  const isSession = item?.kind === 'session'

  return (
    <Modal title="Aplicar al calendario de un atleta" onClose={onClose} wide>
      <div className="space-y-4">
        {!fixedItem && (
          <div>
            <label className={labelCls}>Plantilla</label>
            <select value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
              <option value="">Elige una plantilla…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} · {kindLabel(i.kind)}
                </option>
              ))}
            </select>
            {items.length === 0 && <p className="text-xs text-slate mt-1">Tu biblioteca está vacía. Crea plantillas en la pestaña Biblioteca.</p>}
          </div>
        )}
        {fixedItem && (
          <p className="text-sm">
            <span className="font-semibold">{fixedItem.name}</span>
            <span className="text-slate"> · {kindLabel(fixedItem.kind)}</span>
            {summary && (
              <span className="font-mono text-xs text-slate">
                {' '}· {summary.sessions} {summary.sessions === 1 ? 'sesión' : 'sesiones'}
                {summary.weeks ? ` · ${summary.weeks} semanas` : ''}
              </span>
            )}
          </p>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Atleta</label>
            {fixedAthlete ? (
              <p className="text-sm py-2">{fixedAthlete.full_name || fixedAthlete.email}</p>
            ) : (
              <select value={athleteId} onChange={(e) => setAthleteId(e.target.value)} className={inputCls}>
                <option value="">Elige un atleta…</option>
                {athletes.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name || a.email}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div>
            <label className={labelCls}>{isSession ? 'Día de la sesión' : 'Fecha de inicio'}</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputCls} />
            {!isSession && startDate && (
              <p className="text-xs text-slate mt-1">La semana 1 empieza el lunes {shortDate(mondayOf(startDate))}.</p>
            )}
          </div>
        </div>

        {item?.kind === 'mesocycle' && macros.length > 0 && (
          <div>
            <label className={labelCls}>Macrociclo destino</label>
            <select value={macroChoice} onChange={(e) => setMacroChoice(e.target.value)} className={inputCls}>
              <option value="auto">El más reciente</option>
              {macros.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
              <option value="none">Sin macrociclo</option>
            </select>
          </div>
        )}

        {previewError && <p className="text-red text-sm">{previewError}</p>}

        {preview && (
          <div className="bg-bg rounded-sm px-4 py-3 text-sm space-y-1">
            {preview.errors.length === 0 ? (
              <>
                <p>
                  Se crearán <strong>{preview.application.sessions.length}</strong>{' '}
                  {preview.application.sessions.length === 1 ? 'sesión' : 'sesiones'}
                  {preview.first && preview.last && preview.first !== preview.last
                    ? ` entre el ${longDayTitle(preview.first)} y el ${longDayTitle(preview.last)}.`
                    : preview.first
                      ? ` el ${longDayTitle(preview.first)}.`
                      : '.'}
                </p>
                {preview.application.mesocycles.length > 0 && (
                  <p className="text-slate">
                    {preview.application.mesocycles.length} {preview.application.mesocycles.length === 1 ? 'mesociclo' : 'mesociclos'}
                    {preview.application.macrocycle ? ` · nuevo macrociclo «${preview.application.macrocycle.name}»` : ''}.
                  </p>
                )}
                {!preview.plan && (
                  <p className="text-slate">Este atleta no tiene plan: se creará uno nuevo (activo) con esta plantilla.</p>
                )}
                {preview.plan && preview.plan.status === 'draft' && (
                  <p className="text-slate">El plan del atleta está en borrador: no lo verá hasta que lo actives.</p>
                )}
                {preview.newPlanStart && preview.plan && (
                  <p className="text-slate">El plan no tenía fecha de inicio: se fijará el lunes {shortDate(preview.planStart)}.</p>
                )}
                <p className="text-slate">Se añaden a lo que ya tenga el atleta; no se borra ni se mueve nada.</p>
              </>
            ) : (
              preview.errors.map((m) => (
                <p key={m} className="text-red">
                  {m}
                </p>
              ))
            )}
          </div>
        )}

        {error && <p className="text-red text-sm">{error}</p>}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleApply}
            disabled={!canApply}
            className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            {busy ? 'Aplicando…' : 'Aplicar al calendario'}
          </button>
          <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm text-slate border border-mist rounded-sm hover:border-red hover:text-red">
            Cancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}
