import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { fetchDisciplines } from '../lib/disciplines'
import LoadingScreen from '../components/LoadingScreen'
import ZonesTable from '../components/ZonesTable'
import AthleteCalendar from '../components/AthleteCalendar'
import StatsDashboard from '../components/StatsDashboard'
import GoalsView from '../components/GoalsView'
import useToday from '../components/calendar/useToday'
import { sessionKm } from '../lib/stats'
import { effectiveMaxHr, sanitizeManualZones } from '../lib/zones'

// Datos del plan del atleta. La navegación entre secciones vive ahora en el
// panel lateral (AthleteHome); este componente recibe la sección activa y
// pinta su contenido. Las tarjetas de sesión (SessionCard) no han cambiado.
export default function AthleteDashboard({ section = 'calendario', onNavigate }) {
  const { user } = useAuth()
  const today = useToday()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [race, setRace] = useState(null)
  const [mesocycles, setMesocycles] = useState([])
  const [sessions, setSessions] = useState([])
  const [milestones, setMilestones] = useState([])
  const [hrZones, setHrZones] = useState(null)
  const [manualZones, setManualZones] = useState({})
  const [athleteProfile, setAthleteProfile] = useState(null)
  const [tests, setTests] = useState([])
  const [evaluationsBySession, setEvaluationsBySession] = useState({})
  const [disciplines, setDisciplines] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // Al entrar en «Objetivos!» se refrescan los datos: así se ven al instante
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

    // Zonas manuales y perfil: no dependen del plan (si aún no existen las
    // tablas de la migración 0004, simplemente quedan vacías).
    const [{ data: manual }, { data: profileRow }] = await Promise.all([
      supabase.from('athlete_hr_zones').select('manual_zones').eq('athlete_id', user.id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('profile_id', user.id).maybeSingle(),
    ])
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
    const doneKm = sessions
      .filter((s) => s.status === 'completado')
      .reduce((sum, s) => sum + sessionKm(s), 0)
    const totalSessions = sessions.length
    const doneSessions = sessions.filter((s) => s.status === 'completado').length
    return { totalKm, doneKm, totalSessions, doneSessions }
  }, [sessions])

  if (loading) return <LoadingScreen />

  const hasManualZones = Object.keys(manualZones).length > 0

  if (!plan && section !== 'objetivos' && !(section === 'zonas' && hasManualZones)) {
    return (
      <div className="bg-white border border-mist rounded-sm p-8 text-center">
        <h2 className="font-display text-xl text-navy mb-2">Todavía no tienes un plan asignado</h2>
        <p className="text-slate text-sm">
          Tu entrenador está preparando tu plan. En cuanto lo publique, aparecerá aquí.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {plan && (section === 'calendario' || section === 'estadisticas') && (
        <div className="bg-navy-deep text-white rounded-sm p-6 sm:p-8">
          <p className="font-mono text-xs text-red mb-2">
            {race?.name || plan.custom_race_name || 'Plan personalizado'}
          </p>
          <h1 className="font-display text-2xl sm:text-3xl mb-3">Tu plan de entrenamiento</h1>
          <div className="grid sm:grid-cols-4 gap-4 mt-6 text-sm">
            <Stat label="Duración" value={`${plan.duration_weeks} semanas`} />
            <Stat label="Ritmo objetivo" value={plan.target_pace || '—'} />
            <Stat label="Km completados" value={`${progress.doneKm.toFixed(1)} / ${progress.totalKm.toFixed(1)}`} />
            <Stat label="Sesiones completadas" value={`${progress.doneSessions} / ${progress.totalSessions}`} />
          </div>
        </div>
      )}

      {error && <p className="text-red text-sm">{error}</p>}

      {section === 'calendario' && (
        <AthleteCalendar
          plan={plan}
          sessions={sessions}
          mesocycles={mesocycles}
          disciplines={disciplines}
          evaluationsBySession={evaluationsBySession}
          milestones={milestones}
          onUpdated={() => loadData(true)}
        />
      )}

      {section === 'estadisticas' && <StatsDashboard sessions={sessions} disciplines={disciplines} />}

      {section === 'zonas' && <HrZonesView hrZones={hrZones} manualZones={manualZones} />}

      {section === 'objetivos' && (
        <GoalsView
          plan={plan}
          race={race}
          milestones={milestones}
          athleteProfile={athleteProfile}
          today={today}
          onGoToProfile={onNavigate ? () => onNavigate('perfil') : undefined}
        />
      )}

      {section === 'tests' && <TestsView tests={tests} />}
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

function HrZonesView({ hrZones, manualZones }) {
  const hasManual = Object.keys(manualZones).length > 0
  if (!hrZones && !hasManual) return <EmptyState text="Tu entrenador aún no ha configurado tus zonas de frecuencia cardíaca." />
  const used = hrZones ? effectiveMaxHr({ maxHrReal: hrZones.max_hr_real, age: hrZones.age }) : { value: null, source: null }
  return <ZonesTable maxHr={used.value} sourceLabel={used.source} manualZones={manualZones} />
}

function TestsView({ tests }) {
  if (!tests.length) return <EmptyState text="Todavía no hay test o marcas registradas." />
  return (
    <div className="bg-white border border-mist rounded-sm overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]">
        <thead className="bg-bg-dim">
          <tr>
            {['Fecha', 'Bloque', 'Tipo de test', 'Distancia', 'Resultado', 'Ritmo', 'Observaciones'].map((h) => (
              <th key={h} className="text-left px-4 py-3 font-mono text-xs text-slate">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mist">
          {tests.map((t) => (
            <tr key={t.id}>
              <td className="px-4 py-3 font-mono text-xs">{t.test_date || '—'}</td>
              <td className="px-4 py-3">{t.block_label}</td>
              <td className="px-4 py-3">{t.test_type}</td>
              <td className="px-4 py-3">{t.distance}</td>
              <td className="px-4 py-3 font-mono">{t.result}</td>
              <td className="px-4 py-3 font-mono">{t.pace}</td>
              <td className="px-4 py-3 text-slate">{t.observations}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyState({ text }) {
  return <div className="bg-white border border-mist rounded-sm p-8 text-center text-slate text-sm">{text}</div>
}
