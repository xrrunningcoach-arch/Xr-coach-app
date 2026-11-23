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
  const userClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: authorization } } })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const { activity_id: activityId, athlete_id: requestedAthleteId } = await request.json().catch(() => ({}))
  if (typeof activityId !== 'string' || activityId.length > 100) return json({ error: 'Invalid activity id' }, 400)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile } = await admin.from('profiles').select('role,is_active,coach_approved').eq('id', user.id).maybeSingle()
  if (!profile || profile.is_active === false) return json({ error: 'Active account required' }, 403)
  let ownerId = user.id
  if (profile.role === 'coach') {
    if (profile.coach_approved !== true) return json({ error: 'Approved coach account required' }, 403)
    if (typeof requestedAthleteId !== 'string') return json({ error: 'Athlete id required' }, 400)
    const { data: athlete } = await admin.from('profiles').select('id,coach_id,role,is_active').eq('id', requestedAthleteId).maybeSingle()
    if (!athlete || athlete.role !== 'athlete' || athlete.coach_id !== user.id || athlete.is_active === false) return json({ error: 'Athlete access denied' }, 403)
    ownerId = athlete.id
  } else if (profile.role !== 'athlete') return json({ error: 'Athlete or assigned coach account required' }, 403)
  const [{ data: activity }, { data: connection }] = await Promise.all([
    admin.from('intervals_activities').select('provider_activity_id').eq('profile_id', ownerId).eq('provider_activity_id', activityId).maybeSingle(),
    admin.from('intervals_connections').select('access_token').eq('profile_id', ownerId).maybeSingle(),
  ])
  if (!activity || !connection?.access_token) return json({ error: 'Activity or connection not found' }, 404)
  try {
    await fetchAndStoreIntervalsDetails(admin, ownerId, connection.access_token, activityId)
  } catch (error) {
    console.error('Activity detail request failed', error instanceof Error ? error.message : 'unknown error')
    return json({ error: 'Could not load activity detail from Intervals.icu' }, 502)
  }
  const { data: details, error } = await admin.from('intervals_activity_details')
    .select('streams,intervals,has_streams,details_updated_at')
    .eq('profile_id', ownerId).eq('provider_activity_id', activityId).maybeSingle()
  if (error) return json({ error: 'Could not read saved activity detail' }, 500)
  return json({ details })
})
