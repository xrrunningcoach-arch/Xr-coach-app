// Lecturas y escrituras de las quedadas en Supabase (migración 0012).
import { supabase } from '../supabaseClient'
import { RULES_VERSION } from './meetups'

const fail = (error) => {
  throw new Error(error.message)
}

const looksMissing = (message) => /social_profiles|communities|meetups|relation|schema cache|does not exist/i.test(message || '')

// { profile, missing, error }. missing = la migración 0012 no está ejecutada.
export async function fetchSocialProfile(userId) {
  const { data, error } = await supabase
    .from('social_profiles')
    .select('*, communities(id, slug, name, postal_code)')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) return { profile: null, missing: looksMissing(error.message), error: error.message }
  return { profile: data, missing: false, error: null }
}

export async function fetchCommunities() {
  const { data, error } = await supabase.from('communities').select('*').eq('is_active', true).order('name')
  if (error) fail(error)
  return data || []
}

export async function saveSocialProfile({ userId, communityId, displayName }) {
  const { error } = await supabase.from('social_profiles').upsert(
    {
      user_id: userId,
      community_id: communityId,
      display_name: displayName.trim(),
      adult_confirmed: true,
      rules_version: RULES_VERSION,
      consent_at: new Date().toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  )
  if (error) fail(error)
}

export async function deactivateSocial(userId) {
  const { error } = await supabase
    .from('social_profiles')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
  if (error) fail(error)
}

export async function fetchMeetingPoints(communityId) {
  const { data, error } = await supabase
    .from('meeting_points')
    .select('*')
    .eq('community_id', communityId)
    .eq('is_active', true)
    .order('name')
  if (error) fail(error)
  return data || []
}

// Quedadas desde hace 3 horas en adelante, con sus apuntados (nombre visible).
export async function fetchMeetups(communityId) {
  const since = new Date(Date.now() - 3 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('meetups')
    .select('*')
    .eq('community_id', communityId)
    .gte('starts_at', since)
    .order('starts_at')
  if (error) fail(error)
  const list = data || []
  if (list.length === 0) return []

  const { data: parts, error: pErr } = await supabase
    .from('meetup_participants')
    .select('meetup_id, user_id')
    .in('meetup_id', list.map((m) => m.id))
  if (pErr) fail(pErr)
  const participants = parts || []

  const userIds = [...new Set(participants.map((p) => p.user_id))]
  const names = {}
  if (userIds.length) {
    const { data: people, error: sErr } = await supabase.from('social_profiles').select('user_id, display_name').in('user_id', userIds)
    if (sErr) fail(sErr)
    ;(people || []).forEach((p) => {
      names[p.user_id] = p.display_name
    })
  }

  return list.map((m) => ({
    ...m,
    people: participants
      .filter((p) => p.meetup_id === m.id)
      .map((p) => ({ user_id: p.user_id, display_name: names[p.user_id] || '—' })),
    organizerName: names[m.organizer_id] || '',
  }))
}

export async function createMeetup(row) {
  const { data, error } = await supabase.from('meetups').insert(row).select().single()
  if (error) fail(error)
  return data
}

export async function joinMeetup(id) {
  const { error } = await supabase.rpc('join_meetup', { p_meetup: id })
  if (error) fail(error)
}

export async function leaveMeetup(id) {
  const { error } = await supabase.rpc('leave_meetup', { p_meetup: id })
  if (error) fail(error)
}

export async function cancelMeetup(id) {
  const { error } = await supabase.from('meetups').update({ status: 'cancelled' }).eq('id', id)
  if (error) fail(error)
}

export async function reportMeetup({ meetupId, reporterId, reason, details }) {
  const { error } = await supabase.from('meetup_reports').insert({
    meetup_id: meetupId,
    reporter_id: reporterId,
    reason,
    details: String(details || '').trim() || null,
  })
  if (error) fail(error)
}
