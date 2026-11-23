-- Per-session HR target and read-only Intervals.icu wellness import.
alter table public.sessions
  add column if not exists hr_zone_target text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_hr_zone_target_check') then
    alter table public.sessions add constraint sessions_hr_zone_target_check
      check (hr_zone_target is null or hr_zone_target in ('Z1','Z2','Z3','Z4','Z5'));
  end if;
end $$;

-- Athletes own their goals, milestones, tests and marks. Coaches retain read
-- access through the existing select policies but no longer write these rows.
drop policy if exists "ms_insert" on public.milestones;
drop policy if exists milestones_insert_self on public.milestones;
create policy milestones_insert_self on public.milestones for insert to authenticated
  with check (exists (select 1 from public.training_plans p where p.id = milestones.plan_id and p.athlete_id = auth.uid()));
drop policy if exists "ms_update" on public.milestones;
drop policy if exists milestones_update_self on public.milestones;
create policy milestones_update_self on public.milestones for update to authenticated
  using (exists (select 1 from public.training_plans p where p.id = milestones.plan_id and p.athlete_id = auth.uid()))
  with check (exists (select 1 from public.training_plans p where p.id = milestones.plan_id and p.athlete_id = auth.uid()));
drop policy if exists "ms_delete" on public.milestones;
drop policy if exists milestones_delete_self on public.milestones;
create policy milestones_delete_self on public.milestones for delete to authenticated
  using (exists (select 1 from public.training_plans p where p.id = milestones.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "tests_insert" on public.tests;
drop policy if exists tests_insert_self on public.tests;
create policy tests_insert_self on public.tests for insert to authenticated
  with check (exists (select 1 from public.training_plans p where p.id = tests.plan_id and p.athlete_id = auth.uid()));
drop policy if exists "tests_update" on public.tests;
drop policy if exists tests_update_self on public.tests;
create policy tests_update_self on public.tests for update to authenticated
  using (exists (select 1 from public.training_plans p where p.id = tests.plan_id and p.athlete_id = auth.uid()))
  with check (exists (select 1 from public.training_plans p where p.id = tests.plan_id and p.athlete_id = auth.uid()));
drop policy if exists "tests_delete" on public.tests;
drop policy if exists tests_delete_self on public.tests;
create policy tests_delete_self on public.tests for delete to authenticated
  using (exists (select 1 from public.training_plans p where p.id = tests.plan_id and p.athlete_id = auth.uid()));

alter table public.intervals_connections
  add column if not exists last_wellness_sync_at timestamptz;

create table if not exists public.intervals_wellness (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  wellness_date date not null,
  hrv_rmssd numeric,
  hrv_sdnn numeric,
  resting_hr numeric,
  average_sleeping_hr numeric,
  weight_kg numeric,
  sleep_seconds integer,
  sleep_score numeric,
  spo2 numeric,
  readiness numeric,
  stress numeric,
  fatigue numeric,
  soreness numeric,
  mood numeric,
  motivation numeric,
  raw_wellness jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  unique(profile_id, wellness_date)
);
create index if not exists intervals_wellness_profile_date_idx
  on public.intervals_wellness(profile_id, wellness_date desc);
alter table public.intervals_wellness enable row level security;
revoke all on public.intervals_wellness from anon, authenticated;
grant select on public.intervals_wellness to authenticated;
drop policy if exists intervals_wellness_self_or_coach on public.intervals_wellness;
create policy intervals_wellness_self_or_coach on public.intervals_wellness
  for select to authenticated using (
    profile_id = auth.uid() or public.my_athlete(profile_id)
  );
alter table public.intervals_wellness replica identity full;
do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='intervals_wellness') then
    alter publication supabase_realtime add table public.intervals_wellness;
  end if;
exception when undefined_object then null; end $$;
