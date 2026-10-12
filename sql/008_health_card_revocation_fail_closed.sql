-- Revocation must remain possible after the Temple member/card becomes inactive. This does not open login or patient access.
create or replace function public.health_admin_card_binding(
 p_event_id uuid,p_member_id uuid,p_actor_id uuid,p_action text,
 p_hmac text,p_confirm_consent boolean,p_issued_at timestamptz
) returns jsonb language plpgsql security invoker set search_path = ''
as $$
declare v_actor public.members%rowtype;
        v_member public.members%rowtype;
        v_bridge public.health_members%rowtype;
        v_binding public.health_card_bindings%rowtype;
        v_existing public.health_card_binding_events%rowtype;
begin
 if p_event_id is null or p_member_id is null or p_actor_id is null
    or p_action not in ('prepare','approve','revoke') or p_issued_at is null
    or abs(extract(epoch from now()-p_issued_at))>300
    or (p_action <> 'revoke' and (p_hmac is null or p_hmac !~ '^[0-9a-f]{64}
 then raise exception 'Invalid or expired card binding command'; end if;
 select * into v_actor from public.members where id=p_actor_id;
 if not found or v_actor.role is distinct from 'admin'
    or v_actor.membership_status is distinct from 'active'
 then raise exception 'Unauthorized administrator'; end if;
 select * into v_member from public.members where id=p_member_id;
 if p_action <> 'revoke' and (not found or v_member.membership_status is distinct from 'active'
    or v_member.id_card_verified_at is null)
 then raise exception 'Member card not verified at Temple'; end if;
 select * into v_bridge from public.health_members where member_id=p_member_id;
 if p_action <> 'revoke' and (not found or not v_bridge.is_active) then raise exception 'Health Bridge not active'; end if;
 select * into v_existing from public.health_card_binding_events where event_id=p_event_id;
 if found then
    if v_existing.member_id<>p_member_id or v_existing.actor_id<>p_actor_id
      or v_existing.action<>p_action then raise exception 'Replayed event ID'; end if;
    return jsonb_build_object('success',true,'idempotent',true);
 end if;
 select * into v_binding from public.health_card_bindings where member_id=p_member_id for update;
 if p_action='prepare' then
    if found then
      if v_binding.card_lookup_hmac<>p_hmac then raise exception 'Card changed: revoke and reverify before pairing'; end if;
    else
      insert into public.health_card_bindings(member_id,card_lookup_hmac,binding_status,verified_by)
      values (p_member_id,p_hmac,'pending',p_actor_id);
    end if;
 elsif p_action='approve' then
    if p_confirm_consent is distinct from true then raise exception 'Explicit consent required'; end if;
    if not found or v_binding.card_lookup_hmac<>p_hmac or v_binding.binding_status <> 'pending'
    then raise exception 'Pairing not prepared or changed'; end if;
    update public.health_card_bindings
      set binding_status='approved',verified_by=p_actor_id,consent_at=now(),approved_at=now(),updated_at=now()
      where member_id=p_member_id;
    update public.health_members set kiosk_enabled=true,updated_at=now()
      where member_id=p_member_id and is_active=true;
 elsif p_action='revoke' then
    if found then update public.health_card_bindings set binding_status='revoked',updated_at=now()
       where member_id=p_member_id; end if;
    update public.health_members set kiosk_enabled=false,updated_at=now() where member_id=p_member_id;
    update public.health_kiosk_sessions set revoked_at=now() where member_id=p_member_id and revoked_at is null;
 end if;
 insert into public.health_card_binding_events(event_id,member_id,actor_id,action)
 values(p_event_id,p_member_id,p_actor_id,p_action);
 return jsonb_build_object('success',true,'idempotent',false,'member_id',p_member_id,'action',p_action);
end $$;
revoke all on function public.health_admin_card_binding(uuid,uuid,uuid,text,text,boolean,timestamptz)
  from public,anon,authenticated;
grant execute on function public.health_admin_card_binding(uuid,uuid,uuid,text,text,boolean,timestamptz)
  to service_role;
))
 then raise exception 'Invalid or expired card binding command'; end if;
 select * into v_actor from public.members where id=p_actor_id;
 if not found or v_actor.role is distinct from 'admin'
    or v_actor.membership_status is distinct from 'active'
 then raise exception 'Unauthorized administrator'; end if;
 select * into v_member from public.members where id=p_member_id;
 if not found or v_member.membership_status is distinct from 'active'
    or v_member.id_card_verified_at is null
 then raise exception 'Member card not verified at Temple'; end if;
 select * into v_bridge from public.health_members where member_id=p_member_id;
 if not found or not v_bridge.is_active then raise exception 'Health Bridge not active'; end if;
 select * into v_existing from public.health_card_binding_events where event_id=p_event_id;
 if found then
    if v_existing.member_id<>p_member_id or v_existing.actor_id<>p_actor_id
      or v_existing.action<>p_action then raise exception 'Replayed event ID'; end if;
    return jsonb_build_object('success',true,'idempotent',true);
 end if;
 select * into v_binding from public.health_card_bindings where member_id=p_member_id for update;
 if p_action='prepare' then
    if found then
      if v_binding.card_lookup_hmac<>p_hmac then raise exception 'Card changed: revoke and reverify before pairing'; end if;
    else
      insert into public.health_card_bindings(member_id,card_lookup_hmac,binding_status,verified_by)
      values (p_member_id,p_hmac,'pending',p_actor_id);
    end if;
 elsif p_action='approve' then
    if p_confirm_consent is distinct from true then raise exception 'Explicit consent required'; end if;
    if not found or v_binding.card_lookup_hmac<>p_hmac or v_binding.binding_status <> 'pending'
    then raise exception 'Pairing not prepared or changed'; end if;
    update public.health_card_bindings
      set binding_status='approved',verified_by=p_actor_id,consent_at=now(),approved_at=now(),updated_at=now()
      where member_id=p_member_id;
    update public.health_members set kiosk_enabled=true,updated_at=now()
      where member_id=p_member_id and is_active=true;
 elsif p_action='revoke' then
    if found then update public.health_card_bindings set binding_status='revoked',updated_at=now()
       where member_id=p_member_id; end if;
    update public.health_members set kiosk_enabled=false,updated_at=now() where member_id=p_member_id;
    update public.health_kiosk_sessions set revoked_at=now() where member_id=p_member_id and revoked_at is null;
 end if;
 insert into public.health_card_binding_events(event_id,member_id,actor_id,action)
 values(p_event_id,p_member_id,p_actor_id,p_action);
 return jsonb_build_object('success',true,'idempotent',false,'member_id',p_member_id,'action',p_action);
end $$;
revoke all on function public.health_admin_card_binding(uuid,uuid,uuid,text,text,boolean,timestamptz)
  from public,anon,authenticated;
grant execute on function public.health_admin_card_binding(uuid,uuid,uuid,text,text,boolean,timestamptz)
  to service_role;
