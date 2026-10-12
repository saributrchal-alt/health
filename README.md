# NATHOENG HEALTH — Phase 1 (manual entry pilot)
Next.js + Supabase. No Bluetooth integration. The UI requires Supabase Auth and SQL setup.
1. Configure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.
2. Review and execute sql/001_health_phase1.sql in the intended Supabase project.
3. Configure Supabase Auth email OTP redirect URL for health.nathoeng.com.
4. Verify login, per-user isolation, data entry, history and print before real patient use.
The existing HEALTH_BRIDGE_KEY is reserved for future member bridge integration; it is not consumed by the pilot.
No doctor access is enabled yet. Do not use with real patient data until privacy/security checks and clinical review are complete.
