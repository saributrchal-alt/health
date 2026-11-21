package com.nathoeng.healthpilot;

/**
 * Experimental Scalefit advertisement decoder. No network, patient identity or automatic save.
 * Evidence: 0x10FF C07B 1941 1770 0A0125 08B8D08A4A37 -> 64.65 kg;
 *           0x10FF C07E 195F 1770 0A0125 08B8D08A4A37 -> 64.95 kg.
 *
 * The raw samples begin with AD length=0x10 and type=0xFF. Android's
 * getManufacturerSpecificData(id) excludes the 2-byte company ID.
 * Company ID is little-endian (e.g. C0 7B => 0x7BC0) and varies.
 * The following protocol assumptions MUST be confirmed with real hardware.
 */
public final class ScalefitWeight {
  private ScalefitWeight() {}

  public static final class Reading {
    public final double kilograms;
    public final int companyId;
    Reading(double kilograms, int companyId) {
      this.kilograms = kilograms;
      this.companyId = companyId;
    }
  }

  /** Accept Android manufacturer payload (without company ID), or return null. */
  public static Reading fromManufacturer(int companyId, byte[] payload) {
    if ((companyId & 255) != 0xC0 || payload == null || payload.length < 6) return null;
    if ((payload[2] & 255) != 0x17 || (payload[3] & 255) != 0x70) return null;
    int hundredths = ((payload[0] & 255) << 8) | (payload[1] & 255);
    double kg = hundredths / 100.0;
    if (kg < 5 || kg > 300) return null;
    return new Reading(kg, companyId);
  }

  /** Parse one complete BLE AD structure, including its length and 0xFF type. */
  public static Reading fromAdvertisement(byte[] advertisement) {
    if (advertisement == null) return null;
    for (int pos = 0; pos < advertisement.length; ) {
      int len = advertisement[pos] & 255;
      if (len == 0) break;
      if (pos + 1 + len > advertisement.length) return null;
      if (len >= 9 && (advertisement[pos + 1] & 255) == 0xFF) {
        int id = (advertisement[pos + 2] & 255) | ((advertisement[pos + 3] & 255) << 8);
        byte[] payload = new byte[len - 3];
        System.arraycopy(advertisement, pos + 4, payload, 0, payload.length);
        Reading reading = fromManufacturer(id, payload);
        if (reading != null) return reading;
      }
      pos += len + 1;
    }
    return null;
  }
}
