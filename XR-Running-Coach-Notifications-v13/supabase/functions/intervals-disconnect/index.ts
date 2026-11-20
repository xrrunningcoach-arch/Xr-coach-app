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
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
  const serviceKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
  const authorization = request.headers.get('Authorization')
  if (!supabaseUrl || !anonKey || !serviceKey || !authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized or server not configured' }, 401)

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error } = await userClient.auth.getUser()
  if (error || !user) return json({ error: 'Unauthorized' }, 401)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: connection } = await admin.from('intervals_connections').select('access_token').eq('profile_id', user.id).maybeSingle()
  if (connection?.access_token) {
    // Revocation at Intervals.icu is best effort; local disconnection always proceeds.
    await fetch('https://intervals.icu/api/v1/disconnect-app', {
      method: 'DELETE', headers: { Authorization: `Bearer ${connection.access_token}` },
    }).catch(() => undefined)
  }
  const results = await Promise.all([
    admin.from('intervals_connections').delete().eq('profile_id', user.id),
    admin.from('intervals_connection_status').delete().eq('profile_id', user.id),
  ])
  if (results.some((result) => result.error)) return json({ error: 'Could not remove the local connection' }, 500)
  return json({ ok: true })
})
