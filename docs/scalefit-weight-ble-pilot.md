# Scalefit weight BLE — isolated decoder pilot

This branch adds a **pure-Java, offline-only decoder** and sample tests to the existing Health Android pilot. It does **not** add a scan UI, upload data, change Supabase, or deploy to health.nathoeng.com.

## Observed sample frames
- `10 FF C0 7B 19 41 17 70 0A 01 25 08 B8 D0 8A 4A 37` -> 64.65 kg
- `10 FF C0 7E 19 5F 17 70 0A 01 25 08 B8 D0 8A 4A 37` -> 64.95 kg

The manufacturer identifier varies. The decoder checks only the low byte `C0`, marker `17 70`, and a plausible weight range. This is an **experimental heuristic**, not a vendor-verified protocol. Nearby devices might collide. Verify the BLE address or trusted identity and compare many physical readings before use.

## Android integration (not yet implemented)
1. Request appropriate Bluetooth scan permission and start an Android `BluetoothLeScanner` scan.
2. In `ScanCallback.onScanResult`, iterate `ScanRecord.getManufacturerSpecificData()` keys and pass each payload to `ScalefitWeight.fromManufacturer(companyId,payload)`. Never prepend the AD length/type to those payloads.
3. Display provisional weight, signal strength and last update; do not silently persist a reading.
4. Require human review and explicit confirmation before associating the reading with a verified Health member.
5. Implement authenticated server-side save with per-member authorization and RLS separately. Never put service-role keys in the APK.

## Local decoder test
```sh
javac -d /tmp/scalefit-test android/app/src/main/java/com/nathoeng/healthpilot/ScalefitWeight.java android/tests/com/nathoeng/healthpilot/ScalefitWeightTest.java
java -cp /tmp/scalefit-test com.nathoeng.healthpilot.ScalefitWeightTest
```

**Safety:** This code is not a medical device integration and has not been tested against the physical scale or an APK build.
