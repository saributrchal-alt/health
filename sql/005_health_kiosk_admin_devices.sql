-- Health Android kiosk admin provisioning audit; no PII or patient data.
create table if not exists public.health_kiosk_device_events (
 event_id uuid primary key,
 device_id uuid not null references public.health_kiosk_devices(id),
 assigned_by uuid not null references public.members(id),
 action text not null check (action in ('register','approve','disable')),
 issued_at timestamptz not null,
 received_at timestamptz not null default now()
);
create index if not exists health_kiosk_device_events_device_idx
 on public.health_kiosk_device_events(device_id, received_at desc);
alter table public.health_kiosk_device_events enable row level security;
revoke all on public.health_kiosk_device_events from public, anon, authenticated;
grant select, insert on public.health_kiosk_device_events to service_role;

create or replace function public.health_admin_kiosk_device(
 p_event_id uuid,p_device_id uuid,p_actor uuid,p_action text,
 p_label text,p_public_key text,p_issued_at timestamptz)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_actor public.members%rowtype; v_old public.health_kiosk_devices%rowtype;
        v_event public.health_kiosk_device_events%rowtype;
begin
 if p_event_id is null or p_device_id is null or p_actor is null
    or p_issued_at is null or abs(extract(epoch from now()-p_issued_at))>300
    or p_action not in ('register','approve','disable') 
    or p_label is null or length(p_label) not between 2 and 120
    or p_public_key is null or length(p_public_key) not between 80 and 700
 then raise exception 'Invalid or expired device command'; end if;
 select * into v_actor from public.members where id=p_actor;
 if not found or v_actor.role is distinct from 'admin'
    or v_actor.membership_status is distinct from 'active'
 then raise exception 'Unauthorized administrator'; end if;
 select * into v_event from public.health_kiosk_device_events where event_id=p_event_id;
 if found then
   if v_event.device_id<>p_device_id or v_event.assigned_by<>p_actor
     or v_event.action<>p_action or v_event.issued_at<>p_issued_at
   then raise exception 'Reused device event ID'; end if;
   return jsonb_build_object('success',true,'idempotent',true,'device_id',p_device_id);
 end if;
 select * into v_old from public.health_kiosk_devices where id=p_device_id for update;
 if p_action='register' then
    if found then
      if v_old.public_key_spki_base64<>p_public_key then raise exception 'Device key mismatch'; end if;
    else
      insert into public.health_kiosk_devices(id,label,public_key_spki_base64,enabled)
      values (p_device_id,p_label,p_public_key,false);
    end if;
 elsif p_action='approve' then
    if not found or v_old.public_key_spki_base64<>p_public_key then raise exception 'Unknown device or key mismatch'; end if;
    update public.health_kiosk_devices set enabled=true,label=p_label where id=p_device_id;
 elsif p_action='disable' then
    if not found or v_old.public_key_spki_base64<>p_public_key then raise exception 'Unknown device or key mismatch'; end if;
    update public.health_kiosk_devices set enabled=false where id=p_device_id;
    update public.health_kiosk_sessions set revoked_at=now() where device_id=p_device_id and revoked_at is null;
 end if;
 insert into public.health_kiosk_device_events(event_id,device_id,assigned_by,action,issued_at)
 values(p_event_id,p_device_id,p_actor,p_action,p_issued_at);
 return jsonb_build_object('success',true,'idempotent',false,'device_id',p_device_id,
    'enabled',(select enabled from public.health_kiosk_devices where id=p_device_id));
end; $$;
revoke all on function public.health_admin_kiosk_device(uuid,uuid,uuid,text,text,text,timestamptz) from public, anon, authenticated;
grant execute on function public.health_admin_kiosk_device(uuid,uuid,uuid,text,text,text,timestamptz) to service_role;
