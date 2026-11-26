create table if not exists public.health_kiosk_weights (
  id uuid primary key,
  member_id uuid not null references public.health_members(member_id),
  device_id uuid not null references public.health_kiosk_devices(id),
  weight_hundredths integer not null check (weight_hundredths between 500 and 30000),
  measured_at timestamptz not null default now(),
  source text not null default 'scalefit' check (source = 'scalefit')
);
create index if not exists health_kiosk_weights_member_idx
  on public.health_kiosk_weights(member_id, measured_at desc);
alter table public.health_kiosk_weights enable row level security;
revoke all on public.health_kiosk_weights from public, anon, authenticated;
grant select, insert on public.health_kiosk_weights to service_role;

create or replace function public.health_save_kiosk_weight(
  p_challenge_id uuid, p_device_id uuid, p_reading_id uuid,
  p_card_hmac text, p_citizen_id text, p_weight_hundredths integer
) returns boolean language plpgsql security invoker set search_path = ''
as $$
declare
  target_member uuid;
begin
  if not public.health_consume_kiosk_challenge(p_challenge_id, p_device_id) then
    return false;
  end if;

  select hm.member_id into target_member
  from public.health_card_bindings b
  join public.health_members hm on hm.member_id = b.member_id
  join public.members tm on tm.id = hm.member_id
  join public.health_kiosk_devices d on d.id = p_device_id
  where b.card_lookup_hmac = p_card_hmac and b.binding_status = 'approved'
    and b.consent_at is not null and b.approved_at is not null
    and hm.is_active and hm.kiosk_enabled and d.enabled
    and tm.membership_status = 'active' and tm.id_card_verified_at is not null
    and tm.tax_id = p_citizen_id;
  if not found then return false; end if;

  insert into public.health_kiosk_weights(id, member_id, device_id, weight_hundredths)
    values(p_reading_id, target_member, p_device_id, p_weight_hundredths)
    on conflict (id) do nothing;

  return exists (
    select 1 from public.health_kiosk_weights w
    where w.id = p_reading_id and w.member_id = target_member
      and w.device_id = p_device_id and w.weight_hundredths = p_weight_hundredths
  );
end;
$$;
revoke all on function public.health_save_kiosk_weight(uuid,uuid,uuid,text,text,integer)
  from public, anon, authenticated;
grant execute on function public.health_save_kiosk_weight(uuid,uuid,uuid,text,text,integer)
  to service_role;
