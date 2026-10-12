-- NATHOENG HEALTH pilot upgrade (run AFTER 001 and check for existing duplicates)
-- Prevent two records for the same Thai calendar day, period and measurement number.
-- This statement will fail safely if existing duplicates need review; it never deletes records.
create unique index if not exists health_unique_thai_day_slot
on public.health_measurements (
 user_id,
 ((measured_at at time zone 'Asia/Bangkok')::date),
 session,
 sequence
);
-- Read-only checks for owner to run in SQL editor:
select tablename,rowsecurity,forcerowsecurity
from pg_tables where schemaname='public' and tablename='health_measurements';
select policyname,cmd,roles,qual,with_check
from pg_policies where schemaname='public' and tablename='health_measurements';
select has_table_privilege('anon','public.health_measurements','SELECT') as anon_can_select,
       has_table_privilege('authenticated','public.health_measurements','SELECT') as authenticated_can_select,
       has_table_privilege('authenticated','public.health_measurements','INSERT') as authenticated_can_insert;
