import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

function defaultKey(mapName: string, legacyName: string) {
  try {
    const map = JSON.parse(Deno.env.get(mapName) || '{}')
    if (typeof map.default === 'string') return map.default
  } catch { /* legacy projects may not expose key maps */ }
  return Deno.env.get(legacyName) || ''
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const secretKey = defaultKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY')
  if (!secretKey || request.headers.get('apikey') !== secretKey) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY')
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY')
  const vapidSubject = Deno.env.get('VAPID_SUBJECT')
  if (!supabaseUrl || !vapidPublic || !vapidPrivate || !vapidSubject) return Response.json({ error: 'Push is not configured' }, { status: 500, headers: cors })

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const now = new Date()
  const { data: subscriptions, error } = await admin.from('push_subscriptions').select('user_id,endpoint,timezone,reminder_hour,hide_preview,subscription')
  if (error) return Response.json({ error: 'Could not read subscriptions' }, { status: 500, headers: cors })
  const dueByAthlete = new Map<string, any[]>()
  for (const row of subscriptions || []) {
    const tz = row.timezone || 'Europe/Madrid'
    let parts: Record<string, string>
    try { parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now).map((p) => [p.type, p.value])) }
    catch { continue }
    const reminderHour = String(row.reminder_hour ?? 8).padStart(2, '0')
    if (parts.hour !== reminderHour) continue
    const day = `${parts.year}-${parts.month}-${parts.day}`
    const current = dueByAthlete.get(row.user_id) || []
    current.push({ ...row, localDate: day, timezone: tz })
    dueByAthlete.set(row.user_id, current)
  }
  if (!dueByAthlete.size) return Response.json({ sent: 0 }, { headers: cors })

  const userIds = [...dueByAthlete.keys()]
  const { data: plans } = await admin.from('training_plans').select('id,athlete_id,coach_id').in('athlete_id', userIds).eq('status', 'active')
  const planIds = (plans || []).map((plan) => plan.id)
  const { data: sessions } = planIds.length
    ? await admin.from('sessions').select('id,plan_id,session_date,session_type,description,km_estimated,status').in('plan_id', planIds).eq('status', 'pendiente')
    : { data: [] }
  const planById = new Map((plans || []).map((plan) => [plan.id, plan]))
  let sent = 0
  let failed = 0
  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)

  for (const session of sessions || []) {
    const plan = planById.get(session.plan_id)
    const user = plan?.athlete_id
    const rows = user ? (dueByAthlete.get(user) || []).filter((row) => row.localDate === session.session_date) : []
    if (!rows.length || !session.session_date) continue
    const sessionName = String(session.session_type || 'Entrenamiento').replace(/\s+/g, ' ').trim().slice(0, 70)
    const distance = session.km_estimated ? ` · ${session.km_estimated} km` : ''
    const description = String(session.description || '').replace(/\s+/g, ' ').trim().slice(0, 90)
    const body = `${sessionName}${distance}${description ? ` · ${description}` : ''}`
    const expiredEndpoints: string[] = []
    await Promise.all(rows.map(async (row) => {
      const notification = JSON.stringify(row.hide_preview
        ? { title: 'XR Running Coach', body: 'Tienes un recordatorio de entrenamiento.', url: './#/atleta', tag: `xr-workout-${session.id}` }
        : { title: 'Tu entrenamiento de hoy', body, url: './#/atleta', tag: `xr-workout-${session.id}` })
      try {
        await webpush.sendNotification(row.subscription, notification, { TTL: 60 * 60 * 12 })
        sent += 1
        await admin.from('push_reminder_log').upsert({ user_id: user, session_date: row.localDate, session_id: session.id, endpoint: row.endpoint }, { onConflict: 'user_id,session_date,session_id,endpoint' })
      }
      catch (pushError) {
        const e = pushError as { statusCode?: number; message?: string }
        if (e.statusCode === 404 || e.statusCode === 410) expiredEndpoints.push(row.endpoint)
        else { failed += 1; console.error('Workout reminder delivery failed:', e.statusCode || e.message) }
      }
    }))
    if (expiredEndpoints.length) await admin.from('push_subscriptions').delete().eq('user_id', user).in('endpoint', expiredEndpoints)
  }

  // Avisa el día anterior solo a quien ya se ha apuntado (incluida la persona organizadora).
  const until = new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString()
  const { data: meetups } = await admin.from('meetups')
    .select('id,title,starts_at,place_name,status,meetup_participants(user_id)')
    .eq('status', 'open').gte('starts_at', now.toISOString()).lte('starts_at', until)
  for (const meetup of meetups || []) {
    for (const attendee of meetup.meetup_participants || []) {
      const dayRows = (dueByAthlete.get(attendee.user_id) || []).filter((row) => {
        const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: row.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(meetup.starts_at)).map((p) => [p.type, p.value]))
        const tomorrow = new Date(`${row.localDate}T12:00:00.000Z`)
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
        return `${parts.year}-${parts.month}-${parts.day}` === tomorrow.toISOString().slice(0, 10)
      })
      if (!dayRows.length) continue
      const expired: string[] = []
      await Promise.all(dayRows.map(async (row) => {
        const { data: logged } = await admin.from('push_meetup_reminder_log').select('meetup_id').eq('user_id', attendee.user_id).eq('meetup_id', meetup.id).eq('endpoint', row.endpoint).maybeSingle()
        if (logged) return
        try {
          const when = new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short', timeZone: row.timezone }).format(new Date(meetup.starts_at))
          const place = String(meetup.place_name || '').replace(/\s+/g, ' ').trim().slice(0, 70)
          const body = `${when}${place ? ` · ${place}` : ''}`
          const notification = JSON.stringify(row.hide_preview
            ? { title: 'XR Running Coach', body: 'Tienes un recordatorio de quedada.', url: './#/', tag: `xr-meetup-reminder-${meetup.id}` }
            : { title: `Mañana: ${String(meetup.title || 'quedada').slice(0, 70)}`, body, url: './#/', tag: `xr-meetup-reminder-${meetup.id}` })
          await webpush.sendNotification(row.subscription, notification, { TTL: 60 * 60 * 12 })
          await admin.from('push_meetup_reminder_log').upsert({ user_id: attendee.user_id, meetup_id: meetup.id, endpoint: row.endpoint }, { onConflict: 'user_id,meetup_id,endpoint' })
        } catch (pushError) {
          const e = pushError as { statusCode?: number; message?: string }
          if (e.statusCode === 404 || e.statusCode === 410) expired.push(row.endpoint)
          else { failed += 1; console.error('Meetup reminder delivery failed:', e.statusCode || e.message) }
        }
      }))
      if (expired.length) await admin.from('push_subscriptions').delete().eq('user_id', attendee.user_id).in('endpoint', expired)
    }
  }
  return Response.json({ sent, failed }, { status: failed ? 502 : 200, headers: cors })
})
