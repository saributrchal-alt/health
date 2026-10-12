-- Atomic challenge consumption AND short-lived proof-code issuance.
-- HTTPS frontend checks P-256 signature against the approved registered device first.
create or replace function public.health_issue_card_claim_with_challenge(
 p_device_id uuid,p_challenge_id uuid,p_card_hmac text,p_code_digest text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_changed int;
begin
 if p_device_id is null or p_challenge_id is null or p_card_hmac is null
  or p_code_digest is null or p_card_hmac !~ '^[a-f0-9]{64}$'
  or p_code_digest !~ '^[a-f0-9]{64}$'
 then return false; end if;
 perform pg_advisory_xact_lock(hashtext(p_device_id::text));
 if not exists (select 1 from public.health_kiosk_devices
                where id=p_device_id and enabled=true) then return false; end if;
 if (select count(*) from public.health_card_claims
      where device_id=p_device_id and issued_at > now()-interval '15 minutes')>=5
 then return false; end if;
 update public.health_kiosk_challenges set used_at=now()
 where id=p_challenge_id and device_id=p_device_id and used_at is null
   and issued_at > now()-interval '20 seconds' and issued_at<=now()+interval '5 seconds';
 get diagnostics v_changed=row_count;
 if v_changed<>1 then return false; end if;
 update public.health_card_claims set used_at=now()
 where device_id=p_device_id and used_at is null;
 insert into public.health_card_claims(device_id,card_lookup_hmac,code_digest)
 values(p_device_id,p_card_hmac,p_code_digest);
 return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.health_issue_card_claim_with_challenge(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.health_issue_card_claim_with_challenge(uuid,uuid,text,text) to service_role;
