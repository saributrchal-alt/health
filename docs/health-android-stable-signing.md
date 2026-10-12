# Health Android stable APK signing — private one-time setup

**Pilot only; no real patient data.** The signing certificate for an APK is separate from the non-exportable P-256 identity key generated in the phone's Android Keystore.

## Why this is necessary
GitHub Actions debug builds use ephemeral debug signing keys. Android will refuse an update if signing certificates differ. Uninstalling the existing Android Pilot destroys its app-private data and may destroy the Android Keystore identity already registered in Health. **Do not uninstall 0.1.2 until the stable signed 0.1.3 APK is built and you are ready to re-register the device once.**

## Stable signing credentials (never commit to GitHub)
The project supports only two encrypted GitHub Actions secrets:
- `HEALTH_SIGNING_KEYSTORE_BASE64`: Base64 encoding of a password-protected PKCS#12 keystore containing alias `healthpilot`.
- `HEALTH_SIGNING_PASSWORD`: Password for the keystore and private key.

Store the original keystore and password offline in two protected locations. Losing them means future APK updates cannot be signed with the same identity. Do not add either value to GitHub source, Issues, screenshots, chat messages, Vercel envs, or public website assets.

To register them, visit `saributrchal-alt/health` → Settings → Secrets and variables → Actions → New repository secret. Paste the full one-line Base64 into the first secret and the password into the second.

Then go to Actions → Android Health Pilot (hardware test only) → Run workflow. The job produces a **Nathoeng-Health-Android-STABLE-SIGNED-PILOT** artifact ONLY after both secrets exist; the DEBUG artifact is for compiler tests and should not be installed for approved Health device verification.

## First transition from the existing 0.1.2 debug installation
1. Record old Device ID and public key. Keep 0.1.2 installed until stable 0.1.3 has built successfully.
2. In Temple, disable/revoke the old device registration if switching APK signing identities.
3. Uninstall the old debug Pilot. This **invalidates the old Android Keystore device key**. It cannot be restored from a public key.
4. Install the stable signed APK. Open registration info; it will generate a new Device ID and non-exportable Android Keystore private key.
5. Register and approve the new public key with Temple. Keep using this signed Android app for subsequent updates without uninstalling.
6. Tap **0.1 ตรวจสอบอุปกรณ์กับ Health Server**; expect a device-verification-only success message. Any 403 means not approved or the key does not match. Never send the full citizen ID or a PIN in troubleshooting.
7. Confirm inserting / removing ID card clears on-screen identity and form fields as before.

## What verification means
The 0.1.3 test uses HTTPS to request a one-time 20-second challenge and signs it using the Android Keystore private key. The server validates its registered public key and consumes the challenge exactly once.

A successful device verification **does not** verify the person, enroll a PIN, create a member session, or write any health measurement. Keep member authentication disabled until consent, secure card matching, PIN enrolment, access isolation and revocation are all tested.
