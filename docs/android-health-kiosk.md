# NATHOENG HEALTH — Android OTG + Bluetooth kiosk pilot

Status: **development only**. Do not enter real patient data, distribute an APK as production-ready, or enable device records yet.

## Intended user experience
1. Android phone with USB-C OTG + compatible Thai ID smart-card reader (CCID) launches the dedicated Health app.
2. The app reads the **currently inserted** smart card. Removal, USB disconnect, expiry, or activity termination immediately clears candidate identity and suspends access.
3. Android Keystore holds a non-exportable device signing private key. The Health server maintains its registered public key, approves a device through an administrator-controlled out-of-band ceremony, and challenges each request. Requests are signed and one-time; a plain card JSON, card number, or local handoff is NOT proof of identity.
4. Server matches the card against the Temple member registry **only when** the administrator has sent the member via Health Bridge, Temple membership is active, and a consent record exists. Use server-side HMAC of citizen ID for matching; never expose the full ID, nor store it in the kiosk session/browser.
5. PIN enrollment/reset requires separate administrator-assisted identity proofing; the PIN cannot be chosen merely from a read card or a public request. Verify the 6-digit PIN with a slow salted hash, rate limits, lockout, session timeout and server audit.
6. Short-lived, server-scoped Health session uses member ID and device ID, revokes on card removal and inactivity. Card is continuously monitored; if communication fails, fail closed. Kiosk must not show another person's data on next insertion.
7. Select **Manual** (SYS, DIA, pulse) or **Bluetooth**. For Bluetooth use only compatible, explicitly identified devices/protocols; never infer generic GATT byte format. Confirm received values, measurement time, units, and patient match on-screen before saving. Use mock readings only during testing.
8. Medical records are never returned over the Bridge to Temple. Restrict health measurements by verified member and current kiosk session on the server. Existing Supabase Auth user tables stay untouched pending a reviewed identity-link migration.

## Current components
- Temple Member Bridge tables and signed Health receiver
- SQL 004: disabled-by-default kiosk devices, PIN credentials, challenges, sessions, measurements; RLS enabled, no anonymous browser grants
- Existing Saributr Android app source in `saributrchal-alt/nathoeng-temple/card-reader/android/` handles CCID and Thai card APDU. Its Temple-only encrypted handoff and JSON export must **not** be repurposed as Health authentication.
- No Android kiosk APK, Bluetooth pairing, PIN enrollment or production session flow is authorized as completed.

## Acceptance tests before first use
- Unknown / revoked Bridge member, cancelled Temple member, unregistered / disabled Android device: deny.
- Forged, stale, duplicated, unsigned challenge: deny. Device private key is never uploaded.
- Card removed during PIN or measurement: revoke session, clear screen; reconnect requires new challenge and PIN.
- Five failed PIN tries: rate limit and lock. Test separate identity-proofed reset, never reveal a PIN.
- Person A cannot view person B's data after swap, restart, network loss, or concurrent use.
- Bluetooth permission denial, wrong GATT profile, disconnect, invalid units/value: no automatic record; manual entry still available.
- Browser / build security scan, DB RLS isolation, privacy consent, local device end-to-end test all pass before real patient data.

## Bluetooth device compatibility
Prefer Blood Pressure Service 0x1810 (Blood Pressure Measurement 0x2A35) for cuffs and Heart Rate Service 0x180D (Heart Rate Measurement 0x2A37) for supported pulse monitors. The precise model must be tested: some products use proprietary protocols or do not support live broadcast. USB host (OTG) and BLE can run on the same Android phone if hardware supports both.
