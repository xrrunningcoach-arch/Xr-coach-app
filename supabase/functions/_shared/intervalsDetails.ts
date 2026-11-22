const STREAMS_URL = 'https://intervals.icu/api/v1/activity/'
const KEEP_STREAMS = ['time', 'distance', 'heartrate', 'velocity_smooth', 'altitude', 'cadence', 'moving']
const MAX_POINTS = 700

function normalizedStreams(payload: unknown) {
  const entries = Array.isArray(payload) ? payload : []
  const byType = new Map<string, number[]>()
  for (const item of entries) {
    if (!item || !KEEP_STREAMS.includes(String(item.type)) || !Array.isArray(item.data)) continue
    byType.set(String(item.type), item.data)
  }
  const lengths = [...byType.values()].map((v) => v.length).filter(Boolean)
  const count = Math.max(0, Math.min(...lengths))
  if (!count) return {}
  const step = Math.max(1, Math.ceil(count / MAX_POINTS))
  const result: Record<string, (number | null)[]> = {}
  for (const [name, values] of byType) {
    const points: (number | null)[] = []
    for (let i = 0; i < count; i += step) {
      const n = Number(values[i])
      if (Number.isFinite(n)) points.push(n)
      else points.push(null)
    }
    result[name] = points
  }
  return result
}

function compactIntervals(payload: unknown) {
  const data = payload as Record<string, unknown> | null
  const rows = Array.isArray(data) ? data : Array.isArray(data?.icu_intervals) ? data.icu_intervals : []
  const keys = ['id', 'type', 'start_index', 'end_index', 'start_time', 'end_time', 'distance', 'moving_time', 'elapsed_time', 'average_heartrate', 'min_heartrate', 'max_heartrate', 'average_speed', 'average_cadence', 'total_elevation_gain', 'zone', 'group_id']
  return rows.slice(0, 200).map((row) => {
    const source = row as Record<string, unknown>
    return Object.fromEntries(keys.filter((key) => source[key] != null).map((key) => [key, source[key]]))
  })
}

export async function fetchAndStoreIntervalsDetails(admin: any, profileId: string, token: string, activityId: string, force = false) {
  const { data: existing } = await admin.from('intervals_activity_details')
    .select('has_streams,details_updated_at').eq('profile_id', profileId).eq('provider_activity_id', activityId).maybeSingle()
  const fresh = existing?.details_updated_at && Date.now() - new Date(existing.details_updated_at).getTime() < 6 * 60 * 60 * 1000
  if (!force && existing?.has_streams) return { skipped: true, has_streams: true }
  if (!force && fresh) return { skipped: true, has_streams: false }

  const headers = { Authorization: `Bearer ${token}` }
  const streamUrl = new URL(`${STREAMS_URL}${encodeURIComponent(activityId)}/streams.json`)
  streamUrl.searchParams.set('types', KEEP_STREAMS.join(','))
  const intervalsUrl = `${STREAMS_URL}${encodeURIComponent(activityId)}?intervals=true`
  const [streamsResponse, intervalsResponse] = await Promise.all([
    fetch(streamUrl, { headers }),
    fetch(intervalsUrl, { headers }),
  ])
  if (!streamsResponse.ok) {
    if ([403, 404].includes(streamsResponse.status)) {
      await admin.from('intervals_activity_details').upsert({
        profile_id: profileId, provider_activity_id: activityId, streams: {}, intervals: [], has_streams: false,
        source_status: streamsResponse.status, details_updated_at: new Date().toISOString(),
      }, { onConflict: 'profile_id,provider_activity_id' })
    }
    return { skipped: false, has_streams: false, status: streamsResponse.status }
  }
  const streamMap = normalizedStreams(await streamsResponse.json().catch(() => null))
  const intervalPayload = intervalsResponse.ok ? await intervalsResponse.json().catch(() => null) : null
  const intervals = compactIntervals(intervalPayload)
  const row = {
    profile_id: profileId,
    provider_activity_id: activityId,
    streams: streamMap,
    intervals,
    has_streams: Object.keys(streamMap).length > 0,
    source_status: null,
    details_updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('intervals_activity_details').upsert(row, { onConflict: 'profile_id,provider_activity_id' })
  if (error) throw new Error(`Could not save activity detail: ${error.message}`)
  return { skipped: false, has_streams: row.has_streams, interval_count: intervals.length }
}
