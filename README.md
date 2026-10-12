# NATHOENG HEALTH — Manual measurement pilot
Status: pilot app, not approved for storing real patient data.
`health.nathoeng.com` is intended for manual entry only in this phase. No devices or hospital API are connected.

## Features
- Supabase email magic-link sign-in for existing test users only (no anonymous view of personal readings).
- Manual SYS / DIA / pulse and Thai time, morning / bedtime, measurement 1 / 2.
- Seven-day 28-slot tracking. Doctor-style averages are displayed ONLY when all 28 slots exist, excluding day 1; does not establish a diagnosis.
- Personal-only history, printing as a PDF using the browser print dialog, basic input checks.

## Setup and verification
1. In Vercel Production set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY for the intended Supabase project. The other Health env vars are reserved for future integration.
2. Apply sql/001_health_phase1.sql (already confirmed manually in the project) and sql/002_health_slot_uniqueness.sql in the same project. The second adds server-side duplicate prevention and displays read-only diagnostics for policies and privileges.
3. Supabase Dashboard → Authentication → URL Configuration: Site URL `https://health.nathoeng.com`; allow redirect URL `https://health.nathoeng.com/**`.
4. Add an explicit test user in Supabase Authentication → Users. The UI intentionally uses `shouldCreateUser:false`, so public visitors cannot register a test account through the login page.
5. Sign in as test user A using magic link; enter dummy 120/80, pulse 70. Confirm history and a fresh page reload.
6. Sign in as distinct test user B; verify that user A's entries are not returned. Unauthenticated users must not be able to select data.
7. Enter 28 synthetic results (7 consecutive days × morning/bedtime × 2), verify summary averages exclude day 1; verify the duplicate slot is rejected.
8. Print the report with the browser print dialog. Validate Vercel deployment and domain.

RLS policies permit authenticated users to SELECT/INSERT only records owned by `auth.uid()`. There is intentionally no doctor access, editing, deleting or Member Bridge endpoint. Anonymously reading medical data is prohibited. Review Auth setup, database RLS, clinical workflow, consent and backups before admitting real patient data.

Never expose SUPABASE_SECRET_KEY, HEALTH_BRIDGE_KEY, or MEDIA_UPLOAD_KEY to client-side code.
