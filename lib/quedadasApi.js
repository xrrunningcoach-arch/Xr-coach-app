// Lecturas y escrituras de las quedadas en Supabase (migraciones 0012–0013).
import { supabase } from '../supabaseClient'
import { RULES_VERSION } from './meetups'

const fail = (error) => {
  throw new Error(error.message)
}

const looksMissing = (message) => /social_profiles|communities|meetups|list_community_meetups|relation|schema cache|does not exist/i.test(message || '')

// { profile, missing, error }. missing = falta la migración base 0012.
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

// El RPC devuelve solo el punto exacto a quien organiza o ya está apuntado.
export async function fetchMeetups(communityId) {
  const { data, error } = await supabase.rpc('list_community_meetups', { p_community: communityId })
  if (error) fail(error)
  return Array.isArray(data) ? data : []
}

export async function createMeetup(row) {
  const { error } = await supabase.from('meetups').insert(row)
  if (error) fail(error)
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
