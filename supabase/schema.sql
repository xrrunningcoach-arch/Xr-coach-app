-- ============================================================================
-- XR RUNNING COACH — ESQUEMA DE BASE DE DATOS (Supabase / Postgres)
-- ============================================================================
-- Ejecuta este archivo entero en: Supabase Dashboard -> SQL Editor -> New query
-- Traduce la estructura del Excel "Plan_Entrenamiento_5K_11_Semanas" a tablas:
--   Dashboard y Mesociclos   -> athlete_profiles + mesocycles
--   Planificacion Detallada  -> sessions
--   Resumen y Progreso       -> se calcula en el frontend a partir de sessions
--   Zonas de Entrenamiento   -> hr_zones
--   Calendario y Objetivos   -> milestones
--   Control de Test y Marcas -> tests
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ----------------------------------------------------------------------------
-- CONFIGURACIÓN: emails que se convierten automáticamente en "entrenador"
-- ----------------------------------------------------------------------------
create table if not exists app_config (
  id int primary key default 1,
  coach_emails text[] not null default '{}',
  constraint singleton check (id = 1)
);
insert into app_config (id, coach_emails)
values (1, array['xr.running.coach@gmail.com'])
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- PERFILES (1:1 con auth.users)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'athlete' check (role in ('coach','athlete')),
  full_name text,
  email text,
  age int,
  coach_id uuid references profiles(id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Al crear un usuario en auth.users, se crea su fila en profiles automáticamente.
-- Si su email está en app_config.coach_emails -> role = 'coach'; si no -> 'athlete'
-- y se le asigna el primer entrenador existente como coach_id.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_is_coach boolean;
  v_default_coach uuid;
begin
  select (new.email = any(coach_emails)) into v_is_coach from app_config where id = 1;

  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    case when v_is_coach then 'coach' else 'athlete' end,
    new.raw_user_meta_data->>'full_name',
    new.email
  );

  if not v_is_coach then
    select id into v_default_coach from profiles where role = 'coach' order by created_at asc limit 1;
    update profiles set coach_id = v_default_coach where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ----------------------------------------------------------------------------
-- ANAMNESIS / PERFIL EXTENDIDO DEL ATLETA
-- ----------------------------------------------------------------------------
create table if not exists athlete_profiles (
  profile_id uuid primary key references profiles(id) on delete cascade,
  main_goal text,
  sport_history text,
  injury_history text,
  weekly_run_frequency text,
  weekly_strength_frequency text,
  resting_hr int,
  max_hr_real int,
  notes text,
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CATÁLOGO DE PRUEBAS (fijo + personalizadas creadas por el entrenador)
-- ----------------------------------------------------------------------------
create table if not exists races (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  distance_km numeric,
  is_custom boolean not null default false,
  created_by uuid references profiles(id)
);
insert into races (name, distance_km, is_custom)
select * from (values
  ('5K', 5, false),
  ('10K', 10, false),
  ('Media maratón', 21.1, false),
  ('Maratón', 42.2, false)
) as v(name, distance_km, is_custom)
where not exists (select 1 from races where races.name = v.name);

-- ----------------------------------------------------------------------------
-- PLANES DE ENTRENAMIENTO
-- ----------------------------------------------------------------------------
create table if not exists training_plans (
  id uuid primary key default uuid_generate_v4(),
  athlete_id uuid not null references profiles(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  race_id uuid references races(id),
  custom_race_name text,
  current_pace text,
  target_pace text,
  start_date date,
  race_date date,
  duration_weeks int not null,
  status text not null default 'draft' check (status in ('draft','active','completed')),
  created_at timestamptz not null default now()
);

-- Mesociclos (bloques del plan)
create table if not exists mesocycles (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  order_index int not null,
  name text,
  week_start int not null,
  week_end int not null,
  focus text,
  key_objective text
);

-- Sesiones (una fila = un entrenamiento, igual que "Planificacion Detallada")
create table if not exists sessions (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  mesocycle_id uuid references mesocycles(id) on delete set null,
  week_number int not null,
  day_number int not null,
  session_type text,
  description text,
  km_estimated numeric,
  rpe_theoretical text,
  status text not null default 'pendiente' check (status in ('pendiente','completado','saltado')),
  rpe_actual text,
  athlete_notes text,
  link_url text,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Valoración del entrenador sobre una sesión ya completada por el atleta
create table if not exists session_evaluations (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  rating int check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- Zonas de frecuencia cardíaca del plan
create table if not exists hr_zones (
  plan_id uuid primary key references training_plans(id) on delete cascade,
  age int,
  max_hr_real int,
  resting_hr int
);

-- Calendario de hitos (fin de mesociclo, día de carrera, etc.)
create table if not exists milestones (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  event_date date,
  title text,
  type text,
  week_ref text,
  notes text
);

-- Control de test y marcas
create table if not exists tests (
  id uuid primary key default uuid_generate_v4(),
  plan_id uuid not null references training_plans(id) on delete cascade,
  test_date date,
  block_label text,
  test_type text,
  distance text,
  result text,
  pace text,
  rpe_reached text,
  observations text
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles enable row level security;
alter table athlete_profiles enable row level security;
alter table races enable row level security;
alter table training_plans enable row level security;
alter table mesocycles enable row level security;
alter table sessions enable row level security;
alter table session_evaluations enable row level security;
alter table hr_zones enable row level security;
alter table milestones enable row level security;
alter table tests enable row level security;

create or replace function public.is_coach()
returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'coach');
$$ language sql security definer stable set search_path = public;

-- profiles
drop policy if exists "profiles_select" on profiles;
create policy "profiles_select" on profiles for select using (id = auth.uid() or is_coach());
drop policy if exists "profiles_update" on profiles;
create policy "profiles_update" on profiles for update using (id = auth.uid() or is_coach());

-- athlete_profiles (el propio atleta o el entrenador pueden ver/editar)
drop policy if exists "athlete_profiles_select" on athlete_profiles;
create policy "athlete_profiles_select" on athlete_profiles for select using (profile_id = auth.uid() or is_coach());
drop policy if exists "athlete_profiles_insert" on athlete_profiles;
create policy "athlete_profiles_insert" on athlete_profiles for insert with check (profile_id = auth.uid() or is_coach());
drop policy if exists "athlete_profiles_update" on athlete_profiles;
create policy "athlete_profiles_update" on athlete_profiles for update using (profile_id = auth.uid() or is_coach());

-- races
drop policy if exists "races_select" on races;
create policy "races_select" on races for select using (true);
drop policy if exists "races_insert" on races;
create policy "races_insert" on races for insert with check (is_coach());

-- training_plans (solo el entrenador crea/edita; el atleta solo ve el suyo)
drop policy if exists "plans_select" on training_plans;
create policy "plans_select" on training_plans for select using (athlete_id = auth.uid() or is_coach());
drop policy if exists "plans_insert" on training_plans;
create policy "plans_insert" on training_plans for insert with check (is_coach());
drop policy if exists "plans_update" on training_plans;
create policy "plans_update" on training_plans for update using (is_coach());
drop policy if exists "plans_delete" on training_plans;
create policy "plans_delete" on training_plans for delete using (is_coach());

-- mesocycles
drop policy if exists "meso_select" on mesocycles;
create policy "meso_select" on mesocycles for select using (
  is_coach() or exists (select 1 from training_plans p where p.id = plan_id and p.athlete_id = auth.uid())
);
drop policy if exists "meso_insert" on mesocycles;
create policy "meso_insert" on mesocycles for insert with check (is_coach());
drop policy if exists "meso_update" on mesocycles;
create policy "meso_update" on mesocycles for update using (is_coach());
drop policy if exists "meso_delete" on mesocycles;
create policy "meso_delete" on mesocycles for delete using (is_coach());

-- sessions: SELECT para dueño/entrenador. Solo el entrenador puede
-- INSERT/UPDATE/DELETE directo (crea y programa las sesiones).
-- El atleta actualiza SOLO estado/RPE real/notas/enlace a través de la
-- función submit_session() (más abajo), nunca tocando la fila directamente.
drop policy if exists "sessions_select" on sessions;
create policy "sessions_select" on sessions for select using (
  is_coach() or exists (select 1 from training_plans p where p.id = plan_id and p.athlete_id = auth.uid())
);
drop policy if exists "sessions_insert" on sessions;
create policy "sessions_insert" on sessions for insert with check (is_coach());
drop policy if exists "sessions_update" on sessions;
create policy "sessions_update" on sessions for update using (is_coach());
drop policy if exists "sessions_delete" on sessions;
create policy "sessions_delete" on sessions for delete using (is_coach());

-- session_evaluations
drop policy if exists "eval_select" on session_evaluations;
create policy "eval_select" on session_evaluations for select using (
  is_coach() or exists (
    select 1 from sessions s join training_plans p on p.id = s.plan_id
    where s.id = session_id and p.athlete_id = auth.uid()
  )
);
drop policy if exists "eval_insert" on session_evaluations;
create policy "eval_insert" on session_evaluations for insert with check (is_coach());
drop policy if exists "eval_update" on session_evaluations;
create policy "eval_update" on session_evaluations for update using (is_coach());

-- hr_zones
drop policy if exists "hrz_select" on hr_zones;
create policy "hrz_select" on hr_zones for select using (
  is_coach() or exists (select 1 from training_plans p where p.id = plan_id and p.athlete_id = auth.uid())
);
drop policy if exists "hrz_insert" on hr_zones;
create policy "hrz_insert" on hr_zones for insert with check (is_coach());
drop policy if exists "hrz_update" on hr_zones;
create policy "hrz_update" on hr_zones for update using (is_coach());

-- milestones
drop policy if exists "ms_select" on milestones;
create policy "ms_select" on milestones for select using (
  is_coach() or exists (select 1 from training_plans p where p.id = plan_id and p.athlete_id = auth.uid())
);
drop policy if exists "ms_insert" on milestones;
create policy "ms_insert" on milestones for insert with check (is_coach());
drop policy if exists "ms_update" on milestones;
create policy "ms_update" on milestones for update using (is_coach());
drop policy if exists "ms_delete" on milestones;
create policy "ms_delete" on milestones for delete using (is_coach());

-- tests
drop policy if exists "tests_select" on tests;
create policy "tests_select" on tests for select using (
  is_coach() or exists (select 1 from training_plans p where p.id = plan_id and p.athlete_id = auth.uid())
);
drop policy if exists "tests_insert" on tests;
create policy "tests_insert" on tests for insert with check (is_coach());
drop policy if exists "tests_update" on tests;
create policy "tests_update" on tests for update using (is_coach());
drop policy if exists "tests_delete" on tests;
create policy "tests_delete" on tests for delete using (is_coach());

-- ============================================================================
-- FUNCIÓN: el atleta "sube" su entrenamiento (estado, RPE real, notas, enlace)
-- sin poder tocar la descripción, los km o el RPE teórico que fijó el entrenador.
-- ============================================================================
create or replace function public.submit_session(
  p_session_id uuid,
  p_status text,
  p_rpe_actual text,
  p_notes text,
  p_link_url text
) returns void as $$
declare
  v_owner uuid;
begin
  select p.athlete_id into v_owner
  from sessions s join training_plans p on p.id = s.plan_id
  where s.id = p_session_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  if p_status not in ('pendiente','completado','saltado') then
    raise exception 'Estado no válido';
  end if;

  update sessions
  set status = p_status,
      rpe_actual = p_rpe_actual,
      athlete_notes = p_notes,
      link_url = p_link_url,
      completed_at = case when p_status = 'completado' then now() else null end,
      updated_at = now()
  where id = p_session_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.submit_session to authenticated;
