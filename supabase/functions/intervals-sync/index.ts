import { createClient } from 'npm:@supabase/supabase-js@2'
import { fetchAndStoreIntervalsDetails } from '../_shared/intervalsDetails.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function readKey(mapName: string, legacyName: string) {
  try {
    const keys = JSON.parse(Deno.env.get(mapName) || '{}')
    if (typeof keys.default === 'string') return keys.default
  } catch { /* use legacy secret below */ }
  return Deno.env.get(legacyName) || ''
}
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: cors })

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const anonKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
  const serviceKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
  const authorization = request.headers.get('Authorization') || ''
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server not configured' }, 503)
  if (!authorization.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const requestBody = await request.json().catch(() => ({}))
  const forceWellness = requestBody?.force_wellness === true
  const { data: profile } = await admin.from('profiles').select('role,is_active,coach_approved').eq('id', user.id).maybeSingle()
  if (!profile || profile.is_active === false) return json({ error: 'Active account required' }, 403)
  let ownerId = user.id
  if (profile.role === 'coach') {
    if (profile.coach_approved !== true) return json({ error: 'Approved coach account required' }, 403)
    if (typeof requestBody?.athlete_id !== 'string') return json({ error: 'Athlete id required for coach sync' }, 400)
    const { data: athlete } = await admin.from('profiles').select('id,role,coach_id,is_active').eq('id', requestBody.athlete_id).maybeSingle()
    if (!athlete || athlete.role !== 'athlete' || athlete.coach_id !== user.id || athlete.is_active === false) return json({ error: 'This athlete is not assigned to this coach' }, 403)
    ownerId = athlete.id
  } else if (profile.role !== 'athlete') return json({ error: 'Athlete or assigned coach account required' }, 403)

  const { data: connection, error: connectionError } = await admin.from('intervals_connections')
    .select('access_token,last_activity_sync_at,last_wellness_sync_at').eq('profile_id', ownerId).maybeSingle()
  if (connectionError) return json({ error: 'Could not read Intervals connection' }, 500)
  if (!connection?.access_token) return json({ connected: false, synced: 0 })
  const syncActivities = !connection.last_activity_sync_at || Date.now() - new Date(connection.last_activity_sync_at).getTime() >= 60 * 60 * 1000
  const syncWellness = forceWellness || !connection.last_wellness_sync_at || Date.now() - new Date(connection.last_wellness_sync_at).getTime() >= 12 * 60 * 60 * 1000
  if (!syncActivities && !syncWellness) return json({ connected: true, skipped: true, synced: 0, wellness_synced: 0, wellness_error: null })

  const newest = new Date().toISOString().slice(0, 10)
  const oldest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const now = new Date().toISOString()
  let runs: any[] = []
  if (syncActivities) {
    const url = new URL('https://intervals.icu/api/v1/athlete/0/activities')
    url.searchParams.set('oldest', oldest)
    url.searchParams.set('newest', newest)
    let response: Response
    try { response = await fetch(url, { headers: { Authorization: `Bearer ${connection.access_token}` } }) }
    catch { return json({ error: 'Intervals.icu is temporarily unavailable' }, 502) }
    if (!response.ok) {
      console.error('Intervals activity sync returned', response.status)
      return json({ error: 'Intervals.icu rejected the activity sync', status: response.status }, 502)
    }
    const activities = await response.json().catch(() => null)
    if (!Array.isArray(activities)) return json({ error: 'Invalid activity response from Intervals.icu' }, 502)
    runs = activities.filter((a) => a?.id && /run|trail/i.test(String(a.type || a.sport || '')))
  }
  if (runs.length) {
    const { error } = await admin.from('intervals_activities').upsert(runs.map((a) => ({
      profile_id: ownerId,
      provider_activity_id: String(a.id),
      activity_type: a.type || a.sport || null,
      activity_name: a.name || null,
      start_date_local: a.start_date_local || a.start_date || null,
      distance_m: a.distance ?? null,
      moving_time_s: a.moving_time ?? null,
      elapsed_time_s: a.elapsed_time ?? null,
      average_hr: a.average_heartrate ?? a.avg_hr ?? null,
      max_hr: a.max_heartrate ?? a.max_hr ?? null,
      source: a.source || null,
      raw_activity: a,
      received_at: now,
    })), { onConflict: 'profile_id,provider_activity_id' })
    if (error) {
      console.error('Could not save Intervals sync', error.message)
      return json({ error: 'Could not save imported activities' }, 500)
    }
    // Pull each detailed trace once; the shared helper skips activities whose
    // stream data is already stored. Process serially to stay gentle with API limits.
    for (const activity of runs) {
      try {
        await fetchAndStoreIntervalsDetails(admin, ownerId, connection.access_token, String(activity.id))
      } catch (detailError) {
        console.error('Could not fetch Intervals activity detail', detailError instanceof Error ? detailError.message : 'unknown error')
      }
    }
  }

  const syncTimes: Record<string, string> = {}
  if (syncActivities) syncTimes.last_activity_sync_at = now
  let wellnessSynced = 0
  let wellnessError: string | null = null
  if (syncWellness) {
    const wellnessUrl = new URL('https://intervals.icu/api/v1/athlete/0/wellness')
    wellnessUrl.searchParams.set('oldest', new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10))
    wellnessUrl.searchParams.set('newest', newest)
    try {
      const wellnessResponse = await fetch(wellnessUrl, { headers: { Authorization: `Bearer ${connection.access_token}` } })
      if (wellnessResponse.ok) {
        const wellness = await wellnessResponse.json().catch(() => null)
        if (Array.isArray(wellness)) {
          const rows = wellness.map((w) => {
            const date = String(w?.id || w?.date || w?.day || '').slice(0, 10)
            return {
              profile_id: ownerId, wellness_date: date,
              hrv_rmssd: w?.hrv ?? w?.hrvRmssd ?? null, hrv_sdnn: w?.hrvSDNN ?? w?.hrv_sdnn ?? null,
              resting_hr: w?.restingHR ?? w?.resting_hr ?? null,
              average_sleeping_hr: w?.avgSleepingHR ?? w?.average_sleeping_hr ?? null,
              weight_kg: w?.weight ?? w?.weight_kg ?? null,
              sleep_seconds: w?.sleepSecs ?? w?.sleep_seconds ?? null,
              sleep_score: w?.sleepScore ?? w?.sleep_score ?? null,
              spo2: w?.spO2 ?? w?.spo2 ?? null, readiness: w?.readiness ?? null,
              stress: w?.stress ?? null, fatigue: w?.fatigue ?? null,
              soreness: w?.soreness ?? null, mood: w?.mood ?? null,
              motivation: w?.motivation ?? null, raw_wellness: w, received_at: now,
            }
          }).filter((w) => /^\d{4}-\d{2}-\d{2}$/.test(w.wellness_date))
          if (rows.length) {
            const { error } = await admin.from('intervals_wellness').upsert(rows, { onConflict: 'profile_id,wellness_date' })
            if (error) { console.error('Could not save wellness', error.message); wellnessError = 'Could not save imported Wellness data.' }
            else wellnessSynced = rows.length
          }
        }
      } else {
        console.error('Intervals wellness sync returned', wellnessResponse.status)
        wellnessError = wellnessResponse.status === 403
          ? 'Intervals.icu denied Wellness access (403). Reconnect and grant WELLNESS:READ.'
          : `Intervals.icu Wellness request failed (${wellnessResponse.status}).`
      }
    } catch (error) {
      console.error('Intervals wellness sync failed', error instanceof Error ? error.message : 'unknown error')
      wellnessError = 'Could not contact Intervals.icu to refresh Wellness.'
    }
    if (!wellnessError) syncTimes.last_wellness_sync_at = now
  }
  if (Object.keys(syncTimes).length) {
    const { error: timestampError } = await admin.from('intervals_connections').update(syncTimes).eq('profile_id', ownerId)
    if (timestampError) return json({ error: 'Data synced, but sync time could not be saved' }, 500)
  }
  return json({ connected: true, synced: runs.length, wellness_synced: wellnessSynced, wellness_error: wellnessError })
})
