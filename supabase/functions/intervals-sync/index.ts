import { createClient } from 'npm:@supabase/supabase-js@2'

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
  const { data: profile } = await admin.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'athlete' || profile.is_active === false) return json({ error: 'Athlete account required' }, 403)

  const { data: connection, error: connectionError } = await admin.from('intervals_connections')
    .select('access_token,last_activity_sync_at').eq('profile_id', user.id).maybeSingle()
  if (connectionError) return json({ error: 'Could not read Intervals connection' }, 500)
  if (!connection?.access_token) return json({ connected: false, synced: 0 })
  if (connection.last_activity_sync_at && Date.now() - new Date(connection.last_activity_sync_at).getTime() < 60 * 60 * 1000) {
    return json({ connected: true, skipped: true, synced: 0 })
  }

  const newest = new Date().toISOString().slice(0, 10)
  const oldest = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const url = new URL('https://intervals.icu/api/v1/athlete/0/activities')
  url.searchParams.set('oldest', oldest)
  url.searchParams.set('newest', newest)
  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${connection.access_token}` } })
  } catch {
    return json({ error: 'Intervals.icu is temporarily unavailable' }, 502)
  }
  if (!response.ok) {
    console.error('Intervals sync returned', response.status)
    return json({ error: 'Intervals.icu rejected the activity sync', status: response.status }, 502)
  }

  const activities = await response.json().catch(() => null)
  if (!Array.isArray(activities)) return json({ error: 'Invalid activity response from Intervals.icu' }, 502)
  const now = new Date().toISOString()
  const runs = activities.filter((a) => a?.id && /run|trail/i.test(String(a.type || a.sport || '')))
  if (runs.length) {
    const { error } = await admin.from('intervals_activities').upsert(runs.map((a) => ({
      profile_id: user.id,
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
  }

  const { error: timestampError } = await admin.from('intervals_connections')
    .update({ last_activity_sync_at: now }).eq('profile_id', user.id)
  if (timestampError) return json({ error: 'Activities synced, but sync time could not be saved' }, 500)
  return json({ connected: true, synced: runs.length })
})
