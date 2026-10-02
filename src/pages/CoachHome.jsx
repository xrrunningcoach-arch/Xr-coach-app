import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import { useAuth } from '../auth/AuthProvider'
import LoadingScreen from '../components/LoadingScreen'

function InviteAthleteButton() {
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    const url = `${window.location.origin}${window.location.pathname}#/signup`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <button
      onClick={handleCopy}
      title="Un atleta nuevo se registra él mismo con este enlace y aparecerá aquí automáticamente."
      className="px-4 py-2 bg-red hover:bg-red-deep text-white text-sm font-semibold rounded-sm"
    >
      {copied ? 'Enlace copiado ✓' : 'Copiar enlace de registro para un atleta nuevo'}
    </button>
  )
}

export default function CoachHome() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [athletes, setAthletes] = useState([])
  const [pending, setPending] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadData() {
    if (!user) return
    setLoading(true)
    setError(null)

    const { data: rosterRaw, error: rosterErr } = await supabase
      .from('profiles')
      .select('*')
      .eq('role', 'athlete')
      .order('created_at', { ascending: false })

    if (rosterErr) {
      setError(rosterErr.message)
      setLoading(false)
      return
    }

    const { data: plans } = await supabase
      .from('training_plans')
      .select('id, athlete_id, status, duration_weeks, race_id, custom_race_name, races(name)')

    const roster = (rosterRaw || []).map((a) => ({
      ...a,
      plan: (plans || []).find((p) => p.athlete_id === a.id && p.status !== 'completed') || null,
    }))
    setAthletes(roster)

    // Sesiones completadas sin evaluación del entrenador todavía
    const { data: sessions } = await supabase
      .from('sessions')
      .select('*, training_plans(athlete_id, profiles:athlete_id(full_name,email))')
      .eq('status', 'completado')
      .order('completed_at', { ascending: false })
      .limit(30)

    const { data: evaluations } = await supabase.from('session_evaluations').select('session_id')
    const evaluatedIds = new Set((evaluations || []).map((e) => e.session_id))
    setPending((sessions || []).filter((s) => !evaluatedIds.has(s.id)))

    setLoading(false)
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="space-y-10">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="font-display text-2xl text-navy">Panel del entrenador</h1>
        <InviteAthleteButton />
      </div>

      {error && <p className="text-red text-sm">{error}</p>}

      <section>
        <h2 className="font-display text-lg text-navy mb-3">Entrenamientos pendientes de revisión</h2>
        {pending.length === 0 ? (
          <div className="bg-white border border-mist rounded-sm p-6 text-sm text-slate">
            No hay entrenamientos completados sin revisar. Buen trabajo.
          </div>
        ) : (
          <div className="bg-white border border-mist rounded-sm divide-y divide-mist">
            {pending.map((s) => (
              <div key={s.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-sm">
                    {s.training_plans?.profiles?.full_name || s.training_plans?.profiles?.email} · Semana {s.week_number}, Día {s.day_number}
                  </p>
                  <p className="text-sm text-slate">{s.session_type} — RPE real: {s.rpe_actual || '—'}</p>
                </div>
                <Link
                  to={`/coach/atleta/${s.training_plans.athlete_id}`}
                  className="text-sm font-semibold text-navy hover:text-red underline underline-offset-4"
                >
                  Revisar
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="font-display text-lg text-navy mb-3">Tus atletas ({athletes.length})</h2>
        <div className="bg-white border border-mist rounded-sm divide-y divide-mist">
          {athletes.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate">
              Todavía no hay atletas registrados. Cuando alguien se registre en la web, aparecerá aquí.
            </p>
          )}
          {athletes.map((a) => (
            <Link
              key={a.id}
              to={`/coach/atleta/${a.id}`}
              className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-bg-dim transition-colors"
            >
              <div>
                <p className="font-semibold text-sm">{a.full_name || a.email}</p>
                <p className="text-sm text-slate">{a.email}</p>
              </div>
              <div className="text-right">
                {a.plan ? (
                  <span className="font-mono text-xs text-navy-light">
                    Plan activo · {a.plan.races?.name || a.plan.custom_race_name} · {a.plan.duration_weeks} sem.
                  </span>
                ) : (
                  <span className="font-mono text-xs text-red">Sin plan asignado</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
