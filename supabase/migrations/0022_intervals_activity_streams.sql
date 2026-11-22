-- Detailed time-series and interval data for activity charts and kilometre splits.
create table if not exists public.intervals_activity_details (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  provider_activity_id text not null,
  streams jsonb not null default '{}'::jsonb,
  intervals jsonb not null default '[]'::jsonb,
  has_streams boolean not null default false,
  source_status integer,
  details_updated_at timestamptz not null default now(),
  unique (profile_id, provider_activity_id)
);
alter table public.intervals_activity_details
  add column if not exists source_status integer;

create index if not exists intervals_activity_details_profile_idx
  on public.intervals_activity_details(profile_id, details_updated_at desc);

alter table public.intervals_activity_details enable row level security;
revoke all on public.intervals_activity_details from anon, authenticated;
grant select on public.intervals_activity_details to authenticated;
drop policy if exists intervals_activity_details_select_owner_or_coach on public.intervals_activity_details;
create policy intervals_activity_details_select_owner_or_coach on public.intervals_activity_details
  for select to authenticated using (
    profile_id = auth.uid()
    or exists (
      select 1 from public.profiles athlete
      where athlete.id = intervals_activity_details.profile_id
        and athlete.coach_id = auth.uid()
        and athlete.role = 'athlete'
    )
  );

alter table public.intervals_activity_details replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intervals_activity_details'
  ) then
    alter publication supabase_realtime add table public.intervals_activity_details;
  end if;
exception when undefined_object then null;
end $$;
