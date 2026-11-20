-- 0013 · Descubrimiento compatible y ubicación privada por participación.
-- La lista solo incluye la ubicación aproximada. El punto exacto se devuelve
-- mediante RPC cuando la persona organiza la quedada o ya está apuntada.

create or replace function public.list_community_meetups(p_community uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_community uuid;
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  v_community := public.my_social_community();
  if v_community is null or v_community is distinct from p_community then
    raise exception 'No autorizado';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'organizer_id', m.organizer_id,
        'community_id', m.community_id,
        'meeting_point_id', m.meeting_point_id,
        'title', m.title,
        'description', m.description,
        'discipline_code', m.discipline_code,
        'starts_at', m.starts_at,
        'duration_min', m.duration_min,
        'distance_km', m.distance_km,
        'pace_min_s_km', m.pace_min_s_km,
        'pace_max_s_km', m.pace_max_s_km,
        'level', m.level,
        'max_participants', m.max_participants,
        'place_name', case when loc_access.can_see_location then m.place_name else c.name end,
        'exact_place_name', case when loc_access.can_see_location then m.place_name else null end,
        'lat', case when loc_access.can_see_location then m.lat else null end,
        'lng', case when loc_access.can_see_location then m.lng else null end,
        'location_visible', loc_access.can_see_location,
        'status', m.status,
        'created_at', m.created_at,
        'updated_at', m.updated_at,
        'people', coalesce(participants.people, '[]'::jsonb),
        'organizerName', coalesce(organizer.display_name, '')
      ) order by m.starts_at
    ), '[]'::jsonb
  ) into v_result
  from public.meetups m
  join public.communities c on c.id = m.community_id
  left join public.social_profiles organizer on organizer.user_id = m.organizer_id
  cross join lateral (
    select (m.organizer_id = auth.uid() or exists (
      select 1 from public.meetup_participants mine
      where mine.meetup_id = m.id and mine.user_id = auth.uid()
    )) as can_see_location
  ) loc_access
  left join lateral (
    select jsonb_agg(
      jsonb_build_object('user_id', p.user_id, 'display_name', coalesce(sp.display_name, '—'))
      order by p.joined_at
    ) as people
    from public.meetup_participants p
    left join public.social_profiles sp on sp.user_id = p.user_id
    where p.meetup_id = m.id
  ) participants on true
  where m.community_id = p_community
    and m.starts_at >= now() - interval '3 hours';

  return v_result;
end;
$$;

revoke all on function public.list_community_meetups(uuid) from public, anon;
grant execute on function public.list_community_meetups(uuid) to authenticated;

-- Las políticas existentes necesitan comprobar que la quedada existe. Esta
-- función evita que esas comprobaciones dependan del SELECT directo revocado.
create or replace function public.meetup_is_in_my_community(p_meetup uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from public.meetups m
    where m.id = p_meetup and m.community_id = public.my_social_community()
  );
$$;

revoke all on function public.meetup_is_in_my_community(uuid) from public, anon;
grant execute on function public.meetup_is_in_my_community(uuid) to authenticated;

drop policy if exists "participants_select" on public.meetup_participants;
create policy "participants_select" on public.meetup_participants
  for select using (public.meetup_is_in_my_community(meetup_id));

drop policy if exists "reports_insert" on public.meetup_reports;
create policy "reports_insert" on public.meetup_reports
  for insert with check (
    reporter_id = auth.uid()
    and public.meetup_is_in_my_community(meetup_id)
  );

-- Evita saltarse la ubicación aproximada consultando directamente la tabla.
-- Las altas, bajas y cancelaciones usan sus permisos/RPC propios.
revoke select on public.meetups from authenticated;
-- IDs y organizador bastan para que el organizador pueda cancelar; no concede
-- acceso a nombre del lugar ni coordenadas.
grant select (id, organizer_id) on public.meetups to authenticated;

