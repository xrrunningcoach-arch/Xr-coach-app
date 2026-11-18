-- 0017 · Recordatorios push diarios para la sesión del plan.
-- Programación: revisar docs/NOTIFICACIONES_PUSH.md antes de activar Cron.

alter table public.push_subscriptions
  add column if not exists timezone text not null default 'Europe/Madrid';

create table if not exists public.push_reminder_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  session_date date not null,
  session_id uuid not null references public.sessions(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, session_date, session_id)
);

create table if not exists public.push_meetup_reminder_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  meetup_id uuid not null references public.meetups(id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (user_id, meetup_id)
);

alter table public.push_reminder_log enable row level security;
alter table public.push_meetup_reminder_log enable row level security;
revoke all on public.push_reminder_log from anon, authenticated;
revoke all on public.push_meetup_reminder_log from anon, authenticated;
grant all on public.push_reminder_log to service_role;
grant all on public.push_meetup_reminder_log to service_role;
