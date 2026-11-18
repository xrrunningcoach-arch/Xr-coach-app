-- ============================================================================
-- 0007 · Test de umbrales, HRV y límite de intentos en códigos de invitación
-- ============================================================================
-- 1) threshold_tests: test de umbrales (VT1/VT2, vAM, lactato) con fecha. De
--    aquí se derivan las zonas de FC (ver src/lib/zones.js).
-- 2) hrv_readings: lecturas diarias de HRV (rMSSD) y FC en reposo.
-- 3) check_invite_code: máximo 10 intentos / 10 min por IP (fuerza bruta).
-- Idempotente.
-- ============================================================================

-- 1) TEST DE UMBRALES ---------------------------------------------------------
create table if not exists public.threshold_tests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  test_date date not null,
  test_type text not null default 'campo'
    check (test_type in ('laboratorio','campo','rampa','lactato')),
  vt1_hr integer check (vt1_hr is null or vt1_hr between 30 and 250),
  vt2_hr integer check (vt2_hr is null or vt2_hr between 30 and 250),
  vt1_pace_s_km integer check (vt1_pace_s_km is null or vt1_pace_s_km between 90 and 1200),
  vt2_pace_s_km integer check (vt2_pace_s_km is null or vt2_pace_s_km between 90 and 1200),
  vam_kmh numeric check (vam_kmh is null or vam_kmh between 5 and 40),
  lactate_threshold_mmol numeric check (lactate_threshold_mmol is null or lactate_threshold_mmol between 0.5 and 12),
  max_hr integer check (max_hr is null or max_hr between 100 and 250),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (vt1_hr is null or vt2_hr is null or vt1_hr < vt2_hr)
);
create index if not exists idx_threshold_tests_athlete on public.threshold_tests(athlete_id, test_date desc);

alter table public.threshold_tests enable row level security;
drop policy if exists "tt_select" on public.threshold_tests;
create policy "tt_select" on public.threshold_tests
  for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists "tt_insert" on public.threshold_tests;
create policy "tt_insert" on public.threshold_tests for insert with check (public.is_coach());
drop policy if exists "tt_update" on public.threshold_tests;
create policy "tt_update" on public.threshold_tests
  for update using (public.is_coach()) with check (public.is_coach());
drop policy if exists "tt_delete" on public.threshold_tests;
create policy "tt_delete" on public.threshold_tests for delete using (public.is_coach());
revoke all on public.threshold_tests from anon;
grant select, insert, update, delete on public.threshold_tests to authenticated;

-- 2) HRV ---------------------------------------------------------------------
create table if not exists public.hrv_readings (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.profiles(id) on delete cascade,
  reading_date date not null,
  rmssd_ms numeric not null check (rmssd_ms between 1 and 400),
  resting_hr integer check (resting_hr is null or resting_hr between 25 and 150),
  created_at timestamptz not null default now(),
  unique (athlete_id, reading_date)
);
create index if not exists idx_hrv_athlete on public.hrv_readings(athlete_id, reading_date desc);

alter table public.hrv_readings enable row level security;
drop policy if exists "hrv_select" on public.hrv_readings;
create policy "hrv_select" on public.hrv_readings
  for select using (athlete_id = auth.uid() or public.is_coach());
drop policy if exists "hrv_insert" on public.hrv_readings;
create policy "hrv_insert" on public.hrv_readings for insert with check (athlete_id = auth.uid());
drop policy if exists "hrv_update" on public.hrv_readings;
create policy "hrv_update" on public.hrv_readings
  for update using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
drop policy if exists "hrv_delete" on public.hrv_readings;
create policy "hrv_delete" on public.hrv_readings for delete using (athlete_id = auth.uid());
revoke all on public.hrv_readings from anon;
grant select, insert, update, delete on public.hrv_readings to authenticated;

-- 3) LÍMITE DE INTENTOS EN check_invite_code ---------------------------------------
create table if not exists public.invite_attempts (
  id bigserial primary key,
  ip text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists idx_invite_attempts on public.invite_attempts(ip, attempted_at);
alter table public.invite_attempts enable row level security; -- sin policies: solo la función

create or replace function public.check_invite_code(p_code text)
returns boolean as $$
declare
  v_ip text;
  v_recent int;
begin
  v_ip := coalesce(
    split_part(coalesce(nullif(current_setting('request.headers', true), '')::json->>'x-forwarded-for', ''), ',', 1),
    ''
  );
  if v_ip = '' then v_ip := 'desconocida'; end if;

  delete from public.invite_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_recent from public.invite_attempts
  where ip = v_ip and attempted_at > now() - interval '10 minutes';
  if v_recent >= 10 then
    raise exception 'Demasiados intentos. Espera unos minutos y vuelve a probar.';
  end if;
  insert into public.invite_attempts (ip) values (v_ip);

  return exists (
    select 1 from public.invite_codes
    where code = upper(btrim(coalesce(p_code, '')))
      and is_active
      and uses < max_uses
      and (expires_at is null or expires_at > now())
  );
end;
$$ language plpgsql volatile security definer set search_path = public;

revoke all on function public.check_invite_code(text) from public;
grant execute on function public.check_invite_code(text) to anon, authenticated;

-- COMPROBACIONES
-- select count(*) from public.threshold_tests;
-- select public.check_invite_code('XR-NOEXISTE');  -- 11 veces seguidas => error
