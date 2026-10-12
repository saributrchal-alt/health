-- NATHOENG HEALTH phase 1: execute in Supabase SQL Editor after review.
-- This creates an isolated table with per-user RLS; no patient data is public.
create extension if not exists pgcrypto;
create table if not exists public.health_measurements (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 systolic integer not null check (systolic between 60 and 300),
 diastolic integer not null check (diastolic between 30 and 200 and diastolic < systolic),
 pulse integer not null check (pulse between 30 and 220),
 measured_at timestamptz not null,
 session text not null check (session in ('morning','bedtime')),
 sequence integer not null check (sequence in (1,2)),
 notes text not null default '' check (char_length(notes)<=500),
 source text not null default 'manual' check (source='manual'),
 created_at timestamptz not null default now(),
 unique(user_id,measured_at,session,sequence)
);
create index if not exists health_measurements_user_date_idx on public.health_measurements(user_id,measured_at desc);
alter table public.health_measurements enable row level security;
revoke all on public.health_measurements from anon;
grant select,insert on public.health_measurements to authenticated;
drop policy if exists health_measurements_read_self on public.health_measurements;
create policy health_measurements_read_self on public.health_measurements for select to authenticated using (user_id=auth.uid());
drop policy if exists health_measurements_insert_self on public.health_measurements;
create policy health_measurements_insert_self on public.health_measurements for insert to authenticated with check (user_id=auth.uid());
-- Doctor access intentionally NOT enabled until staff verification and patient consent workflows exist.
