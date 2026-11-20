import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../supabaseClient'
import { useT } from '../i18n'
import { ui } from '../ui/ui'
import { IconAlert, IconCheck } from './icons'
import { removeCurrentDevicePushSubscription } from '../lib/pushSubscriptions'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || ''

function applicationServerKey(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

function supportsPush() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && 'PushManager' in window
}

export default function PushNotificationSettings({ userId }) {
  const t = useT()
  const [supported, setSupported] = useState(false)
  const [permission, setPermission] = useState('default')
  const [active, setActive] = useState(false)
  const [migrationMissing, setMigrationMissing] = useState(false)
  const [busy, setBusy] = useState(true)
  const [savingPreferences, setSavingPreferences] = useState(false)
  const [reminderHour, setReminderHour] = useState(8)
  const [hidePreview, setHidePreview] = useState(false)

  const refresh = useCallback(async () => {
    const canPush = supportsPush()
    setSupported(canPush)
    if (!canPush) { setBusy(false); return }
    setPermission(Notification.permission)
    try {
      const { data: subscriptions, error } = await supabase.from('push_subscriptions').select('id,endpoint,reminder_hour,hide_preview').eq('user_id', userId)
      if (error) {
        if (/push_subscriptions|schema cache|does not exist/i.test(error.message)) setMigrationMissing(true)
      } else {
        setMigrationMissing(false)
        const preference = subscriptions?.[0]
        setReminderHour(preference?.reminder_hour ?? 8)
        setHidePreview(preference?.hide_preview ?? false)
      }
      const registration = await navigator.serviceWorker.getRegistration()
      const subscription = registration ? await registration.pushManager.getSubscription() : null
      setActive(!!subscription && (error ? true : !!subscriptions?.some((row) => row.endpoint === subscription.endpoint)))
    } catch {
      setActive(false)
    }
    setBusy(false)
  }, [userId])

  useEffect(() => { refresh() }, [refresh])

  async function enable() {
    if (!supported || !VAPID_PUBLIC_KEY || busy) return
    setBusy(true)
    try {
      const result = await Notification.requestPermission()
      setPermission(result)
      if (result !== 'granted') {
        ui.info(result === 'denied' ? t('push.denied') : t('push.permissionDismissed'))
        setBusy(false)
        return
      }
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) throw new Error('La aplicación todavía no está instalada o preparada en este navegador.')
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(VAPID_PUBLIC_KEY),
      })
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: subscription.endpoint,
        subscription: subscription.toJSON(),
        user_agent: navigator.userAgent.slice(0, 500),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid',
        reminder_hour: reminderHour,
        hide_preview: hidePreview,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id,endpoint' })
      if (error) throw error
      setActive(true)
      ui.success(t('push.enabled'))
    } catch (error) {
      if (/push_subscriptions|schema cache|does not exist/i.test(error.message || '')) setMigrationMissing(true)
      ui.error(t('push.enableError', { msg: error.message || t('common.error') }))
    }
    setBusy(false)
  }

  async function disable() {
    if (busy) return
    setBusy(true)
    try {
      await removeCurrentDevicePushSubscription(userId)
      setActive(false)
      ui.success(t('push.disabled'))
    } catch (error) {
      ui.error(t('push.enableError', { msg: error.message || t('common.error') }))
    }
    setBusy(false)
  }

  async function savePreferences(next) {
    if (savingPreferences || migrationMissing) return
    setSavingPreferences(true)
    try {
      const { error } = await supabase.from('push_subscriptions').update({
        reminder_hour: next.reminder_hour ?? reminderHour,
        hide_preview: next.hide_preview ?? hidePreview,
        updated_at: new Date().toISOString(),
      }).eq('user_id', userId)
      if (error) throw error
      if (next.reminder_hour !== undefined) setReminderHour(next.reminder_hour)
      if (next.hide_preview !== undefined) setHidePreview(next.hide_preview)
      ui.success(t('push.preferencesSaved'))
    } catch (error) {
      ui.error(t('push.enableError', { msg: error.message || t('common.error') }))
    }
    setSavingPreferences(false)
  }

  const setupMissing = supported && !VAPID_PUBLIC_KEY

  return <section className="rounded-xl border border-mist bg-bg-dim/70 p-4">
    <div className="flex items-start gap-3">
      <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-brand text-navy' : 'bg-surface text-slate'}`}>
        {active ? <IconCheck width={18} height={18} /> : <IconAlert width={18} height={18} />}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-display text-lg text-navy">{t('push.title')}</h3>
        <p className="mt-1 text-xs leading-relaxed text-slate">
          {active ? t('push.active') : !supported ? t('push.unsupported') : setupMissing ? t('push.setupMissing') : migrationMissing ? t('push.migrationMissing') : permission === 'denied' ? t('push.denied') : t('push.help')}
        </p>
        {migrationMissing && <p className="mt-2 rounded-md bg-surface p-2 text-xs text-navy">{t('push.migrationSteps')}</p>}
        {supported && VAPID_PUBLIC_KEY && <button type="button" onClick={active ? disable : enable} disabled={busy || (migrationMissing && !active)} className={`mt-3 min-h-11 rounded-md px-4 text-sm font-bold transition disabled:opacity-50 ${active ? 'border border-mist bg-surface text-slate hover:border-red hover:text-red' : 'bg-brand text-navy hover:bg-brand-deep'}`}>
          {busy ? t('common.loading') : active ? t('push.turnOff') : t('push.turnOn')}
        </button>}
        {active && !migrationMissing && <div className="mt-4 grid gap-3 border-t border-mist pt-4 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-semibold text-slate">
            <span>{t('push.reminderHour')}</span>
            <select value={reminderHour} disabled={savingPreferences} onChange={(event) => savePreferences({ reminder_hour: Number(event.target.value) })} className="min-h-11 rounded-md border border-mist bg-surface px-3 text-sm text-navy">
              {Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>)}
            </select>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-mist bg-surface px-3 text-xs leading-relaxed text-slate">
            <input type="checkbox" checked={hidePreview} disabled={savingPreferences} onChange={(event) => savePreferences({ hide_preview: event.target.checked })} className="h-4 w-4 accent-brand" />
            <span>{t('push.hidePreview')}</span>
          </label>
          <p className="text-xs leading-relaxed text-slate sm:col-span-2">{t('push.preferenceScope')}{savingPreferences ? ` ${t('common.loading')}` : ''}</p>
        </div>}
      </div>
    </div>
  </section>
}
