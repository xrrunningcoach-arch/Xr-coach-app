-- ============================================================================
-- 0012 · Quedadas: entrenar acompañado (prueba piloto: Orio, 20810)
-- ============================================================================
-- Ejecuta este archivo UNA VEZ en: Supabase -> SQL Editor -> New query
-- (primero en el proyecto de pruebas y después en el de producción).
-- Es idempotente. Requiere haber ejecutado 0001-0011 (usa is_admin() de 0008).
--
-- Qué añade:
--   1) communities: comunidades (pueblos). Orio (20810) viene creada.
--   2) social_profiles: perfil social con consentimiento (opt-in, 18+).
--   3) meeting_points: puntos de encuentro públicos de cada comunidad.
--   4) meetups + meetup_participants: las quedadas y quién se apunta.
--   5) join_meetup() / leave_meetup(): apuntarse con control de plazas.
--   6) meetup_reports: denuncias (las lee solo el administrador).
-- La tabla profiles NO se abre: los demás solo ven el «nombre visible».
-- ============================================================================

-- 1) COMUNIDADES ---------------------------------------------------------------
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  postal_code text check (postal_code is null or char_length(postal_code) <= 10),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.communities enable row level security;
drop policy if exists "communities_select" on public.communities;
create policy "communities_select" on public.communities
  for select using (auth.uid() is not null and is_active);
drop policy if exists "communities_write" on public.communities;
create policy "communities_write" on public.communities
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.communities from anon;
grant select, insert, update, delete on public.communities to authenticated;

insert into public.communities (slug, name, postal_code)
values ('orio', 'Orio', '20810')
on conflict (slug) do nothing;

-- 2) PERFIL SOCIAL (opt-in) ----------------------------------------------------
create table if not exists public.social_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id),
  display_name text not null check (char_length(btrim(display_name)) between 2 and 40),
  adult_confirmed boolean not null check (adult_confirmed),
  rules_version text not null check (char_length(rules_version) <= 20),
  consent_at timestamptz not null default now(),
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- Comunidad de quien consulta (null si no tiene perfil social activo).
create or replace function public.my_social_community()
returns uuid as $$
  select community_id from public.social_profiles where user_id = auth.uid() and is_active;
$$ language sql security definer stable set search_path = public;

revoke all on function public.my_social_community() from public, anon;
grant execute on function public.my_social_community() to authenticated;

alter table public.social_profiles enable row level security;
drop policy if exists "social_select" on public.social_profiles;
create policy "social_select" on public.social_profiles
  for select using (user_id = auth.uid() or (is_active and community_id = public.my_social_community()));
drop policy if exists "social_insert" on public.social_profiles;
create policy "social_insert" on public.social_profiles
  for insert with check (user_id = auth.uid());
drop policy if exists "social_update" on public.social_profiles;
create policy "social_update" on public.social_profiles
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "social_delete" on public.social_profiles;
create policy "social_delete" on public.social_profiles
  for delete using (user_id = auth.uid());

revoke all on public.social_profiles from anon;
grant select, insert, update, delete on public.social_profiles to authenticated;

-- 3) PUNTOS DE ENCUENTRO ---------------------------------------------------------
create table if not exists public.meeting_points (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 80),
  description text check (description is null or char_length(description) <= 300),
  lat numeric(9,6) not null check (lat between -90 and 90),
  lng numeric(9,6) not null check (lng between -180 and 180),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_points_community on public.meeting_points(community_id);

alter table public.meeting_points enable row level security;
drop policy if exists "points_select" on public.meeting_points;
create policy "points_select" on public.meeting_points
  for select using ((is_active and community_id = public.my_social_community()) or public.is_admin());
drop policy if exists "points_write" on public.meeting_points;
create policy "points_write" on public.meeting_points
  for all using (public.is_admin()) with check (public.is_admin());

revoke all on public.meeting_points from anon;
grant select, insert, update, delete on public.meeting_points to authenticated;

-- 4) QUEDADAS -----------------------------------------------------------------------
create table if not exists public.meetups (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.profiles(id) on delete cascade,
  community_id uuid not null references public.communities(id),
  meeting_point_id uuid references public.meeting_points(id) on delete set null,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  description text check (description is null or char_length(description) <= 1000),
  discipline_code text not null default 'running' check (discipline_code ~ '^[a-z_]{2,30}$'),
  starts_at timestamptz not null,
  duration_min int not null check (duration_min between 10 and 600),
  distance_km numeric(5,1) check (distance_km is null or distance_km between 0.1 and 500),
  pace_min_s_km int check (pace_min_s_km is null or pace_min_s_km between 120 and 1200),
  pace_max_s_km int check (pace_max_s_km is null or pace_max_s_km between 120 and 1200),
  level text not null default 'all' check (level in ('all','beginner','intermediate','advanced')),
  max_participants int not null default 8 check (max_participants between 2 and 50),
  place_name text not null check (char_length(btrim(place_name)) between 2 and 120),
  lat numeric(9,6) check (lat is null or lat between -90 and 90),
  lng numeric(9,6) check (lng is null or lng between -180 and 180),
  status text not null default 'open' check (status in ('open','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (pace_min_s_km is null or pace_max_s_km is null or pace_min_s_km <= pace_max_s_km),
  check ((lat is null) = (lng is null))
);
create index if not exists idx_meetups_community_start on public.meetups(community_id, starts_at);
create index if not exists idx_meetups_organizer on public.meetups(organizer_id);

create table if not exists public.meetup_participants (
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (meetup_id, user_id)
);
create index if not exists idx_meetup_participants_user on public.meetup_participants(user_id);

-- Antes de crear: futuro, máximo 90 días y máximo 5 quedadas activas por persona.
create or replace function public.trg_meetups_before_insert()
returns trigger as $$
declare
  v_active int;
begin
  if new.starts_at <= now() then
    raise exception 'La quedada debe ser en el futuro';
  end if;
  if new.starts_at > now() + interval '90 days' then
    raise exception 'Solo se pueden publicar quedadas de los próximos 90 días';
  end if;
  select count(*) into v_active from public.meetups
  where organizer_id = new.organizer_id and status = 'open' and starts_at > now();
  if v_active >= 5 then
    raise exception 'Ya tienes 5 quedadas activas: cancela alguna o espera a que pasen';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_meetup_before_insert on public.meetups;
create trigger on_meetup_before_insert
  before insert on public.meetups
  for each row execute procedure public.trg_meetups_before_insert();

-- El organizador queda apuntado automáticamente.
create or replace function public.trg_meetups_after_insert()
returns trigger as $$
begin
  insert into public.meetup_participants (meetup_id, user_id)
  values (new.id, new.organizer_id)
  on conflict do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_meetup_after_insert on public.meetups;
create trigger on_meetup_after_insert
  after insert on public.meetups
  for each row execute procedure public.trg_meetups_after_insert();

-- Al editar: las plazas no pueden quedar por debajo de los apuntados.
create or replace function public.trg_meetups_before_update()
returns trigger as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.meetup_participants where meetup_id = new.id;
  if new.max_participants < v_count then
    raise exception 'Hay % personas apuntadas: no puedes reducir las plazas por debajo', v_count;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_meetup_before_update on public.meetups;
create trigger on_meetup_before_update
  before update on public.meetups
  for each row execute procedure public.trg_meetups_before_update();

alter table public.meetups enable row level security;
drop policy if exists "meetups_select" on public.meetups;
create policy "meetups_select" on public.meetups
  for select using (
    community_id = public.my_social_community() or organizer_id = auth.uid() or public.is_admin()
  );
drop policy if exists "meetups_insert" on public.meetups;
create policy "meetups_insert" on public.meetups
  for insert with check (organizer_id = auth.uid() and community_id = public.my_social_community());
drop policy if exists "meetups_update" on public.meetups;
create policy "meetups_update" on public.meetups
  for update using (organizer_id = auth.uid() or public.is_admin())
  with check (organizer_id = auth.uid() or public.is_admin());
drop policy if exists "meetups_delete" on public.meetups;
create policy "meetups_delete" on public.meetups
  for delete using (organizer_id = auth.uid() or public.is_admin());

revoke all on public.meetups from anon;
revoke update on public.meetups from authenticated;
grant select, insert, delete on public.meetups to authenticated;
-- organizer_id y community_id no se pueden cambiar nunca.
grant update (meeting_point_id, title, description, discipline_code, starts_at, duration_min,
              distance_km, pace_min_s_km, pace_max_s_km, level, max_participants,
              place_name, lat, lng, status) on public.meetups to authenticated;

-- Participantes: solo se leen. Apuntarse y bajarse pasa por las funciones de abajo.
alter table public.meetup_participants enable row level security;
drop policy if exists "participants_select" on public.meetup_participants;
create policy "participants_select" on public.meetup_participants
  for select using (exists (select 1 from public.meetups m where m.id = meetup_id));

revoke all on public.meetup_participants from anon;
revoke all on public.meetup_participants from authenticated;
grant select on public.meetup_participants to authenticated;

-- 5) APUNTARSE / BAJARSE ---------------------------------------------------------
create or replace function public.join_meetup(p_meetup uuid)
returns void as $$
declare
  v_m public.meetups%rowtype;
  v_count int;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;

  select * into v_m from public.meetups where id = p_meetup for update;
  if not found then
    raise exception 'Quedada no encontrada';
  end if;
  if v_m.community_id is distinct from public.my_social_community() then
    raise exception 'No autorizado';
  end if;
  if v_m.status <> 'open' then
    raise exception 'La quedada está cancelada';
  end if;
  if v_m.starts_at <= now() then
    raise exception 'La quedada ya ha empezado';
  end if;

  if exists (select 1 from public.meetup_participants where meetup_id = p_meetup and user_id = auth.uid()) then
    return;
  end if;

  select count(*) into v_count from public.meetup_participants where meetup_id = p_meetup;
  if v_count >= v_m.max_participants then
    raise exception 'La quedada está completa';
  end if;

  insert into public.meetup_participants (meetup_id, user_id) values (p_meetup, auth.uid());
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.leave_meetup(p_meetup uuid)
returns void as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  select organizer_id into v_org from public.meetups where id = p_meetup;
  if v_org is null then
    raise exception 'Quedada no encontrada';
  end if;
  if v_org = auth.uid() then
    raise exception 'El organizador no puede bajarse: cancela la quedada';
  end if;
  delete from public.meetup_participants where meetup_id = p_meetup and user_id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.join_meetup(uuid), public.leave_meetup(uuid) from public, anon;
grant execute on function public.join_meetup(uuid), public.leave_meetup(uuid) to authenticated;

-- 6) DENUNCIAS -----------------------------------------------------------------------
create table if not exists public.meetup_reports (
  id uuid primary key default gen_random_uuid(),
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('spam','unsafe','inappropriate','other')),
  details text check (details is null or char_length(details) <= 500),
  created_at timestamptz not null default now(),
  unique (meetup_id, reporter_id)
);

alter table public.meetup_reports enable row level security;
drop policy if exists "reports_insert" on public.meetup_reports;
create policy "reports_insert" on public.meetup_reports
  for insert with check (
    reporter_id = auth.uid()
    and exists (select 1 from public.meetups m where m.id = meetup_id)
  );
drop policy if exists "reports_select" on public.meetup_reports;
create policy "reports_select" on public.meetup_reports
  for select using (reporter_id = auth.uid() or public.is_admin());

revoke all on public.meetup_reports from anon;
grant select, insert on public.meetup_reports to authenticated;

-- ============================================================================
-- PUNTOS DE ENCUENTRO DE ORIO (rellénalos tú; no se inventa ninguna ubicación)
-- En Google Maps: clic derecho sobre el sitio -> copiar coordenadas.
-- Ejecuta una vez por sitio (cambia nombre, descripción y coordenadas):
--
--   insert into public.meeting_points (community_id, name, description, lat, lng)
--   select id, 'NOMBRE DEL SITIO', 'Cómo reconocerlo / dónde exactamente', 43.000000, -2.000000
--   from public.communities where slug = 'orio';
--
-- COMPROBACIONES
--   select slug, name, postal_code from public.communities;
--   select name, lat, lng from public.meeting_points order by name;
--   select has_function_privilege('anon', 'public.join_meetup(uuid)', 'execute'); -- false
-- ============================================================================
