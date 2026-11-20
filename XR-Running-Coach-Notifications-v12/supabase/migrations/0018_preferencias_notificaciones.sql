-- 0018 · Hora y privacidad de las notificaciones por cuenta.
-- Los valores se guardan en cada dispositivo y la interfaz los replica en las suscripciones activas.

alter table public.push_subscriptions
  add column if not exists reminder_hour smallint not null default 8
    check (reminder_hour between 0 and 23),
  add column if not exists hide_preview boolean not null default false;

-- Los recordatorios se deduplican por dispositivo: una zona horaria distinta
-- puede hacer que dos dispositivos reciban el aviso a horas diferentes.
alter table public.push_reminder_log
  add column if not exists endpoint text not null default '';
alter table public.push_reminder_log
  drop constraint if exists push_reminder_log_pkey;
alter table public.push_reminder_log
  add constraint push_reminder_log_pkey
  primary key (user_id, session_date, session_id, endpoint);
insert into public.push_reminder_log (user_id, session_date, session_id, endpoint)
select log.user_id, log.session_date, log.session_id, subscription.endpoint
from public.push_reminder_log as log
join public.push_subscriptions as subscription on subscription.user_id = log.user_id
where log.endpoint = ''
on conflict do nothing;
delete from public.push_reminder_log where endpoint = '';

alter table public.push_meetup_reminder_log
  add column if not exists endpoint text not null default '';
alter table public.push_meetup_reminder_log
  drop constraint if exists push_meetup_reminder_log_pkey;
alter table public.push_meetup_reminder_log
  add constraint push_meetup_reminder_log_pkey
  primary key (user_id, meetup_id, endpoint);
insert into public.push_meetup_reminder_log (user_id, meetup_id, endpoint)
select log.user_id, log.meetup_id, subscription.endpoint
from public.push_meetup_reminder_log as log
join public.push_subscriptions as subscription on subscription.user_id = log.user_id
where log.endpoint = ''
on conflict do nothing;
delete from public.push_meetup_reminder_log where endpoint = '';
