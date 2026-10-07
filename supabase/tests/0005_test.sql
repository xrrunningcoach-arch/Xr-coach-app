-- Pruebas de la migración 0005. Se ejecutan contra una base de datos de PRUEBA
-- (nunca la de producción) con un esquema `auth` mínimo; ver docs/GUIA_v4.md.
--   psql -v ON_ERROR_STOP=1 -d xr_test -f supabase/tests/0005_test.sql
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(label text, ok boolean) returns void as $$
begin
  if ok is not true then raise exception 'FALLO: %', label; end if;
  raise notice 'ok  - %', label;
end $$ language plpgsql;

create or replace function pg_temp.raises(label text, stmt text, expect text default null) returns void as $$
begin
  begin
    execute stmt;
  exception when others then
    if expect is not null and sqlerrm not like '%' || expect || '%' then
      raise exception 'FALLO: % (mensaje inesperado: %)', label, sqlerrm;
    end if;
    raise notice 'ok  - % (%)', label, sqlerrm;
    return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$ language plpgsql;

-- Datos base
insert into public.app_config (id, coach_emails) values (1, '{coach@xr.test}')
  on conflict (id) do update set coach_emails = '{coach@xr.test}', require_invite_code = false;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'coach@xr.test', '{"full_name":"Coach"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'atleta@xr.test', '{"full_name":"Atleta Uno"}');
select pg_temp.check('trigger: coach creado', (select role from public.profiles where id = '00000000-0000-0000-0000-0000000000c1') = 'coach');
select pg_temp.check('trigger: atleta creado y asignado al coach', (select coach_id from public.profiles where id = '00000000-0000-0000-0000-0000000000a1') = '00000000-0000-0000-0000-0000000000c1');

grant all on all tables in schema public to authenticated;

-- ---------------------------------------------------------------- plantillas
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.raises('un atleta NO puede aplicar plantillas',
  $$select public.apply_template_application('00000000-0000-0000-0000-0000000000a1', '{"plan":{}}'::jsonb)$$, 'No autorizado');
select pg_temp.raises('un atleta NO puede crear códigos', $$select public.create_invite_code('x',1,1)$$, 'No autorizado');
select pg_temp.raises('un atleta NO puede activar códigos', $$select public.set_invite_required(true)$$, 'No autorizado');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
do $$
declare r jsonb; v_plan uuid;
begin
  r := public.apply_template_application('00000000-0000-0000-0000-0000000000a1', $j$
  { "plan": {"id": null, "custom_race_name": "Prueba", "start_date": "2026-10-05", "duration_weeks": 2},
    "macrocycle": {"order_index":1,"name":"Macro","objective":"Base","start_date":"2026-10-05","end_date":"2026-10-18"},
    "mesocycles": [{"key":"m0","order_index":1,"name":"Meso A","focus":"x","key_objective":"y","week_start":1,"week_end":2,"start_date":"2026-10-05","end_date":"2026-10-18"}],
    "sessions": [
      {"session":{"week_number":1,"day_number":2,"session_date":"2026-10-06","discipline_id":null,"session_type":"Rodaje","description":"suave","km_estimated":10,"duration_planned_min":60,"rpe_theoretical":"4","metrics":{},"status":"pendiente"},"exercises":[],"meso_key":"m0"},
      {"session":{"week_number":2,"day_number":3,"session_date":"2026-10-14","discipline_id":null,"session_type":"Fuerza","description":"","km_estimated":null,"duration_planned_min":45,"rpe_theoretical":"6","metrics":{}},"exercises":[{"order_index":1,"exercise_name":"Sentadilla","sets":4,"reps":6,"load_kg":60,"rpe_set":"7"}],"meso_key":"m0"}
    ] }$j$::jsonb);
  v_plan := (r->>'plan_id')::uuid;
  perform pg_temp.check('aplicar: devuelve 2 sesiones', (r->>'sessions')::int = 2);
  perform pg_temp.check('aplicar: 1 plan, 1 macro, 1 meso', (select count(*) from public.training_plans where athlete_id = '00000000-0000-0000-0000-0000000000a1') = 1
     and (select count(*) from public.macrocycles where plan_id = v_plan) = 1 and (select count(*) from public.mesocycles where plan_id = v_plan and macrocycle_id is not null) = 1);
  perform pg_temp.check('aplicar: sesiones ligadas al mesociclo', (select count(*) from public.sessions where plan_id = v_plan and mesocycle_id is not null) = 2);
  perform pg_temp.check('aplicar: ejercicios creados', (select count(*) from public.session_exercises) = 1);

  -- segunda aplicación sobre el plan existente
  r := public.apply_template_application('00000000-0000-0000-0000-0000000000a1',
    jsonb_build_object('plan', jsonb_build_object('id', v_plan, 'start_date', '2026-10-05', 'duration_weeks', 4),
      'sessions', jsonb_build_array(jsonb_build_object('session', jsonb_build_object('week_number',4,'day_number',1,'session_date','2026-10-26','session_type','Extra'),'exercises','[]'::jsonb))));
  perform pg_temp.check('reaplicar: amplía duración del plan', (select duration_weeks from public.training_plans where id = v_plan) = 4);
  perform pg_temp.check('reaplicar: 3 sesiones en total', (select count(*) from public.sessions where plan_id = v_plan) = 3);
end $$;

-- Atomicidad: la 2.ª sesión es inválida (week_number nulo) -> no debe quedar NADA.
create temp table before_counts as select
  (select count(*) from public.training_plans) p, (select count(*) from public.macrocycles) mc,
  (select count(*) from public.mesocycles) m, (select count(*) from public.sessions) s;
select pg_temp.raises('atómico: una sesión inválida aborta todo', $$
  select public.apply_template_application('00000000-0000-0000-0000-0000000000a1', $j$
  {"plan":{"id":null,"custom_race_name":"Roto","start_date":"2026-11-02","duration_weeks":1},
   "macrocycle":{"order_index":9,"name":"M","start_date":"2026-11-02","end_date":"2026-11-08"},
   "mesocycles":[{"key":"m0","order_index":9,"name":"X","week_start":1,"week_end":1}],
   "sessions":[{"session":{"week_number":1,"day_number":1,"session_date":"2026-11-02"},"meso_key":"m0"},
               {"session":{"day_number":2,"session_date":"2026-11-03"},"meso_key":"m0"}]}$j$::jsonb)$$);
select pg_temp.check('atómico: no queda ningún dato a medias',
  (select p from before_counts) = (select count(*) from public.training_plans)
  and (select mc from before_counts) = (select count(*) from public.macrocycles)
  and (select m from before_counts) = (select count(*) from public.mesocycles)
  and (select s from before_counts) = (select count(*) from public.sessions));

select pg_temp.raises('no se puede usar el plan de otro atleta',
  format($$select public.apply_template_application('00000000-0000-0000-0000-0000000000c1', %L::jsonb)$$, '{"plan":{"id":"00000000-0000-0000-0000-000000000099"}}'), 'Atleta no encontrado');

-- ------------------------------------------------------------- invitaciones
reset role;
select pg_temp.check('invite_required: apagado por defecto', public.invite_required() = false);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.set_invite_required(true);
reset role;
select pg_temp.check('invite_required: activado', public.invite_required() = true);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
create temp table codes as select public.create_invite_code('prueba', 1, 7) as code;
grant select on codes to public;
select pg_temp.check('código con formato XR-…', (select code from codes) ~ '^XR-[0-9A-F]{10}$');
select pg_temp.check('el coach ve sus códigos', (select count(*) from public.invite_codes) = 1);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.check('el atleta NO ve códigos (RLS)', (select count(*) from public.invite_codes) = 0);
reset role;

set local role anon;
select pg_temp.check('anon: código válido', public.check_invite_code((select code from codes)) = true);
select pg_temp.check('anon: código válido en minúsculas', public.check_invite_code(lower((select code from codes))) = true);
select pg_temp.check('anon: código falso', public.check_invite_code('XR-0000000000') = false);
select pg_temp.check('anon: vacío', public.check_invite_code('') = false and public.check_invite_code(null) = false);
reset role;

select pg_temp.raises('registro SIN código se bloquea',
  $$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'sin@xr.test', '{"full_name":"Sin"}')$$, 'Código de invitación no válido');
select pg_temp.raises('registro con código falso se bloquea',
  $$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'falso@xr.test', '{"invite_code":"XR-ZZZZZZZZZZ"}')$$, 'Código de invitación no válido');
insert into auth.users (id, email, raw_user_meta_data)
  select gen_random_uuid(), 'con@xr.test', jsonb_build_object('full_name','Con', 'invite_code', lower(code)) from codes;
select pg_temp.check('registro con código válido funciona', exists (select 1 from public.profiles where email = 'con@xr.test' and role = 'athlete'));
select pg_temp.check('el código consume un uso', (select uses from public.invite_codes) = 1);
select pg_temp.raises('el código agotado no se puede reutilizar',
  format($$insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'otro@xr.test', jsonb_build_object('invite_code', %L))$$, (select code from codes)), 'Código de invitación no válido');
select pg_temp.check('registro fallido no deja perfil', not exists (select 1 from public.profiles where email = 'otro@xr.test'));
update public.app_config set coach_emails = '{coach@xr.test, jefe@xr.test}' where id = 1;
insert into auth.users (id, email, raw_user_meta_data) values (gen_random_uuid(), 'jefe@xr.test', '{}');
select pg_temp.check('un coach nuevo se registra sin código', (select role from public.profiles where email = 'jefe@xr.test') = 'coach');

rollback;
\echo 'TODAS LAS PRUEBAS DE 0005 PASARON'
