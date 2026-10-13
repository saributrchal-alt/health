-- Pilot PIN attempts are managed by the Health server, never by anonymous clients.
-- No kiosk login sessions or access to medical records are enabled by this migration.
create or replace function public.health_reserve_pin_attempt(p_member_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
 v public.health_kiosk_credentials%rowtype;
 n integer;
begin
 if p_member_id is null then return jsonb_build_object('allowed',false); end if;
 select * into v from public.health_kiosk_credentials where member_id=p_member_id for update;
 if not found then return jsonb_build_object('allowed',false); end if;
 if v.locked_until is not null and v.locked_until > now() then
  return jsonb_build_object('allowed',false);
 end if;
 n:=case when v.locked_until is not null and v.locked_until <= now() then 1 else v.failed_attempts+1 end;
 update public.health_kiosk_credentials
  set failed_attempts=n,
      locked_until=case when n>=5 then now()+interval '15 minutes' else null end
  where member_id=p_member_id;
 return jsonb_build_object('allowed',true,'salt',v.pin_salt,'hash',v.pin_hash);
end;
$$;

create or replace function public.health_reset_pin_attempts(p_member_id uuid,p_expected_hash text)
returns boolean
language sql
set search_path = ''
as $$
 with changed as (
  update public.health_kiosk_credentials
  set failed_attempts=0,locked_until=null
  where member_id=p_member_id and pin_hash=p_expected_hash
  returning member_id
 )
 select exists(select 1 from changed);
$$;

revoke all on function public.health_reserve_pin_attempt(uuid) from public,anon,authenticated;
revoke all on function public.health_reset_pin_attempts(uuid,text) from public,anon,authenticated;
grant execute on function public.health_reserve_pin_attempt(uuid) to service_role;
grant execute on function public.health_reset_pin_attempts(uuid,text) to service_role;
