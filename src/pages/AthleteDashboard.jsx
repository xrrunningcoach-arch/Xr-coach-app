import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { fetchDisciplines } from '../lib/disciplines'
import LoadingScreen from '../components/LoadingScreen'
import ZonesTable from '../components/ZonesTable'
import AthleteCalendar from '../components/AthleteCalendar'
import StatsDashboard from '../components/StatsDashboard'
import GoalsView from '../components/GoalsView'
import TodayView from '../components/TodayView'
import { useT } from '../i18n'
import useToday from '../components/calendar/useToday'
import { sessionKm, sessionKmDone } from '../lib/stats'
import { pickMaxHr, sanitizeManualZones } from '../lib/zones'
import ThresholdsPanel from '../components/ThresholdsPanel'
import RpeScaleTable from '../components/RpeScaleTable'
import { ui } from '../ui/ui'

// Datos del plan del atleta. La navegación entre secciones vive ahora en el
// panel lateral (AthleteHome); este componente recibe la sección activa y
// pinta su contenido. Las tarjetas de sesión (SessionCard) no han cambiado.
export default function AthleteDashboard({ section = 'hoy', onNavigate, onProposeSession, unread = 0 }) {
  const { user, profile } = useAuth()
  const t = useT()
  const today = useToday()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [race, setRace] = useState(null)
  const [mesocycles, setMesocycles] = useState([])
  const [sessions, setSessions] = useState([])
  const [intervalsActivities, setIntervalsActivities] = useState([])
  const [milestones, setMilestones] = useState([])
  const [hrZones, setHrZones] = useState(null)
  const [manualZones, setManualZones] = useState({})
  const [thresholdTest, setThresholdTest] = useState(null)
  const [hrv, setHrv] = useState([])
  const [athleteProfile, setAthleteProfile] = useState(null)
  const [tests, setTests] = useState([])
  const [evaluationsBySession, setEvaluationsBySession] = useState({})
  const [disciplines, setDisciplines] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Keep the athlete's Today screen current while open. Intervals webhooks are
  // the primary path; this hourly catch-up covers missed webhook deliveries.
  useEffect(() => {
    if (!user) return undefined
    const channel = supabase.channel(`intervals-activities-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'intervals_activities', filter: `profile_id=eq.${user.id}` }, () => loadData(true))
      .subscribe()
    let timer
    const sync = async () => {
      if (section !== 'hoy') return
      try {
        const { data, error } = await supabase.functions.invoke('intervals-sync', { body: {} })
        if (error) throw error
        if (data?.synced > 0) await loadData(true)
      } catch (error) {
        console.warn('Intervals automatic sync was deferred:', error?.message || error)
      }
    }
    sync()
    timer = window.setInterval(sync, 60 * 60 * 1000)
    return () => {
      window.clearInterval(timer)
      supabase.removeChannel(channel)
    }
    // loadData is intentionally stable for this subscription lifecycle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, section])

  // Al entrar en «Objetivos» se refrescan los datos: así se ven al instante
  // las metas que se acaban de editar en «Mi perfil».
  useEffect(() => {
    if (section === 'objetivos') loadData(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  // silent = true: recarga sin tapar la pantalla (así no se pierde el mes o
  // la semana que estás mirando ni el formulario abierto).
  async function loadData(silent = false) {
    if (!user) return
    if (silent !== true) setLoading(true)
    setError(null)

    if (disciplines.length === 0) setDisciplines(await fetchDisciplines())

    const { data: importedActivities } = await supabase.from('intervals_activities')
      .select('provider_activity_id,session_id,activity_local_date,activity_type,activity_name,start_date_local,distance_m,moving_time_s,elapsed_time_s,average_hr,max_hr,source')
      .eq('profile_id', user.id)
      .order('start_date_local', { ascending: false })
      .limit(60)
    setIntervalsActivities(importedActivities || [])

    // Zonas manuales y perfil: no dependen del plan (si aún no existen las
    // tablas de la migración 0004, simplemente quedan vacías).
    const [{ data: manual }, { data: profileRow }, { data: thr }, { data: hrvRows }] = await Promise.all([
      supabase.from('athlete_hr_zones').select('manual_zones').eq('athlete_id', user.id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('profile_id', user.id).maybeSingle(),
      supabase.from('threshold_tests').select('*').eq('athlete_id', user.id).order('test_date', { ascending: false }).limit(1),
      supabase.from('hrv_readings').select('*').eq('athlete_id', user.id).order('reading_date', { ascending: false }).limit(60),
    ])
    setThresholdTest(thr?.[0] || null)
    setHrv(hrvRows || [])
    setManualZones(sanitizeManualZones(manual?.manual_zones))
    setAthleteProfile(profileRow || null)

    const { data: plans, error: planErr } = await supabase
      .from('training_plans')
      .select('*, races(*)')
      .eq('athlete_id', user.id)
      .in('status', ['active', 'completed']) // los planes en borrador no son visibles para el atleta
      .order('created_at', { ascending: false })
      .limit(1)

    if (planErr) {
      setError(planErr.message)
      setLoading(false)
      return
    }

    const currentPlan = plans?.[0] || null
    setPlan(currentPlan)
    setRace(currentPlan?.races || null)

    if (currentPlan) {
      const [{ data: meso }, { data: sess }, { data: ms }, { data: hz }, { data: tst }] = await Promise.all([
        supabase.from('mesocycles').select('*').eq('plan_id', currentPlan.id).order('order_index'),
        supabase.from('sessions').select('*').eq('plan_id', currentPlan.id).order('week_number').order('day_number'),
        supabase.from('milestones').select('*').eq('plan_id', currentPlan.id).order('event_date'),
        supabase.from('hr_zones').select('*').eq('plan_id', currentPlan.id).maybeSingle(),
        supabase.from('tests').select('*').eq('plan_id', currentPlan.id).order('test_date'),
      ])
      setMesocycles(meso || [])
      setSessions(sess || [])
      setMilestones(ms || [])
      setHrZones(hz || null)
      setTests(tst || [])

      const sessionIds = (sess || []).map((s) => s.id)
      if (sessionIds.length) {
        const { data: evals } = await supabase
          .from('session_evaluations')
          .select('*')
          .in('session_id', sessionIds)
          .order('created_at', { ascending: false })
        const grouped = {}
        ;(evals || []).forEach((ev) => {
          if (!grouped[ev.session_id]) grouped[ev.session_id] = []
          grouped[ev.session_id].push(ev)
        })
        setEvaluationsBySession(grouped)
      } else {
        setEvaluationsBySession({})
      }
    }

    setLoading(false)
  }

  const progress = useMemo(() => {
    const totalKm = sessions.reduce((sum, s) => sum + sessionKm(s), 0)
    const doneKm = sessions.reduce((sum, s) => sum + sessionKmDone(s), 0)
    const totalSessions = sessions.length
    const doneSessions = sessions.filter((s) => s.status === 'completado').length
    return { totalKm, doneKm, totalSessions, doneSessions }
  }, [sessions])

  if (loading) return <LoadingScreen />

  if (!plan && ['hoy', 'calendario'].includes(section) && !(section === 'hoy' && intervalsActivities.length > 0)) {
    return (
      <div className="bg-surface border border-mist rounded-sm p-8 text-center">
        <h2 className="font-display text-xl text-navy mb-2">{t('today.noPlanTitle')}</h2>
        <p className="text-slate text-sm">{t('today.noPlanBody')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {plan && (section === 'calendario' || section === 'estadisticas') && (
        <div className="bg-navy-deep text-white rounded-sm p-6 sm:p-8">
          <p className="font-mono text-xs text-red mb-2">
            {race?.name || plan.custom_race_name || t('dash.customPlan')}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl mb-3">{t('dash.planTitle')}</h1>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 text-sm">
            <Stat label={t('dash.duration')} value={t('dash.weeks', { count: plan.duration_weeks })} />
            <Stat label={t('dash.targetPace')} value={plan.target_pace || '—'} />
            <Stat label={t('dash.kmDone')} value={`${progress.doneKm.toFixed(1)} / ${progress.totalKm.toFixed(1)}`} />
            <Stat label={t('dash.sessionsDone')} value={`${progress.doneSessions} / ${progress.totalSessions}`} />
          </div>
        </div>
      )}

      {error && <p className="text-red text-sm">{error}</p>}

      {section === 'hoy' && (
        <TodayView
          today={today}
          profile={profile}
          plan={plan}
          race={race}
          sessions={sessions}
          intervalsActivities={intervalsActivities}
          manualZones={manualZones}
          disciplines={disciplines}
          evaluationsBySession={evaluationsBySession}
          unread={unread}
          onUpdated={() => loadData(true)}
          onNavigate={onNavigate || (() => {})}
        />
      )}

      {section === 'calendario' && (
        <AthleteCalendar
          plan={plan}
          sessions={sessions}
          mesocycles={mesocycles}
          disciplines={disciplines}
          evaluationsBySession={evaluationsBySession}
          milestones={milestones}
          manualZones={manualZones}
          onUpdated={() => loadData(true)}
          onProposeSession={onProposeSession}
        />
      )}

      {section === 'estadisticas' && <StatsDashboard sessions={sessions} disciplines={disciplines} />}

      {section === 'zonas' && (
        <div className="space-y-4">
          <HrZonesView hrZones={hrZones} manualZones={manualZones} test={thresholdTest} />
          <RpeScaleTable />
          <ThresholdsPanel test={thresholdTest} hrv={hrv} athleteId={user.id} today={today} showTest={false} onChanged={() => loadData(true)} />
        </div>
      )}

      {section === 'objetivos' && (
        <GoalsView
          plan={plan}
          race={race}
          milestones={milestones}
          athleteProfile={athleteProfile}
          profileId={user.id}
          basicProfile={profile}
          today={today}
          onGoToProfile={onNavigate ? () => onNavigate('perfil') : undefined}
          onChanged={() => loadData(true)}
        />
      )}

      {section === 'tests' && <TestsView tests={tests} plan={plan} onChanged={() => loadData(true)} />}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div>
      <div className="font-mono text-[11px] text-navy-light uppercase">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function HrZonesView({ hrZones, manualZones, test }) {
  const t = useT()
  if (Object.keys(manualZones).length === 0) return <EmptyState text={t('zones.empty')} />
  // Una sola FC máx.: la del test de umbrales más reciente manda sobre la del plan.
  const maxHr = pickMaxHr(test?.max_hr, hrZones?.max_hr_real)
  return <ZonesTable maxHr={maxHr} manualZones={manualZones} test={test} />
}

function TestsView({ tests, plan, onChanged }) {
  const t = useT()
  const [form, setForm] = useState({ test_date: '', block_label: '', test_type: '', distance: '', result: '', pace: '', observations: '' })
  const [saving, setSaving] = useState(false)
  async function addTest(event) {
    event.preventDefault()
    if (!plan) return
    setSaving(true)
    const { error } = await supabase.from('tests').insert({ ...form, plan_id: plan.id })
    setSaving(false)
    if (error) { ui.error(error.message); return }
    setForm({ test_date: '', block_label: '', test_type: '', distance: '', result: '', pace: '', observations: '' })
    onChanged()
  }
  async function deleteTest(id) {
    const { error } = await supabase.from('tests').delete().eq('id', id)
    if (error) ui.error(error.message)
    else onChanged()
  }
  return (
    <div className="space-y-5">
    <div className="rounded-xl border border-mist bg-surface overflow-x-auto">
      {tests.length === 0 ? <p className="p-5 text-sm text-slate">{t('tests.empty')}</p> : <table className="w-full text-sm min-w-[720px]">
        <thead className="bg-bg-dim">
          <tr>
            {['date', 'block', 'type', 'distance', 'result', 'pace', 'notes', 'delete'].map((h) => h === 'delete' ? t('c.delete') : t('tests.col.' + h)).map((h) => (
              <th key={h} className="text-left px-4 py-3 font-mono text-xs text-slate">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {tests.map((row) => (
            <tr key={row.id}>
              <td className="px-4 py-3 font-mono text-xs">{row.test_date || '—'}</td>
              <td className="px-4 py-3">{row.block_label}</td>
              <td className="px-4 py-3">{row.test_type}</td>
              <td className="px-4 py-3">{row.distance}</td>
              <td className="px-4 py-3 font-mono">{row.result}</td>
              <td className="px-4 py-3 font-mono">{row.pace}</td>
              <td className="px-4 py-3 text-slate">{row.observations}</td>
              <td className="px-4 py-3"><button type="button" onClick={() => deleteTest(row.id)} className="text-xs font-semibold text-red">{t('c.delete')}</button></td>
            </tr>
          ))}
        </tbody>
      </table>}
    </div>
    {plan && <form onSubmit={addTest} className="space-y-3 rounded-xl border border-mist bg-surface p-5">
      <h3 className="font-display text-lg text-navy">{t('ed.test.add')}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="date" value={form.test_date} onChange={(e) => setForm({ ...form, test_date: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
        <input placeholder={t('ed.test.block')} value={form.block_label} onChange={(e) => setForm({ ...form, block_label: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
        <input required placeholder={t('tests.col.type')} value={form.test_type} onChange={(e) => setForm({ ...form, test_type: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
        <input placeholder={t('tests.col.distance')} value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
        <input placeholder={t('tests.col.result')} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
        <input placeholder={t('tests.col.pace')} value={form.pace} onChange={(e) => setForm({ ...form, pace: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
      </div>
      <textarea placeholder={t('tests.col.notes')} value={form.observations} onChange={(e) => setForm({ ...form, observations: e.target.value })} rows={2} className="w-full rounded-md border border-mist px-3 py-2" />
      <button disabled={saving} className="min-h-11 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy disabled:opacity-60">{saving ? t('common.saving') : t('c.add')}</button>
    </form>}
    </div>
  )
}

function EmptyState({ text }) {
  return <div className="bg-surface border border-mist rounded-sm p-8 text-center text-slate text-sm">{text}</div>
}
