import { supabase } from '../supabaseClient'

export async function removeCurrentDevicePushSubscription(userId) {
  if (!userId || !('serviceWorker' in navigator)) return
  const registration = await navigator.serviceWorker.getRegistration()
  if (!registration?.pushManager) return
  const subscription = await registration.pushManager.getSubscription()
  if (!subscription) return
  let databaseError
  try {
    const { error } = await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint)
    databaseError = error
  } finally {
    // El navegador deja de recibir avisos aunque temporalmente falle Supabase.
    await subscription.unsubscribe()
  }
  if (databaseError) throw databaseError
}
