import { createClient } from 'npm:@supabase/supabase-js@2'

function readKey(mapName: string, legacyName: string) {
  try {
    const keys = JSON.parse(Deno.env.get(mapName) || '{}')
    if (typeof keys.default === 'string') return keys.default
  } catch { /* use legacy secret below */ }
  return Deno.env.get(legacyName) || ''
}
const html = (message: string, status = 200) => {
  const appUrl = Deno.env.get('XR_APP_URL') || ''
  const safeUrl = appUrl.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  return new Response(
  `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>XR Running Coach</title><body style="font:16px system-ui;max-width:38rem;margin:15vh auto;padding:1.5rem;color:#173933"><h1>XR Running Coach</h1><p>${message}</p>${safeUrl ? `<p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#d8f36a;color:#173933;font-weight:700;text-decoration:none">Volver a XR</a></p>` : '<p>Vuelve a la aplicación para comprobar la conexión.</p>'}</body></html>`,
  { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } },
  )
}
const base64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
const sha256 = async (value: string) => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))))

Deno.serve(async (request) => {
  if (request.method !== 'GET') return html('Solicitud no válida.', 405)
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  if (url.searchParams.has('error')) return html('Has cancelado la autorización. No se ha conectado la cuenta.')
  if (!code || !state) return html('Falta el código de autorización o el estado de seguridad.', 400)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = readKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SECRET_KEY') || ''
  const clientId = Deno.env.get('INTERVALS_CLIENT_ID')
  const clientSecret = Deno.env.get('INTERVALS_CLIENT_SECRET')
  const redirectUri = Deno.env.get('INTERVALS_REDIRECT_URI')
  if (!supabaseUrl || !serviceKey || !clientId || !clientSecret || !redirectUri) return html('La integración todavía no está configurada en XR.', 503)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const stateHash = await sha256(state)
  const { data: stateRow } = await admin.from('intervals_oauth_states')
    .select('profile_id,expires_at,code_verifier').eq('state_hash', stateHash).maybeSingle()
  if (!stateRow || new Date(stateRow.expires_at).getTime() < Date.now()) {
    if (stateRow) await admin.from('intervals_oauth_states').delete().eq('state_hash', stateHash)
    return html('La autorización ha caducado o ya se utilizó. Vuelve a iniciar la conexión desde XR.', 400)
  }
  // Consume state before exchanging the one-time authorization code.
  const { error: consumeError } = await admin.from('intervals_oauth_states').delete().eq('state_hash', stateHash)
  if (consumeError) return html('No se pudo validar la autorización. Inténtalo de nuevo.', 500)

  const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, code_verifier: stateRow.code_verifier })
  let token: { access_token?: string; scope?: string; athlete?: { id?: string; name?: string } }
  try {
    const response = await fetch('https://intervals.icu/api/oauth/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form,
    })
    if (!response.ok) return html('Intervals.icu no aceptó el código. Revisa que la aplicación esté aprobada y que la URL de retorno coincida.', 400)
    token = await response.json()
  } catch {
    return html('No se pudo contactar con Intervals.icu. Vuelve a intentarlo desde XR.', 502)
  }
  if (!token.access_token || !token.athlete?.id) return html('Intervals.icu devolvió una respuesta incompleta.', 502)

  const savedAt = new Date().toISOString()
  const [{ error: connectionError }, { error: statusError }] = await Promise.all([
    admin.from('intervals_connections').upsert({
      profile_id: stateRow.profile_id,
      intervals_athlete_id: String(token.athlete.id),
      access_token: token.access_token,
      granted_scopes: token.scope || '',
      updated_at: savedAt,
    }),
    admin.from('intervals_connection_status').upsert({
      profile_id: stateRow.profile_id,
      intervals_athlete_name: token.athlete.name || null,
      connected_at: savedAt,
    }),
  ])
  if (connectionError || statusError) return html('Se autorizó la cuenta, pero XR no pudo guardar la conexión. Contacta con soporte antes de volver a autorizar.', 500)

  // One-time 90-day backfill, then ACTIVITY_UPLOADED webhooks keep it current.
  const oldest = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const newest = new Date().toISOString().slice(0, 10)
  try {
    const activitiesUrl = new URL('https://intervals.icu/api/v1/athlete/0/activities')
    activitiesUrl.searchParams.set('oldest', oldest)
    activitiesUrl.searchParams.set('newest', newest)
    const activitiesResponse = await fetch(activitiesUrl, { headers: { Authorization: `Bearer ${token.access_token}` } })
    if (activitiesResponse.ok) {
      const activities = await activitiesResponse.json()
      if (Array.isArray(activities)) {
        const runs = activities.filter((activity) => activity?.id && /run|trail/i.test(String(activity.type || activity.sport || '')))
        if (runs.length) {
          const { error: backfillError } = await admin.from('intervals_activities').upsert(runs.map((activity) => ({
            profile_id: stateRow.profile_id,
            provider_activity_id: String(activity.id),
            activity_type: activity.type || activity.sport || null,
            activity_name: activity.name || null,
            start_date_local: activity.start_date_local || activity.start_date || null,
            distance_m: activity.distance ?? null,
            moving_time_s: activity.moving_time ?? null,
            elapsed_time_s: activity.elapsed_time ?? null,
            average_hr: activity.average_heartrate ?? activity.avg_hr ?? null,
            max_hr: activity.max_heartrate ?? activity.max_hr ?? null,
            source: activity.source || null,
            raw_activity: activity,
            received_at: savedAt,
          })), { onConflict: 'profile_id,provider_activity_id' })
          if (backfillError) console.error('Intervals activity backfill failed:', backfillError.message)
        }
      }
    } else console.error('Intervals activity backfill returned:', activitiesResponse.status)
  } catch (backfillError) {
    console.error('Intervals activity backfill failed:', backfillError instanceof Error ? backfillError.message : 'unknown error')
  }
  return html('Intervals.icu se ha conectado correctamente con XR Running Coach.')
})
