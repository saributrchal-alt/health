# Health Nathoeng weight kiosk

On a dedicated Android station, open **ชั่งน้ำหนักด้วยบัตรประชาชน**. Register and approve the Health device, grant USB permission to the CCID reader, and enter the Bluetooth address of the station's Scalefit in **ตั้งค่าเครื่องชั่ง**.

Insert an approved Health member's Thai ID card. After the server confirms Health access, tap **เริ่มชั่ง**, step on the scale and wait for a stable reading. Compare the kilograms shown by both devices and tap **ยืนยันและบันทึก** while the same card remains in the reader. Remove the card before the next member. Readings are stored under the approved member ID in the `health_kiosk_weights` MariaDB table on Hostinger.

## Deploy the weight endpoint

1. In Hostinger hPanel, create a database for Health under the website that serves `media.nathoeng.com`. Import `hostinger/health-kiosk-weights.sql` into that database.
2. Place `hostinger/health-weight.php` beside the existing `upload.php` on Hostinger. The expected endpoint is `https://media.nathoeng.com/health-weight.php`.
3. In the directory that contains the website's `public_html`, create `nathoeng-private-health/weight-config.php` using `hostinger/weight-config.example.php`. Enter the Hostinger database connection details and generate a dedicated token with `openssl rand -hex 32`. Keep the config outside `public_html` and restrict it to the hosting account.
4. Apply `sql/011_health_kiosk_weight_authorization.sql` to the Supabase project that holds the existing Health devices and approved card bindings. The function checks the one-time challenge and returns an authorized member ID. The weight endpoint sends Hostinger the reading ID, member ID, device ID and value.
5. Set `HEALTH_WEIGHT_STORAGE_TOKEN` to the same token in the Health backend's server environment. Deploy this version of Health with `HEALTH_KIOSK_WEIGHT_ENABLED=true`. The existing APK uses `https://health.nathoeng.com/api/kiosk/weight`.

## Verify a save

Use an approved test member and a registered Android installation. Compare the BLE reading with the scale and confirm the app displays **บันทึกน้ำหนักแล้ว**. Check that Hostinger contains one row for the member with the expected value in hundredths of a kilogram. Retry after a dropped response and confirm that the same reading ID still has one row. Check that a revoked card cannot submit a reading.
