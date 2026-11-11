// Quedadas para entrenar acompañado. Funciones puras (sin red): validan el
// formulario, construyen los enlaces de Google Maps y filtran la lista.
// Los límites de aquí reflejan los de la migración 0012 (la base de datos es
// quien manda: esto solo da mensajes claros antes de enviar).
import { addDays, localDateOf, todayISO } from './dates'
import { formatPaceSec, parsePace } from './zones'

export const RULES_VERSION = '2026-11-07'
export const LEVELS = ['all', 'beginner', 'intermediate', 'advanced']
export const REPORT_REASONS = ['spam', 'unsafe', 'inappropriate', 'other']
export const MAX_DAYS_AHEAD = 90

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const round6 = (n) => Math.round(n * 1e6) / 1e6

// «Xabat Elortza Rubio» -> «Xabat E.» (nombre + inicial del primer apellido).
export function suggestDisplayName(fullName) {
  const parts = String(fullName ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`
}

// Coordenadas pegadas desde Google Maps: «43.2831, -2.1234».
export function parseCoords(text) {
  const m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(String(text ?? ''))
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null
  return { lat: round6(lat), lng: round6(lng) }
}

// Destino para Google Maps: coordenadas si las hay; si no, «lugar, pueblo».
function destination(meetup, area) {
  if (meetup.lat != null && meetup.lng != null) return `${meetup.lat},${meetup.lng}`
  return [meetup.place_name, area].filter(Boolean).join(', ')
}

export function mapsViewUrl(meetup, area = '') {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination(meetup, area))}`
}

export function mapsDirectionsUrl(meetup, area = '') {
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination(meetup, area))}&travelmode=walking`
}

// ---------------------------------------------------------------------------
// Fechas del formulario (<input type="datetime-local"> trabaja en hora local)
// ---------------------------------------------------------------------------
export function localInputToISO(local) {
  const d = new Date(local)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

export function isoToLocalInput(iso) {
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// Mañana a las 19:00.
export function defaultStartLocal(now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 19, 0)
  return isoToLocalInput(d.toISOString())
}

export function formatWhen(iso, lang = 'es') {
  const d = new Date(iso)
  try {
    const text = new Intl.DateTimeFormat(lang === 'eu' ? 'eu-ES' : 'es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d)
    return cap(text)
  } catch {
    return d.toLocaleString()
  }
}

// ---------------------------------------------------------------------------
// Formulario -> fila de la tabla meetups
// ---------------------------------------------------------------------------
const intIn = (v, min, max) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

// form: { title, description, discipline_code, starts_local, duration_min,
//         distance_km, pace_from, pace_to, level, max_participants,
//         point_id, place_name, coords }
// Devuelve { errors: [{ key, params? }], row }.
export function buildMeetupRow(form, { organizerId, communityId, points = [], now = Date.now() }) {
  const errors = []

  const title = String(form.title ?? '').trim()
  if (title.length < 3 || title.length > 80) errors.push({ key: 'qd.err.title' })

  const startsAt = form.starts_local ? localInputToISO(form.starts_local) : null
  if (!startsAt) {
    errors.push({ key: 'qd.err.start' })
  } else {
    const t = new Date(startsAt).getTime()
    if (t <= now) errors.push({ key: 'qd.err.startPast' })
    else if (t > now + MAX_DAYS_AHEAD * 86400000) errors.push({ key: 'qd.err.startFar' })
  }

  const duration = intIn(form.duration_min, 10, 600)
  if (duration == null) errors.push({ key: 'qd.err.duration' })

  let distance = null
  const distRaw = String(form.distance_km ?? '').trim().replace(',', '.')
  if (distRaw !== '') {
    const n = Number(distRaw)
    if (!Number.isFinite(n) || n < 0.1 || n > 500) errors.push({ key: 'qd.err.distance' })
    else distance = Math.round(n * 10) / 10
  }

  let paceMin = null
  let paceMax = null
  const pf = String(form.pace_from ?? '').trim()
  const pt = String(form.pace_to ?? '').trim()
  if (pf || pt) {
    if (!pf || !pt) {
      errors.push({ key: 'qd.err.pacePair' })
    } else {
      const a = parsePace(pf)
      const b = parsePace(pt)
      if (a == null || b == null) errors.push({ key: 'qd.err.paceFormat' })
      else if (a > b) errors.push({ key: 'qd.err.paceOrder' })
      else {
        paceMin = a
        paceMax = b
      }
    }
  }

  const max = intIn(form.max_participants, 2, 50)
  if (max == null) errors.push({ key: 'qd.err.max' })

  const point = form.point_id ? points.find((p) => p.id === form.point_id) : null
  let placeName = ''
  let lat = null
  let lng = null
  let pointId = null
  if (point) {
    pointId = point.id
    placeName = point.name
    lat = Number(point.lat)
    lng = Number(point.lng)
  } else {
    placeName = String(form.place_name ?? '').trim()
    if (placeName.length < 2 || placeName.length > 120) errors.push({ key: 'qd.err.place' })
    const coordsRaw = String(form.coords ?? '').trim()
    if (coordsRaw) {
      const c = parseCoords(coordsRaw)
      if (!c) errors.push({ key: 'qd.err.coords' })
      else {
        lat = c.lat
        lng = c.lng
      }
    }
  }

  if (errors.length) return { errors, row: null }

  const description = String(form.description ?? '').trim().slice(0, 1000)
  return {
    errors: [],
    row: {
      organizer_id: organizerId,
      community_id: communityId,
      meeting_point_id: pointId,
      title,
      description: description || null,
      discipline_code: String(form.discipline_code || 'running'),
      starts_at: startsAt,
      duration_min: duration,
      distance_km: distance,
      pace_min_s_km: paceMin,
      pace_max_s_km: paceMax,
      level: LEVELS.includes(form.level) ? form.level : 'all',
      max_participants: max,
      place_name: placeName,
      lat,
      lng,
    },
  }
}

// ---------------------------------------------------------------------------
// Estado de una quedada para quien la mira
// ---------------------------------------------------------------------------
export const spotsLeft = (meetup, count) => Math.max(0, meetup.max_participants - count)

// 'cancelled' | 'past' | 'organizer' | 'joined' | 'full' | 'open'
export function joinState({ meetup, userId, count, joined, now = Date.now() }) {
  if (meetup.status === 'cancelled') return 'cancelled'
  if (new Date(meetup.starts_at).getTime() <= now) return 'past'
  if (meetup.organizer_id === userId) return 'organizer'
  if (joined) return 'joined'
  if (count >= meetup.max_participants) return 'full'
  return 'open'
}

export function paceRangeParts(meetup) {
  if (meetup.pace_min_s_km == null || meetup.pace_max_s_km == null) return null
  return { from: formatPaceSec(meetup.pace_min_s_km), to: formatPaceSec(meetup.pace_max_s_km) }
}

// filters: day, discipline and level. Compatibility is deliberately broad:
// an all-level session remains visible for every level.
export function filterMeetups(list, { day = 'all', discipline = 'all', level = 'all' } = {}, now = new Date()) {
  const today = todayISO(now)
  return list.filter((m) => {
    if (discipline !== 'all' && m.discipline_code !== discipline) return false
    if (level !== 'all' && m.level !== 'all' && m.level !== level) return false
    const d = localDateOf(m.starts_at)
    if (day === 'today') return d === today
    if (day === 'week') return d >= today && d <= addDays(today, 6)
    return true
  })
}
