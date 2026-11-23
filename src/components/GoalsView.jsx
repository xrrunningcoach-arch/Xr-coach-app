import { diffDays, longDayTitle } from '../lib/dates'
import { tr, useT } from '../i18n'
import { useState } from 'react'
import { supabase } from '../supabaseClient'
import { ui } from '../ui/ui'
import AthleteProfileForm from '../pages/AthleteProfileForm'

function Card({ title, children }) {
  return (
    <div className="bg-surface border border-mist rounded-sm overflow-hidden">
      <div className="px-5 py-3 bg-bg-dim">
        <h3 className="font-display text-lg text-navy">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function countdown(dateISO, today) {
  const d = diffDays(dateISO, today)
  if (d === 0) return { big: tr('cal.today'), small: tr('goals.raceDay') }
  if (d > 0) return { big: String(d), small: tr('goals.daysTo', { count: d }) }
  return { big: String(-d), small: tr('goals.daysSince', { count: -d }) }
}

// Sección «Objetivos»: las metas del atleta. Reúne la prueba objetivo del
// plan, los objetivos de su perfil y los hitos que registra el atleta (lo que
// antes era la pestaña «Calendario»).
export default function GoalsView({ plan, race, milestones, athleteProfile, profileId, basicProfile, today, onGoToProfile, onChanged }) {
  const t = useT()
  const [form, setForm] = useState({ event_date: '', title: '', type: 'goal', week_ref: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [editingGoals, setEditingGoals] = useState(false)
  const raceName = race?.name || plan?.custom_race_name
  const goals = [
    [t('goals.main'), athleteProfile?.main_goal],
    [t('goals.long'), athleteProfile?.long_term_goal],
    [t('goals.pbs'), athleteProfile?.personal_bests],
  ].filter(([, v]) => v && String(v).trim())

  const upcoming = milestones.filter((m) => !m.event_date || m.event_date >= today)
  const past = milestones.filter((m) => m.event_date && m.event_date < today)

  return (
    <div className="space-y-6">
      {(raceName || plan?.target_pace) && (
        <div className="bg-navy-deep text-white rounded-sm p-6 sm:p-8 grid sm:grid-cols-[1fr_auto] gap-6 items-center">
          <div>
            <p className="font-mono text-xs text-red mb-2">{t('today.race')}</p>
            <h2 className="font-display text-2xl sm:text-3xl mb-1">{raceName || t('dash.customPlan')}</h2>
            {plan?.race_date && <p className="text-sm text-white/80">{longDayTitle(plan.race_date)}</p>}
            <div className="grid grid-cols-2 gap-4 mt-5 text-sm max-w-md">
              <div>
                <div className="font-mono text-[11px] text-navy-light uppercase">{t('goals.currentPace')}</div>
                <div className="text-lg font-semibold">{plan?.current_pace || '—'}</div>
              </div>
              <div>
                <div className="font-mono text-[11px] text-navy-light uppercase">{t('dash.targetPace')}</div>
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

      <Card title={t('goals.myGoals')}>
        {editingGoals && <AthleteProfileForm profileId={profileId} basicProfile={basicProfile} onSaved={() => { setEditingGoals(false); onChanged?.() }} />}
        {!editingGoals && <button type="button" onClick={() => setEditingGoals(true)} className="mb-4 rounded-lg border border-brand px-3 py-2 text-sm font-semibold text-navy">{t('goals.editGoals')}</button>}
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
            {t('goals.noGoals')}{' '}
            {onGoToProfile && (
              <button type="button" onClick={onGoToProfile} className="font-semibold text-navy underline underline-offset-2 hover:text-red">
                {t('goals.addInProfile')}
              </button>
            )}
          </p>
        )}
      </Card>

      <Card title={t('goals.milestones')}>
        {milestones.length === 0 ? (
          <p className="text-sm text-slate">{t('goals.noMilestones')}</p>
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
                        {isPast ? t('goals.past') : m.event_date === today ? t('cal.today') : t('goals.inDays', { n: diffDays(m.event_date, today) })}
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={async () => {
                    const { error } = await supabase.from('milestones').delete().eq('id', m.id)
                    if (error) ui.error(error.message)
                    else onChanged?.()
                  }} className="shrink-0 text-xs font-semibold text-red">{t('c.delete')}</button>
                </div>
              )
            })}
          </div>
        )}
        {plan && <form onSubmit={async (event) => {
          event.preventDefault()
          setSaving(true)
          const { error } = await supabase.from('milestones').insert({ ...form, plan_id: plan.id })
          setSaving(false)
          if (error) { ui.error(error.message); return }
          setForm({ event_date: '', title: '', type: 'goal', week_ref: '', notes: '' })
          onChanged?.()
        }} className="mt-5 grid gap-3 border-t border-mist pt-5 sm:grid-cols-2">
          <input type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
          <input required maxLength={120} placeholder={t('goals.milestoneTitle')} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="min-h-11 rounded-md border border-mist px-3 py-2" />
          <textarea maxLength={1000} placeholder={t('tests.col.notes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} className="rounded-md border border-mist px-3 py-2 sm:col-span-2" />
          <button disabled={saving} className="min-h-11 justify-self-start rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy disabled:opacity-60">{saving ? t('common.saving') : t('goals.addMilestone')}</button>
        </form>}
      </Card>
    </div>
  )
}
