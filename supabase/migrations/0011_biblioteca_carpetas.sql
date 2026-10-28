-- ============================================================================
-- 0011 · Biblioteca del entrenador: carpetas propias
-- ============================================================================
-- Cada entrenador crea sus carpetas y mueve sus plantillas (library_items) a
-- ellas. Una carpeta solo la ve su dueño. Al borrar una carpeta, sus plantillas
-- NO se borran: pasan a «Sin carpeta». Idempotente. Requiere 0004 y 0008.
-- ============================================================================

create table if not exists public.library_folders (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  unique (coach_id, name)
);

create index if not exists idx_library_folders_coach on public.library_folders(coach_id);

alter table public.library_folders enable row level security;

drop policy if exists "folders_select" on public.library_folders;
create policy "folders_select" on public.library_folders
  for select using (public.is_coach() and coach_id = auth.uid());

drop policy if exists "folders_insert" on public.library_folders;
create policy "folders_insert" on public.library_folders
  for insert with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "folders_update" on public.library_folders;
create policy "folders_update" on public.library_folders
  for update using (public.is_coach() and coach_id = auth.uid())
  with check (public.is_coach() and coach_id = auth.uid());

drop policy if exists "folders_delete" on public.library_folders;
create policy "folders_delete" on public.library_folders
  for delete using (public.is_coach() and coach_id = auth.uid());

revoke all on public.library_folders from anon;
grant select, insert, update, delete on public.library_folders to authenticated;

-- La plantilla apunta a su carpeta (opcional).
alter table public.library_items
  add column if not exists folder_id uuid references public.library_folders(id) on delete set null;

create index if not exists idx_library_items_folder on public.library_items(folder_id);

-- Una plantilla solo puede estar en una carpeta de su mismo entrenador.
create or replace function public.trg_library_item_folder_owner()
returns trigger as $$
begin
  if new.folder_id is not null and not exists (
    select 1 from public.library_folders f where f.id = new.folder_id and f.coach_id = new.coach_id
  ) then
    raise exception 'La carpeta no pertenece a este entrenador';
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_library_item_folder on public.library_items;
create trigger on_library_item_folder
  before insert or update of folder_id, coach_id on public.library_items
  for each row execute procedure public.trg_library_item_folder_owner();

-- ============================================================================
-- COMPROBACIONES
--   select * from public.library_folders;
--   select id, name, folder_id from public.library_items order by folder_id nulls first;
-- ============================================================================
