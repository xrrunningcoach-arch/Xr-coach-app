-- Pruebas de la migración 0008 (varios entrenadores). Base de datos de PRUEBA.
--   psql -v ON_ERROR_STOP=1 -d xr_test -f supabase/tests/0008_test.sql
\set ON_ERROR_STOP on
begin;

create or replace function pg_temp.check(label text, ok boolean) returns void as $$
begin
  if ok is not true then raise exception 'FALLO: %', label; end if;
  raise notice 'ok  - %', label;
end $$ language plpgsql;
create or replace function pg_temp.raises(label text, stmt text, expect text default null) returns void as $$
begin
  begin execute stmt;
  exception when others then
    if expect is not null and sqlerrm not like '%' || expect || '%' then
      raise exception 'FALLO: % (mensaje inesperado: %)', label, sqlerrm;
    end if;
    raise notice 'ok  - % (%)', label, sqlerrm; return;
  end;
  raise exception 'FALLO: % (no dio error)', label;
end $$ language plpgsql;

insert into public.app_config (id, coach_emails) values (1, '{admin@xr.test}')
  on conflict (id) do update set coach_emails = '{admin@xr.test}', require_invite_code = false;

-- Altas: admin, coach solicitante, atleta que elige coach
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c1', 'admin@xr.test', '{"first_name":"Ada","last_name":"Admin"}');
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000c2', 'coach2@xr.test', '{"role":"coach","first_name":"Berta","last_name":"Segunda"}');
select pg_temp.check('el correo de administrador entra como entrenador aprobado',
  (select role = 'coach' and coach_approved from public.profiles where id = '00000000-0000-0000-0000-0000000000c1'));
select pg_temp.check('quien pide ser entrenador queda PENDIENTE',
  (select role = 'coach' and not coach_approved from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'));
select pg_temp.check('nombre y apellido se guardan', (select full_name = 'Berta Segunda' and first_name = 'Berta' and last_name = 'Segunda' from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'));

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select pg_temp.check('un entrenador pendiente NO es entrenador', not public.is_coach());
select pg_temp.raises('un pendiente no puede aprobarse', $$select public.approve_coach('00000000-0000-0000-0000-0000000000c2', true)$$, 'No autorizado');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.check('el admin ve 1 solicitud pendiente', (select count(*) from public.list_pending_coaches()) = 1);
select public.approve_coach('00000000-0000-0000-0000-0000000000c2', true);
reset role;
select pg_temp.check('tras aprobar, es entrenador', (select coach_approved from public.profiles where id = '00000000-0000-0000-0000-0000000000c2'));

set local role anon;
select pg_temp.check('la lista pública de entrenadores tiene 2', (select count(*) from public.list_coaches()) = 2);
reset role;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'a1@xr.test', '{"first_name":"Ana","last_name":"Uno","coach_id":"00000000-0000-0000-0000-0000000000c1"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'a2@xr.test', '{"first_name":"Beto","last_name":"Dos","coach_id":"00000000-0000-0000-0000-0000000000c2"}'),
  ('00000000-0000-0000-0000-0000000000a3', 'a3@xr.test', '{"first_name":"Cris","coach_id":"00000000-0000-0000-0000-0000000000c2","role":"coach"}');
select pg_temp.check('el atleta queda con el entrenador que eligió', (select coach_id from public.profiles where id = '00000000-0000-0000-0000-0000000000a2') = '00000000-0000-0000-0000-0000000000c2');
select pg_temp.check('pedir role=coach y coach_id no da privilegios extra a un atleta normal',
  (select count(*) from public.profiles where role = 'athlete') = 2);

grant all on all tables in schema public to authenticated;
insert into public.training_plans (id, athlete_id, coach_id, custom_race_name, start_date, duration_weeks, status) values
  ('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-0000000000c1', 'P1', '2026-10-05', 4, 'active'),
  ('00000000-0000-0000-0000-00000000b002', '00000000-0000-0000-0000-0000000000a2', '00000000-0000-0000-0000-0000000000c2', 'P2', '2026-10-05', 4, 'active');
insert into public.sessions (id, plan_id, week_number, day_number, session_date, status) values
  ('00000000-0000-0000-0000-00000000d001', '00000000-0000-0000-0000-00000000b001', 1, 1, '2026-10-05', 'pendiente'),
  ('00000000-0000-0000-0000-00000000d002', '00000000-0000-0000-0000-00000000b002', 1, 1, '2026-10-05', 'pendiente');

-- Aislamiento: coach 2 (Berta) solo ve a sus atletas
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c2', true);
select pg_temp.check('Berta ve solo a su atleta', (select count(*) from public.profiles where role = 'athlete') = 1);
select pg_temp.check('Berta ve solo su plan', (select count(*) from public.training_plans) = 1);
select pg_temp.check('Berta ve solo sus sesiones', (select count(*) from public.sessions) = 1);
update public.sessions set description = 'x' where id = '00000000-0000-0000-0000-00000000d001';
select pg_temp.check('Berta NO puede editar sesiones de otro entrenador', (select count(*) from public.sessions where description = 'x') = 0);
select pg_temp.raises('Berta NO puede crear un plan para un atleta ajeno',
  $$insert into public.training_plans (athlete_id, coach_id, start_date, duration_weeks, status) values ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c2','2026-10-05',4,'active')$$);
select pg_temp.raises('Berta NO puede aplicar plantillas a un atleta ajeno',
  $$select public.apply_template_application('00000000-0000-0000-0000-0000000000a1', '{"plan":{}}'::jsonb)$$, 'No autorizado');
select pg_temp.raises('Berta NO puede archivar a un atleta ajeno', $$select public.set_athlete_active('00000000-0000-0000-0000-0000000000a1', false)$$, 'No autorizado');
select pg_temp.raises('Berta NO es administradora', $$select public.list_pending_coaches()$$, 'No autorizado');
delete from public.training_plans where id = '00000000-0000-0000-0000-00000000b001';
select pg_temp.check('Berta NO puede borrar el plan de otro', (select count(*) from public.training_plans) = 1);
delete from public.training_plans where id = '00000000-0000-0000-0000-00000000b002';
select pg_temp.check('Berta SÍ puede borrar el plan de su atleta', (select count(*) from public.training_plans) = 0);

-- El atleta ve lo suyo y su entrenador
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a1', true);
select pg_temp.check('Ana ve su plan', (select count(*) from public.training_plans) = 1);
select pg_temp.check('Ana ve a su entrenador con my_coach()', (select full_name from public.my_coach()) = 'Ada Admin');
select public.choose_coach('00000000-0000-0000-0000-0000000000c2');
select pg_temp.check('Ana puede cambiar de entrenador', (select id from public.my_coach()) = '00000000-0000-0000-0000-0000000000c2');
select pg_temp.raises('no puede elegir a quien no es entrenador', $$select public.choose_coach('00000000-0000-0000-0000-0000000000a2')$$, 'no válido');

-- Admin ya no ve a Ana (ahora es de Berta)
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select pg_temp.check('Ada ya no ve a Ana', (select count(*) from public.profiles where role = 'athlete') = 0);

-- Rechazo de una solicitud
reset role;
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c3', 'coach3@xr.test', '{"role":"coach","first_name":"Tres"}');
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000c1', true);
select public.approve_coach('00000000-0000-0000-0000-0000000000c3', false);
reset role;
select pg_temp.check('una solicitud rechazada elimina la cuenta', (select count(*) from auth.users where id = '00000000-0000-0000-0000-0000000000c3') = 0);

rollback;
