import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function readDefaultKey(mapName: string, legacyName: string) {
  const rawMap = Deno.env.get(mapName)
  if (rawMap) {
    try {
      const keys = JSON.parse(rawMap)
      if (typeof keys?.default === 'string' && keys.default) return keys.default
      console.error(`${mapName} is present but has no default key`)
    } catch (error) {
      console.error(`${mapName} is not valid JSON:`, error instanceof Error ? error.message : 'invalid JSON')
    }
  }
  return Deno.env.get(legacyName)
}

const clipped = (value: unknown, max = 120) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
const dateTime = (value: string) => new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Madrid' }).format(new Date(value))

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = readDefaultKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY')
  const serviceKey = readDefaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  const missingRuntime = [!supabaseUrl && 'SUPABASE_URL', !anonKey && 'SUPABASE_PUBLISHABLE_KEYS/default', !serviceKey && 'SUPABASE_SECRET_KEYS/default'].filter(Boolean)
  if (missingRuntime.length) {
    console.error('Push server runtime configuration missing:', missingRuntime)
    return Response.json({ error: 'Push server is not configured' }, { status: 500, headers: corsHeaders })
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })
  const userClient = createClient(supabaseUrl!, anonKey!, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders })

  const payload = await request.json().catch(() => null)
  const admin = createClient(supabaseUrl!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } })
  const [{ data: sender }, { data: profile }] = await Promise.all([
    admin.from('profiles').select('id,role,full_name,coach_id').eq('id', user.id).maybeSingle(),
    admin.from('social_profiles').select('community_id,display_name,is_active').eq('user_id', user.id).maybeSingle(),
  ])
  if (!sender) return Response.json({ error: 'Profile not found' }, { status: 403, headers: corsHeaders })

  let title = ''
  let body = ''
  let tag = ''
  let url = './'
  let recipientIds: string[] = []
  const kind = payload?.kind || 'chat'

  if (kind === 'chat') {
    const messageId = payload?.messageId
    if (typeof messageId !== 'string') return Response.json({ error: 'messageId is required' }, { status: 400, headers: corsHeaders })
    const { data: message, error } = await admin.from('messages').select('id,athlete_id,sender_id,body').eq('id', messageId).maybeSingle()
    if (error || !message || message.sender_id !== user.id) return Response.json({ error: 'Message not found or not owned by sender' }, { status: 403, headers: corsHeaders })
    if (sender.role === 'athlete' && message.athlete_id === user.id) recipientIds = sender.coach_id ? [sender.coach_id] : []
    else if (sender.role === 'coach') {
      const { data: athlete } = await admin.from('profiles').select('id,coach_id').eq('id', message.athlete_id).maybeSingle()
      if (athlete?.coach_id === user.id) recipientIds = [athlete.id]
    }
    title = sender.role === 'athlete' ? `Mensaje de ${sender.full_name || 'tu atleta'}` : `Mensaje de ${sender.full_name || 'tu entrenador'}`
    body = clipped(message.body) || 'Tienes un mensaje nuevo.'
    tag = `xr-chat-${message.athlete_id}`
    url = sender.role === 'athlete' ? `./#/coach/atleta/${message.athlete_id}` : './#/atleta'
  } else if (kind === 'evaluation') {
    const evaluationId = payload?.evaluationId
    if (typeof evaluationId !== 'string' || sender.role !== 'coach') return Response.json({ error: 'Invalid evaluation request' }, { status: 400, headers: corsHeaders })
    const { data: evaluation } = await admin.from('session_evaluations').select('id,session_id,coach_id,rating,comment').eq('id', evaluationId).maybeSingle()
    if (!evaluation || evaluation.coach_id !== user.id) return Response.json({ error: 'Evaluation not found or not owned by sender' }, { status: 403, headers: corsHeaders })
    const { data: session } = await admin.from('sessions').select('id,plan_id,session_type,session_date').eq('id', evaluation.session_id).maybeSingle()
    if (!session) return Response.json({ error: 'Session not found' }, { status: 404, headers: corsHeaders })
    const { data: plan } = await admin.from('training_plans').select('athlete_id,coach_id').eq('id', session.plan_id).maybeSingle()
    if (!plan || plan.coach_id !== user.id) return Response.json({ error: 'Not authorized for this athlete' }, { status: 403, headers: corsHeaders })
    recipientIds = [plan.athlete_id]
    title = 'Nueva valoración de tu entrenador'
    body = [session.session_type, evaluation.rating ? `${evaluation.rating}/5` : null, clipped(evaluation.comment)].filter(Boolean).join(' · ') || 'Tu entrenador ha valorado un entrenamiento.'
    tag = `xr-evaluation-${evaluation.id}`
    url = './#/atleta'
  } else if (kind === 'meetup_created' || kind === 'meetup_joined') {
    const meetupId = payload?.meetupId
    if (typeof meetupId !== 'string' || !profile?.is_active) return Response.json({ error: 'Invalid meetup request' }, { status: 400, headers: corsHeaders })
    const { data: meetup } = await admin.from('meetups').select('id,organizer_id,community_id,title,starts_at,place_name,status').eq('id', meetupId).maybeSingle()
    if (!meetup || meetup.status !== 'open') return Response.json({ error: 'Meetup not found' }, { status: 404, headers: corsHeaders })
    const { data: membership } = await admin.from('social_profiles').select('community_id,is_active').eq('user_id', user.id).maybeSingle()
    if (!membership?.is_active || membership.community_id !== meetup.community_id) return Response.json({ error: 'Not authorized for this community' }, { status: 403, headers: corsHeaders })
    if (kind === 'meetup_created') {
      if (meetup.organizer_id !== user.id) return Response.json({ error: 'Only the organizer can announce a meetup' }, { status: 403, headers: corsHeaders })
      const { data: members } = await admin.from('social_profiles').select('user_id').eq('community_id', meetup.community_id).eq('is_active', true).neq('user_id', user.id)
      recipientIds = (members || []).map((member) => member.user_id)
      title = 'Nueva quedada en tu comunidad'
      body = `${clipped(meetup.title, 70)} · ${dateTime(meetup.starts_at)}. Abre XR Running Coach para ver el lugar y apuntarte.`
    } else {
      const { data: attendee } = await admin.from('meetup_participants').select('user_id').eq('meetup_id', meetupId).eq('user_id', user.id).maybeSingle()
      if (!attendee || meetup.organizer_id === user.id) return Response.json({ error: 'Only a participant can notify the organizer' }, { status: 403, headers: corsHeaders })
      recipientIds = [meetup.organizer_id]
      title = 'Alguien se ha unido a tu quedada'
      body = `${profile.display_name || 'Un atleta'} se ha apuntado a «${clipped(meetup.title, 70)}».`
    }
    tag = `xr-meetup-${meetupId}`
    url = './#/coach/quedadas'
  } else {
    return Response.json({ error: 'Unsupported notification type' }, { status: 400, headers: corsHeaders })
  }

  const uniqueRecipients = [...new Set(recipientIds)].filter((id) => id !== user.id)
  if (!uniqueRecipients.length) return Response.json({ sent: 0 }, { headers: corsHeaders })
  const { data: subscriptions, error: subscriptionError } = await admin.from('push_subscriptions').select('id,user_id,subscription,hide_preview').in('user_id', uniqueRecipients)
  if (subscriptionError) {
    console.error('Unable to load push subscriptions:', subscriptionError.message)
    return Response.json({ error: 'Unable to load subscriptions' }, { status: 500, headers: corsHeaders })
  }
  if (!subscriptions?.length) return Response.json({ sent: 0 }, { headers: corsHeaders })
  const missingVapid = [!vapidPublic && 'VAPID_PUBLIC_KEY', !vapidPrivate && 'VAPID_PRIVATE_KEY', !vapidSubject && 'VAPID_SUBJECT'].filter(Boolean)
  if (missingVapid.length) {
    console.error('Push VAPID configuration missing:', missingVapid)
    return Response.json({ error: 'VAPID keys are not configured' }, { status: 500, headers: corsHeaders })
  }
  try { webpush.setVapidDetails(vapidSubject!, vapidPublic!, vapidPrivate!) }
  catch (error) {
    console.error('Invalid VAPID configuration:', error instanceof Error ? error.message : 'invalid VAPID values')
    return Response.json({ error: 'VAPID configuration is invalid' }, { status: 500, headers: corsHeaders })
  }

  let sent = 0
  let failed = 0
  const expired: string[] = []
  await Promise.all(subscriptions.map(async (row) => {
    const notification = JSON.stringify(row.hide_preview
      ? { title: 'XR Running Coach', body: 'Tienes una nueva notificación.', url, tag }
      : { title, body, url, tag })
    try { await webpush.sendNotification(row.subscription, notification, { TTL: 60 * 60 }); sent += 1 }
    catch (error) {
      const pushError = error as { statusCode?: number; message?: string }
      if (pushError.statusCode === 404 || pushError.statusCode === 410) expired.push(row.id)
      else { failed += 1; console.error('Push delivery failed:', pushError.statusCode || pushError.message || error) }
    }
  }))
  if (expired.length) await admin.from('push_subscriptions').delete().in('id', expired)
  return Response.json({ sent, failed }, { status: failed ? 502 : 200, headers: corsHeaders })
})
