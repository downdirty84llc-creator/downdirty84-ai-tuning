-- DD84 LINK cloud data model. Apply to the DD84 Supabase project, not the Georgia Opportunity Ledger database.
create extension if not exists pgcrypto;

create table if not exists public.dd84_devices (
  id uuid primary key default gen_random_uuid(),
  serial text not null unique,
  owner_user_id uuid null references auth.users(id) on delete set null,
  hardware_revision text not null,
  firmware_version text not null,
  lifecycle text not null default 'provisioned' check (lifecycle in ('provisioned','claimed','suspended','retired')),
  device_public_key text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dd84_vehicle_sessions (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.dd84_devices(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  vin_hash text not null,
  controller_id text not null,
  transport text not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.dd84_log_batches (
  id uuid primary key default gen_random_uuid(),
  vehicle_session_id uuid not null references public.dd84_vehicle_sessions(id) on delete cascade,
  sequence_no bigint not null,
  object_path text not null,
  sha256 text not null,
  sample_count integer not null check (sample_count >= 0),
  created_at timestamptz not null default now(),
  unique(vehicle_session_id, sequence_no)
);

create table if not exists public.dd84_calibration_releases (
  id uuid primary key default gen_random_uuid(),
  vehicle_session_id uuid not null references public.dd84_vehicle_sessions(id) on delete restrict,
  device_id uuid not null references public.dd84_devices(id) on delete restrict,
  calibration_id text not null,
  revision integer not null check (revision > 0),
  payload_sha256 text not null,
  signature text not null,
  status text not null default 'released' check (status in ('released','installed','failed','revoked')),
  released_by uuid not null references auth.users(id),
  released_at timestamptz not null default now(),
  installed_at timestamptz,
  unique(calibration_id, revision)
);

create table if not exists public.dd84_device_events (
  id bigint generated always as identity primary key,
  device_id uuid not null references public.dd84_devices(id) on delete cascade,
  vehicle_session_id uuid references public.dd84_vehicle_sessions(id) on delete set null,
  event_type text not null,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.dd84_devices enable row level security;
alter table public.dd84_vehicle_sessions enable row level security;
alter table public.dd84_log_batches enable row level security;
alter table public.dd84_calibration_releases enable row level security;
alter table public.dd84_device_events enable row level security;

create policy dd84_devices_owner_read on public.dd84_devices
for select to authenticated using (owner_user_id = auth.uid());
create policy dd84_vehicle_sessions_owner_read on public.dd84_vehicle_sessions
for select to authenticated using (owner_user_id = auth.uid());

-- Writes from physical devices must go through a server/device-auth boundary using
-- a service credential; do not grant direct INSERT/UPDATE privileges to anon clients.
revoke insert, update, delete on public.dd84_devices from anon, authenticated;
revoke insert, update, delete on public.dd84_vehicle_sessions from anon, authenticated;
revoke all on public.dd84_log_batches from anon;
revoke all on public.dd84_calibration_releases from anon;
revoke all on public.dd84_device_events from anon;
