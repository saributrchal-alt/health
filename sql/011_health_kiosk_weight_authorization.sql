-- Supabase resolves the member and consumes the challenge. The reading is stored on Hostinger.
create or replace function public.health_authorize_kiosk_weight(
  p_challenge_id uuid, p_device_id uuid, p_device_key text,
  p_card_hmac text, p_citizen_id text
) returns uuid language plpgsql security invoker set search_path = ''
as $$
declare
  target_member uuid;
begin
  if not public.health_consume_kiosk_challenge(p_challenge_id, p_device_id) then
    return null;
  end if;

  select hm.member_id into target_member
  from public.health_card_bindings b
  join public.health_members hm on hm.member_id = b.member_id
  join public.members tm on tm.id = hm.member_id
  join public.health_kiosk_devices d on d.id = p_device_id
  where b.card_lookup_hmac = p_card_hmac and b.binding_status = 'approved'
    and b.consent_at is not null and b.approved_at is not null
    and hm.is_active and hm.kiosk_enabled and d.enabled
    and d.public_key_spki_base64 = p_device_key
    and tm.membership_status = 'active' and tm.id_card_verified_at is not null
    and tm.tax_id = p_citizen_id;

  return target_member;
end;
$$;
revoke all on function public.health_authorize_kiosk_weight(uuid,uuid,text,text,text)
  from public, anon, authenticated;
grant execute on function public.health_authorize_kiosk_weight(uuid,uuid,text,text,text)
  to service_role;
