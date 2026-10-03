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
  const [unread, setUnread] = useState({})
  const [showArchived, setShowArchived] = useState(false)
  const [busyId, setBusyId] = useState(null)
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
      .select('*, training_plans(athlete_id, profiles:athlete_id(full_name,email,is_active))')
      .eq('status', 'completado')
      .order('completed_at', { ascending: false })
      .limit(30)

    const { data: evaluations } = await supabase.from('session_evaluations').select('session_id')
    const evaluatedIds = new Set((evaluations || []).map((e) => e.session_id))
    setPending(
      (sessions || []).filter(
        (s) => !evaluatedIds.has(s.id) && s.training_plans?.profiles?.is_active !== false
      )
    )

    // Mensajes del chat que los atletas te han enviado y aún no has leído.
    // Si todavía no se ha ejecutado la migración 0003, esta consulta falla y
    // simplemente no se muestran avisos.
    const { data: unreadRows } = await supabase
      .from('messages')
      .select('athlete_id, sender_id')
      .is('read_at', null)
    const counts = {}
    ;(unreadRows || []).forEach((m) => {
      if (m.sender_id === m.athlete_id) counts[m.athlete_id] = (counts[m.athlete_id] || 0) + 1
    })
    setUnread(counts)

    setLoading(false)
  }

  async function handleArchive(a) {
    const name = a.full_name || a.email
    if (
      !confirm(
        `¿Archivar a ${name}?\n\nDejará de aparecer en tu lista y no podrá entrar en la app. Su historial (plan, sesiones, tests, mensajes) se conserva y podrás reactivarlo cuando quieras.`
      )
    )
      return
    setBusyId(a.id)
    const { error: err } = await supabase.rpc('set_athlete_active', { p_athlete_id: a.id, p_active: false })
    setBusyId(null)
    if (err) alert(err.message)
    else loadData()
  }

  async function handleRestore(a) {
    setBusyId(a.id)
    const { error: err } = await supabase.rpc('set_athlete_active', { p_athlete_id: a.id, p_active: true })
    setBusyId(null)
    if (err) alert(err.message)
    else loadData()
  }

  async function handleDelete(a) {
    const name = a.full_name || a.email
    if (
      !confirm(
        `¿Eliminar DEFINITIVAMENTE a ${name}?\n\nSe borrarán su cuenta, su plan, sus sesiones, tests y mensajes. Esta acción NO se puede deshacer.\n\nSi solo quieres dejar de verlo, es mejor mantenerlo archivado.`
      )
    )
      return
    const typed = prompt('Para confirmar el borrado, escribe ELIMINAR (en mayúsculas):')
    if (typed !== 'ELIMINAR') return
    setBusyId(a.id)
    const { error: err } = await supabase.rpc('delete_athlete', { p_athlete_id: a.id })
    setBusyId(null)
    if (err) alert(err.message)
    else loadData()
  }

  if (loading) return <LoadingScreen />

  const active = athletes.filter((a) => a.is_active !== false)
  const archived = athletes.filter((a) => a.is_active === false)

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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-display text-lg text-navy">Tus atletas ({active.length})</h2>
          {archived.length > 0 && (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="text-sm font-semibold text-slate hover:text-red"
            >
              {showArchived ? 'Ocultar archivados' : `Ver archivados (${archived.length})`}
            </button>
          )}
        </div>

        <div className="bg-white border border-mist rounded-sm divide-y divide-mist">
          {active.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate">
              {athletes.length === 0
                ? 'Todavía no hay atletas registrados. Cuando alguien se registre en la web, aparecerá aquí.'
                : 'No tienes atletas activos. Puedes reactivar a alguno desde «Ver archivados».'}
            </p>
          )}
          {active.map((a) => (
            <div key={a.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3 hover:bg-bg-dim transition-colors">
              <Link to={`/coach/atleta/${a.id}`} className="flex-1 min-w-[200px]">
                <p className="font-semibold text-sm">
                  {a.full_name || a.email}
                  {unread[a.id] > 0 && (
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[11px] font-mono font-semibold bg-red text-white">
                      {unread[a.id]} {unread[a.id] === 1 ? 'mensaje nuevo' : 'mensajes nuevos'}
                    </span>
                  )}
                </p>
                <p className="text-sm text-slate">{a.email}</p>
              </Link>
              <div className="flex items-center gap-4">
                {a.plan ? (
                  <span className="font-mono text-xs text-navy-light">
                    Plan activo · {a.plan.races?.name || a.plan.custom_race_name} · {a.plan.duration_weeks} sem.
                  </span>
                ) : (
                  <span className="font-mono text-xs text-red">Sin plan asignado</span>
                )}
                <button
                  onClick={() => handleArchive(a)}
                  disabled={busyId === a.id}
                  className="text-xs font-semibold text-slate hover:text-red border border-mist rounded-sm px-3 py-1.5 disabled:opacity-60"
                >
                  Archivar
                </button>
              </div>
            </div>
          ))}
        </div>

        {showArchived && archived.length > 0 && (
          <div className="mt-6">
            <h3 className="font-display text-base text-slate mb-2">Archivados ({archived.length})</h3>
            <div className="bg-white border border-mist rounded-sm divide-y divide-mist opacity-90">
              {archived.map((a) => (
                <div key={a.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                  <Link to={`/coach/atleta/${a.id}`} className="flex-1 min-w-[200px]">
                    <p className="font-semibold text-sm text-slate">{a.full_name || a.email}</p>
                    <p className="text-sm text-slate">{a.email}</p>
                  </Link>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => handleRestore(a)}
                      disabled={busyId === a.id}
                      className="text-xs font-semibold text-navy hover:text-red border border-mist rounded-sm px-3 py-1.5 disabled:opacity-60"
                    >
                      Reactivar
                    </button>
                    <button
                      onClick={() => handleDelete(a)}
                      disabled={busyId === a.id}
                      className="text-xs font-semibold text-red hover:text-red-deep border border-red/40 rounded-sm px-3 py-1.5 disabled:opacity-60"
                    >
                      Eliminar definitivamente
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
