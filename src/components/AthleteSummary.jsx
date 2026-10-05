import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import AthleteProfileForm from '../pages/AthleteProfileForm'
import AnamnesisForm, { AnamnesisReadOnly } from './AnamnesisForm'
import RpeScaleTable from './RpeScaleTable'
import WeeklyVolumeChart from './WeeklyVolumeChart'
import MacroMesoPanel from './MacroMesoPanel'

function Card({ title, action, children }) {
  return (
    <div className="bg-white border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display text-lg text-navy">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

const linkBtn = 'text-sm font-semibold text-navy hover:text-red'

// Datos del perfil, con el mismo orden que "PERFIL Y ANAMNESIS DEL ATLETA"
// del Excel.
function ProfileCard({ athlete, onReload }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('athlete_profiles')
      .select('*')
      .eq('profile_id', athlete.id)
      .maybeSingle()
      .then(({ data: row }) => {
        if (active) {
          setData(row || null)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [athlete.id, editing, athlete.full_name, athlete.age])

  const rows = [
    ['Nombre del atleta', athlete.full_name || athlete.email],
    ['Edad', athlete.age ? `${athlete.age} años` : ''],
    ['Objetivo principal', data?.main_goal],
    ['Objetivo a largo plazo', data?.long_term_goal],
    ['Experiencia en carrera', data?.sport_history],
    ['Marcas personales', data?.personal_bests],
    ['Frecuencia de carrera', data?.weekly_run_frequency],
    ['Frecuencia de fuerza / gym', data?.weekly_strength_frequency],
    ['Historial de lesiones', data?.injury_history],
    ['Material y recursos', data?.resources],
    ['Control de carga', data?.load_control],
    ['FC de reposo', data?.resting_hr ? `${data.resting_hr} ppm` : ''],
    ['FC máxima real', data?.max_hr_real ? `${data.max_hr_real} ppm` : ''],
    ['Notas', data?.notes],
  ]

  return (
    <Card
      title="Perfil del atleta"
      action={
        <button type="button" onClick={() => setEditing((v) => !v)} className={linkBtn}>
          {editing ? 'Cerrar edición' : 'Editar perfil'}
        </button>
      }
    >
      {editing ? (
        <AthleteProfileForm
          profileId={athlete.id}
          basicProfile={athlete}
          onSaved={() => {
            setEditing(false)
            onReload(true)
          }}
        />
      ) : loading ? (
        <p className="text-sm text-slate">Cargando perfil…</p>
      ) : (
        <dl className="divide-y divide-mist">
          {rows.map(([label, value]) => (
            <div key={label} className="py-2.5 grid sm:grid-cols-3 gap-1 sm:gap-4">
              <dt className="font-mono text-xs text-slate pt-0.5">{label}</dt>
              <dd className="sm:col-span-2 text-sm whitespace-pre-wrap break-words">
                {value || <span className="text-slate italic">—</span>}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </Card>
  )
}

function AnamnesisCard({ athlete }) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <Card
      title="Anamnesis"
      action={
        <div className="flex gap-4">
          {open && (
            <button type="button" onClick={() => setEditing((v) => !v)} className={linkBtn}>
              {editing ? 'Ver respuestas' : 'Editar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v)
              setEditing(false)
            }}
            className={linkBtn}
          >
            {open ? 'Ocultar' : 'Ver cuestionario'}
          </button>
        </div>
      }
    >
      {!open ? (
        <p className="text-sm text-slate">
          Cuestionario inicial de 21 preguntas que rellena el atleta desde «Mi perfil». Pulsa «Ver cuestionario» para leer sus respuestas.
        </p>
      ) : editing ? (
        <AnamnesisForm
          athleteId={athlete.id}
          basicProfile={athlete}
          onSaved={() => setRefreshKey((k) => k + 1)}
        />
      ) : (
        <AnamnesisReadOnly athleteId={athlete.id} refreshKey={refreshKey} />
      )}
    </Card>
  )
}

// Pestaña "Perfil y mesociclos" de la ficha del atleta: a la izquierda el
// perfil, la anamnesis, la escala RPE y el gráfico de semanas y volumen; a la
// derecha los macrociclos con sus mesociclos.
export default function AthleteSummary({
  athlete,
  plan,
  macrocycles,
  mesocycles,
  sessions,
  disciplines,
  onReload,
  onGoToPlan,
  onSaveToLibrary,
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <ProfileCard athlete={athlete} onReload={onReload} />
        <AnamnesisCard athlete={athlete} />
        <RpeScaleTable />
        {plan ? (
          <WeeklyVolumeChart sessions={sessions} totalWeeks={plan.duration_weeks} />
        ) : (
          <Card title="Semanas y volumen">
            <p className="text-sm text-slate">Crea primero un plan en «Plan y sesiones» para ver el volumen semanal.</p>
          </Card>
        )}
      </div>

      <div className="min-w-0">
        {plan ? (
          <MacroMesoPanel
            plan={plan}
            macrocycles={macrocycles}
            mesocycles={mesocycles}
            sessions={sessions}
            disciplines={disciplines}
            onReload={onReload}
            onGoToPlan={onGoToPlan}
            onSaveToLibrary={onSaveToLibrary}
          />
        ) : (
          <Card title="Macrociclos y mesociclos">
            <p className="text-sm text-slate mb-3">
              Crea primero un plan para poder organizar macrociclos y mesociclos.
            </p>
            <button type="button" onClick={onGoToPlan} className="px-4 py-2 bg-red hover:bg-red-deep text-white text-sm font-semibold rounded-sm">
              Ir a «Plan y sesiones»
            </button>
          </Card>
        )}
      </div>
    </div>
  )
}
