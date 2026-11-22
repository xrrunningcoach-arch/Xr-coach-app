-- Automatically attach Intervals.icu running activities to the athlete's
-- planned running session for the activity's local calendar date.
alter table public.intervals_connections
  add column if not exists last_activity_sync_at timestamptz;

alter table public.intervals_activities
  add column if not exists activity_local_date date,
  add column if not exists session_id uuid references public.sessions(id) on delete set null;

alter table public.sessions
  add column if not exists intervals_activity_id text,
  add column if not exists max_hr_actual integer;

create unique index if not exists sessions_intervals_activity_id_uidx
  on public.sessions(intervals_activity_id) where intervals_activity_id is not null;

create or replace function public.attach_intervals_activity_to_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date date;
  v_session_id uuid;
  v_km numeric;
  v_minutes numeric;
  v_pace numeric;
  v_running_discipline uuid;
begin
  if coalesce(new.activity_type, '') !~* '(run|trail)' then
    return new;
  end if;

  -- start_date_local is an ISO local timestamp from Intervals; preserve its
  -- written calendar date instead of converting through the database timezone.
  v_date := coalesce(
    new.activity_local_date,
    nullif(substr(new.raw_activity->>'start_date_local', 1, 10), '')::date,
    nullif(substr(new.raw_activity->>'start_date', 1, 10), '')::date,
    new.start_date_local::date
  );
  if v_date is null then return new; end if;
  new.activity_local_date := v_date;

  select id into v_running_discipline from public.disciplines where code = 'running' limit 1;
  if v_running_discipline is null then return new; end if;

  -- Prefer a previously linked session; otherwise choose the closest planned
  -- run on the same date, preferring active plans and pending sessions.
  select s.id into v_session_id
  from public.sessions s
  join public.training_plans p on p.id = s.plan_id
  where p.athlete_id = new.profile_id
    and p.status in ('active', 'completed')
    and s.session_date = v_date
    and s.discipline_id = v_running_discipline
    and s.status <> 'saltado'
    and (s.intervals_activity_id is null or s.intervals_activity_id = new.provider_activity_id)
  order by
    (s.intervals_activity_id = new.provider_activity_id) desc nulls last,
    (p.status = 'active') desc,
    (s.status = 'pendiente') desc,
    case when s.km_estimated is null or new.distance_m is null then 999999
      else abs(s.km_estimated - new.distance_m / 1000.0) end,
    s.id
  limit 1;

  if v_session_id is null then return new; end if;

  v_km := case when new.distance_m > 0 then round((new.distance_m / 1000.0)::numeric, 2) else null end;
  v_minutes := case when new.moving_time_s > 0 then round((new.moving_time_s / 60.0)::numeric, 2) else null end;
  v_pace := case when v_km > 0 and v_minutes > 0 then round((v_minutes / v_km)::numeric, 2) else null end;

  update public.sessions s set
    status = 'completado',
    completed_at = coalesce(new.start_date_local, now()),
    distance_actual_km = coalesce(v_km, s.distance_actual_km),
    duration_actual_min = coalesce(v_minutes, s.duration_actual_min),
    avg_hr_actual = coalesce(new.average_hr, s.avg_hr_actual),
    max_hr_actual = coalesce(new.max_hr, s.max_hr_actual),
    intervals_activity_id = new.provider_activity_id,
    metrics_actual = coalesce(s.metrics_actual, '{}'::jsonb) || jsonb_build_object(
      'source', 'Intervals.icu',
      'provider_activity_id', new.provider_activity_id,
      'activity_name', new.activity_name,
      'activity_type', new.activity_type,
      'pace_min_per_km', v_pace,
      'moving_time_s', new.moving_time_s,
      'elapsed_time_s', new.elapsed_time_s,
      'max_hr', new.max_hr
    )
  where s.id = v_session_id;

  new.session_id := v_session_id;
  return new;
end;
$$;

drop trigger if exists intervals_activity_attach_session on public.intervals_activities;
create trigger intervals_activity_attach_session
before insert or update of activity_type, activity_name, start_date_local, distance_m,
  moving_time_s, elapsed_time_s, average_hr, max_hr, raw_activity
on public.intervals_activities
for each row execute function public.attach_intervals_activity_to_session();

-- Backfill the activities already imported before this upgrade.
update public.intervals_activities set raw_activity = raw_activity;

create index if not exists intervals_activities_profile_local_date_idx
  on public.intervals_activities(profile_id, activity_local_date desc);

alter table public.intervals_activities replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intervals_activities'
  ) then
    alter publication supabase_realtime add table public.intervals_activities;
  end if;
exception when undefined_object then null;
end $$;
