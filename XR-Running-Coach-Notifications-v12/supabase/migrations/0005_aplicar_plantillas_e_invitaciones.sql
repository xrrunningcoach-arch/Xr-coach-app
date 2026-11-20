-- ============================================================================
-- MIGRACIÓN 0005 — Aplicar plantillas de forma atómica + códigos de invitación
-- ============================================================================
-- Ejecuta este archivo UNA VEZ en: Supabase -> SQL Editor -> New query.
-- Se puede repetir sin romper nada. Requiere haber ejecutado 0001-0004.
--
-- Qué añade:
--   1) apply_template_application(): crea plan/macrociclo/mesociclos/sesiones/
--      ejercicios en UNA transacción. Si algo falla, no queda nada a medias
--      (antes el navegador tenía que "deshacer a mano").
--   2) Códigos de invitación para el registro de atletas (opcional, apagado
--      por defecto: no cambia nada hasta que lo actives desde el panel).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) REPARACIÓN: dejar una sola versión de submit_session
-- ----------------------------------------------------------------------------
-- La migración 0002 añadía una versión con más parámetros sin borrar la
-- antigua (quedaban dos funciones con el mismo nombre). La app usa siempre la
-- nueva. Si ya está todo bien, este bloque no hace nada.
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'submit_session' and p.pronargs = 8
  ) then
    drop function if exists public.submit_session(uuid, text, text, text, text);
    grant execute on function public.submit_session(uuid, text, text, text, text, numeric, numeric, jsonb) to authenticated;
  end if;
end $$;

-- ----------------------------------------------------------------------------
-- 1) APLICAR PLANTILLA (atómico)
-- ----------------------------------------------------------------------------
-- p_application (jsonb) lo calcula la app (src/lib/templates.js):
--   { "plan": { "id": uuid|null, "custom_race_name": text, "start_date": date,
--               "duration_weeks": int },
--     "macrocycle": { order_index, name, objective, start_date, end_date } | null,
--     "use_macro_id": uuid | null,
--     "mesocycles": [ { key, order_index, name, focus, key_objective,
--                       week_start, week_end, start_date, end_date } ],
--     "sessions": [ { "session": {...columnas de sessions...},
--                     "exercises": [ {order_index, exercise_name, sets, reps,
--                                     load_kg, rpe_set} ],
--                     "meso_key": text|null, "meso_id": uuid|null } ] }
create or replace function public.apply_template_application(
  p_athlete_id uuid,
  p_application jsonb
) returns jsonb as $$
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
  if not public.is_coach() then
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
$$ language plpgsql security definer set search_path = public;

revoke all on function public.apply_template_application(uuid, jsonb) from public, anon;
grant execute on function public.apply_template_application(uuid, jsonb) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) CÓDIGOS DE INVITACIÓN
-- ----------------------------------------------------------------------------
alter table public.app_config
  add column if not exists require_invite_code boolean not null default false;

create table if not exists public.invite_codes (
  code text primary key check (code = upper(code) and char_length(code) between 6 and 40),
  note text,
  max_uses int not null default 1 check (max_uses > 0),
  uses int not null default 0 check (uses >= 0),
  expires_at timestamptz,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;

drop policy if exists "invite_select" on public.invite_codes;
create policy "invite_select" on public.invite_codes for select using (public.is_coach());
drop policy if exists "invite_update" on public.invite_codes;
create policy "invite_update" on public.invite_codes for update
  using (public.is_coach()) with check (public.is_coach());
drop policy if exists "invite_delete" on public.invite_codes;
create policy "invite_delete" on public.invite_codes for delete using (public.is_coach());

revoke all on public.invite_codes from anon;
revoke insert, update on public.invite_codes from authenticated;
grant select, delete on public.invite_codes to authenticated;
grant update (is_active, note) on public.invite_codes to authenticated;

-- ¿El registro exige código? (lo puede consultar la pantalla de registro)
create or replace function public.invite_required()
returns boolean as $$
  select coalesce((select require_invite_code from public.app_config where id = 1), false);
$$ language sql stable security definer set search_path = public;

revoke all on function public.invite_required() from public;
grant execute on function public.invite_required() to anon, authenticated;

-- ¿Es válido este código? (la comprobación DEFINITIVA la hace el trigger)
create or replace function public.check_invite_code(p_code text)
returns boolean as $$
  select exists (
    select 1 from public.invite_codes
    where code = upper(btrim(coalesce(p_code, '')))
      and is_active
      and uses < max_uses
      and (expires_at is null or expires_at > now())
  );
$$ language sql stable security definer set search_path = public;

revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- Activar / desactivar la exigencia de código (solo entrenador).
create or replace function public.set_invite_required(p_required boolean)
returns void as $$
begin
  if not public.is_coach() then
    raise exception 'No autorizado';
  end if;
  update public.app_config set require_invite_code = p_required where id = 1;
  if not found then
    raise exception 'Falta la fila de app_config (ver schema.sql)';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.set_invite_required(boolean) from public, anon;
grant execute on function public.set_invite_required(boolean) to authenticated;

-- Crear un código nuevo (aleatorio, p. ej. XR-3F9A1C07B2).
create or replace function public.create_invite_code(
  p_note text default null,
  p_max_uses int default 1,
  p_days int default 30
) returns text as $$
declare
  v_code text;
begin
  if not public.is_coach() then
    raise exception 'No autorizado';
  end if;
  if p_max_uses is null or p_max_uses < 1 or p_max_uses > 500 then
    raise exception 'Usos máximos: entre 1 y 500';
  end if;
  v_code := 'XR-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  insert into public.invite_codes (code, note, max_uses, expires_at, created_by)
  values (
    v_code,
    nullif(left(btrim(coalesce(p_note, '')), 120), ''),
    p_max_uses,
    case when p_days is null or p_days <= 0 then null else now() + make_interval(days => p_days) end,
    auth.uid()
  );
  return v_code;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.create_invite_code(text, int, int) from public, anon;
grant execute on function public.create_invite_code(text, int, int) to authenticated;

-- El trigger de alta de usuarios: igual que antes, y además valida el código
-- cuando el entrenador ha activado la exigencia. Los correos de coach_emails
-- no necesitan código.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_is_coach boolean;
  v_default_coach uuid;
  v_required boolean;
  v_code text;
begin
  select (new.email = any(coach_emails)), require_invite_code
    into v_is_coach, v_required
  from app_config where id = 1;

  if coalesce(v_required, false) and not coalesce(v_is_coach, false) then
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

  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    case when v_is_coach then 'coach' else 'athlete' end,
    new.raw_user_meta_data->>'full_name',
    new.email
  );

  if not coalesce(v_is_coach, false) then
    select id into v_default_coach from profiles where role = 'coach' order by created_at asc limit 1;
    update profiles set coach_id = v_default_coach where id = new.id;
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

-- ============================================================================
-- COMPROBACIONES (opcional, ejecutar después y revisar a mano)
--   select public.invite_required();                -- false hasta que lo actives
--   select * from public.invite_codes;
-- ============================================================================
