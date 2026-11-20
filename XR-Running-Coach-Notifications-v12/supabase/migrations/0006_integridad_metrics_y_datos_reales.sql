-- ============================================================================
-- 0006 · Integridad de `metrics` + datos reales de la sesión
-- ============================================================================
-- Problemas que corrige:
--   1) `metrics = metrics || p_metrics` dejaba al atleta SOBRESCRIBIR lo que fijó
--      el entrenador (en jsonb `||` gana la clave de la derecha). Además, al
--      guardar una plantilla desde una sesión, se copiaban datos del atleta.
--      -> `metrics` pasa a ser SOLO lo planificado (lo escribe el entrenador).
--      -> `metrics_actual` guarda lo que registra el atleta.
--   2) p_metrics no tenía tope de tamaño.
--   3) recompute_session_load era ejecutable por cualquier usuario autenticado.
--      El trigger ya calcula la carga, así que la llamada de submit_session
--      sobraba.
--   4) Faltaban distancia y FC media reales por sesión (km "completados" reales).
--
-- Es idempotente: puede ejecutarse más de una vez.
-- ============================================================================

alter table public.sessions
  add column if not exists metrics_actual jsonb not null default '{}',
  add column if not exists distance_actual_km numeric,
  add column if not exists avg_hr_actual integer;

alter table public.sessions drop constraint if exists sessions_distance_actual_km_check;
alter table public.sessions add constraint sessions_distance_actual_km_check
  check (distance_actual_km is null or (distance_actual_km >= 0 and distance_actual_km <= 500));

alter table public.sessions drop constraint if exists sessions_avg_hr_actual_check;
alter table public.sessions add constraint sessions_avg_hr_actual_check
  check (avg_hr_actual is null or (avg_hr_actual between 30 and 240));

alter table public.sessions drop constraint if exists sessions_metrics_actual_object;
alter table public.sessions add constraint sessions_metrics_actual_object
  check (jsonb_typeof(metrics_actual) = 'object' and length(metrics_actual::text) <= 4000);

-- Las firmas cambian: se retira la versión de 8 parámetros.
drop function if exists public.submit_session(uuid, text, text, text, text, numeric, numeric, jsonb);

create or replace function public.submit_session(
  p_session_id uuid,
  p_status text,
  p_rpe_actual text,
  p_notes text,
  p_link_url text,
  p_duration_actual_min numeric default null,
  p_rpe_actual_value numeric default null,
  p_metrics jsonb default null,
  p_distance_actual_km numeric default null,
  p_avg_hr_actual integer default null
) returns void as $$
declare
  v_owner uuid;
  v_plan_status text;
  v_metrics jsonb := coalesce(p_metrics, '{}'::jsonb);
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

  if p_distance_actual_km is not null and (p_distance_actual_km < 0 or p_distance_actual_km > 500) then
    raise exception 'Distancia fuera de rango';
  end if;

  if p_avg_hr_actual is not null and (p_avg_hr_actual < 30 or p_avg_hr_actual > 240) then
    raise exception 'FC media fuera de rango';
  end if;

  if jsonb_typeof(v_metrics) <> 'object' then
    raise exception 'Los datos de la sesión no son válidos';
  end if;
  if length(v_metrics::text) > 4000 then
    raise exception 'Datos de la sesión demasiado grandes';
  end if;

  -- `metrics` (lo planificado) NO se toca: solo el entrenador lo escribe.
  -- El trigger on_session_load_inputs_changed recalcula session_load e
  -- impact_load al cambiar RPE/duración.
  update sessions
  set status = p_status,
      rpe_actual = p_rpe_actual,
      athlete_notes = p_notes,
      link_url = nullif(p_link_url, ''),
      duration_actual_min = coalesce(p_duration_actual_min, duration_actual_min),
      rpe_actual_value = coalesce(p_rpe_actual_value, rpe_actual_value),
      distance_actual_km = coalesce(p_distance_actual_km, distance_actual_km),
      avg_hr_actual = coalesce(p_avg_hr_actual, avg_hr_actual),
      metrics_actual = v_metrics,
      completed_at = case when p_status = 'completado' then now() else null end,
      updated_at = now()
  where id = p_session_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.submit_session(uuid, text, text, text, text, numeric, numeric, jsonb, numeric, integer) from public, anon;
grant execute on function public.submit_session(uuid, text, text, text, text, numeric, numeric, jsonb, numeric, integer) to authenticated;

-- recompute_session_load solo debe llamarlo el propio sistema (trigger).
revoke execute on function public.recompute_session_load(uuid) from public, anon, authenticated;

-- ============================================================================
-- COMPROBACIONES
-- ============================================================================
-- select column_name from information_schema.columns
--   where table_name = 'sessions' and column_name in ('metrics_actual','distance_actual_km','avg_hr_actual');
-- select has_function_privilege('authenticated', 'public.recompute_session_load(uuid)', 'execute'); -- false
