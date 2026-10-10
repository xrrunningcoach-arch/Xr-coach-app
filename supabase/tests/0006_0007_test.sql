-- Pruebas de las migraciones 0006 y 0007 (metrics_actual, permisos, test de
-- umbrales, HRV y límite de intentos de invitación). Base de datos de PRUEBA.
--   psql -v ON_ERROR_STOP=1 -d xr_test -f supabase/tests/0006_0007_test.sql
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

insert into public.app_config (id, coach_emails) values (1, '{coach@xr.test}')
  on conflict (id) do update set coach_emails = '{coach@xr.test}', require_invite_code = false;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'coach@xr.test', '{"full_name":"Coach"}'),
  ('00000000-0000-0000-0000-0000000000a1', 'atleta@xr.test', '{"full_name":"Atleta Uno"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'atleta2@xr.test', '{"full_name":"Atleta Dos"}');

grant all on all tables in schema public to authenticated;

insert into public.training_plans (id, athlete_id, coach_id, custom_race_name, start_date, duration_weeks, status)
values ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'Plan', '2026-10-05', 4, 'active');
insert into public.sessions (id, plan_id, week_number, day_number, session_date, metrics, status)
values ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000b001', 1, 1, '2026-10-05', '{"ritmo":"4:00","tipo":"umbral"}', 'pendiente');

-- ------------------------------------------------------------ submit_session
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);

select public.submit_session('00000000-0000-0000-0000-00000000d001', 'completado', 'RPE 7', 'bien', '', 50, 7, '{"ritmo":"9:99","extra":"x"}'::jsonb, 10.5, 152);
select pg_temp.check('metrics planificadas NO se sobrescriben', (select metrics from public.sessions where id = '00000000-0000-0000-0000-00000000d001') = '{"ritmo":"4:00","tipo":"umbral"}'::jsonb);
select pg_temp.check('lo del atleta va a metrics_actual', (select metrics_actual->>'ritmo' from public.sessions where id = '00000000-0000-0000-0000-00000000d001') = '9:99');
select pg_temp.check('distancia y FC reales guardadas', (select distance_actual_km = 10.5 and avg_hr_actual = 152 from public.sessions where id = '00000000-0000-0000-0000-00000000d001'));
select pg_temp.check('la carga la calcula el trigger (7 x 50)', (select session_load = 350 from public.sessions where id = '00000000-0000-0000-0000-00000000d001'));

select pg_temp.raises('metrics_actual demasiado grande',
  $$select public.submit_session('00000000-0000-0000-0000-00000000d001','completado','','','',null,null, jsonb_build_object('x', repeat('a', 5000)))$$, 'demasiado grandes');
select pg_temp.raises('distancia fuera de rango',
  $$select public.submit_session('00000000-0000-0000-0000-00000000d001','completado','','','',null,null,'{}'::jsonb, 900)$$, 'Distancia');
select pg_temp.raises('FC media fuera de rango',
  $$select public.submit_session('00000000-0000-0000-0000-00000000d001','completado','','','',null,null,'{}'::jsonb, 10, 400)$$, 'FC media');
select pg_temp.raises('metrics no objeto',
  $$select public.submit_session('00000000-0000-0000-0000-00000000d001','completado','','','',null,null,'[1,2]'::jsonb)$$, 'no son válidos');
select pg_temp.raises('recompute_session_load ya no es ejecutable por el atleta',
  $$select public.recompute_session_load('00000000-0000-0000-0000-00000000d001')$$, 'permission denied');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select pg_temp.raises('otro atleta NO puede registrar la sesión',
  $$select public.submit_session('00000000-0000-0000-0000-00000000d001','completado','','','')$$, 'No autorizado');

-- ------------------------------------------------------- test de umbrales
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.raises('el atleta NO puede crear tests de umbral',
  $$insert into public.threshold_tests (athlete_id, test_date, vt1_hr, vt2_hr) values ('00000000-0000-0000-0000-0000000000a1','2026-10-01',150,170)$$);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
insert into public.threshold_tests (athlete_id, test_date, vt1_hr, vt2_hr, vam_kmh) values ('00000000-0000-0000-0000-0000000000a1','2026-10-01',150,170,18.5);
select pg_temp.check('el entrenador crea un test de umbrales', (select count(*) from public.threshold_tests) = 1);
select pg_temp.raises('VT1 debe ser menor que VT2',
  $$insert into public.threshold_tests (athlete_id, test_date, vt1_hr, vt2_hr) values ('00000000-0000-0000-0000-0000000000a1','2026-10-02',180,170)$$);

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.check('el atleta ve su test', (select count(*) from public.threshold_tests) = 1);
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a2', true);
select pg_temp.check('otro atleta NO ve el test', (select count(*) from public.threshold_tests) = 0);

-- ------------------------------------------------------------------- HRV
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
insert into public.hrv_readings (athlete_id, reading_date, rmssd_ms) values ('00000000-0000-0000-0000-0000000000a1', '2026-10-08', 62.5);
select pg_temp.check('el atleta registra su HRV', (select count(*) from public.hrv_readings) = 1);
select pg_temp.raises('no se puede registrar HRV de otro',
  $$insert into public.hrv_readings (athlete_id, reading_date, rmssd_ms) values ('00000000-0000-0000-0000-0000000000a2', '2026-10-08', 55)$$);
select pg_temp.raises('una lectura por día', $$insert into public.hrv_readings (athlete_id, reading_date, rmssd_ms) values ('00000000-0000-0000-0000-0000000000a1', '2026-10-08', 60)$$);

-- ----------------------------------------------- límite de intentos de invitación
reset role;
select set_config('request.headers', '{"x-forwarded-for":"203.0.113.9, 10.0.0.1"}', true);
set local role anon;
do $$
begin
  for i in 1..10 loop perform public.check_invite_code('XR-NOEXISTE'); end loop;
end $$;
select pg_temp.raises('el intento 11 se bloquea', $$select public.check_invite_code('XR-NOEXISTE')$$, 'Demasiados intentos');
reset role;
select set_config('request.headers', '{"x-forwarded-for":"198.51.100.7"}', true);
set local role anon;
select pg_temp.check('otra IP no está bloqueada', public.check_invite_code('XR-NOEXISTE') = false);

rollback;
