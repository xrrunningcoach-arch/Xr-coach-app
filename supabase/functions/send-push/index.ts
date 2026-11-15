import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!supabaseUrl || !anonKey || !serviceKey) return Response.json({ error: 'Push server is not configured' }, { status: 500, headers: corsHeaders })

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

  const payload = await request.json().catch(() => null)
  const messageId = payload?.messageId
  if (typeof messageId !== 'string') return Response.json({ error: 'messageId is required' }, { status: 400, headers: corsHeaders })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: message, error: messageError }, { data: sender }] = await Promise.all([
    admin.from('messages').select('id,athlete_id,sender_id').eq('id', messageId).maybeSingle(),
    admin.from('profiles').select('id,role,full_name,coach_id').eq('id', user.id).maybeSingle(),
  ])
  if (messageError || !message || !sender || message.sender_id !== user.id) {
    return Response.json({ error: 'Message not found or not owned by sender' }, { status: 403, headers: corsHeaders })
  }

  let recipientId: string | null = null
  if (sender.role === 'athlete' && message.athlete_id === user.id) {
    recipientId = sender.coach_id
  } else if (sender.role === 'coach') {
    const { data: athlete } = await admin.from('profiles').select('id,coach_id').eq('id', message.athlete_id).maybeSingle()
    if (athlete?.coach_id === user.id) recipientId = athlete.id
  }
  if (!recipientId) return Response.json({ sent: 0 }, { headers: corsHeaders })

  const { data: subscriptions, error: subscriptionError } = await admin
    .from('push_subscriptions')
    .select('id,subscription')
    .eq('user_id', recipientId)
  if (subscriptionError) return Response.json({ error: 'Unable to load subscriptions' }, { status: 500, headers: corsHeaders })
  if (!subscriptions?.length) return Response.json({ sent: 0 }, { headers: corsHeaders })
  if (!vapidPublic || !vapidPrivate || !vapidSubject) return Response.json({ error: 'VAPID keys are not configured' }, { status: 500, headers: corsHeaders })

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
  const title = sender.role === 'athlete' ? 'Nuevo mensaje de tu atleta' : 'Nuevo mensaje de tu entrenador'
  const body = sender.full_name ? `${sender.full_name} te ha enviado un mensaje.` : 'Tienes un mensaje nuevo en XR Running Coach.'
  const notification = JSON.stringify({ title, body, url: './', tag: `xr-chat-${message.athlete_id}` })
  let sent = 0
  const expired: string[] = []
  await Promise.all(subscriptions.map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, notification, { TTL: 60 * 60 })
      sent += 1
    } catch (error) {
      const pushError = error as { statusCode?: number; message?: string }
      if (pushError.statusCode === 404 || pushError.statusCode === 410) expired.push(row.id)
      else console.error('Push delivery failed:', pushError.statusCode || pushError.message || error)
    }
  }))
  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired)
  return Response.json({ sent }, { headers: corsHeaders })
})
