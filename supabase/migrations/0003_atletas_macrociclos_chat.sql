-- ============================================================================
-- MIGRACIÓN 0003 — Gestión de atletas, anamnesis, macrociclos y chat
-- ============================================================================
-- Ejecuta este archivo UNA VEZ en: Supabase -> SQL Editor -> New query.
-- Está escrito para poder repetirse sin romper nada (si lo lanzas dos veces,
-- no da error).
--
-- Qué añade:
--   1) Archivar / reactivar / eliminar atletas (funciones solo para el entrenador)
--   2) Campos nuevos del perfil del atleta (como la hoja "Dashboard" del Excel)
--   3) Tabla "anamnesis": el cuestionario de 21 preguntas del Excel
--   4) Macrociclos (agrupan mesociclos) + estado rojo/ámbar/verde en ambos
--   5) Chat entre atleta y entrenador
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) ATLETAS: archivar, reactivar y eliminar
-- ----------------------------------------------------------------------------
create or replace function public.set_athlete_active(p_athlete_id uuid, p_active boolean)
returns void as $$
begin
  if not public.is_coach() then
    raise exception 'No autorizado';
  end if;

  update public.profiles
  set is_active = p_active
  where id = p_athlete_id and role = 'athlete';

  if not found then
    raise exception 'Atleta no encontrado';
  end if;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.set_athlete_active(uuid, boolean) from public, anon;
grant execute on function public.set_athlete_active(uuid, boolean) to authenticated;

-- Borrado definitivo: solo si el atleta ya está archivado (doble seguridad).
-- Borra su cuenta de acceso y, en cascada, su plan, sesiones, tests y mensajes.
create or replace function public.delete_athlete(p_athlete_id uuid)
returns void as $$
begin
  if not public.is_coach() then
    raise exception 'No autorizado';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = p_athlete_id and role = 'athlete' and is_active = false
  ) then
    raise exception 'Solo se puede eliminar a un atleta que esté archivado';
  end if;

  delete from auth.users where id = p_athlete_id;
end;
$$ language plpgsql security definer set search_path = public;

revoke all on function public.delete_athlete(uuid) from public, anon;
grant execute on function public.delete_athlete(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2) PERFIL DEL ATLETA: campos que faltaban respecto al Excel
-- ----------------------------------------------------------------------------
alter table public.athlete_profiles
  add column if not exists long_term_goal text,
  add column if not exists personal_bests text,
  add column if not exists resources text,
  add column if not exists load_control text;

-- ----------------------------------------------------------------------------
-- 3) ANAMNESIS (cuestionario de 21 preguntas, una fila por atleta)
-- ----------------------------------------------------------------------------
create table if not exists public.anamnesis (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  answered_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.anamnesis enable row level security;

drop policy if exists "anamnesis_select" on public.anamnesis;
create policy "anamnesis_select" on public.anamnesis
  for select using (athlete_id = auth.uid() or public.is_coach());

drop policy if exists "anamnesis_insert" on public.anamnesis;
create policy "anamnesis_insert" on public.anamnesis
  for insert with check (athlete_id = auth.uid() or public.is_coach());

drop policy if exists "anamnesis_update" on public.anamnesis;
create policy "anamnesis_update" on public.anamnesis
  for update using (athlete_id = auth.uid() or public.is_coach())
  with check (athlete_id = auth.uid() or public.is_coach());

revoke all on public.anamnesis from anon;
grant select, insert, update on public.anamnesis to authenticated;

-- ----------------------------------------------------------------------------
-- 4) MACROCICLOS + estado (pendiente / en_curso / completado) en macro y meso
-- ----------------------------------------------------------------------------
create table if not exists public.macrocycles (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.training_plans(id) on delete cascade,
  order_index int not null,
  name text not null,
  objective text,
  status text not null default 'pendiente'
    check (status in ('pendiente','en_curso','completado')),
  created_at timestamptz not null default now()
);

create index if not exists idx_macrocycles_plan_id on public.macrocycles(plan_id);

alter table public.macrocycles enable row level security;

drop policy if exists "macro_select" on public.macrocycles;
create policy "macro_select" on public.macrocycles for select using (
  public.is_coach() or exists (
    select 1 from public.training_plans p where p.id = plan_id and p.athlete_id = auth.uid()
  )
);
drop policy if exists "macro_insert" on public.macrocycles;
create policy "macro_insert" on public.macrocycles for insert with check (public.is_coach());
drop policy if exists "macro_update" on public.macrocycles;
create policy "macro_update" on public.macrocycles for update using (public.is_coach());
drop policy if exists "macro_delete" on public.macrocycles;
create policy "macro_delete" on public.macrocycles for delete using (public.is_coach());

revoke all on public.macrocycles from anon;
grant select, insert, update, delete on public.macrocycles to authenticated;

alter table public.mesocycles
  add column if not exists macrocycle_id uuid references public.macrocycles(id) on delete set null;

alter table public.mesocycles
  add column if not exists status text not null default 'pendiente'
    check (status in ('pendiente','en_curso','completado'));

create index if not exists idx_mesocycles_macrocycle_id on public.mesocycles(macrocycle_id);

-- Planes que ya existen: se crea un "Macrociclo 1" y se les asignan sus mesociclos.
insert into public.macrocycles (plan_id, order_index, name)
select distinct m.plan_id, 1, 'Macrociclo 1'::text
from public.mesocycles m
where m.macrocycle_id is null
  and not exists (select 1 from public.macrocycles x where x.plan_id = m.plan_id);

update public.mesocycles m
set macrocycle_id = (
  select x.id from public.macrocycles x
  where x.plan_id = m.plan_id
  order by x.order_index
  limit 1
)
where m.macrocycle_id is null;

-- ----------------------------------------------------------------------------
-- 5) CHAT atleta <-> entrenador
-- ----------------------------------------------------------------------------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists idx_messages_athlete_created on public.messages(athlete_id, created_at);

alter table public.messages enable row level security;

-- Ve la conversación: el propio atleta o el entrenador.
drop policy if exists "messages_select" on public.messages;
create policy "messages_select" on public.messages
  for select using (athlete_id = auth.uid() or public.is_coach());

-- Escribe en una conversación: el atleta en la suya, o el entrenador en cualquiera.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages
  for insert with check (
    sender_id = auth.uid() and (athlete_id = auth.uid() or public.is_coach())
  );

-- Solo el destinatario puede marcar un mensaje como leído (y solo eso).
drop policy if exists "messages_mark_read" on public.messages;
create policy "messages_mark_read" on public.messages
  for update using (
    (athlete_id = auth.uid() and sender_id <> auth.uid())
    or (public.is_coach() and sender_id = athlete_id)
  );

revoke all on public.messages from anon;
revoke update on public.messages from authenticated;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;

-- Mensajes en tiempo real (si la publicación existe y la tabla aún no está).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
     ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ============================================================================
-- COMPROBACIONES (opcional, ejecutar después y revisar a mano)
--   select * from public.macrocycles;
--   select id, name, macrocycle_id, status from public.mesocycles;
-- ============================================================================
