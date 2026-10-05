import { diffDays, longDayTitle } from '../lib/dates'

function Card({ title, children }) {
  return (
    <div className="bg-white border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim">
        <h3 className="font-display text-lg text-navy">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function countdown(dateISO, today) {
  const d = diffDays(dateISO, today)
  if (d === 0) return { big: 'Hoy', small: 'es el día' }
  if (d > 0) return { big: String(d), small: d === 1 ? 'día para la prueba' : 'días para la prueba' }
  return { big: String(-d), small: -d === 1 ? 'día desde la prueba' : 'días desde la prueba' }
}

// Sección «Objetivos!»: las metas del atleta. Reúne la prueba objetivo del
// plan, los objetivos de su perfil y los hitos que fija el entrenador (lo que
// antes era la pestaña «Calendario»).
export default function GoalsView({ plan, race, milestones, athleteProfile, today, onGoToProfile }) {
  const raceName = race?.name || plan?.custom_race_name
  const goals = [
    ['Objetivo principal', athleteProfile?.main_goal],
    ['Objetivo a largo plazo', athleteProfile?.long_term_goal],
    ['Marcas personales', athleteProfile?.personal_bests],
  ].filter(([, v]) => v && String(v).trim())

  const upcoming = milestones.filter((m) => !m.event_date || m.event_date >= today)
  const past = milestones.filter((m) => m.event_date && m.event_date < today)

  return (
    <div className="space-y-6">
      {(raceName || plan?.target_pace) && (
        <div className="bg-navy-deep text-white rounded-sm p-6 sm:p-8 grid sm:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="font-mono text-xs text-red mb-2">Prueba objetivo</p>
            <h2 className="font-display text-2xl sm:text-3xl mb-1">{raceName || 'Plan personalizado'}</h2>
            {plan?.race_date && <p className="text-sm text-bg/80">{longDayTitle(plan.race_date)}</p>}
            <div className="grid grid-cols-2 gap-4 mt-5 text-sm max-w-md">
              <div>
                <div className="font-mono text-[11px] text-navy-light uppercase">Ritmo actual</div>
                <div className="text-lg font-semibold">{plan?.current_pace || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[11px] text-navy-light uppercase">Ritmo objetivo</div>
                <div className="text-lg font-semibold">{plan?.target_pace || '—'}</div>
              </div>
            </div>
          </div>
          {plan?.race_date && (
            <div className="text-center sm:text-right">
              <p className="font-display text-5xl leading-none">{countdown(plan.race_date, today).big}</p>
              <p className="font-mono text-[11px] text-navy-light mt-1">{countdown(plan.race_date, today).small}</p>
            </div>
          )}
        </div>
      )}

      <Card title="Mis metas">
        {goals.length > 0 ? (
          <dl className="grid sm:grid-cols-2 gap-x-8 gap-y-4">
            {goals.map(([label, value]) => (
              <div key={label}>
                <dt className="font-mono text-[11px] uppercase text-navy-light">{label}</dt>
                <dd className="text-sm mt-0.5 whitespace-pre-line">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-sm text-slate">
            Todavía no has escrito tus metas.{' '}
            {onGoToProfile && (
              <button type="button" onClick={onGoToProfile} className="font-semibold text-navy underline underline-offset-2 hover:text-red">
                Añádelas en «Mi perfil»
              </button>
            )}
          </p>
        )}
      </Card>

      <Card title="Hitos del plan">
        {milestones.length === 0 ? (
          <p className="text-sm text-slate">Tu entrenador aún no ha fijado hitos en el plan.</p>
        ) : (
          <div className="divide-y divide-mist -my-2">
            {[...upcoming, ...past].map((m) => {
              const isPast = m.event_date && m.event_date < today
              return (
                <div key={m.id} className={`py-4 flex items-start justify-between gap-4 ${isPast ? 'opacity-60' : ''}`}>
                  <div>
                    <p className="font-semibold text-sm">{m.title}</p>
                    {m.notes && <p className="text-sm text-slate">{m.notes}</p>}
                  </div>
                  <div className="text-right font-mono text-xs text-navy-light shrink-0">
                    {m.event_date} <br /> {m.week_ref}
                    {m.event_date && (
                      <span className="block text-[10px] mt-0.5">
                        {isPast ? 'Pasado' : m.event_date === today ? 'Hoy' : `En ${diffDays(m.event_date, today)} d`}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}
