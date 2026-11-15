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

  const refresh = useCallback(async () => {
    const canPush = supportsPush()
    setSupported(canPush)
    if (!canPush) { setBusy(false); return }
    setPermission(Notification.permission)
    try {
      const registration = await navigator.serviceWorker.getRegistration()
      if (!registration) { setActive(false); setBusy(false); return }
      const subscription = await registration.pushManager.getSubscription()
      if (!subscription) { setActive(false); setBusy(false); return }
      const { data, error } = await supabase.from('push_subscriptions').select('id').eq('user_id', userId).eq('endpoint', subscription.endpoint).maybeSingle()
      if (error) {
        if (/push_subscriptions|schema cache|does not exist/i.test(error.message)) setMigrationMissing(true)
      } else {
        setMigrationMissing(false)
        setActive(!!data)
      }
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
        {supported && VAPID_PUBLIC_KEY && <button type="button" onClick={active ? disable : enable} disabled={busy || migrationMissing} className={`mt-3 min-h-11 rounded-md px-4 text-sm font-bold transition disabled:opacity-50 ${active ? 'border border-mist bg-surface text-slate hover:border-red hover:text-red' : 'bg-brand text-navy hover:bg-brand-deep'}`}>
          {busy ? t('common.loading') : active ? t('push.turnOff') : t('push.turnOn')}
        </button>}
      </div>
    </div>
  </section>
}
