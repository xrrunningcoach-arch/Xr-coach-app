-- 0015 · Proponer sesiones del plan y permitir quedadas sin límite de plazas.
-- Ejecutar después de 0014_comunidad_series_conexiones.sql.

alter table public.meetups add column if not exists session_id uuid
  references public.sessions(id) on delete set null;

alter table public.meetups alter column duration_min drop not null;
alter table public.meetups alter column duration_min drop default;
alter table public.meetups drop constraint if exists meetups_duration_min_check;
alter table public.meetups add constraint meetups_duration_min_check
  check (duration_min is null or duration_min between 10 and 600);

alter table public.meetups alter column max_participants drop not null;
alter table public.meetups alter column max_participants drop default;
alter table public.meetups drop constraint if exists meetups_max_participants_check;
alter table public.meetups add constraint meetups_max_participants_check
  check (max_participants is null or max_participants between 2 and 50);
update public.meetups set max_participants = null where status = 'open';

-- A session may only be advertised by its own athlete.
create or replace function public.trg_meetups_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_active int;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.organizer_id::text, 0));
  if new.starts_at <= now() then raise exception 'La quedada debe ser en el futuro'; end if;
  if new.starts_at > now() + interval '90 days' then raise exception 'Solo se pueden publicar quedadas de los próximos 90 días'; end if;
  select count(*) into v_active from public.meetups where organizer_id=new.organizer_id and status='open' and starts_at>now();
  if v_active >= 5 then raise exception 'Ya tienes 5 quedadas activas: cancela alguna o espera a que pasen'; end if;
  if new.session_id is not null and not exists (
    select 1 from public.sessions s join public.training_plans p on p.id=s.plan_id
    where s.id=new.session_id and p.athlete_id=new.organizer_id
  ) then raise exception 'La sesión no pertenece a este atleta'; end if;
  return new;
end; $$;

create or replace function public.trg_meetups_before_update()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  select count(*) into v_count from public.meetup_participants where meetup_id = new.id;
  if new.max_participants is not null and new.max_participants < v_count then
    raise exception 'Hay % personas apuntadas: no puedes reducir las plazas por debajo', v_count;
  end if;
  new.updated_at := now();
  return new;
end; $$;

create or replace function public.list_community_meetups(p_community uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_community uuid; v_result jsonb;
begin
  if auth.uid() is null then raise exception 'No autorizado'; end if;
  v_community := public.my_social_community();
  if v_community is null or v_community is distinct from p_community then raise exception 'No autorizado'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',m.id,'organizer_id',m.organizer_id,'community_id',m.community_id,'meeting_point_id',m.meeting_point_id,
    'from_plan',m.session_id is not null,'title',m.title,'description',m.description,'discipline_code',m.discipline_code,
    'starts_at',m.starts_at,'duration_min',m.duration_min,'distance_km',m.distance_km,
    'pace_min_s_km',m.pace_min_s_km,'pace_max_s_km',m.pace_max_s_km,'level',m.level,
    'max_participants',m.max_participants,
    'place_name',case when loc_access.can_see_location then m.place_name else c.name end,
    'exact_place_name',case when loc_access.can_see_location then m.place_name else null end,
    'lat',case when loc_access.can_see_location then m.lat else null end,
    'lng',case when loc_access.can_see_location then m.lng else null end,
    'location_visible',loc_access.can_see_location,'status',m.status,'created_at',m.created_at,'updated_at',m.updated_at,
    'series_id',m.series_id,'series_index',m.series_index,'series_total',m.series_total,
    'joined',exists(select 1 from public.meetup_participants mine where mine.meetup_id=m.id and mine.user_id=auth.uid()),
    'participant_count',coalesce(participants.participant_count,0),
    'people',coalesce(participants.people,'[]'::jsonb),'organizerName',coalesce(organizer.display_name,'')
  ) order by m.starts_at),'[]'::jsonb) into v_result
  from public.meetups m join public.communities c on c.id=m.community_id
  left join public.social_profiles organizer on organizer.user_id=m.organizer_id
  cross join lateral (select (m.organizer_id=auth.uid() or exists (
    select 1 from public.meetup_participants mine where mine.meetup_id=m.id and mine.user_id=auth.uid()
  )) as can_see_location) loc_access
  left join lateral (
    select
      (select count(*) from public.meetup_participants p where p.meetup_id=m.id) as participant_count,
      (select jsonb_agg(shown.person) from (
        select jsonb_build_object('user_id',p.user_id,'display_name',coalesce(sp.display_name,'—')) as person
        from public.meetup_participants p left join public.social_profiles sp on sp.user_id=p.user_id
        where p.meetup_id=m.id order by p.joined_at limit 12
      ) shown) as people
  ) participants on true
  where m.community_id=p_community and m.starts_at >= now()-interval '3 hours';
  return v_result;
end; $$;
revoke all on function public.list_community_meetups(uuid) from public, anon;
grant execute on function public.list_community_meetups(uuid) to authenticated;
