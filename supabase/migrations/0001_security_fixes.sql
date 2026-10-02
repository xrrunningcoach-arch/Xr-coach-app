-- ============================================================================
-- XR RUNNING COACH — MIGRACIÓN 0001: correcciones de seguridad (Fase 1)
-- ============================================================================
-- Aditiva y compatible con schema.sql: no elimina tablas ni columnas.
-- Ejecutar una sola vez en: Supabase Dashboard -> SQL Editor -> New query.
-- Corrige los hallazgos S-01, S-02, S-07 y S-08 de la auditoría.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- S-01: app_config no tenía RLS -> cualquiera con la anon key podía leer y
-- modificar coach_emails vía la API y auto-asignarse el rol de entrenador.
-- Se cierra a la API pública; el trigger handle_new_user sigue funcionando
-- porque es security definer.
-- ----------------------------------------------------------------------------
alter table public.app_config enable row level security;
-- Sin policies: ningún rol de la API (anon/authenticated) puede leer ni
-- escribir esta tabla directamente. Gestiónala desde el SQL Editor.

-- ----------------------------------------------------------------------------
-- S-02: "profiles_update" permitía "using (id = auth.uid() or is_coach())"
-- sin restringir columnas -> un atleta podía hacer
-- update profiles set role = 'coach' where id = auth.uid().
-- Se sustituye por una policy que solo cubre la fila propia, y se limitan
-- las columnas editables por el propio usuario a las no sensibles.
-- ----------------------------------------------------------------------------
drop policy if exists "profiles_update" on public.profiles;

create policy "profiles_update_self" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_update_coach" on public.profiles
  for update using (public.is_coach()) with check (public.is_coach());

revoke update on public.profiles from anon, authenticated;
grant update (full_name, age) on public.profiles to authenticated;
-- El entrenador sigue pudiendo cambiar cualquier columna (asignación de
-- coach_id, activar/desactivar atleta, etc.) a través de la policy
-- "profiles_update_coach"; el propio usuario solo su nombre y edad.

-- ----------------------------------------------------------------------------
-- S-07 (parcial): submit_session no validaba longitud de texto ni exigía que
-- el plan estuviera activo. Se añade validación básica; se mantiene la firma
-- para no romper el frontend actual (CoachAthlete/AthleteDashboard).
-- ----------------------------------------------------------------------------
create or replace function public.submit_session(
  p_session_id uuid,
  p_status text,
  p_rpe_actual text,
  p_notes text,
  p_link_url text
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

  update sessions
  set status = p_status,
      rpe_actual = p_rpe_actual,
      athlete_notes = p_notes,
      link_url = nullif(p_link_url, ''),
      completed_at = case when p_status = 'completado' then now() else null end,
      updated_at = now()
  where id = p_session_id;
end;
$$ language plpgsql security definer set search_path = public;

grant execute on function public.submit_session to authenticated;

-- ----------------------------------------------------------------------------
-- S-08: índices que faltaban sobre las columnas que las policies de RLS
-- consultan en cada fila.
-- ----------------------------------------------------------------------------
create index if not exists idx_profiles_coach_id on public.profiles(coach_id);
create index if not exists idx_athlete_profiles_profile_id on public.athlete_profiles(profile_id);
create index if not exists idx_training_plans_athlete_id on public.training_plans(athlete_id);
create index if not exists idx_training_plans_coach_id on public.training_plans(coach_id);
create index if not exists idx_mesocycles_plan_id on public.mesocycles(plan_id);
create index if not exists idx_sessions_plan_id on public.sessions(plan_id);
create index if not exists idx_sessions_status on public.sessions(status);
create index if not exists idx_session_evaluations_session_id on public.session_evaluations(session_id);
create index if not exists idx_milestones_plan_id on public.milestones(plan_id);
create index if not exists idx_tests_plan_id on public.tests(plan_id);

-- ============================================================================
-- COMPROBACIONES (ejecutar después y revisar el resultado a mano)
-- ============================================================================
-- 1) Todas las tablas deben devolver relrowsecurity = true:
--    select c.relname, c.relrowsecurity
--    from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relkind = 'r' order by 1;
--
-- 2) Revisa que el único email en coach_emails sea el tuyo:
--    select coach_emails from public.app_config;
--
-- 3) Revisa que no haya cuentas con role='coach' que no reconozcas:
--    select id, email, role, created_at from public.profiles where role = 'coach';
