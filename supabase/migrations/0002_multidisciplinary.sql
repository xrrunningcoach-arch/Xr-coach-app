-- ============================================================================
-- XR RUNNING COACH — MIGRACIÓN 0002: núcleo de flexibilidad multidisciplinar
-- ============================================================================
-- Aditiva y compatible con schema.sql + 0001_security_fixes.sql: no borra
-- columnas, tablas ni cambia el comportamiento de lo que ya funciona.
-- Ejecutar DESPUÉS de 0001_security_fixes.sql en el SQL Editor de Supabase.
--
-- Qué resuelve:
--   1) Catálogo de disciplinas editable (sin tocar el esquema al añadir una).
--   2) Campos universales de duración + campos específicos en `metrics` jsonb,
--      validados a través de `disciplines.metrics_schema` (la definición de
--      qué campos son válidos vive en datos, no en el código).
--   3) Tabla relacional `session_exercises` para fuerza (series x reps x carga).
--   4) Carga de sesión y de impacto calculadas en base de datos (session-RPE),
--      para que el histórico quede fijo aunque cambien los coeficientes.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) CATÁLOGO DE DISCIPLINAS
-- ----------------------------------------------------------------------------
create table if not exists disciplines (
  id uuid primary key default uuid_generate_v4(),
  code text unique not null,
  name text not null,
  -- Coeficiente de impacto mecánico/articular, 0 (nulo) a 1 (máximo).
  -- Son valores de partida orientativos, editables por el entrenador desde
  -- Supabase; no son una verdad científica fija.
  impact_coefficient numeric not null default 0.5 check (impact_coefficient between 0 and 1),
  -- Define qué campos específicos son válidos para esta disciplina y cómo
  -- mostrarlos. El frontend los renderiza genéricamente: añadir una
  -- disciplina nueva no requiere tocar código.
  -- Formato: {"fields":[{"key":"distancia_m","label":"Distancia (m)","type":"number"}, ...],
  --           "has_exercises": true|false}
  metrics_schema jsonb not null default '{"fields": [], "has_exercises": false}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table disciplines enable row level security;
drop policy if exists "disciplines_select" on disciplines;
create policy "disciplines_select" on disciplines for select using (true);
drop policy if exists "disciplines_write" on disciplines;
create policy "disciplines_write" on disciplines for all using (is_coach()) with check (is_coach());

insert into disciplines (code, name, impact_coefficient, metrics_schema)
select * from (values
  ('running', 'Carrera a pie', 0.85,
    '{"fields": [
        {"key":"ritmo_objetivo","label":"Ritmo objetivo (min/km)","type":"text"},
        {"key":"desnivel_m","label":"Desnivel (m)","type":"number"}
      ], "has_exercises": false}'::jsonb),
  ('swim', 'Natación', 0.05,
    '{"fields": [
        {"key":"distancia_m","label":"Distancia total (m)","type":"number"},
        {"key":"piscina_m","label":"Longitud de piscina (m)","type":"number"},
        {"key":"estilo","label":"Estilo principal","type":"text"},
        {"key":"ritmo_100m","label":"Ritmo objetivo /100m","type":"text"}
      ], "has_exercises": false}'::jsonb),
  ('strength', 'Fuerza', 0.40,
    '{"fields": [
        {"key":"enfoque","label":"Enfoque (hipertrofia/fuerza máx/potencia)","type":"text"}
      ], "has_exercises": true}'::jsonb),
  ('bike', 'Bicicleta', 0.15,
    '{"fields": [
        {"key":"distancia_km","label":"Distancia (km)","type":"number"},
        {"key":"potencia_w","label":"Potencia objetivo (W)","type":"number"}
      ], "has_exercises": false}'::jsonb),
  ('hyrox', 'Híbrido / Hyrox', 0.60,
    '{"fields": [
        {"key":"estaciones","label":"Estaciones (texto libre)","type":"text"}
      ], "has_exercises": true}'::jsonb),
  ('mobility', 'Movilidad / técnica', 0.10,
    '{"fields": [], "has_exercises": false}'::jsonb)
) as v(code, name, impact_coefficient, metrics_schema)
where not exists (select 1 from disciplines where disciplines.code = v.code);

-- ----------------------------------------------------------------------------
-- 2) CAMPOS NUEVOS EN sessions (envoltorio universal + puente a disciplina)
-- ----------------------------------------------------------------------------
alter table sessions add column if not exists discipline_id uuid references disciplines(id);
alter table sessions add column if not exists block_order int not null default 1;
alter table sessions add column if not exists metrics jsonb not null default '{}';
alter table sessions add column if not exists duration_planned_min numeric;
alter table sessions add column if not exists duration_actual_min numeric;
-- Valor numérico 0-10 (escala CR-10) para calcular carga; rpe_actual (texto)
-- se conserva tal cual para la nota cualitativa que ya existía ("RPE 6 fuerte").
alter table sessions add column if not exists rpe_actual_value numeric check (rpe_actual_value between 0 and 10);
alter table sessions add column if not exists session_load numeric;
alter table sessions add column if not exists impact_load numeric;

-- Sesiones ya existentes -> disciplina "Carrera a pie" por defecto, para no
-- dejar ninguna fila sin disciplina asignada.
update sessions set discipline_id = (select id from disciplines where code = 'running')
where discipline_id is null;

create index if not exists idx_sessions_discipline_id on sessions(discipline_id);

-- ----------------------------------------------------------------------------
-- 3) FUERZA: tabla relacional (series x reps x carga), misma RLS que sessions
-- ----------------------------------------------------------------------------
create table if not exists session_exercises (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references sessions(id) on delete cascade,
  order_index int not null default 1,
  exercise_name text not null,
  sets int,
  reps int,
  load_kg numeric,
  rpe_set text
);

alter table session_exercises enable row level security;

drop policy if exists "session_exercises_select" on session_exercises;
create policy "session_exercises_select" on session_exercises for select using (
  is_coach() or exists (
    select 1 from sessions s join training_plans p on p.id = s.plan_id
    where s.id = session_id and p.athlete_id = auth.uid()
  )
);
drop policy if exists "session_exercises_write" on session_exercises;
create policy "session_exercises_write" on session_exercises for all using (is_coach()) with check (is_coach());

create index if not exists idx_session_exercises_session_id on session_exercises(session_id);

-- ----------------------------------------------------------------------------
-- 4) CÁLCULO DE CARGA: session_load (session-RPE) e impact_load (ponderada)
-- ----------------------------------------------------------------------------
-- session_load = RPE (0-10) x duración real (min)  -> unifica cualquier
-- disciplina en una sola unidad de esfuerzo interno, sin convertir km/kg/m.
-- impact_load  = session_load x impact_coefficient de la disciplina -> eje
-- separado para no ocultar que la misma carga pesa distinto en articulaciones
-- según venga de agua, fuerza o asfalto.
create or replace function public.recompute_session_load(p_session_id uuid)
returns void as $$
declare
  v_rpe numeric;
  v_duration numeric;
  v_coef numeric;
begin
  select s.rpe_actual_value, s.duration_actual_min, coalesce(d.impact_coefficient, 0.5)
  into v_rpe, v_duration, v_coef
  from sessions s
  left join disciplines d on d.id = s.discipline_id
  where s.id = p_session_id;

  if v_rpe is not null and v_duration is not null then
    update sessions
    set session_load = v_rpe * v_duration,
        impact_load = v_rpe * v_duration * v_coef
    where id = p_session_id;
  end if;
end;
$$ language plpgsql security definer set search_path = public;

-- submit_session amplía su firma con parámetros nuevos opcionales (con
-- default null) para no romper las llamadas ya existentes en el frontend
-- (AthleteDashboard.jsx sigue llamando solo con los 5 parámetros originales).
create or replace function public.submit_session(
  p_session_id uuid,
  p_status text,
  p_rpe_actual text,
  p_notes text,
  p_link_url text,
  p_duration_actual_min numeric default null,
  p_rpe_actual_value numeric default null,
  p_metrics jsonb default null
) returns void as $$
declare
  v_owner uuid;
  v_plan_status text;
begin
  select p.athlete_id, p.status into v_owner, v_plan_status
  from sessions s join training_plans p on p.id = s.plan_id
  where s.id = p_session_id;

  if v_owner is null or v_owner <> auth.uid() then
    raise exception 'No autorizado';
  end if;

  if v_plan_status <> 'active' then
    raise exception 'Solo se puede registrar una sesión de un plan activo';
  end if;

  if p_status not in ('pendiente','completado','saltado') then
    raise exception 'Estado no válido';
  end if;

  if p_rpe_actual is not null and length(p_rpe_actual) > 50 then
    raise exception 'RPE demasiado largo';
  end if;

  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'Notas demasiado largas';
  end if;

  if p_link_url is not null and p_link_url <> '' and p_link_url !~* '^https?://' then
    raise exception 'El enlace debe empezar por http:// o https://';
  end if;

  if p_rpe_actual_value is not null and (p_rpe_actual_value < 0 or p_rpe_actual_value > 10) then
    raise exception 'El RPE debe estar entre 0 y 10';
  end if;

  if p_duration_actual_min is not null and (p_duration_actual_min < 0 or p_duration_actual_min > 720) then
    raise exception 'Duración fuera de rango';
  end if;

  update sessions
  set status = p_status,
      rpe_actual = p_rpe_actual,
      athlete_notes = p_notes,
      link_url = nullif(p_link_url, ''),
      duration_actual_min = coalesce(p_duration_actual_min, duration_actual_min),
      rpe_actual_value = coalesce(p_rpe_actual_value, rpe_actual_value),
      -- El atleta solo puede AÑADIR datos a metrics (p.ej. ritmo real en la
      -- piscina), nunca sobrescribir lo que fijó el entrenador al planificar.
      metrics = metrics || coalesce(p_metrics, '{}'::jsonb),
      completed_at = case when p_status = 'completado' then now() else null end,
      updated_at = now()
  where id = p_session_id;

  perform public.recompute_session_load(p_session_id);
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.submit_session to authenticated;
grant execute on function public.recompute_session_load to authenticated;

-- El entrenador también puede registrar duración/RPE real directamente sobre
-- la fila (p. ej. al revisar con el atleta in situ); un trigger recalcula la
-- carga en cualquier UPDATE que toque esos campos, sin pasar por la función.
create or replace function public.trg_recompute_session_load()
returns trigger as $$
begin
  if new.rpe_actual_value is not null and new.duration_actual_min is not null then
    new.session_load := new.rpe_actual_value * new.duration_actual_min;
    new.impact_load := new.session_load * coalesce(
      (select impact_coefficient from disciplines where id = new.discipline_id), 0.5
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_session_load_inputs_changed on sessions;
create trigger on_session_load_inputs_changed
  before insert or update of rpe_actual_value, duration_actual_min, discipline_id on sessions
  for each row execute procedure public.trg_recompute_session_load();

-- ============================================================================
-- COMPROBACIONES
-- ============================================================================
-- select code, name, impact_coefficient from disciplines order by code;
-- select id, discipline_id, session_load, impact_load from sessions where session_load is not null limit 10;
