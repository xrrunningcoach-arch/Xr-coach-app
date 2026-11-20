import { createClient } from 'npm:@supabase/supabase-js@2'

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
  const expected = Deno.env.get('INTERVALS_WEBHOOK_AUTHORIZATION')
  const received = request.headers.get('Authorization') || ''
  if (!expected || !constantTimeEqual(received, expected)) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
  if (!supabaseUrl || !serviceKey) return Response.json({ error: 'Server not configured' }, { status: 503 })
  const payload = await request.json().catch(() => null)
  if (!payload || !Array.isArray(payload.events)) return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  let stored = 0
  for (const event of payload.events) {
    if (!['ACTIVITY_UPLOADED', 'ACTIVITY_ANALYZED'].includes(event?.type) || !event.activity?.id || !event.athlete_id) continue
    const { data: connection } = await admin.from('intervals_connections')
      .select('profile_id').eq('intervals_athlete_id', String(event.athlete_id)).maybeSingle()
    if (!connection) continue

    const activity = event.activity
    const activityType = String(activity.type || activity.sport || '')
    // The MVP stores running activities only, preserving the complete summary
    // for later mapping to XR's planned sessions.
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
  }
  return Response.json({ ok: true, stored })
})
