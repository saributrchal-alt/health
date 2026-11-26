# Health Nathoeng weight kiosk

On a dedicated Android station, open **ชั่งน้ำหนักด้วยบัตรประชาชน**. Register and approve the Health device, grant USB permission to the CCID reader, and enter the Bluetooth address of the station's Scalefit in **ตั้งค่าเครื่องชั่ง**.

Insert an approved Health member's Thai ID card. After the server confirms Health access, tap **เริ่มชั่ง**, step on the scale and wait for a stable reading. Compare the kilograms shown by both devices and tap **ยืนยันและบันทึก** while the same card remains in the reader. Remove the card before the next member. Readings persist in `health_kiosk_weights` under the approved Health member. This screen grants measurement submission only.

In a test environment, apply `sql/011_health_kiosk_weights.sql` after the existing kiosk and card-binding migrations. Enable the server endpoint with `HEALTH_KIOSK_WEIGHT_ENABLED=true`. The Android application points to `https://health.nathoeng.com` by default. Use the test deployment hostname in a separate test build.

With an approved test member and a registered test Android installation, compare the BLE reading against the scale, confirm that the member and value are correct in the database, and repeat after swapping the card and disconnecting USB. Test with a second nearby BLE scale, a revoked card and a retry after a dropped response. Retries on the same confirmation reuse the reading ID. Confirm the actual reader and scale work simultaneously on the station before enabling the endpoint for members.
