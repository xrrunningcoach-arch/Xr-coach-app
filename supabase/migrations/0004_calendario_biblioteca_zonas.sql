-- ============================================================================
-- MIGRACIÓN 0004 — Calendario con fechas reales, Biblioteca y zonas de FC manuales
-- ============================================================================
-- Ejecuta este archivo UNA VEZ en: Supabase -> SQL Editor -> New query,
-- DESPUÉS de 0001, 0002 y 0003. Se puede repetir sin romper nada.
--
-- Qué añade:
--   1) Fechas reales: sessions.session_date y start_date / end_date en
--      mesociclos y macrociclos (hasta ahora solo existían semanas "1, 2, 3…").
--   2) Rellena las fechas de los planes que ya existen (solo si el plan tiene
--      fecha de inicio y solo donde todavía no hay fecha).
--   3) Zonas de FC manuales por atleta (prioridad sobre el cálculo automático).
--   4) Biblioteca del entrenador: plantillas (sesión / mesociclo / macrociclo)
--      que no pertenecen a ningún atleta.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) FECHAS REALES
-- ----------------------------------------------------------------------------
alter table public.sessions
  add column if not exists session_date date;

create index if not exists idx_sessions_plan_date on public.sessions(plan_id, session_date);

alter table public.mesocycles
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.macrocycles
  add column if not exists start_date date,
  add column if not exists end_date date;

alter table public.mesocycles drop constraint if exists mesocycles_dates_order;
alter table public.mesocycles add constraint mesocycles_dates_order
  check (start_date is null or end_date is null or end_date >= start_date);

alter table public.macrocycles drop constraint if exists macrocycles_dates_order;
alter table public.macrocycles add constraint macrocycles_dates_order
  check (start_date is null or end_date is null or end_date >= start_date);

-- ----------------------------------------------------------------------------
-- 2) RELLENAR FECHAS DE LOS PLANES EXISTENTES
-- ----------------------------------------------------------------------------
-- Semana 1 = la semana (lunes a domingo) que contiene la fecha de inicio del
-- plan. "Día N" se interpreta literalmente como el día N de esa semana
-- (Día 1 = lunes). Es solo una colocación inicial: el entrenador puede mover
-- cada sesión a otro día desde el calendario. Solo toca filas sin fecha.
update public.sessions s
set session_date = (date_trunc('week', p.start_date)::date)
                   + ((s.week_number - 1) * 7)
                   + (least(greatest(s.day_number, 1), 7) - 1)
from public.training_plans p
where p.id = s.plan_id
  and p.start_date is not null
  and s.session_date is null
  and s.week_number >= 1;

update public.mesocycles m
set start_date = (date_trunc('week', p.start_date)::date) + ((m.week_start - 1) * 7),
    end_date   = (date_trunc('week', p.start_date)::date) + (m.week_end * 7) - 1
from public.training_plans p
where p.id = m.plan_id
  and p.start_date is not null
  and m.start_date is null
  and m.end_date is null
  and m.week_start >= 1
  and m.week_end >= m.week_start;

update public.macrocycles mc
set start_date = x.min_start,
    end_date = x.max_end
from (
  select macrocycle_id, min(start_date) as min_start, max(end_date) as max_end
  from public.mesocycles
  where macrocycle_id is not null and start_date is not null and end_date is not null
  group by macrocycle_id
) x
where x.macrocycle_id = mc.id
  and mc.start_date is null
  and mc.end_date is null;

-- ----------------------------------------------------------------------------
-- 3) ZONAS DE FC MANUALES POR ATLETA
-- ----------------------------------------------------------------------------
-- manual_zones = {"Z1":{"lo":110,"hi":125}, "Z3":{"lo":140,"hi":155}, ...}
-- Solo aparecen las zonas que el entrenador ha fijado a mano; las que faltan
-- siguen calculándose automáticamente. Valores en pulsaciones por minuto.
create table if not exists public.athlete_hr_zones (
  athlete_id uuid primary key references public.profiles(id) on delete cascade,
  manual_zones jsonb not null default '{}'::jsonb
    check (jsonb_typeof(manual_zones) = 'object'),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.trg_validate_manual_zones()
returns trigger as $$
declare
  k text;
  v jsonb;
begin
  for k, v in select * from jsonb_each(new.manual_zones) loop
    if k not in ('Z1','Z2','Z3','Z4','Z5') then
      raise exception 'Zona no válida: %', k;
    end if;
    if jsonb_typeof(v) <> 'object'
       or jsonb_typeof(v->'lo') <> 'number'
       or jsonb_typeof(v->'hi') <> 'number' then
      raise exception 'La zona % necesita un mínimo (lo) y un máximo (hi)', k;
    end if;
    if (v->>'lo')::numeric < 30 or (v->>'hi')::numeric > 250
       or (v->>'lo')::numeric >= (v->>'hi')::numeric then
      raise exception 'Valores no válidos en %: entre 30 y 250 ppm y el mínimo menor que el máximo', k;
    end if;
  end loop;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql set search_path = public;

drop trigger if exists on_manual_zones_write on public.athlete_hr_zones;
create trigger on_manual_zones_write
  before insert or update on public.athlete_hr_zones
  for each row execute procedure public.trg_validate_manual_zones();

alter table public.athlete_hr_zones enable row level security;

drop policy if exists "ahz_select" on public.athlete_hr_zones;
create policy "ahz_select" on public.athlete_hr_zones
  for select using (athlete_id = auth.uid() or public.is_coach());

drop policy if exists "ahz_insert" on public.athlete_hr_zones;
create policy "ahz_insert" on public.athlete_hr_zones
  for insert with check (public.is_coach());

drop policy if exists "ahz_update" on public.athlete_hr_zones;
create policy "ahz_update" on public.athlete_hr_zones
  for update using (public.is_coach()) with check (public.is_coach());

drop policy if exists "ahz_delete" on public.athlete_hr_zones;
create policy "ahz_delete" on public.athlete_hr_zones
  for delete using (public.is_coach());

revoke all on public.athlete_hr_zones from anon;
grant select, insert, update, delete on public.athlete_hr_zones to authenticated;

-- ----------------------------------------------------------------------------
-- 4) BIBLIOTECA DEL ENTRENADOR
-- ----------------------------------------------------------------------------
-- payload (jsonb) es autocontenido y no referencia a ningún atleta:
--   session:    {"session": {...}}
--   mesocycle:  {"blocks": [ {name, focus, key_objective, weeks, sessions:[...]} ]}  (1 bloque)
--   macrocycle: {"objective": "...", "blocks": [ ... varios bloques ... ]}
-- Cada sesión de plantilla lleva week_offset (0 = primera semana del bloque)
-- y weekday (0 = lunes ... 6 = domingo). Ver src/lib/templates.js.
create table if not exists public.library_items (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('session','mesocycle','macrocycle')),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  tags text[] not null default '{}',
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) < 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_library_items_coach on public.library_items(coach_id, kind);

alter table public.library_items enable row level security;

drop policy if exists "library_select" on public.library_items;
create policy "library_select" on public.library_items
  for select using (public.is_coach() and coach_id = auth.uid());

drop policy if exists "library_insert" on public.library_items;
create policy "library_insert" on public.library_items
  for insert with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "library_update" on public.library_items;
create policy "library_update" on public.library_items
  for update using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "library_delete" on public.library_items;
create policy "library_delete" on public.library_items
  for delete using (public.is_coach() and coach_id = auth.uid());

revoke all on public.library_items from anon;
grant select, insert, update, delete on public.library_items to authenticated;

-- ============================================================================
-- COMPROBACIONES (opcional, ejecutar después y revisar a mano)
--   select count(*) filter (where session_date is null) as sin_fecha, count(*) as total from public.sessions;
--   select id, name, start_date, end_date from public.mesocycles order by start_date;
--   select * from public.athlete_hr_zones;
--   select id, kind, name from public.library_items;
-- ============================================================================
