-- Intervals.icu integration: private OAuth credentials + webhook activity inbox.
-- OAuth tokens and one-time states are server-only (service role); the client
-- can read only the non-secret connection status and its own imported activities.

create table if not exists public.intervals_oauth_states (
  state_hash text primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  code_verifier text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.intervals_connections (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  intervals_athlete_id text not null unique,
  access_token text not null,
  granted_scopes text not null default '',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.intervals_connection_status (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  intervals_athlete_name text,
  connected_at timestamptz not null default now()
);

create table if not exists public.intervals_activities (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider_activity_id text not null,
  activity_type text,
  activity_name text,
  start_date_local timestamptz,
  distance_m numeric,
  moving_time_s integer,
  elapsed_time_s integer,
  average_hr integer,
  max_hr integer,
  source text,
  raw_activity jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique (profile_id, provider_activity_id)
);

create index if not exists intervals_activities_profile_date_idx
  on public.intervals_activities (profile_id, start_date_local desc);

alter table public.intervals_oauth_states enable row level security;
alter table public.intervals_connections enable row level security;
alter table public.intervals_connection_status enable row level security;
alter table public.intervals_activities enable row level security;

revoke all on public.intervals_oauth_states from anon, authenticated;
revoke all on public.intervals_connections from anon, authenticated;
revoke all on public.intervals_connection_status from anon, authenticated;
revoke all on public.intervals_activities from anon, authenticated;

grant select on public.intervals_connection_status to authenticated;
grant select on public.intervals_activities to authenticated;

drop policy if exists intervals_status_select_self on public.intervals_connection_status;
create policy intervals_status_select_self on public.intervals_connection_status
  for select to authenticated using (profile_id = auth.uid());

drop policy if exists intervals_activities_select_owner_or_coach on public.intervals_activities;
create policy intervals_activities_select_owner_or_coach on public.intervals_activities
  for select to authenticated using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles athlete
      where athlete.id = intervals_activities.profile_id
        and athlete.coach_id = auth.uid()
        and athlete.role = 'athlete'
    )
  );
