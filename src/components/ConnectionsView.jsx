import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { ui } from '../ui/ui'
import { useT } from '../i18n'
import { IconCheck, IconFlag } from './icons'

function Status({ children, ready = false }) {
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide ${ready ? 'bg-brand/15 text-navy' : 'bg-bg-dim text-slate'}`}>
    {ready && <IconCheck width={13} height={13} />}{children}
  </span>
}

export default function ConnectionsView({ onNavigate, userId }) {
  const t = useT()
  const [intervals, setIntervals] = useState(null)
  const [activities, setActivities] = useState([])
  const [busy, setBusy] = useState(false)
  const loadIntervals = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('intervals_connection_status').select('intervals_athlete_name,connected_at').eq('profile_id', userId).maybeSingle()
    if (error) {
      console.warn('No se pudo consultar el estado de Intervals.icu:', error.message)
      return
    }
    setIntervals(data || null)
    const { data: recent, error: activityError } = await supabase.from('intervals_activities')
      .select('provider_activity_id,activity_type,activity_name,start_date_local,distance_m,moving_time_s,average_hr')
      .eq('profile_id', userId).order('start_date_local', { ascending: false }).limit(10)
    if (!activityError) setActivities(recent || [])
  }, [userId])

  useEffect(() => { loadIntervals() }, [loadIntervals])

  async function connectIntervals() {
    setBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('intervals-oauth-start', { body: {} })
      if (error) throw error
      if (!data?.authorize_url) throw new Error('Intervals.icu no devolvió el enlace de autorización.')
      window.location.assign(data.authorize_url)
    } catch (error) {
      ui.error(error.message || 'No se pudo iniciar la conexión con Intervals.icu.')
      setBusy(false)
    }
  }

  async function disconnectIntervals() {
    if (!(await ui.confirm(t('connections.intervalsDisconnectConfirm'), { danger: true, confirmLabel: t('connections.intervalsDisconnect') }))) return
    setBusy(true)
    try {
      const { error } = await supabase.functions.invoke('intervals-disconnect', { body: {} })
      if (error) throw error
      setIntervals(null)
      setActivities([])
      ui.success(t('connections.intervalsDisconnectedToast'))
    } catch (error) {
      ui.error(error.message || 'No se pudo desconectar Intervals.icu.')
    } finally { setBusy(false) }
  }
  const platforms = [
    { title: t('connections.stravaTitle'), state: t('connections.stravaState'), body: t('connections.stravaBody'), mark: 'S', accent: 'bg-[#FC4C02]' },
    { title: t('connections.corosTitle'), state: t('connections.corosState'), body: t('connections.corosBody'), mark: 'C', accent: 'bg-navy' },
    { title: t('connections.bluetoothTitle'), state: t('connections.bluetoothState'), body: t('connections.bluetoothBody'), mark: '↔', accent: 'bg-slate' },
  ]

  return <div className="max-w-4xl space-y-6">
    <header className="rounded-2xl bg-navy-deep p-6 text-white sm:p-8">
      <p className="font-mono text-[11px] uppercase tracking-[.18em] text-brand">XR · TRAINING DATA</p>
      <h1 className="mt-2 font-display text-3xl sm:text-4xl">{t('connections.title')}</h1>
      <p className="mt-2 max-w-2xl text-sm text-white/75">{t('connections.intro')}</p>
    </header>

    <section className="rounded-xl border border-mist bg-surface p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#d8f36a] font-display text-xl font-bold text-[#173933]">i</span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl text-navy">Intervals.icu</h2>
              <Status ready={Boolean(intervals)}>{intervals ? t('connections.intervalsConnected') : t('connections.intervalsNotConnected')}</Status>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate">{t('connections.intervalsBody')}</p>
            {intervals?.connected_at && <p className="mt-2 text-xs text-slate">{t('connections.intervalsSince', { date: new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(intervals.connected_at)) })}</p>}
          </div>
        </div>
        {intervals
          ? <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={connectIntervals} className="min-h-11 shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:bg-brand-deep hover:text-white disabled:opacity-60">{busy ? t('common.loading') : t('connections.intervalsRefreshPermissions')}</button><button type="button" disabled={busy} onClick={disconnectIntervals} className="min-h-11 shrink-0 rounded-lg border border-mist px-4 py-2 text-sm font-semibold text-slate hover:border-red hover:text-red disabled:opacity-60">{t('connections.intervalsDisconnect')}</button></div>
          : <button type="button" disabled={busy} onClick={connectIntervals} className="min-h-11 shrink-0 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-navy hover:bg-brand-deep hover:text-white disabled:opacity-60">{busy ? t('common.loading') : t('connections.intervalsConnect')}</button>}
      </div>
      <p className="mt-4 border-t border-mist pt-3 text-xs leading-relaxed text-slate">{t('connections.intervalsConsent')}</p>
    </section>

    {intervals && activities.length > 0 && <section className="rounded-xl border border-mist bg-surface p-5">
      <h2 className="font-display text-xl text-navy">{t('connections.intervalsRecent')}</h2>
      <ul className="mt-3 divide-y divide-mist">
        {activities.map((activity) => <li key={activity.provider_activity_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 text-sm">
          <div><p className="font-semibold text-ink">{activity.activity_name || activity.activity_type || t('connections.intervalsRun')}</p><p className="text-xs text-slate">{activity.start_date_local ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(activity.start_date_local)) : ''}</p></div>
          <div className="flex gap-3 font-mono text-xs text-slate">{activity.distance_m != null && <span>{(activity.distance_m / 1000).toFixed(2)} km</span>}{activity.moving_time_s != null && <span>{Math.floor(activity.moving_time_s / 60)} min</span>}{activity.average_hr != null && <span>{Math.round(activity.average_hr)} bpm</span>}</div>
        </li>)}
      </ul>
    </section>}

    <section className="grid gap-4 md:grid-cols-3" aria-label={t('connections.title')}>
      {platforms.map((item) => <article key={item.title} className="flex min-h-52 flex-col rounded-xl border border-mist bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <span className={`grid h-10 w-10 place-items-center rounded-lg text-lg font-bold text-white ${item.accent}`}>{item.mark}</span>
          <Status>{item.state}</Status>
        </div>
        <h2 className="mt-5 font-display text-xl text-navy">{item.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate">{item.body}</p>
      </article>)}
    </section>

    <section className="flex flex-col gap-4 rounded-xl border border-brand/50 bg-brand/10 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
      <div className="flex gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand text-navy"><IconFlag width={22} height={22} /></span>
        <div><Status ready>{t('connections.available')}</Status><h2 className="mt-2 font-display text-xl text-navy">{t('connections.manualTitle')}</h2><p className="mt-1 max-w-2xl text-sm text-slate">{t('connections.manualBody')}</p></div>
      </div>
      <button type="button" onClick={() => onNavigate('hoy')} className="shrink-0 rounded-md bg-brand px-4 py-3 text-sm font-bold text-navy transition hover:bg-brand-deep hover:text-white">{t('connections.manualAction')} →</button>
    </section>
  </div>
}
