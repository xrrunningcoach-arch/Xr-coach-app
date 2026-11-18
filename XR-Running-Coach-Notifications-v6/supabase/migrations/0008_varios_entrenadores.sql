-- ============================================================================
-- 0008 · Varios entrenadores
-- ============================================================================
-- · Cualquiera puede pedir el alta como entrenador, pero NO entra hasta que
--   el administrador (correo en app_config.coach_emails) lo aprueba.
-- · Cada entrenador ve y gestiona SOLO a sus atletas (profiles.coach_id) y
--   su propia biblioteca. El atleta elige entrenador al registrarse.
-- · Nombre y apellido en columnas propias.
-- Idempotente: se puede ejecutar más de una vez.
-- ============================================================================

-- 1) COLUMNAS ------------------------------------------------------------------
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text;

-- coach_approved: los entrenadores YA existentes quedan aprobados una sola vez
-- (si se repite la migración no se aprueba a nadie más).
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'profiles' and column_name = 'coach_approved') then
    alter table public.profiles add column coach_approved boolean not null default false;
    update public.profiles set coach_approved = true where role = 'coach';
    -- Atletas sin entrenador pasan al primer entrenador.
    update public.profiles
    set coach_id = (select id from public.profiles where role = 'coach' order by created_at limit 1)
    where role = 'athlete' and coach_id is null;
  end if;
end $$;

revoke update on public.profiles from anon, authenticated;
grant update (full_name, first_name, last_name, age) on public.profiles to authenticated;

-- 2) FUNCIONES DE PERMISO ------------------------------------------------------
-- is_coach(): entrenador APROBADO. (Antes bastaba role = 'coach'.)
create or replace function public.is_coach()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach' and coach_approved);
$$ language sql security definer stable set search_path = public;

create or replace function public.is_admin()
returns boolean as $$
  select public.is_coach() and exists (
    select 1 from public.profiles p, public.app_config c
    where p.id = auth.uid() and c.id = 1 and p.email = any(c.coach_emails)
  );
$$ language sql security definer stable set search_path = public;

-- ¿Este atleta es MÍO (soy entrenador aprobado y es mi atleta)?
create or replace function public.my_athlete(p_athlete uuid)
returns boolean as $$
  select public.is_coach() and exists (
    select 1 from public.profiles
    where id = p_athlete and role = 'athlete' and coach_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create or replace function public.my_plan(p_plan uuid)
returns boolean as $$
  select public.is_coach() and exists (
    select 1 from public.training_plans tp
    join public.profiles a on a.id = tp.athlete_id
    where tp.id = p_plan and a.role = 'athlete' and a.coach_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

create or replace function public.my_session(p_session uuid)
returns boolean as $$
  select public.is_coach() and exists (
    select 1 from public.sessions s
    join public.training_plans tp on tp.id = s.plan_id
    join public.profiles a on a.id = tp.athlete_id
    where s.id = p_session and a.role = 'athlete' and a.coach_id = auth.uid()
  );
$$ language sql security definer stable set search_path = public;

revoke all on function public.is_admin(), public.my_athlete(uuid), public.my_plan(uuid), public.my_session(uuid) from public, anon;
grant execute on function public.is_admin(), public.my_athlete(uuid), public.my_plan(uuid), public.my_session(uuid) to authenticated;

-- 3) POLÍTICAS (RLS) -----------------------------------------------------------

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select
  using (id = auth.uid() or public.my_athlete(id));

drop policy if exists "profiles_update_coach" on public.profiles;
create policy "profiles_update_coach" on public.profiles for update
  using (public.my_athlete(id))
  with check (public.my_athlete(id));

drop policy if exists "anamnesis_select" on public.anamnesis;
create policy "anamnesis_select" on public.anamnesis for select
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "anamnesis_insert" on public.anamnesis;
create policy "anamnesis_insert" on public.anamnesis for insert
  with check (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "anamnesis_update" on public.anamnesis;
create policy "anamnesis_update" on public.anamnesis for update
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id))
  with check (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "ahz_select" on public.athlete_hr_zones;
create policy "ahz_select" on public.athlete_hr_zones for select
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "ahz_insert" on public.athlete_hr_zones;
create policy "ahz_insert" on public.athlete_hr_zones for insert
  with check (public.my_athlete(athlete_id));

drop policy if exists "ahz_update" on public.athlete_hr_zones;
create policy "ahz_update" on public.athlete_hr_zones for update
  using (public.my_athlete(athlete_id))
  with check (public.my_athlete(athlete_id));

drop policy if exists "ahz_delete" on public.athlete_hr_zones;
create policy "ahz_delete" on public.athlete_hr_zones for delete
  using (public.my_athlete(athlete_id));

drop policy if exists "athlete_profiles_select" on public.athlete_profiles;
create policy "athlete_profiles_select" on public.athlete_profiles for select
  using (profile_id = auth.uid() or public.my_athlete(profile_id));

drop policy if exists "athlete_profiles_insert" on public.athlete_profiles;
create policy "athlete_profiles_insert" on public.athlete_profiles for insert
  with check (profile_id = auth.uid() or public.my_athlete(profile_id));

drop policy if exists "athlete_profiles_update" on public.athlete_profiles;
create policy "athlete_profiles_update" on public.athlete_profiles for update
  using (profile_id = auth.uid() or public.my_athlete(profile_id))
  with check (profile_id = auth.uid() or public.my_athlete(profile_id));

drop policy if exists "hrv_select" on public.hrv_readings;
create policy "hrv_select" on public.hrv_readings for select
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages for select
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert
  with check (sender_id = auth.uid() and (athlete_id = auth.uid() or public.my_athlete(athlete_id)));

drop policy if exists "messages_mark_read" on public.messages;
create policy "messages_mark_read" on public.messages for update
  using ((athlete_id = auth.uid() and sender_id <> auth.uid()) or (public.my_athlete(athlete_id) and sender_id = athlete_id));

drop policy if exists "tt_select" on public.threshold_tests;
create policy "tt_select" on public.threshold_tests for select
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "tt_insert" on public.threshold_tests;
create policy "tt_insert" on public.threshold_tests for insert
  with check (public.my_athlete(athlete_id));

drop policy if exists "tt_update" on public.threshold_tests;
create policy "tt_update" on public.threshold_tests for update
  using (public.my_athlete(athlete_id))
  with check (public.my_athlete(athlete_id));

drop policy if exists "tt_delete" on public.threshold_tests;
create policy "tt_delete" on public.threshold_tests for delete
  using (public.my_athlete(athlete_id));

drop policy if exists "plans_select" on public.training_plans;
create policy "plans_select" on public.training_plans for select
  using (athlete_id = auth.uid() or public.my_athlete(athlete_id));

drop policy if exists "plans_insert" on public.training_plans;
create policy "plans_insert" on public.training_plans for insert
  with check (public.my_athlete(athlete_id));

drop policy if exists "plans_update" on public.training_plans;
create policy "plans_update" on public.training_plans for update
  using (public.my_athlete(athlete_id))
  with check (public.my_athlete(athlete_id));

drop policy if exists "plans_delete" on public.training_plans;
create policy "plans_delete" on public.training_plans for delete
  using (public.my_athlete(athlete_id));

drop policy if exists "hrz_select" on public.hr_zones;
create policy "hrz_select" on public.hr_zones for select
  using (public.my_plan(plan_id) or exists (select 1 from public.training_plans p where p.id = hr_zones.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "hrz_insert" on public.hr_zones;
create policy "hrz_insert" on public.hr_zones for insert
  with check (public.my_plan(plan_id));

drop policy if exists "hrz_update" on public.hr_zones;
create policy "hrz_update" on public.hr_zones for update
  using (public.my_plan(plan_id))
  with check (public.my_plan(plan_id));

drop policy if exists "macro_select" on public.macrocycles;
create policy "macro_select" on public.macrocycles for select
  using (public.my_plan(plan_id) or exists (select 1 from public.training_plans p where p.id = macrocycles.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "macro_insert" on public.macrocycles;
create policy "macro_insert" on public.macrocycles for insert
  with check (public.my_plan(plan_id));

drop policy if exists "macro_update" on public.macrocycles;
create policy "macro_update" on public.macrocycles for update
  using (public.my_plan(plan_id))
  with check (public.my_plan(plan_id));

drop policy if exists "macro_delete" on public.macrocycles;
create policy "macro_delete" on public.macrocycles for delete
  using (public.my_plan(plan_id));

drop policy if exists "meso_select" on public.mesocycles;
create policy "meso_select" on public.mesocycles for select
  using (public.my_plan(plan_id) or exists (select 1 from public.training_plans p where p.id = mesocycles.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "meso_insert" on public.mesocycles;
create policy "meso_insert" on public.mesocycles for insert
  with check (public.my_plan(plan_id));

drop policy if exists "meso_update" on public.mesocycles;
create policy "meso_update" on public.mesocycles for update
  using (public.my_plan(plan_id))
  with check (public.my_plan(plan_id));

drop policy if exists "meso_delete" on public.mesocycles;
create policy "meso_delete" on public.mesocycles for delete
  using (public.my_plan(plan_id));

drop policy if exists "ms_select" on public.milestones;
create policy "ms_select" on public.milestones for select
  using (public.my_plan(plan_id) or exists (select 1 from public.training_plans p where p.id = milestones.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "ms_insert" on public.milestones;
create policy "ms_insert" on public.milestones for insert
  with check (public.my_plan(plan_id));

drop policy if exists "ms_update" on public.milestones;
create policy "ms_update" on public.milestones for update
  using (public.my_plan(plan_id))
  with check (public.my_plan(plan_id));

drop policy if exists "ms_delete" on public.milestones;
create policy "ms_delete" on public.milestones for delete
  using (public.my_plan(plan_id));

drop policy if exists "tests_select" on public.tests;
create policy "tests_select" on public.tests for select
  using (public.my_plan(plan_id) or exists (select 1 from public.training_plans p where p.id = tests.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "tests_insert" on public.tests;
create policy "tests_insert" on public.tests for insert
  with check (public.my_plan(plan_id));

drop policy if exists "tests_update" on public.tests;
create policy "tests_update" on public.tests for update
  using (public.my_plan(plan_id))
  with check (public.my_plan(plan_id));

drop policy if exists "tests_delete" on public.tests;
create policy "tests_delete" on public.tests for delete
  using (public.my_plan(plan_id));

drop policy if exists "sessions_select" on public.sessions;
create policy "sessions_select" on public.sessions for select
  using (public.my_plan(plan_id) or exists (select 1 from public.training_plans p where p.id = sessions.plan_id and p.athlete_id = auth.uid()));

drop policy if exists "sessions_insert" on public.sessions;
create policy "sessions_insert" on public.sessions for insert
  with check (public.my_plan(plan_id));

drop policy if exists "sessions_update" on public.sessions;
create policy "sessions_update" on public.sessions for update
  using (public.my_plan(plan_id))
  with check (public.my_plan(plan_id));

drop policy if exists "sessions_delete" on public.sessions;
create policy "sessions_delete" on public.sessions for delete
  using (public.my_plan(plan_id));

drop policy if exists "eval_select" on public.session_evaluations;
create policy "eval_select" on public.session_evaluations for select
  using (public.my_session(session_id) or exists (select 1 from public.sessions s join public.training_plans p on p.id = s.plan_id where s.id = session_evaluations.session_id and p.athlete_id = auth.uid()));

drop policy if exists "eval_insert" on public.session_evaluations;
create policy "eval_insert" on public.session_evaluations for insert
  with check (public.my_session(session_id));

drop policy if exists "eval_update" on public.session_evaluations;
create policy "eval_update" on public.session_evaluations for update
  using (public.my_session(session_id))
  with check (public.my_session(session_id));

drop policy if exists "session_exercises_select" on public.session_exercises;
create policy "session_exercises_select" on public.session_exercises for select
  using (public.my_session(session_id) or exists (select 1 from public.sessions s join public.training_plans p on p.id = s.plan_id where s.id = session_exercises.session_id and p.athlete_id = auth.uid()));

drop policy if exists "session_exercises_write" on public.session_exercises;
create policy "session_exercises_write" on public.session_exercises for all
  using (public.my_session(session_id))
  with check (public.my_session(session_id));

drop policy if exists "disciplines_write" on public.disciplines;
create policy "disciplines_write" on public.disciplines for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "invite_select" on public.invite_codes;
create policy "invite_select" on public.invite_codes for select
  using (public.is_coach() and created_by = auth.uid());

drop policy if exists "invite_update" on public.invite_codes;
create policy "invite_update" on public.invite_codes for update
  using (public.is_coach() and created_by = auth.uid())
  with check (public.is_coach() and created_by = auth.uid());

drop policy if exists "invite_delete" on public.invite_codes;
create policy "invite_delete" on public.invite_codes for delete
  using (public.is_coach() and created_by = auth.uid());

-- 4) FUNCIONES QUE ACTÚAN SOBRE UN ATLETA ---------------------------------------

CREATE OR REPLACE FUNCTION public.set_athlete_active(p_athlete_id uuid, p_active boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.my_athlete(p_athlete_id) then
    raise exception 'No autorizado';
  end if;

  update public.profiles
  set is_active = p_active
  where id = p_athlete_id and role = 'athlete';

  if not found then
    raise exception 'Atleta no encontrado';
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_athlete(p_athlete_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.my_athlete(p_athlete_id) then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_athlete_id and role = 'athlete' and is_active = false
  ) then
    raise exception 'Solo se puede eliminar a un atleta que esté archivado';
  end if;

  delete from auth.users where id = p_athlete_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.apply_template_application(p_athlete_id uuid, p_application jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_plan_in jsonb := p_application->'plan';
  v_plan_id uuid;
  v_plan_start date;
  v_plan_weeks int;
  v_macro_id uuid;
  v_meso jsonb;
  v_meso_ids jsonb := '{}'::jsonb;
  v_new_id uuid;
  v_item jsonb;
  v_sess jsonb;
  v_session_id uuid;
  v_meso_ref uuid;
  v_ex jsonb;
  v_count int := 0;
begin
  if not public.my_athlete(p_athlete_id) then
    raise exception 'No autorizado';
  end if;

  if not exists (select 1 from public.profiles where id = p_athlete_id and role = 'athlete') then
    raise exception 'Atleta no encontrado';
  end if;

  if p_application is null or jsonb_typeof(p_application) <> 'object' or v_plan_in is null then
    raise exception 'Datos de plantilla no válidos';
  end if;

  if jsonb_array_length(coalesce(p_application->'sessions', '[]'::jsonb)) > 600
     or jsonb_array_length(coalesce(p_application->'mesocycles', '[]'::jsonb)) > 40 then
    raise exception 'La plantilla es demasiado grande';
  end if;

  -- Plan: se reutiliza el existente (del propio atleta) o se crea uno nuevo.
  if nullif(v_plan_in->>'id', '') is not null then
    v_plan_id := (v_plan_in->>'id')::uuid;
    select start_date, duration_weeks into v_plan_start, v_plan_weeks
    from public.training_plans where id = v_plan_id and athlete_id = p_athlete_id;
    if not found then
      raise exception 'El plan no pertenece a este atleta';
    end if;
    update public.training_plans
    set start_date = coalesce(start_date, nullif(v_plan_in->>'start_date', '')::date),
        duration_weeks = greatest(duration_weeks, coalesce((v_plan_in->>'duration_weeks')::int, duration_weeks))
    where id = v_plan_id;
  else
    insert into public.training_plans (athlete_id, coach_id, custom_race_name, start_date, duration_weeks, status)
    values (
      p_athlete_id, auth.uid(),
      left(coalesce(v_plan_in->>'custom_race_name', 'Plan'), 200),
      nullif(v_plan_in->>'start_date', '')::date,
      greatest(1, coalesce((v_plan_in->>'duration_weeks')::int, 1)),
      'active'
    ) returning id into v_plan_id;
  end if;

  -- Macrociclo: uno nuevo o uno ya existente de ESE plan.
  if p_application->'macrocycle' is not null and jsonb_typeof(p_application->'macrocycle') = 'object' then
    v_item := p_application->'macrocycle';
    insert into public.macrocycles (plan_id, order_index, name, objective, start_date, end_date)
    values (
      v_plan_id,
      coalesce((v_item->>'order_index')::int, 1),
      left(coalesce(v_item->>'name', 'Macrociclo'), 200),
      nullif(v_item->>'objective', ''),
      nullif(v_item->>'start_date', '')::date,
      nullif(v_item->>'end_date', '')::date
    ) returning id into v_macro_id;
  elsif nullif(p_application->>'use_macro_id', '') is not null then
    v_macro_id := (p_application->>'use_macro_id')::uuid;
    if not exists (select 1 from public.macrocycles where id = v_macro_id and plan_id = v_plan_id) then
      raise exception 'El macrociclo no pertenece al plan';
    end if;
  end if;

  -- Mesociclos
  for v_meso in select * from jsonb_array_elements(coalesce(p_application->'mesocycles', '[]'::jsonb)) loop
    insert into public.mesocycles (
      plan_id, macrocycle_id, order_index, name, focus, key_objective,
      week_start, week_end, start_date, end_date
    ) values (
      v_plan_id, v_macro_id,
      (v_meso->>'order_index')::int,
      left(coalesce(v_meso->>'name', 'Mesociclo'), 200),
      nullif(v_meso->>'focus', ''),
      nullif(v_meso->>'key_objective', ''),
      (v_meso->>'week_start')::int,
      (v_meso->>'week_end')::int,
      nullif(v_meso->>'start_date', '')::date,
      nullif(v_meso->>'end_date', '')::date
    ) returning id into v_new_id;
    v_meso_ids := v_meso_ids || jsonb_build_object(v_meso->>'key', v_new_id);
  end loop;

  -- Sesiones (+ ejercicios de fuerza)
  for v_sess in select * from jsonb_array_elements(coalesce(p_application->'sessions', '[]'::jsonb)) loop
    v_item := v_sess->'session';
    v_meso_ref := null;
    if nullif(v_sess->>'meso_key', '') is not null then
      v_meso_ref := (v_meso_ids->>(v_sess->>'meso_key'))::uuid;
    elsif nullif(v_sess->>'meso_id', '') is not null then
      v_meso_ref := (v_sess->>'meso_id')::uuid;
      if not exists (select 1 from public.mesocycles where id = v_meso_ref and plan_id = v_plan_id) then
        raise exception 'El mesociclo no pertenece al plan';
      end if;
    end if;

    insert into public.sessions (
      plan_id, mesocycle_id, week_number, day_number, session_date, discipline_id,
      session_type, description, km_estimated, duration_planned_min,
      rpe_theoretical, metrics, status
    ) values (
      v_plan_id, v_meso_ref,
      (v_item->>'week_number')::int,
      (v_item->>'day_number')::int,
      nullif(v_item->>'session_date', '')::date,
      nullif(v_item->>'discipline_id', '')::uuid,
      coalesce(v_item->>'session_type', ''),
      coalesce(v_item->>'description', ''),
      nullif(v_item->>'km_estimated', '')::numeric,
      nullif(v_item->>'duration_planned_min', '')::numeric,
      coalesce(v_item->>'rpe_theoretical', ''),
      coalesce(v_item->'metrics', '{}'::jsonb),
      'pendiente'
    ) returning id into v_session_id;
    v_count := v_count + 1;

    for v_ex in select * from jsonb_array_elements(coalesce(v_sess->'exercises', '[]'::jsonb)) loop
      insert into public.session_exercises (session_id, order_index, exercise_name, sets, reps, load_kg, rpe_set)
      values (
        v_session_id,
        coalesce((v_ex->>'order_index')::int, 1),
        left(v_ex->>'exercise_name', 200),
        nullif(v_ex->>'sets', '')::int,
        nullif(v_ex->>'reps', '')::int,
        nullif(v_ex->>'load_kg', '')::numeric,
        nullif(v_ex->>'rpe_set', '')
      );
    end loop;
  end loop;

  return jsonb_build_object('plan_id', v_plan_id, 'sessions', v_count);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_invite_required(p_required boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  update public.app_config set require_invite_code = p_required where id = 1;
  if not found then
    raise exception 'Falta la fila de app_config (ver schema.sql)';
  end if;
end;
$function$;


-- 5) ALTA DE USUARIOS ----------------------------------------------------------------
-- metadata del registro: role ('athlete'|'coach'), first_name, last_name, coach_id
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_is_admin boolean;
  v_required boolean;
  v_role text;
  v_code text;
  v_coach uuid;
  v_first text := left(btrim(coalesce(new.raw_user_meta_data->>'first_name', '')), 80);
  v_last text := left(btrim(coalesce(new.raw_user_meta_data->>'last_name', '')), 80);
  v_full text;
begin
  select (new.email = any(coach_emails)), require_invite_code
    into v_is_admin, v_required
  from app_config where id = 1;

  v_role := case
    when coalesce(v_is_admin, false) then 'coach'
    when new.raw_user_meta_data->>'role' = 'coach' then 'coach'
    else 'athlete' end;

  v_full := nullif(btrim(v_first || ' ' || v_last), '');
  if v_full is null then
    v_full := left(new.raw_user_meta_data->>'full_name', 200);
  end if;

  -- Código de invitación: solo para atletas (los entrenadores pasan por aprobación).
  if v_role = 'athlete' and coalesce(v_required, false) then
    v_code := upper(btrim(coalesce(new.raw_user_meta_data->>'invite_code', '')));
    update public.invite_codes
    set uses = uses + 1
    where code = v_code
      and is_active
      and uses < max_uses
      and (expires_at is null or expires_at > now());
    if not found then
      raise exception 'Código de invitación no válido';
    end if;
  end if;

  if v_role = 'athlete' then
    begin
      v_coach := nullif(new.raw_user_meta_data->>'coach_id', '')::uuid;
    exception when others then
      v_coach := null;
    end;
    if v_coach is null or not exists (
      select 1 from public.profiles where id = v_coach and role = 'coach' and coach_approved
    ) then
      select id into v_coach from public.profiles
      where role = 'coach' and coach_approved order by created_at asc limit 1;
    end if;
  end if;

  insert into public.profiles (id, role, full_name, first_name, last_name, email, coach_id, coach_approved)
  values (
    new.id, v_role, v_full, nullif(v_first, ''), nullif(v_last, ''), new.email,
    case when v_role = 'athlete' then v_coach end,
    coalesce(v_is_admin, false)
  );
  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- 6) RPC: entrenadores disponibles, aprobación, cambio de entrenador --------------
-- Lista PÚBLICA (solo nombres) para elegir entrenador en el registro.
create or replace function public.list_coaches()
returns table (id uuid, full_name text) as $$
  select p.id, coalesce(p.full_name, 'Entrenador') from public.profiles p
  where p.role = 'coach' and p.coach_approved order by p.full_name;
$$ language sql security definer stable set search_path = public;
revoke all on function public.list_coaches() from public;
grant execute on function public.list_coaches() to anon, authenticated;

create or replace function public.list_pending_coaches()
returns table (id uuid, full_name text, email text, created_at timestamptz) as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  return query select p.id, p.full_name, p.email, p.created_at from public.profiles p
    where p.role = 'coach' and not p.coach_approved order by p.created_at;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.approve_coach(p_coach uuid, p_approve boolean)
returns void as $$
begin
  if not public.is_admin() then raise exception 'No autorizado'; end if;
  if not exists (select 1 from public.profiles where id = p_coach and role = 'coach' and not coach_approved) then
    raise exception 'Solicitud no encontrada';
  end if;
  if p_approve then
    update public.profiles set coach_approved = true where id = p_coach;
  else
    delete from auth.users where id = p_coach;  -- rechazada: se elimina la cuenta
  end if;
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.is_admin_user()
returns boolean as $$ select public.is_admin(); $$ language sql security definer stable set search_path = public;

-- El atleta cambia de entrenador (solo entre entrenadores aprobados).
create or replace function public.choose_coach(p_coach uuid)
returns void as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'athlete') then
    raise exception 'No autorizado';
  end if;
  if not exists (select 1 from public.profiles where id = p_coach and role = 'coach' and coach_approved) then
    raise exception 'Entrenador no válido';
  end if;
  update public.profiles set coach_id = p_coach where id = auth.uid();
end;
$$ language plpgsql security definer set search_path = public;

create or replace function public.my_coach()
returns table (id uuid, full_name text) as $$
  select c.id, c.full_name from public.profiles a join public.profiles c on c.id = a.coach_id
  where a.id = auth.uid();
$$ language sql security definer stable set search_path = public;

revoke all on function public.list_pending_coaches(), public.approve_coach(uuid, boolean), public.is_admin_user(),
  public.choose_coach(uuid), public.my_coach() from public, anon;
grant execute on function public.list_pending_coaches(), public.approve_coach(uuid, boolean), public.is_admin_user(),
  public.choose_coach(uuid), public.my_coach() to authenticated;

-- COMPROBACIONES
-- select public.list_coaches();
-- select * from public.profiles where role = 'coach';
