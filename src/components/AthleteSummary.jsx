import { useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import ZonesTable from './ZonesTable'
import { pickMaxHr } from '../lib/zones'
import AthleteProfileForm from '../pages/AthleteProfileForm'
import AnamnesisForm, { AnamnesisReadOnly } from './AnamnesisForm'
import RpeScaleTable from './RpeScaleTable'
import WeeklyVolumeChart from './WeeklyVolumeChart'
import MacroMesoPanel from './MacroMesoPanel'

function Card({ title, action, children }) {
  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
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
  const t = useT()
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
    [t('prof.name'), athlete.full_name || athlete.email],
    [t('prof.age'), athlete.age ? t('sum.years', { n: athlete.age }) : ''],
    [t('prof.main'), data?.main_goal],
    [t('prof.long'), data?.long_term_goal],
    [t('prof.history'), data?.sport_history],
    [t('prof.pbs'), data?.personal_bests],
    [t('prof.runFreq'), data?.weekly_run_frequency],
    [t('prof.gymFreq'), data?.weekly_strength_frequency],
    [t('prof.injuries'), data?.injury_history],
    [t('prof.resources'), data?.resources],
    [t('prof.loadControl'), data?.load_control],
    [t('prof.restHr'), data?.resting_hr],
    [t('prof.maxHr'), data?.max_hr_real],
    [t('prof.notes'), data?.notes],
  ]

  return (
    <Card
      title={t('sum.profile')}
      action={
        <button type="button" onClick={() => setEditing((v) => !v)} className={linkBtn}>
          {editing ? t('sum.closeEdit') : t('sum.editProfile')}
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
        <p className="text-sm text-slate">{t('prof.loading')}</p>
      ) : (
        <>
        <p className="text-xs text-slate mb-3">{t('sum.profileAuto')}</p>
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
        </>
      )}
    </Card>
  )
}

function AnamnesisCard({ athlete }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <Card
      title={t('sum.anamnesis')}
      action={
        <div className="flex gap-4">
          {open && (
            <button type="button" onClick={() => setEditing((v) => !v)} className={linkBtn}>
              {editing ? t('sum.viewAnswers') : t('sum.edit')}
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
            {open ? t('sum.hide') : t('sum.viewQuestionnaire')}
          </button>
        </div>
      }
    >
      {!open ? (
        <p className="text-sm text-slate">
          {t('sum.anamnesisIntro')}
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
  manualZones = {},
  thresholdTest = null,
  hrZones = null,
}) {
  const t = useT()
  return (
    <div className="grid lg:grid-cols-2 gap-6 items-start">
      <div className="space-y-6 min-w-0">
        <ProfileCard athlete={athlete} onReload={onReload} />
        <AnamnesisCard athlete={athlete} />
        <ZonesTable maxHr={pickMaxHr(thresholdTest?.max_hr, hrZones?.max_hr_real)} manualZones={manualZones} test={thresholdTest} />
        <RpeScaleTable />
        {plan ? (
          <WeeklyVolumeChart sessions={sessions} totalWeeks={plan.duration_weeks} />
        ) : (
          <Card title={t('sum.weeksVolume')}>
            <p className="text-sm text-slate">{t('sum.createPlanVolume')}</p>
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
          <Card title={t('sum.macroMeso')}>
            <p className="text-sm text-slate mb-3">
              {t('sum.createPlanMacro')}
            </p>
            <button type="button" onClick={onGoToPlan} className="px-4 py-2 bg-brand hover:bg-brand-deep text-white text-sm font-semibold rounded-sm">
              {t('sum.goToPlan')}
            </button>
          </Card>
        )}
      </div>
    </div>
  )
}
