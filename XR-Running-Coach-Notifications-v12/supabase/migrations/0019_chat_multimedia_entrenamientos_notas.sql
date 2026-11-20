-- Chat enriquecido: adjuntos privados, sesiones compartidas y notas del entrenador.
alter table public.messages
  add column if not exists message_type text not null default 'text',
  add column if not exists attachment_path text,
  add column if not exists attachment_mime text,
  add column if not exists linked_session_id uuid references public.sessions(id) on delete set null;

alter table public.messages drop constraint if exists messages_message_type_check;
alter table public.messages add constraint messages_message_type_check
  check (message_type in ('text', 'image', 'video', 'training', 'coach_note'));
alter table public.messages drop constraint if exists messages_attachment_type_check;
alter table public.messages add constraint messages_attachment_type_check
  check (
    (message_type in ('image', 'video') and attachment_path is not null and attachment_mime is not null)
    or (message_type not in ('image', 'video') and attachment_path is null and attachment_mime is null)
  );
alter table public.messages drop constraint if exists messages_linked_session_type_check;
alter table public.messages add constraint messages_linked_session_type_check
  check (message_type <> 'training' or linked_session_id is not null);

create index if not exists idx_messages_linked_session on public.messages(linked_session_id) where linked_session_id is not null;

-- Las notas de entrenador se distinguen visualmente y solo las puede enviar
-- el entrenador asignado a ese atleta.
drop policy if exists "messages_insert" on public.messages;
create policy "messages_insert" on public.messages for insert
  with check (
    sender_id = auth.uid()
    and (athlete_id = auth.uid() or public.my_athlete(athlete_id))
    and (message_type <> 'coach_note' or (public.is_coach() and public.my_athlete(athlete_id)))
    and (linked_session_id is null or exists (
      select 1 from public.sessions s
      join public.training_plans p on p.id = s.plan_id
      where s.id = public.messages.linked_session_id
        and p.athlete_id = public.messages.athlete_id
    ))
  );

-- Media is stored in a private bucket under athlete-id/sender-id/filename.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'xr-chat-media',
  'xr-chat-media',
  false,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists "chat_media_select" on storage.objects;
create policy "chat_media_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'xr-chat-media'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.my_athlete(((storage.foldername(name))[1])::uuid)
    )
  );

drop policy if exists "chat_media_insert" on storage.objects;
create policy "chat_media_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'xr-chat-media'
    and (storage.foldername(name))[2] = auth.uid()::text
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.my_athlete(((storage.foldername(name))[1])::uuid)
    )
  );

-- No se permite modificar ni borrar contenido del chat desde Storage.
