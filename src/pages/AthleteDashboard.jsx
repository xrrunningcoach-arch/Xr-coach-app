import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import { fetchDisciplines, findDiscipline } from '../lib/disciplines'
import { weeklyLoad, loadBarWidth } from '../lib/load'
import StatusBadge from '../components/StatusBadge'
import LoadingScreen from '../components/LoadingScreen'
import DisciplineFields from '../components/DisciplineFields'
import ZonesTable from '../components/ZonesTable'
import { effectiveMaxHr } from '../lib/zones'

export default function AthleteDashboard() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [plan, setPlan] = useState(null)
  const [race, setRace] = useState(null)
  const [mesocycles, setMesocycles] = useState([])
  const [sessions, setSessions] = useState([])
  const [milestones, setMilestones] = useState([])
  const [hrZones, setHrZones] = useState(null)
  const [tests, setTests] = useState([])
  const [evaluationsBySession, setEvaluationsBySession] = useState({})
  const [disciplines, setDisciplines] = useState([])
  const [activeTab, setActiveTab] = useState('sesiones')
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    setError(null)

    if (disciplines.length === 0) setDisciplines(await fetchDisciplines())

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

  const weeks = useMemo(() => {
    const byWeek = {}
    sessions.forEach((s) => {
      if (!byWeek[s.week_number]) byWeek[s.week_number] = []
      byWeek[s.week_number].push(s)
    })
    return Object.entries(byWeek)
      .map(([week, items]) => ({ week: Number(week), items }))
      .sort((a, b) => a.week - b.week)
  }, [sessions])

  const progress = useMemo(() => {
    const totalKm = sessions.reduce((sum, s) => sum + (Number(s.km_estimated) || 0), 0)
    const doneKm = sessions
      .filter((s) => s.status === 'completado')
      .reduce((sum, s) => sum + (Number(s.km_estimated) || 0), 0)
    const totalSessions = sessions.length
    const doneSessions = sessions.filter((s) => s.status === 'completado').length
    return { totalKm, doneKm, totalSessions, doneSessions }
  }, [sessions])

  const loadByWeek = useMemo(() => weeklyLoad(sessions), [sessions])
  const maxLoad = Math.max(1, ...loadByWeek.map((w) => w.load))
  const maxImpact = Math.max(1, ...loadByWeek.map((w) => w.impactLoad))

  if (loading) return <LoadingScreen />

  if (!plan) {
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

      {error && <p className="text-red text-sm">{error}</p>}

      <Tabs active={activeTab} onChange={setActiveTab} />

      {activeTab === 'sesiones' && (
        <div className="space-y-6">
          {weeks.map(({ week, items }) => {
            const meso = mesocycles.find((m) => week >= m.week_start && week <= m.week_end)
            const weekLoad = loadByWeek.find((w) => w.week === week)
            return (
              <div key={week} className="bg-white border border-mist rounded-sm overflow-hidden">
                <div className="bg-bg-dim px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-display text-lg text-navy">Semana {week}</h3>
                  {meso && <span className="font-mono text-[11px] text-slate">{meso.name}</span>}
                </div>
                <WeekLoadBars weekLoad={weekLoad} maxLoad={maxLoad} maxImpact={maxImpact} />
                <div className="divide-y divide-mist">
                  {items.map((s) => (
                    <SessionRow
                      key={s.id}
                      session={s}
                      discipline={findDiscipline(disciplines, s.discipline_id)}
                      evaluations={evaluationsBySession[s.id] || []}
                      onUpdated={loadData}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'zonas' && <HrZonesView hrZones={hrZones} />}
      {activeTab === 'calendario' && <MilestonesView milestones={milestones} />}
      {activeTab === 'tests' && <TestsView tests={tests} />}
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

function Tabs({ active, onChange }) {
  const tabs = [
    { id: 'sesiones', label: 'Sesiones' },
    { id: 'zonas', label: 'Zonas de FC' },
    { id: 'calendario', label: 'Calendario' },
    { id: 'tests', label: 'Test y marcas' },
  ]
  return (
    <div className="flex gap-2 border-b border-mist overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors ${
            active === t.id ? 'border-red text-red' : 'border-transparent text-slate hover:text-navy'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// Misma pareja de barras que en el panel del coach: carga total (session-RPE)
// y carga de impacto, para que el atleta vea también si una semana mezclando
// deportes se le está acumulando, no solo el coach.
function WeekLoadBars({ weekLoad, maxLoad, maxImpact }) {
  if (!weekLoad || weekLoad.loggedSessions === 0) {
    return (
      <div className="px-5 py-2 text-xs text-slate italic border-b border-mist">
        Carga de la semana: sin sesiones registradas todavía.
      </div>
    )
  }
  return (
    <div className="px-5 py-3 border-b border-mist space-y-1.5">
      <LoadBar label="Carga total" value={weekLoad.load} max={maxLoad} colorClass="bg-navy" />
      <LoadBar label="Carga de impacto" value={weekLoad.impactLoad} max={maxImpact} colorClass="bg-red" />
    </div>
  )
}

function LoadBar({ label, value, max, colorClass }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-[11px] text-slate w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-mist rounded-full overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${loadBarWidth(value, max)}%` }} />
      </div>
      <span className="font-mono text-[11px] text-navy-light w-12 text-right shrink-0">{Math.round(value)}</span>
    </div>
  )
}

function SessionRow({ session, discipline, evaluations, onUpdated }) {
  const [open, setOpen] = useState(false)
  const [status, setStatus] = useState(session.status)
  const [rpeActual, setRpeActual] = useState(session.rpe_actual || '')
  const [rpeValue, setRpeValue] = useState(session.rpe_actual_value ?? '')
  const [durationActual, setDurationActual] = useState(session.duration_actual_min ?? '')
  const [notes, setNotes] = useState(session.athlete_notes || '')
  const [link, setLink] = useState(session.link_url || '')
  const [metrics, setMetrics] = useState({})
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const { error } = await supabase.rpc('submit_session', {
      p_session_id: session.id,
      p_status: status,
      p_rpe_actual: rpeActual,
      p_notes: notes,
      p_link_url: link,
      p_duration_actual_min: durationActual === '' ? null : Number(durationActual),
      p_rpe_actual_value: rpeValue === '' ? null : Number(rpeValue),
      p_metrics: metrics,
    })
    setSaving(false)
    if (error) {
      alert('Error al guardar: ' + error.message)
      return
    }
    setOpen(false)
    onUpdated()
  }

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex-1 min-w-[220px]">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="font-mono text-xs text-slate">Día {session.day_number}</span>
            {discipline && (
              <span className="font-mono text-[11px] uppercase text-navy-light border border-mist rounded-full px-2 py-0.5">
                {discipline.name}
              </span>
            )}
            <StatusBadge status={session.status} />
          </div>
          <p className="font-semibold text-sm">{session.session_type || 'Sesión'}</p>
          <p className="text-sm text-slate mt-0.5">{session.description || 'El entrenador aún no ha detallado esta sesión.'}</p>
          <p className="font-mono text-xs text-navy-light mt-1">
            {session.km_estimated ? `${session.km_estimated} km` : ''}
            {session.duration_planned_min ? ` · ${session.duration_planned_min} min previstos` : ''}
            {session.rpe_theoretical ? ` · ${session.rpe_theoretical} (teórico)` : ''}
          </p>
          {discipline && <DisciplineFields discipline={discipline} values={session.metrics} readOnly />}
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="px-3 py-1.5 text-sm border border-navy text-navy rounded-sm hover:bg-navy hover:text-white transition-colors"
        >
          {open ? 'Cerrar' : 'Registrar'}
        </button>
      </div>

      {evaluations.length > 0 && (
        <div className="mt-3 space-y-2">
          {evaluations.map((ev) => (
            <div key={ev.id} className="bg-bg-dim rounded-sm px-3 py-2">
              <span className="font-mono text-xs text-navy-light" aria-label={`Valoración: ${ev.rating} de 5`}>
                {'★'.repeat(ev.rating)}
                {'☆'.repeat(5 - ev.rating)}
              </span>
              {ev.comment && <p className="text-sm text-slate mt-0.5">{ev.comment}</p>}
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-4 bg-bg-dim rounded-sm p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">Estado</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              >
                <option value="pendiente">Pendiente</option>
                <option value="completado">Completado</option>
                <option value="saltado">Saltado</option>
              </select>
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">RPE real (nota)</label>
              <input
                value={rpeActual}
                onChange={(e) => setRpeActual(e.target.value)}
                placeholder="Ej. RPE 6 fuerte"
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-mono text-xs text-slate mb-1">Duración real (min)</label>
              <input
                type="number"
                min={0}
                max={720}
                value={durationActual}
                onChange={(e) => setDurationActual(e.target.value)}
                placeholder="Ej. 55"
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              />
            </div>
            <div>
              <label className="block font-mono text-xs text-slate mb-1">RPE (0-10, para la carga)</label>
              <select
                value={rpeValue}
                onChange={(e) => setRpeValue(e.target.value)}
                className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
              >
                <option value="">Sin valorar</option>
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {discipline && (
            <div>
              <p className="font-mono text-xs text-slate mb-1">Datos de la sesión ({discipline.name})</p>
              <DisciplineFields discipline={discipline} values={metrics} onChange={setMetrics} />
            </div>
          )}

          <div>
            <label className="block font-mono text-xs text-slate mb-1">Notas / sensaciones</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-mist rounded-sm px-3 py-2 bg-white resize-none"
            />
          </div>
          <div>
            <label className="block font-mono text-xs text-slate mb-1">Enlace (Strava / Garmin / otro)</label>
            <input
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="https://..."
              className="w-full border border-mist rounded-sm px-3 py-2 bg-white"
            />
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-red hover:bg-red-deep text-white text-sm font-semibold rounded-sm disabled:opacity-60"
          >
            {saving ? 'Guardando…' : 'Guardar entrenamiento'}
          </button>
        </div>
      )}
    </div>
  )
}

function HrZonesView({ hrZones }) {
  if (!hrZones) return <EmptyState text="Tu entrenador aún no ha configurado tus zonas de frecuencia cardíaca." />
  const used = effectiveMaxHr({ maxHrReal: hrZones.max_hr_real, age: hrZones.age })
  return <ZonesTable maxHr={used.value} sourceLabel={used.source} />
}

function MilestonesView({ milestones }) {
  if (!milestones.length) return <EmptyState text="Aún no hay hitos registrados en el calendario." />
  return (
    <div className="bg-white border border-mist rounded-sm divide-y divide-mist">
      {milestones.map((m) => (
        <div key={m.id} className="px-5 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="font-semibold text-sm">{m.title}</p>
            <p className="text-sm text-slate">{m.notes}</p>
          </div>
          <div className="text-right font-mono text-xs text-navy-light shrink-0">
            {m.event_date} <br /> {m.week_ref}
          </div>
        </div>
      ))}
    </div>
  )
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
