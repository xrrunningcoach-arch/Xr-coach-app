-- ============================================================================
-- 0010 · Carga de sesión con la duración PREVISTA cuando no hay duración real
-- ============================================================================
-- El registro del atleta ya no pide la duración (solo esfuerzo, enlace y notas).
-- Para que el entrenador siga viendo la carga (RPE x minutos), si no hay
-- duración real se usa la prevista. Es una estimación: si el atleta o el
-- entrenador registran la duración real, ese valor manda.
-- Idempotente. Requiere 0002 y 0006.
-- ============================================================================

create or replace function public.trg_recompute_session_load()
returns trigger as $$
declare
  v_minutes numeric := coalesce(new.duration_actual_min, new.duration_planned_min);
begin
  if new.rpe_actual_value is not null and v_minutes is not null then
    new.session_load := new.rpe_actual_value * v_minutes;
    new.impact_load := new.session_load * coalesce(
      (select impact_coefficient from public.disciplines where id = new.discipline_id), 0.5
    );
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_session_load_inputs_changed on public.sessions;
create trigger on_session_load_inputs_changed
  before insert or update of rpe_actual_value, duration_actual_min, duration_planned_min, discipline_id on public.sessions
  for each row execute procedure public.trg_recompute_session_load();

-- Recalcula las sesiones ya registradas que quedaron sin carga por no tener duración real.
update public.sessions
set rpe_actual_value = rpe_actual_value
where rpe_actual_value is not null
  and duration_actual_min is null
  and duration_planned_min is not null
  and session_load is null;

-- ============================================================================
-- COMPROBACIONES
--   select count(*) filter (where session_load is null and rpe_actual_value is not null) as sin_carga from public.sessions;
-- ============================================================================
