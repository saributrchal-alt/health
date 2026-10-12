-- Phase C staging: privacy-preserving card-to-member bindings. No patient access or PIN setup is enabled.
create table if not exists public.health_card_bindings (
 member_id uuid primary key references public.health_members(member_id) on delete cascade,
 card_lookup_hmac text not null unique check (card_lookup_hmac ~ '^[0-9a-f]{64}$'),
 binding_status text not null default 'pending' check (binding_status in ('pending','approved','revoked')),
 verified_by uuid not null references public.members(id),
 verified_at timestamptz not null default now(),
 consent_at timestamptz,
 approved_at timestamptz,
 updated_at timestamptz not null default now(),
 constraint health_card_binding_approval_gate check (
   binding_status <> 'approved' or (consent_at is not null and approved_at is not null)
 )
);
create index if not exists health_card_bindings_status_idx on public.health_card_bindings(binding_status);
alter table public.health_card_bindings enable row level security;
revoke all on public.health_card_bindings from public, anon, authenticated;
grant select,insert,update on public.health_card_bindings to service_role;
comment on table public.health_card_bindings is 'Server-only card identifiers: HMAC SHA256 over 13-digit chip ID using separate server secret; never raw card ID.';
-- Baseline guard: a Bridge revocation also disables card approval and existing kiosk sessions.
create or replace function public.health_revoke_card_on_bridge_disable() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (old.is_active and not new.is_active) then
   update public.health_card_bindings set binding_status='revoked',updated_at=now()
      where member_id=new.member_id;
   update public.health_kiosk_sessions set revoked_at=now()
      where member_id=new.member_id and revoked_at is null;
 end if;
 return new;
end $$;
drop trigger if exists health_bridge_disable_revokes_card on public.health_members;
create trigger health_bridge_disable_revokes_card
after update of is_active on public.health_members
for each row execute function public.health_revoke_card_on_bridge_disable();
revoke all on function public.health_revoke_card_on_bridge_disable() from public,anon,authenticated;
