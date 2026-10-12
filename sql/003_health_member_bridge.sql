-- NATHOENG HEALTH: Temple -> Health member entitlement bridge (no medical data transfer).
-- Only trusted service-role callers may invoke the transactional bridge RPC.
create table if not exists public.health_members (
  member_id uuid primary key references public.members(id) on delete cascade,
  member_name text not null check (length(member_name) between 1 and 250),
  is_active boolean not null default false,
  kiosk_enabled boolean not null default false,
  assigned_by uuid not null references public.members(id),
  assigned_at timestamptz not null,
  last_event_id uuid not null,
  updated_at timestamptz not null default now()
);
create table if not exists public.health_bridge_events (
  event_id uuid primary key,
  member_id uuid not null references public.members(id),
  assigned_by uuid not null references public.members(id),
  is_active boolean not null,
  issued_at timestamptz not null,
  received_at timestamptz not null default now()
);
create index if not exists health_bridge_events_member_idx on public.health_bridge_events(member_id, received_at desc);
alter table public.health_members enable row level security;
alter table public.health_bridge_events enable row level security;
revoke all on public.health_members from public, anon, authenticated;
revoke all on public.health_bridge_events from public, anon, authenticated;
grant select, insert, update on public.health_members to service_role;
grant select, insert on public.health_bridge_events to service_role;

create or replace function public.apply_health_bridge(
  p_event_id uuid, p_member_id uuid, p_assigned_by uuid,
  p_is_active boolean, p_issued_at timestamptz
) returns jsonb
language plpgsql security invoker set search_path = ''
as $$
declare
  v_actor public.members%rowtype;
  v_target public.members%rowtype;
  v_event public.health_bridge_events%rowtype;
  v_name text;
  v_changes integer;
begin
  if p_event_id is null or p_member_id is null or p_assigned_by is null or p_is_active is null
     or p_issued_at is null or abs(extract(epoch from (now() - p_issued_at))) > 300 then
    raise exception 'Invalid or expired bridge request';
  end if;
  select * into v_actor from public.members where id = p_assigned_by;
  if not found or v_actor.role is distinct from 'admin'
     or v_actor.membership_status is distinct from 'active' then
    raise exception 'Bridge actor not authorized';
  end if;
  select * into v_target from public.members where id = p_member_id;
  if not found then raise exception 'Member not found'; end if;
  if p_is_active and v_target.membership_status is distinct from 'active' then
    raise exception 'Inactive Temple member';
  end if;
  v_name := coalesce(nullif(btrim(v_target.full_name), ''), nullif(btrim(v_target.display_name), ''));
  if v_name is null then raise exception 'Member name unavailable'; end if;
  select * into v_event from public.health_bridge_events where event_id = p_event_id;
  if found then
    if v_event.member_id <> p_member_id or v_event.assigned_by <> p_assigned_by
       or v_event.is_active <> p_is_active or v_event.issued_at <> p_issued_at then
      raise exception 'Bridge event ID reused with different payload';
    end if;
    return jsonb_build_object('success', true, 'idempotent', true, 'member_id', p_member_id);
  end if;
  insert into public.health_bridge_events(event_id, member_id, assigned_by, is_active, issued_at)
  values (p_event_id, p_member_id, p_assigned_by, p_is_active, p_issued_at);
  insert into public.health_members(member_id, member_name, is_active, assigned_by, assigned_at, last_event_id)
  values (p_member_id, v_name, p_is_active, p_assigned_by, p_issued_at, p_event_id)
  on conflict (member_id) do update
     set member_name = excluded.member_name,
         is_active = excluded.is_active,
         assigned_by = excluded.assigned_by,
         assigned_at = excluded.assigned_at,
         last_event_id = excluded.last_event_id,
         updated_at = now(),
         kiosk_enabled = case when excluded.is_active then public.health_members.kiosk_enabled else false end
  where public.health_members.assigned_at <= excluded.assigned_at;
  get diagnostics v_changes = row_count;
  if v_changes <> 1 then raise exception 'Stale bridge event'; end if;
  return jsonb_build_object('success', true, 'idempotent', false, 'member_id', p_member_id, 'is_active', p_is_active);
end;
$$;
revoke all on function public.apply_health_bridge(uuid,uuid,uuid,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_health_bridge(uuid,uuid,uuid,boolean,timestamptz) to service_role;
-- No health_members policies for anon/authenticated. No card number or health readings copied.
