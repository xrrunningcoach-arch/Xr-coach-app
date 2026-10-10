-- Pruebas de 0009: aplicar de la biblioteca antes del inicio del plan.
\set ON_ERROR_STOP on
begin;
create or replace function pg_temp.check(label text, ok boolean) returns void as $$
begin
  if ok is not true then raise exception 'FALLO: %', label; end if;
  raise notice 'ok  - %', label;
end $$ language plpgsql;

insert into public.app_config (id, coach_emails) values (1, '{admin@xr.test}')
  on conflict (id) do update set coach_emails = '{admin@xr.test}', require_invite_code = false;
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d1', 'admin@xr.test', '{}');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000d2', 'atl@xr.test', '{"coach_id":"00000000-0000-0000-0000-0000000000d1"}');
insert into public.training_plans (id, athlete_id, coach_id, custom_race_name, start_date, duration_weeks, status)
  values ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d1','10K','2026-10-05',4,'active');
insert into public.sessions (plan_id, week_number, day_number, session_date, session_type, status)
  values ('00000000-0000-0000-0000-0000000000e1', 1, 1, '2026-10-05', 'Rodaje', 'pendiente');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000d1', true);
select public.apply_template_application('00000000-0000-0000-0000-0000000000d2', jsonb_build_object(
  'plan', jsonb_build_object('id','00000000-0000-0000-0000-0000000000e1','start_date','2026-09-14','shift_weeks',3,'duration_weeks',7),
  'mesocycles', '[]'::jsonb,
  'sessions', jsonb_build_array(jsonb_build_object('session', jsonb_build_object('week_number',1,'day_number',2,'session_date','2026-09-15','session_type','Series')))
));
reset role;
select pg_temp.check('el plan adelanta su inicio 3 semanas',
  (select start_date = '2026-09-14' and duration_weeks = 7 from public.training_plans where id = '00000000-0000-0000-0000-0000000000e1'));
select pg_temp.check('la sesión existente se renumera a la semana 4',
  (select week_number = 4 from public.sessions where session_type = 'Rodaje'));
select pg_temp.check('la nueva sesión queda en la semana 1',
  (select week_number = 1 from public.sessions where session_type = 'Series'));
rollback;
