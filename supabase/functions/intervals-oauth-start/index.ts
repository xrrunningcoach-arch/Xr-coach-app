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
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const sha256 = async (value: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = readKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || ''
  const serviceKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
  const clientId = Deno.env.get('INTERVALS_CLIENT_ID')
  const redirectUri = Deno.env.get('INTERVALS_REDIRECT_URI')
  if (!supabaseUrl || !anonKey || !serviceKey || !clientId || !redirectUri) {
    return json({ error: 'Intervals integration is not configured on the server' }, 503)
  }

  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)
  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  })
  const { data: { user }, error: authError } = await userClient.auth.getUser()
  if (authError || !user) return json({ error: 'Unauthorized' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: profile } = await admin.from('profiles').select('role,is_active').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'athlete' || profile.is_active === false) return json({ error: 'Only active athlete accounts can connect Intervals.icu' }, 403)

  const state = crypto.randomUUID() + crypto.randomUUID().replaceAll('-', '')
  const codeVerifier = base64url(crypto.getRandomValues(new Uint8Array(48)))
  const { error: stateError } = await admin.from('intervals_oauth_states').insert({
    state_hash: await sha256(state),
    profile_id: user.id,
    code_verifier: codeVerifier,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  })
  if (stateError) return json({ error: 'Could not start secure authorization' }, 500)

  const authorize = new URL('https://intervals.icu/oauth/authorize')
  authorize.searchParams.set('client_id', clientId)
  authorize.searchParams.set('redirect_uri', redirectUri)
  authorize.searchParams.set('scope', 'ACTIVITY:READ,WELLNESS:READ')
  authorize.searchParams.set('state', state)
  authorize.searchParams.set('code_challenge', await sha256(codeVerifier))
  authorize.searchParams.set('code_challenge_method', 'S256')
  return json({ authorize_url: authorize.toString() })
})
