-- Kiosk pilot infrastructure. No changes to existing personal measurements.
create extension if not exists pgcrypto;
create table if not exists public.health_kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  label text not null check(length(label) between 2 and 120),
  hmac_key_base64 text not null check(length(hmac_key_base64) between 40 and 100),
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists public.health_kiosk_credentials (
  member_id uuid primary key references public.health_members(member_id) on delete cascade,
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0 check(failed_attempts>=0),
  locked_until timestamptz,
  enrolled_at timestamptz not null default now(),
  changed_at timestamptz not null default now()
);
create table if not exists public.health_kiosk_challenges (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.health_kiosk_devices(id),
  issued_at timestamptz not null default now(),
  used_at timestamptz
);
create index if not exists health_kiosk_challenges_device_idx on public.health_kiosk_challenges(device_id,issued_at desc);
create table if not exists public.health_kiosk_sessions (
  token_hash text primary key,
  member_id uuid not null references public.health_members(member_id) on delete cascade,
  device_id uuid not null references public.health_kiosk_devices(id),
  card_tag text not null check(length(card_tag)=64),
  pin_verified boolean not null default false,
  expires_at timestamptz not null,
  card_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists health_kiosk_sessions_member_idx on public.health_kiosk_sessions(member_id,expires_at desc);
create table if not exists public.health_kiosk_measurements (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.health_members(member_id) on delete cascade,
  systolic integer not null check(systolic between 60 and 300),
  diastolic integer not null check(diastolic between 30 and 200 and diastolic<systolic),
  pulse integer not null check(pulse between 30 and 220),
  measured_at timestamptz not null,
  session text not null check(session in ('morning','bedtime')),
  sequence integer not null check(sequence in (1,2)),
  created_at timestamptz not null default now(),
  source text not null default 'manual_kiosk' check(source='manual_kiosk')
);
create unique index if not exists health_kiosk_meas_unique_day
  on public.health_kiosk_measurements(member_id, ((measured_at at time zone 'Asia/Bangkok')::date), session, sequence);
-- All kiosk tables are server-only. None are readable or writable by browser credentials.
do $$ declare t text; begin
 foreach t in array array['health_kiosk_devices','health_kiosk_credentials','health_kiosk_challenges','health_kiosk_sessions','health_kiosk_measurements'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public, anon, authenticated',t);
  execute format('grant select, insert, update, delete on public.%I to service_role',t);
 end loop;
end $$;
-- Atomic challenge consumption prevents replay even if requests race.
create or replace function public.health_consume_kiosk_challenge(p_challenge_id uuid,p_device_id uuid)
returns boolean language sql security invoker set search_path=''
as $$
 with changed as (
  update public.health_kiosk_challenges
  set used_at=now()
  where id=p_challenge_id and device_id=p_device_id and used_at is null
    and issued_at > now() - interval '20 seconds'
  returning id
 ) select exists(select 1 from changed);
$$;
revoke all on function public.health_consume_kiosk_challenge(uuid,uuid) from public, anon, authenticated;
grant execute on function public.health_consume_kiosk_challenge(uuid,uuid) to service_role;
