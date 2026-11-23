import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchAndStoreIntervalsDetails } from '../_shared/intervalsDetails.ts'

function readKey(mapName: string, legacyName: string) {
  try {
    const keys = JSON.parse(Deno.env.get(mapName) || '{}')
    if (typeof keys.default === 'string') return keys.default
  } catch { /* use legacy secret below */ }
  return Deno.env.get(legacyName) || ''
}

function constantTimeEqual(a: string, b: string) {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
  return diff === 0
}

Deno.serve(async (request) => {
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 })
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
  if (!supabaseUrl || !serviceKey) return Response.json({ error: 'Server not configured' }, { status: 503 })
  const payload = await request.json().catch(() => null)
  if (!payload || !Array.isArray(payload.events)) return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })

  // Intervals supports a custom Authorization header and a webhook secret
  // included in the JSON payload. Accept whichever was configured.
  const expectedHeader = Deno.env.get('INTERVALS_WEBHOOK_AUTHORIZATION') || ''
  const expectedBody = Deno.env.get('INTERVALS_WEBHOOK_SECRET') || ''
  const receivedHeader = request.headers.get('Authorization') || ''
  const headerOk = !!expectedHeader && constantTimeEqual(receivedHeader, expectedHeader)
  const bodyOk = !!expectedBody && typeof payload.secret === 'string' && constantTimeEqual(payload.secret, expectedBody)
  if (!headerOk && !bodyOk) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let stored = 0
  let wellnessStored = 0
  for (const event of payload.events) {
    if (event?.type === 'WELLNESS_UPDATED' && event.athlete_id) {
      const { data: connection } = await admin.from('intervals_connections')
        .select('profile_id,access_token').eq('intervals_athlete_id', String(event.athlete_id)).maybeSingle()
      if (!connection) continue
      const newest = new Date().toISOString().slice(0, 10)
      const oldest = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
      const wellnessUrl = new URL('https://intervals.icu/api/v1/athlete/0/wellness')
      wellnessUrl.searchParams.set('oldest', oldest)
      wellnessUrl.searchParams.set('newest', newest)
      try {
        const response = await fetch(wellnessUrl, { headers: { Authorization: `Bearer ${connection.access_token}` } })
        if (!response.ok) { console.error('Intervals wellness webhook sync returned', response.status); continue }
        const wellness = await response.json().catch(() => null)
        if (!Array.isArray(wellness)) continue
        const receivedAt = new Date().toISOString()
        const rows = wellness.map((w) => {
          const date = String(w?.id || w?.date || w?.day || '').slice(0, 10)
          return {
            profile_id: connection.profile_id, wellness_date: date,
            hrv_rmssd: w?.hrv ?? w?.hrvRmssd ?? null, hrv_sdnn: w?.hrvSDNN ?? w?.hrv_sdnn ?? null,
            resting_hr: w?.restingHR ?? w?.resting_hr ?? null,
            average_sleeping_hr: w?.avgSleepingHR ?? w?.average_sleeping_hr ?? null,
            weight_kg: w?.weight ?? w?.weight_kg ?? null,
            sleep_seconds: w?.sleepSecs ?? w?.sleep_seconds ?? null,
            sleep_score: w?.sleepScore ?? w?.sleep_score ?? null,
            spo2: w?.spO2 ?? w?.spo2 ?? null, readiness: w?.readiness ?? null,
            stress: w?.stress ?? null, fatigue: w?.fatigue ?? null,
            soreness: w?.soreness ?? null, mood: w?.mood ?? null,
            motivation: w?.motivation ?? null, raw_wellness: w, received_at: receivedAt,
          }
        }).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.wellness_date))
        if (rows.length) {
          const { error } = await admin.from('intervals_wellness').upsert(rows, { onConflict: 'profile_id,wellness_date' })
          if (error) { console.error('Could not store Intervals wellness', error.message); continue }
          wellnessStored += rows.length
          await admin.from('intervals_connections').update({ last_wellness_sync_at: receivedAt }).eq('profile_id', connection.profile_id)
        }
      } catch (error) { console.error('Intervals wellness webhook failed', error instanceof Error ? error.message : 'unknown error') }
      continue
    }
    if (!['ACTIVITY_UPLOADED', 'ACTIVITY_ANALYZED', 'ACTIVITY_UPDATED'].includes(event?.type) || !event.activity?.id || !event.athlete_id) continue
    const { data: connection } = await admin.from('intervals_connections')
      .select('profile_id,access_token').eq('intervals_athlete_id', String(event.athlete_id)).maybeSingle()
    if (!connection) continue

    const activity = event.activity
    const activityType = String(activity.type || activity.sport || '')
    // Keep running activities only; the database trigger associates the
    // summary to its planned session and the helper fetches detailed streams.
    if (!/run|trail/i.test(activityType)) continue
    const result = await admin.from('intervals_activities').upsert({
      profile_id: connection.profile_id,
      provider_activity_id: String(activity.id),
      activity_type: activityType || null,
      activity_name: activity.name || null,
      start_date_local: activity.start_date_local || activity.start_date || null,
      distance_m: activity.distance ?? null,
      moving_time_s: activity.moving_time ?? null,
      elapsed_time_s: activity.elapsed_time ?? null,
      average_hr: activity.average_heartrate ?? activity.avg_hr ?? null,
      max_hr: activity.max_heartrate ?? activity.max_hr ?? null,
      source: activity.source || null,
      raw_activity: activity,
      received_at: new Date().toISOString(),
    }, { onConflict: 'profile_id,provider_activity_id' })
    if (result.error) {
      console.error('Could not store Intervals activity', result.error.message)
      return Response.json({ error: 'Could not store activity' }, { status: 500 })
    }
    stored++
    try {
      await fetchAndStoreIntervalsDetails(admin, connection.profile_id, connection.access_token, String(activity.id), ['ACTIVITY_UPDATED', 'ACTIVITY_ANALYZED'].includes(event.type))
    } catch (detailError) {
      console.error('Could not fetch Intervals activity streams', detailError instanceof Error ? detailError.message : 'unknown error')
    }
  }
  return Response.json({ ok: true, stored, wellness_stored: wellnessStored })
})
