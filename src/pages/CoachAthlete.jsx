import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { generatePlanSkeleton } from '../lib/planGenerator'
import { fetchDisciplines, raceName } from '../lib/disciplines'
import { weeklyLoad } from '../lib/load'
import WeekLoadBars from '../components/WeekLoadBars'
import LoadingScreen from '../components/LoadingScreen'
import AthleteSummary from '../components/AthleteSummary'
import ChatPanel from '../components/ChatPanel'
import ZonesTable from '../components/ZonesTable'
import CoachCalendar from '../components/CoachCalendar'
import ApplyTemplateModal from '../components/library/ApplyTemplateModal'
import SaveToLibraryModal from '../components/library/SaveToLibraryModal'
import { dateForWeekday, shortDate, todayISO } from '../lib/dates'
import { nextMondayISO, sortByDate, weekBounds } from '../lib/planCalendar'
import { cycleDatesFromWeeks } from '../lib/cycles'
import { fetchExercisesBySession, placeUndatedSessions } from '../lib/templatesApi'
import { serializeMacrocycle, serializeMesocycle, serializeSession } from '../lib/templates'
import { pickMaxHr, sanitizeManualZones } from '../lib/zones'
import PlanActions from '../components/PlanActions'
import ThresholdTestForm from '../components/ThresholdTestForm'
import HrZonesManual from '../components/HrZonesManual'
import CoachSessionRow from '../components/CoachSessionRow'
import { ui } from '../ui/ui'
import { useT } from '../i18n'

export default function CoachAthlete() {
  const { athleteId } = useParams()
  const { user } = useAuth()
  const t = useT()

  const [loading, setLoading] = useState(true)
  const [athlete, setAthlete] = useState(null)
  const [plan, setPlan] = useState(null)
  const [applyOpen, setApplyOpen] = useState(false)
  const [races, setRaces] = useState([])
  const [mesocycles, setMesocycles] = useState([])
  const [macrocycles, setMacrocycles] = useState([])
  const [sessions, setSessions] = useState([])
  const [hrZones, setHrZones] = useState(null)
  const [manualZones, setManualZones] = useState({})
  const [thresholdTests, setThresholdTests] = useState([])
  const [milestones, setMilestones] = useState([])
  const [tests, setTests] = useState([])
  const [disciplines, setDisciplines] = useState([])
  const [tab, setTab] = useState('resumen')
  const [calendarFocus, setCalendarFocus] = useState(null) // { date, key }: lleva el calendario a esa semana
  const [libraryDraft, setLibraryDraft] = useState(null) // { kind, defaultName, payload }

  useEffect(() => {
    loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId])

  // silent = true: recarga los datos sin tapar la pantalla con "Cargando…"
  // (lo usan los paneles nuevos para no perder lo que tienes desplegado).
  async function loadAll(silent = false) {
    if (silent !== true) setLoading(true)

    const { data: a } = await supabase.from('profiles').select('*').eq('id', athleteId).single()
    setAthlete(a)

    const { data: raceList } = await supabase.from('races').select('*').order('distance_km')
    setRaces(raceList || [])

    setDisciplines(await fetchDisciplines())

    // Zonas de FC manuales de este atleta (migración 0004). Si la migración
    // aún no se ha ejecutado, la consulta falla y simplemente queda vacío.
    const { data: manual } = await supabase.from('athlete_hr_zones').select('manual_zones').eq('athlete_id', athleteId).maybeSingle()
    setManualZones(sanitizeManualZones(manual?.manual_zones))
    const { data: thr } = await supabase.from('threshold_tests').select('*').eq('athlete_id', athleteId).order('test_date', { ascending: false })
    setThresholdTests(thr || [])

    const { data: plans } = await supabase
      .from('training_plans')
      .select('*, races(*)')
      .eq('athlete_id', athleteId)
      .order('created_at', { ascending: false })
      .limit(1)

    const currentPlan = plans?.[0] || null
    setPlan(currentPlan)

    if (currentPlan) {
      const [{ data: meso }, { data: sess }, { data: hz }, { data: ms }, { data: tst }, { data: macros }] = await Promise.all([
        supabase.from('mesocycles').select('*').eq('plan_id', currentPlan.id).order('order_index'),
        supabase.from('sessions').select('*').eq('plan_id', currentPlan.id).order('week_number').order('day_number'),
        supabase.from('hr_zones').select('*').eq('plan_id', currentPlan.id).maybeSingle(),
        supabase.from('milestones').select('*').eq('plan_id', currentPlan.id).order('event_date'),
        supabase.from('tests').select('*').eq('plan_id', currentPlan.id).order('test_date'),
        supabase.from('macrocycles').select('*').eq('plan_id', currentPlan.id).order('order_index'),
      ])
      setMesocycles(meso || [])
      setMacrocycles(macros || [])
      setSessions(sess || [])
      setHrZones(hz || null)
      setMilestones(ms || [])
      setTests(tst || [])
    } else {
      setMesocycles([])
      setMacrocycles([])
      setSessions([])
      setHrZones(null)
      setMilestones([])
      setTests([])
    }

    setLoading(false)
  }

  // «Guardar en la biblioteca»: convierte lo seleccionado en plantilla sin atleta.
  async function saveToLibrary(kind, entity) {
    try {
      if (kind === 'session') {
        const ex = await fetchExercisesBySession([entity.id])
        setLibraryDraft({
          kind,
          defaultName: entity.session_type || t('common.session'),
          payload: serializeSession(entity, disciplines, ex[entity.id] || []),
        })
      } else if (kind === 'mesocycle') {
        const mine = sessions.filter((x) => x.mesocycle_id === entity.id || (x.week_number >= entity.week_start && x.week_number <= entity.week_end))
        const ex = await fetchExercisesBySession(mine.map((x) => x.id))
        setLibraryDraft({ kind, defaultName: entity.name, payload: serializeMesocycle(entity, sessions, disciplines, ex) })
      } else {
        const mesos = mesocycles.filter((m) => m.macrocycle_id === entity.id)
        const ex = await fetchExercisesBySession(sessions.map((x) => x.id))
        setLibraryDraft({ kind, defaultName: entity.name, payload: serializeMacrocycle(entity, mesos, sessions, disciplines, ex) })
      }
    } catch (e) {
      ui.error(e.message)
    }
  }

  if (loading) return <LoadingScreen />
  if (!athlete) return <p className="text-red">{t('ed.notFound')}</p>

  return (
    <div className="space-y-6">
      <div>
        <Link to="/coach" className="text-sm text-slate hover:text-navy">{t('ed.back')}</Link>
        <h1 className="font-display text-2xl text-navy mt-2">{athlete.full_name || athlete.email}</h1>
        <p className="text-sm text-slate">{athlete.email}</p>
        {athlete.is_active === false && (
          <p className="inline-block mt-2 px-2.5 py-1 rounded-full text-[11px] font-mono font-semibold bg-red/15 text-red-deep">
            {t('ed.archived')}
          </p>
        )}
      </div>

      <div className="flex gap-2 border-b border-mist overflow-x-auto">
        {[
          ['resumen', t('ed.tab.summary')],
          ['plan', t('ed.tab.plan')],
          ['calendario', t('nav.calendar')],
          ['zonas', t('nav.zones')],
          ['objetivos', t('nav.goals')],
          ['tests', t('nav.tests')],
          ['chat', t('nav.chatShort')],
        ].map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
              tab === id ? 'border-red text-red' : 'border-transparent text-slate hover:text-navy'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'resumen' && (
        <AthleteSummary
          athlete={athlete}
          manualZones={manualZones}
          thresholdTest={thresholdTests[0] || null}
          hrZones={hrZones}
          plan={plan}
          macrocycles={macrocycles}
          mesocycles={mesocycles}
          sessions={sessions}
          disciplines={disciplines}
          onReload={loadAll}
          onGoToPlan={() => setTab('plan')}
          onSaveToLibrary={saveToLibrary}
        />
      )}

      {tab === 'plan' &&
        (plan ? (
          <PlanEditor
            plan={plan}
            mesocycles={mesocycles}
            sessions={sessions}
            disciplines={disciplines}
            races={races}
            onReload={loadAll}
            onSaveToLibrary={saveToLibrary}
            onShowInCalendar={(date) => {
              setCalendarFocus({ date, key: Date.now() })
              setTab('calendario')
            }}
          />
        ) : (
          <PlanBuilder
            athleteId={athleteId}
            coachId={user.id}
            races={races}
            disciplines={disciplines}
            onCreated={loadAll}
          />
        ))}

      {tab === 'zonas' && plan && (
        <HrZonesEditor
          planId={plan.id}
          athleteId={athlete.id}
          coachId={user.id}
          hrZones={hrZones}
          manualZones={manualZones}
          thresholdTests={thresholdTests}
          today={todayISO()}
          onSaved={() => loadAll(true)}
        />
      )}
      {tab === 'calendario' && plan && (
        <CoachCalendar
          athlete={athlete}
          plan={plan}
          sessions={sessions}
          mesocycles={mesocycles}
          disciplines={disciplines}
          milestones={milestones}
          onReload={loadAll}
          onSaveSessionToLibrary={(session) => saveToLibrary('session', session)}
          focusDate={calendarFocus?.date}
          focusKey={calendarFocus?.key}
          onShowInPlan={() => setTab('plan')}
        />
      )}
      {tab === 'objetivos' && plan && <MilestonesEditor planId={plan.id} milestones={milestones} onChanged={loadAll} />}
      {tab === 'tests' && plan && <TestsEditor planId={plan.id} tests={tests} onChanged={loadAll} />}
      {tab === 'chat' && <ChatPanel athleteId={athlete.id} otherName={athlete.full_name || athlete.email} />}

      {(tab === 'zonas' || tab === 'objetivos' || tab === 'tests') && !plan && (
        <p className="text-sm text-slate">{t('ed.needPlan')}</p>
      )}
      {tab === 'calendario' && !plan && (
        <div className="space-y-3">
          <p className="text-sm text-slate">
            {t('ed.noPlanCalendar')}
          </p>
          <button
            type="button"
            onClick={() => setApplyOpen(true)}
            className="px-3 py-2 text-sm font-semibold bg-primary hover:bg-primary-hover text-white rounded-sm"
          >
            {t('ed.applyLibrary')}
          </button>
        </div>
      )}
      {applyOpen && (
        <ApplyTemplateModal athlete={athlete} defaultDate={new Date().toISOString().slice(0, 10)} onClose={() => setApplyOpen(false)} onDone={() => loadAll(true)} />
      )}

      {libraryDraft && (
        <SaveToLibraryModal
          kind={libraryDraft.kind}
          defaultName={libraryDraft.defaultName}
          payload={libraryDraft.payload}
          onClose={() => setLibraryDraft(null)}
        />
      )}
    </div>
  )
}

// ----------------------------------------------------------------------------
// CREAR PLAN
// ----------------------------------------------------------------------------
function PlanBuilder({ athleteId, coachId, races, disciplines, onCreated }) {
  const t = useT()
  const [raceId, setRaceId] = useState(races[0]?.id || '')
  const [useCustom, setUseCustom] = useState(false)
  const [customName, setCustomName] = useState('')
  const [duration, setDuration] = useState(11)
  const [startDate, setStartDate] = useState(() => nextMondayISO())
  const [raceDate, setRaceDate] = useState('')
  const [currentPace, setCurrentPace] = useState('')
  const [targetPace, setTargetPace] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  async function handleCreate(e) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: plan, error: planErr } = await supabase
      .from('training_plans')
      .insert({
        athlete_id: athleteId,
        coach_id: coachId,
        race_id: useCustom ? null : raceId || null,
        custom_race_name: useCustom ? customName : null,
        current_pace: currentPace,
        target_pace: targetPace,
        start_date: startDate || null,
        race_date: raceDate || null,
        duration_weeks: Number(duration),
        status: 'active',
      })
      .select()
      .single()

    if (planErr) {
      setError(planErr.message)
      setSaving(false)
      return
    }

    const { mesocycles, sessions } = generatePlanSkeleton(Number(duration), 3, t)

    // Todo plan nuevo nace con un "Macrociclo 1" que agrupa sus mesociclos;
    // luego puedes añadir más macrociclos desde la pestaña "Perfil y mesociclos".
    const { data: macro, error: macroErr } = await supabase
      .from('macrocycles')
      .insert({ plan_id: plan.id, order_index: 1, name: 'Macrociclo 1' })
      .select()
      .single()

    if (macroErr) {
      setError(macroErr.message)
      setSaving(false)
      return
    }

    const { data: insertedMeso, error: mesoErr } = await supabase
      .from('mesocycles')
      .insert(
        mesocycles.map((m) => ({
          ...m,
          plan_id: plan.id,
          macrocycle_id: macro.id,
          ...cycleDatesFromWeeks(startDate, m.week_start, m.week_end),
        }))
      )
      .select()

    if (mesoErr) {
      setError(mesoErr.message)
      setSaving(false)
      return
    }

    const orderToId = {}
    insertedMeso.forEach((m) => { orderToId[m.order_index] = m.id })

    // El esqueleto se genera pensado en carrera; el entrenador cambia la
    // disciplina fila a fila cuando la semana combina deportes.
    const runningId = disciplines.find((d) => d.code === 'running')?.id || null

    // Con fecha de inicio, cada sesión nace colocada en su día del calendario:
    // «Día N» = día N de la semana (Día 1 = lunes). El entrenador puede
    // arrastrarlas a otro día desde la pestaña Calendario.
    const sessionsPayload = sessions.map(({ mesocycle_order, ...s }) => ({
      ...s,
      plan_id: plan.id,
      mesocycle_id: mesocycle_order ? orderToId[mesocycle_order] : null,
      discipline_id: runningId,
      session_date: startDate ? dateForWeekday(startDate, s.week_number, Math.min(6, s.day_number - 1)) : null,
    }))

    const { error: sessErr } = await supabase.from('sessions').insert(sessionsPayload)
    setSaving(false)

    if (sessErr) {
      setError(sessErr.message)
      return
    }

    onCreated()
  }

  return (
    <form onSubmit={handleCreate} className="bg-surface border border-mist rounded-sm p-6 space-y-5 max-w-2xl">
      <h2 className="font-display text-xl text-navy">{t('ed.plan.create')}</h2>

      <div>
        <label className="block font-mono text-xs text-slate mb-1.5">{t('ed.plan.race')}</label>
        <div className="flex flex-wrap gap-3 mb-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={!useCustom} onChange={() => setUseCustom(false)} /> {t('ed.plan.catalog')}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={useCustom} onChange={() => setUseCustom(true)} /> {t('ed.plan.custom')}
          </label>
        </div>
        {!useCustom ? (
          <select
            value={raceId}
            onChange={(e) => setRaceId(e.target.value)}
            className="w-full border border-mist rounded-sm px-3 py-2.5"
          >
            {races.map((r) => (
              <option key={r.id} value={r.id}>{raceName(r)}{r.distance_km ? ` (${r.distance_km} km)` : ''}</option>
            ))}
          </select>
        ) : (
          <input
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder={t('ed.plan.customPh')}
            className="w-full border border-mist rounded-sm px-3 py-2.5"
          />
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-xs text-slate mb-1.5">{t('ed.plan.duration')}</label>
          <input
            type="number"
            min={1}
            max={52}
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full border border-mist rounded-sm px-3 py-2.5"
            required
          />
        </div>
        <div>
          <label className="block font-mono text-xs text-slate mb-1.5">{t('ed.plan.start')}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            required
            className="w-full border border-mist rounded-sm px-3 py-2.5"
          />
          <p className="text-xs text-slate mt-1">{t('ed.plan.startHelp')}</p>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-xs text-slate mb-1.5">{t('ed.plan.raceDate')}</label>
          <input
            type="date"
            value={raceDate}
            onChange={(e) => setRaceDate(e.target.value)}
            className="w-full border border-mist rounded-sm px-3 py-2.5"
          />
        </div>
        <div />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-xs text-slate mb-1.5">{t('ed.plan.currentPace')}</label>
          <input
            value={currentPace}
            onChange={(e) => setCurrentPace(e.target.value)}
            placeholder={t('ed.plan.currentPh')}
            className="w-full border border-mist rounded-sm px-3 py-2.5"
          />
        </div>
        <div>
          <label className="block font-mono text-xs text-slate mb-1.5">{t('ed.plan.targetPace')}</label>
          <input
            value={targetPace}
            onChange={(e) => setTargetPace(e.target.value)}
            placeholder={t('ed.plan.targetPh')}
            className="w-full border border-mist rounded-sm px-3 py-2.5"
          />
        </div>
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="px-5 py-2.5 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
      >
        {saving ? t('ed.plan.generating') : t('ed.plan.generate')}
      </button>
      <p className="text-xs text-slate">
        {t('ed.plan.generateNote')}
      </p>
    </form>
  )
}

// ----------------------------------------------------------------------------
// EDITAR PLAN + SESIONES + EVALUACIÓN
// ----------------------------------------------------------------------------
function PlanEditor({ plan, mesocycles, sessions, disciplines, races, onReload, onSaveToLibrary, onShowInCalendar }) {
  const t = useT()
  const weeks = useMemo(() => {
    const byWeek = {}
    sessions.forEach((s) => {
      if (!byWeek[s.week_number]) byWeek[s.week_number] = []
      byWeek[s.week_number].push(s)
    })
    return Object.entries(byWeek)
      .map(([week, items]) => ({ week: Number(week), items: sortByDate(items) }))
      .sort((a, b) => a.week - b.week)
  }, [sessions])

  // Carga real registrada por semana (session-RPE x duración), para ver de
  // un vistazo si una semana cruzada se está disparando aunque el volumen
  // de cada disciplina por separado parezca razonable.
  const loadByWeek = useMemo(() => weeklyLoad(sessions), [sessions])
  const maxLoad = Math.max(1, ...loadByWeek.map((w) => w.load))
  const maxImpact = Math.max(1, ...loadByWeek.map((w) => w.impactLoad))

  async function handleAddRow(weekNumber, mesocycleId) {
    const weekSessions = sessions.filter((s) => s.week_number === weekNumber)
    const dayNumber = weekSessions.length
      ? Math.max(...weekSessions.map((s) => s.day_number)) + 1
      : 1
    const runningId = disciplines.find((d) => d.code === 'running')?.id || null
    // Con fecha de inicio del plan, la sesión nueva se coloca en el primer día
    // libre de esa semana (o el último si están todos ocupados).
    let session_date = null
    if (plan.start_date) {
      const taken = new Set(weekSessions.map((s) => s.session_date).filter(Boolean))
      for (let d = 0; d < 7; d += 1) {
        const candidate = dateForWeekday(plan.start_date, weekNumber, d)
        session_date = candidate
        if (!taken.has(candidate)) break
      }
    }
    const { error } = await supabase.from('sessions').insert({
      plan_id: plan.id,
      mesocycle_id: mesocycleId,
      week_number: weekNumber,
      day_number: dayNumber,
      session_date,
      discipline_id: runningId,
      session_type: '',
      description: '',
      km_estimated: null,
      rpe_theoretical: '',
      status: 'pendiente',
    })
    if (error) ui.error(error.message)
    else onReload()
  }

  const undated = sessions.filter((s) => !s.session_date)
  async function handlePlaceUndated() {
    const err = await placeUndatedSessions(sessions, plan.start_date)
    if (err) ui.error(err.message)
    else onReload()
  }

  async function handleStatusChange(status) {
    const { error } = await supabase.from('training_plans').update({ status }).eq('id', plan.id)
    if (error) ui.error(error.message)
    else onReload()
  }

  return (
    <div className="space-y-6">
      <div className="bg-navy-deep text-white rounded-sm p-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs text-red mb-1">
            {raceName(plan.races) || plan.custom_race_name} · {t('lib.weeks', { count: plan.duration_weeks })}
          </p>
          <p className="text-sm text-white/80">
            {t('ed.planDates', { start: plan.start_date || '—', end: plan.race_date || '—', pace: plan.target_pace || '—' })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={plan.status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-sm px-3 py-2 text-sm"
          >
            <option value="draft">{t('ed.status.draft')}</option>
            <option value="active">{t('ed.status.active')}</option>
            <option value="completed">{t('ed.status.completed')}</option>
          </select>
          <PlanActions plan={plan} races={races} sessionCount={sessions.length} onChanged={onReload} />
        </div>
      </div>

      {undated.length > 0 && plan.start_date && (
        <div className="bg-surface border border-mist rounded-sm px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t('ed.undated', { count: undated.length })}</p>
          <button type="button" onClick={handlePlaceUndated} className="px-3 py-2 text-xs font-semibold bg-primary hover:bg-primary-hover text-white rounded-sm">
            {t('ed.placeUndated')}
          </button>
        </div>
      )}

      {weeks.map(({ week, items }) => {
        const bounds = plan.start_date ? weekBounds(plan.start_date, week) : null
        const meso = mesocycles.find((m) => week >= m.week_start && week <= m.week_end)
        const weekLoad = loadByWeek.find((w) => w.week === week)
        return (
          <div key={week} className="bg-surface border border-mist rounded-sm overflow-hidden">
            <div className="bg-bg-dim px-5 py-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-lg text-navy">
                {t('cal.weekN', { n: week })}
                {bounds && <span className="font-mono text-xs text-slate ml-3">{shortDate(bounds.from)} – {shortDate(bounds.to)}</span>}
              </h3>
              <span className="flex items-center gap-4">
                <span className="font-mono text-[11px] text-slate">{meso?.name}</span>
                {bounds && onShowInCalendar && (
                  <button type="button" onClick={() => onShowInCalendar(bounds.from)} className="text-xs font-semibold text-navy hover:text-red">
                    {t('ed.viewInCalendar')}
                  </button>
                )}
              </span>
            </div>
            <WeekLoadBars weekLoad={weekLoad} maxLoad={maxLoad} maxImpact={maxImpact} />
            <div className="divide-y divide-mist">
              {items.map((s) => (
                <CoachSessionRow
                  key={s.id}
                  session={s}
                  disciplines={disciplines}
                  mesocycles={mesocycles}
                  planStart={plan.start_date}
                  onChanged={onReload}
                  onSaveToLibrary={(session) => onSaveToLibrary('session', session)}
                />
              ))}
            </div>
            <div className="px-5 py-3">
              <button
                onClick={() => handleAddRow(week, meso?.id || null)}
                className="text-sm font-semibold text-navy hover:text-red"
              >
                {t('ed.addSessionWeek', { n: week })}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ----------------------------------------------------------------------------
// ZONAS DE FC
// ----------------------------------------------------------------------------
function HrZonesEditor({ planId, athleteId, coachId, hrZones, manualZones, thresholdTests = [], today, onSaved }) {
  const t = useT()
  const [maxHr, setMaxHr] = useState(hrZones?.max_hr_real ?? '')
  const [restingHr, setRestingHr] = useState(hrZones?.resting_hr ?? '')
  const [saving, setSaving] = useState(false)
  // Vista previa en directo de las zonas que se están escribiendo.
  const [previewManual, setPreviewManual] = useState(manualZones)

  // FC máx. solo como referencia para mostrar el %: la del test más reciente
  // o la que escribas aquí. No hay ninguna estimación con la edad.
  const latest = thresholdTests[0] || null
  const used = pickMaxHr(latest?.max_hr, maxHr)

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('hr_zones').upsert({
      plan_id: planId,
      max_hr_real: maxHr === '' ? null : Number(maxHr),
      resting_hr: restingHr === '' ? null : Number(restingHr),
    })
    setSaving(false)
    if (error) ui.error(error.message)
    else onSaved()
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="bg-surface border border-mist rounded-sm p-6 space-y-4 max-w-2xl">
        <h2 className="font-display text-xl text-navy">{t('zones.baseTitle')}</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block font-mono text-xs text-slate mb-1.5">{t('zones.maxHrReal')}</label>
            <input type="number" value={maxHr} onChange={(e) => setMaxHr(e.target.value)} className="w-full border border-mist rounded-sm px-3 py-2.5" />
          </div>
          <div>
            <label className="block font-mono text-xs text-slate mb-1.5">{t('zones.restingHr')}</label>
            <input type="number" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} className="w-full border border-mist rounded-sm px-3 py-2.5" />
          </div>
        </div>
        <div className="text-sm text-slate space-y-1">
          <p>
            {t('zones.maxHrUsed')}:{' '}
            <span className="font-mono text-navy">{used ? `${used} ${t('unit.bpm')}` : '—'}</span>
          </p>
          <p className="text-xs">{t('zones.baseNote')}</p>
        </div>
        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60">
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </form>

      <HrZonesManual
        key={JSON.stringify(manualZones)}
        athleteId={athleteId}
        coachId={coachId}
        manualZones={manualZones}
        onPreview={setPreviewManual}
        onSaved={onSaved}
      />

      <ThresholdTestForm athleteId={athleteId} coachId={coachId} today={today} history={thresholdTests} onSaved={onSaved} />

      <ZonesTable maxHr={used} manualZones={previewManual} test={latest} />
    </div>
  )
}

// ----------------------------------------------------------------------------
// CALENDARIO / HITOS
// ----------------------------------------------------------------------------
function MilestonesEditor({ planId, milestones, onChanged }) {
  const t = useT()
  const [form, setForm] = useState({ event_date: '', title: '', type: '', week_ref: '', notes: '' })
  const [saving, setSaving] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('milestones').insert({ ...form, plan_id: planId })
    setSaving(false)
    if (error) { ui.error(error.message); return }
    setForm({ event_date: '', title: '', type: '', week_ref: '', notes: '' })
    onChanged()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('milestones').delete().eq('id', id)
    if (error) ui.error(error.message)
    else onChanged()
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-mist rounded-sm divide-y divide-mist">
        {milestones.length === 0 && <p className="px-5 py-6 text-sm text-slate">{t('ed.ms.none')}</p>}
        {milestones.map((m) => (
          <div key={m.id} className="px-5 py-4 flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-sm">{m.title} <span className="font-mono text-xs text-navy-light">· {m.type}</span></p>
              <p className="text-sm text-slate">{m.notes}</p>
              <p className="font-mono text-xs text-slate mt-1">{m.event_date} · {m.week_ref}</p>
            </div>
            <button onClick={() => handleDelete(m.id)} className="text-xs text-red hover:text-red-deep shrink-0">{t('c.delete')}</button>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdd} className="bg-surface border border-mist rounded-sm p-6 space-y-4">
        <h3 className="font-display text-lg text-navy">{t('ed.ms.add')}</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('ed.ms.title')} required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('ed.ms.type')} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('ed.ms.weekRef')} value={form.week_ref} onChange={(e) => setForm({ ...form, week_ref: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
        </div>
        <textarea placeholder={t('ed.ms.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-mist rounded-sm px-3 py-2.5 resize-none" />
        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60">
          {saving ? t('common.saving') : t('c.add')}
        </button>
      </form>
    </div>
  )
}

// ----------------------------------------------------------------------------
// TEST Y MARCAS
// ----------------------------------------------------------------------------
function TestsEditor({ planId, tests, onChanged }) {
  const t = useT()
  const [form, setForm] = useState({
    test_date: '', block_label: '', test_type: '', distance: '', result: '', pace: '', rpe_reached: '', observations: '',
  })
  const [saving, setSaving] = useState(false)

  async function handleAdd(e) {
    e.preventDefault()
    setSaving(true)
    const { error } = await supabase.from('tests').insert({ ...form, plan_id: planId })
    setSaving(false)
    if (error) { ui.error(error.message); return }
    setForm({ test_date: '', block_label: '', test_type: '', distance: '', result: '', pace: '', rpe_reached: '', observations: '' })
    onChanged()
  }

  async function handleDelete(id) {
    const { error } = await supabase.from('tests').delete().eq('id', id)
    if (error) ui.error(error.message)
    else onChanged()
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface border border-mist rounded-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-bg-dim">
            <tr>
              {[t('tests.col.date'), t('tests.col.block'), t('tests.col.type'), t('tests.col.distance'), t('tests.col.result'), t('tests.col.pace'), 'RPE', t('tests.col.notes'), ''].map((h, i) => (
                <th key={i} className="text-left px-3 py-3 font-mono text-xs text-slate">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-mist">
            {tests.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-3 font-mono text-xs">{row.test_date}</td>
                <td className="px-3 py-3">{row.block_label}</td>
                <td className="px-3 py-3">{row.test_type}</td>
                <td className="px-3 py-3">{row.distance}</td>
                <td className="px-3 py-3 font-mono">{row.result}</td>
                <td className="px-3 py-3 font-mono">{row.pace}</td>
                <td className="px-3 py-3">{row.rpe_reached}</td>
                <td className="px-3 py-3 text-slate">{row.observations}</td>
                <td className="px-3 py-3">
                  <button onClick={() => handleDelete(row.id)} className="text-xs text-red hover:text-red-deep">{t('c.delete')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleAdd} className="bg-surface border border-mist rounded-sm p-6 space-y-4">
        <h3 className="font-display text-lg text-navy">{t('ed.test.add')}</h3>
        <div className="grid sm:grid-cols-3 gap-4">
          <input type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('ed.test.block')} value={form.block_label} onChange={(e) => setForm({ ...form, block_label: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('tests.col.type')} value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('tests.col.distance')} value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('tests.col.result')} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('tests.col.pace')} value={form.pace} onChange={(e) => setForm({ ...form, pace: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
          <input placeholder={t('ed.test.rpe')} value={form.rpe_reached} onChange={(e) => setForm({ ...form, rpe_reached: e.target.value })} className="border border-mist rounded-sm px-3 py-2.5" />
        </div>
        <textarea placeholder={t('tests.col.notes')} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} rows={2} className="w-full border border-mist rounded-sm px-3 py-2.5 resize-none" />
        <button type="submit" disabled={saving} className="px-5 py-2.5 bg-primary hover:bg-primary-hover text-white text-sm font-semibold rounded-sm disabled:opacity-60">
          {saving ? t('common.saving') : t('c.add')}
        </button>
      </form>
    </div>
  )
}
