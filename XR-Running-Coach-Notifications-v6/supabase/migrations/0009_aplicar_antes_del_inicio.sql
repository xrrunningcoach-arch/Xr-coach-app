-- ============================================================================
-- 0009 · Aplicar de la biblioteca antes del inicio del plan
-- ============================================================================
-- Causa del «no me deja añadir al calendario»: las semanas se cuentan desde
-- plan.start_date y, si la fecha elegida era anterior, se rechazaba con
-- «Alguna sesión caería antes del inicio del plan». Ahora el plan adelanta su
-- inicio (shift_weeks) y renumera sesiones y mesociclos existentes.
-- Idempotente. Requiere 0008.
-- ============================================================================

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
  v_shift int := 0;
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
    v_shift := coalesce((v_plan_in->>'shift_weeks')::int, 0);
    if v_shift < 0 or v_shift > 520 then
      raise exception 'Desplazamiento de plan no válido';
    end if;
    if v_shift > 0 then
      -- La fecha elegida cae antes del inicio del plan: se adelanta el inicio
      -- y se renumeran las semanas de lo que ya existe.
      update public.sessions set week_number = week_number + v_shift where plan_id = v_plan_id;
      update public.mesocycles set week_start = week_start + v_shift, week_end = week_end + v_shift where plan_id = v_plan_id;
      update public.training_plans
      set start_date = start_date - (v_shift * 7),
          duration_weeks = greatest(duration_weeks + v_shift, coalesce((v_plan_in->>'duration_weeks')::int, 1))
      where id = v_plan_id;
    else
      update public.training_plans
      set start_date = coalesce(start_date, nullif(v_plan_in->>'start_date', '')::date),
          duration_weeks = greatest(duration_weeks, coalesce((v_plan_in->>'duration_weeks')::int, duration_weeks))
      where id = v_plan_id;
    end if;
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
