-- Staged proof-of-card-on-registered-device binding for Health Kiosk.
-- No member logins / measurements are enabled here.
create table if not exists public.health_card_claims (
 id uuid primary key default gen_random_uuid(),
 device_id uuid not null references public.health_kiosk_devices(id),
 card_lookup_hmac text not null check(card_lookup_hmac ~ '^[a-f0-9]{64}$'),
 code_digest text not null unique check(code_digest ~ '^[a-f0-9]{64}$'),
 issued_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '3 minutes'),
 used_at timestamptz
);
create index if not exists health_card_claims_device_idx on public.health_card_claims(device_id,issued_at desc);

create table if not exists public.health_card_claim_guesses (
 id bigint generated always as identity primary key,
 actor_id uuid not null references public.members(id),
 member_id uuid not null references public.health_members(member_id),
 attempted_at timestamptz not null default now()
);
create index if not exists health_card_claim_guesses_window_idx on public.health_card_claim_guesses(actor_id,member_id,attempted_at desc);

alter table public.health_card_claims enable row level security;
alter table public.health_card_claim_guesses enable row level security;
revoke all on public.health_card_claims from public,anon,authenticated;
revoke all on public.health_card_claim_guesses from public,anon,authenticated;
grant select,insert,update on public.health_card_claims to service_role;
grant select,insert on public.health_card_claim_guesses to service_role;
grant usage,select on sequence public.health_card_claim_guesses_id_seq to service_role;

create or replace function public.health_issue_card_claim(
 p_device_id uuid,p_card_hmac text,p_code_digest text
) returns boolean language plpgsql security invoker set search_path='' as $$
declare v_device public.health_kiosk_devices%rowtype;
begin
 if p_device_id is null or p_card_hmac !~ '^[a-f0-9]{64}$'
    or p_code_digest !~ '^[a-f0-9]{64}$' then return false; end if;
 select * into v_device from public.health_kiosk_devices where id=p_device_id;
 if not found or not v_device.enabled then return false; end if;
 -- Count *all* proof codes (not just active) to rate-limit use of an approved device.
 if (select count(*) from public.health_card_claims
     where device_id=p_device_id and issued_at>now()-interval '15 minutes')>=5 then return false; end if;
 update public.health_card_claims set used_at=now() where device_id=p_device_id and used_at is null;
 insert into public.health_card_claims(device_id,card_lookup_hmac,code_digest)
 values(p_device_id,p_card_hmac,p_code_digest);
 return true;
exception when unique_violation then return false;
end $$;
revoke all on function public.health_issue_card_claim(uuid,text,text) from public,anon,authenticated;
grant execute on function public.health_issue_card_claim(uuid,text,text) to service_role;

create or replace function public.health_admin_card_binding_with_claim(
 p_event_id uuid,p_member_id uuid,p_actor_id uuid,
 p_hmac text,p_code_digest text,p_confirm_consent boolean,p_issued_at timestamptz
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_actor public.members%rowtype;
        v_claim public.health_card_claims%rowtype;
        v_response jsonb;
begin
 if p_event_id is null or p_member_id is null or p_actor_id is null
    or p_confirm_consent is distinct from true or p_issued_at is null
    or abs(extract(epoch from now()-p_issued_at))>300
    or p_hmac !~ '^[a-f0-9]{64}$' or p_code_digest !~ '^[a-f0-9]{64}$'
 then return jsonb_build_object('success',false,'reason','INVALID_REQUEST'); end if;
 select * into v_actor from public.members where id=p_actor_id;
 if not found or v_actor.role is distinct from 'admin'
    or v_actor.membership_status is distinct from 'active'
 then return jsonb_build_object('success',false,'reason','NOT_AUTHORIZED'); end if;
 -- Serialized rate check prevents parallel guessing; code guesses are never logged.
 perform pg_advisory_xact_lock(hashtext(p_actor_id::text||':'||p_member_id::text));
 if (select count(*) from public.health_card_claim_guesses
      where actor_id=p_actor_id and member_id=p_member_id
      and attempted_at>now()-interval '10 minutes')>=5
 then return jsonb_build_object('success',false,'reason','RATE_LIMITED'); end if;
 select * into v_claim from public.health_card_claims
   where code_digest=p_code_digest and card_lookup_hmac=p_hmac
     and used_at is null and expires_at>now()
     and exists(select 1 from public.health_kiosk_devices d where d.id=device_id and d.enabled)
   for update;
 if not found then
    insert into public.health_card_claim_guesses(actor_id,member_id) values(p_actor_id,p_member_id);
    return jsonb_build_object('success',false,'reason','INVALID_OR_EXPIRED_CODE');
 end if;
 -- One-time consumption and member authorization occur in a single transaction.
 update public.health_card_claims set used_at=now() where id=v_claim.id;
 v_response:=public.health_admin_card_binding(p_event_id,p_member_id,p_actor_id,
    'approve',p_hmac,true,p_issued_at);
 return v_response;
end $$;
revoke all on function public.health_admin_card_binding_with_claim(uuid,uuid,uuid,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.health_admin_card_binding_with_claim(uuid,uuid,uuid,text,text,boolean,timestamptz) to service_role;
