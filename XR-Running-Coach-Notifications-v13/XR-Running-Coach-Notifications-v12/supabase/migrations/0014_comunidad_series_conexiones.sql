-- 0014 · Solicitudes de comunidad y quedadas semanales.
-- Ejecutar después de 0013 en Supabase SQL Editor.

alter table public.meetups
  add column if not exists series_id uuid,
  add column if not exists series_index int,
  add column if not exists series_total int;

create index if not exists idx_meetups_series_start
  on public.meetups(series_id, starts_at) where series_id is not null;

-- Evita superar el límite de publicaciones activas si llegan altas simultáneas.
create or replace function public.trg_meetups_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_active int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organizer_id::text, 0));
  if new.starts_at <= now() then raise exception 'La quedada debe ser en el futuro'; end if;
  if new.starts_at > now() + interval '90 days' then raise exception 'Solo se pueden publicar quedadas de los próximos 90 días'; end if;
  select count(*) into v_active from public.meetups where organizer_id=new.organizer_id and status='open' and starts_at>now();
  if v_active >= 5 then raise exception 'Ya tienes 5 quedadas activas: cancela alguna o espera a que pasen'; end if;
  return new;
end; $$;

-- Las solicitudes permiten medir demanda local antes de abrir una comunidad.
create table if not exists public.community_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  postal_code text check (postal_code is null or char_length(postal_code) <= 10),
  sport text not null default 'running' check (char_length(sport) <= 30),
  status text not null default 'pending' check (status in ('pending','reviewed','opened')),
  created_at timestamptz not null default now(),
  unique (requester_id, name, postal_code)
);
alter table public.community_requests enable row level security;
drop policy if exists community_requests_insert_own on public.community_requests;
create policy community_requests_insert_own on public.community_requests
  for insert with check (requester_id = auth.uid() and status = 'pending');
drop policy if exists community_requests_select_own on public.community_requests;
create policy community_requests_select_own on public.community_requests
  for select using (requester_id = auth.uid() or public.is_admin());
drop policy if exists community_requests_update_admin on public.community_requests;
create policy community_requests_update_admin on public.community_requests
  for update using (public.is_admin()) with check (public.is_admin());
revoke all on public.community_requests from anon;
grant select, insert, update on public.community_requests to authenticated;

create or replace function public.list_community_meetups(p_community uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_community uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  v_community := public.my_social_community();
  if v_community is null or v_community is distinct from p_community then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'organizer_id',m.organizer_id,'community_id',m.community_id,'meeting_point_id',m.meeting_point_id,
    'title',m.title,'description',m.description,'discipline_code',m.discipline_code,'starts_at',m.starts_at,
    'duration_min',m.duration_min,'distance_km',m.distance_km,'pace_min_s_km',m.pace_min_s_km,
    'pace_max_s_km',m.pace_max_s_km,'level',m.level,'max_participants',m.max_participants,
    'place_name',case when loc_access.can_see_location then m.place_name else c.name end,
    'exact_place_name',case when loc_access.can_see_location then m.place_name else null end,
    'lat',case when loc_access.can_see_location then m.lat else null end,
    'lng',case when loc_access.can_see_location then m.lng else null end,
    'location_visible',loc_access.can_see_location,'status',m.status,'created_at',m.created_at,'updated_at',m.updated_at,
    'series_id',m.series_id,'series_index',m.series_index,'series_total',m.series_total,
    'people',coalesce(participants.people,'[]'::jsonb),'organizerName',coalesce(organizer.display_name,'')
  ) order by m.starts_at),'[]'::jsonb) into v_result
  from public.meetups m join public.communities c on c.id=m.community_id
  left join public.social_profiles organizer on organizer.user_id=m.organizer_id
  cross join lateral (select (m.organizer_id=auth.uid() or exists (
    select 1 from public.meetup_participants mine where mine.meetup_id=m.id and mine.user_id=auth.uid()
  )) as can_see_location) loc_access
  left join lateral (select jsonb_agg(jsonb_build_object('user_id',p.user_id,'display_name',coalesce(sp.display_name,'—')) order by p.joined_at) as people
    from public.meetup_participants p left join public.social_profiles sp on sp.user_id=p.user_id where p.meetup_id=m.id) participants on true
  where m.community_id=p_community and m.starts_at >= now()-interval '3 hours';
  return v_result;
end; $$;
revoke all on function public.list_community_meetups(uuid) from public, anon;
grant execute on function public.list_community_meetups(uuid) to authenticated;

-- Una inscripción a una serie reserva plaza en todas sus próximas fechas.
create or replace function public.join_meetup(p_meetup uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_m public.meetups%rowtype; v_occ public.meetups%rowtype; v_count int; v_series uuid; v_target_locked boolean := false;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v_m from public.meetups where id=p_meetup;
  if not found then raise exception 'Quedada no encontrada'; end if;
  if v_m.community_id is distinct from public.my_social_community() then raise exception 'No autorizado'; end if;
  if v_m.status<>'open' or v_m.starts_at<=now() then raise exception 'La quedada ya no está disponible'; end if;
  if v_m.series_id is null then
    select * into v_m from public.meetups where id=p_meetup for update;
    if v_m.status<>'open' or v_m.starts_at<=now() then raise exception 'La quedada ya no está disponible'; end if;
    select count(*) into v_count from public.meetup_participants where meetup_id=p_meetup;
    if not exists(select 1 from public.meetup_participants where meetup_id=p_meetup and user_id=auth.uid()) then
      if v_count>=v_m.max_participants then raise exception 'La quedada está completa'; end if;
      insert into public.meetup_participants(meetup_id,user_id) values(p_meetup,auth.uid());
    end if;
    return;
  end if;
  v_series := v_m.series_id;
  for v_occ in select * from public.meetups where series_id=v_series and community_id=v_m.community_id and status='open' and starts_at>now() order by starts_at,id for update loop
    if v_occ.id=p_meetup then v_target_locked := true; end if;
    select count(*) into v_count from public.meetup_participants where meetup_id=v_occ.id;
    if v_count>=v_occ.max_participants and not exists(select 1 from public.meetup_participants where meetup_id=v_occ.id and user_id=auth.uid()) then
      raise exception 'La serie está completa en una de sus próximas fechas';
    end if;
  end loop;
  if not v_target_locked then raise exception 'La quedada ya no está disponible'; end if;
  insert into public.meetup_participants(meetup_id,user_id)
    select id,auth.uid() from public.meetups m where m.series_id=v_series and m.community_id=v_m.community_id and m.status='open' and m.starts_at>now()
    on conflict do nothing;
end; $$;

create or replace function public.leave_meetup(p_meetup uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_m public.meetups%rowtype;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  select * into v_m from public.meetups where id=p_meetup;
  if not found then raise exception 'Quedada no encontrada'; end if;
  if v_m.organizer_id=auth.uid() then raise exception 'El organizador no puede bajarse: cancela la quedada'; end if;
  if v_m.series_id is null then
    delete from public.meetup_participants where meetup_id=p_meetup and user_id=auth.uid();
  else
    delete from public.meetup_participants p using public.meetups m
      where p.meetup_id=m.id and m.series_id=v_m.series_id and m.starts_at>now() and p.user_id=auth.uid();
  end if;
end; $$;
revoke all on function public.join_meetup(uuid), public.leave_meetup(uuid) from public, anon;
grant execute on function public.join_meetup(uuid), public.leave_meetup(uuid) to authenticated;
