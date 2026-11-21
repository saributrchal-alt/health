package com.nathoeng.healthpilot;

public final class ScalefitWeightTest {
  private static void check(boolean ok) { if (!ok) throw new AssertionError("Scalefit parser test failed"); }
  private static byte[] hex(String h) {
    byte[] bytes = new byte[h.length()/2];
    for(int i=0;i<bytes.length;i++)bytes[i]=(byte)Integer.parseInt(h.substring(i*2,i*2+2),16);
    return bytes;
  }
  public static void main(String[] args) {
    ScalefitWeight.Reading a=ScalefitWeight.fromAdvertisement(hex("10FFC07B194117700A012508B8D08A4A37"));
    ScalefitWeight.Reading b=ScalefitWeight.fromAdvertisement(hex("10FFC07E195F17700A012508B8D08A4A37"));
    check(a!=null && a.kilograms==64.65 && a.companyId==0x7BC0);
    check(b!=null && b.kilograms==64.95 && b.companyId==0x7EC0);
    check(ScalefitWeight.fromManufacturer(0x7EC0,hex("195F17700A012508B8D08A4A37")).kilograms==64.95);
    check(ScalefitWeight.fromManufacturer(0x7EC0,hex("195F1771"))==null);
    check(ScalefitWeight.fromAdvertisement(hex("10FFC07E195F17700A012508B8D08A4A"))==null);
    check(ScalefitWeight.fromAdvertisement(hex("020106"))==null);
    check(ScalefitWeight.fromManufacturer(0x7EC0,hex("000117700A0125"))==null);
    System.out.println("Scalefit decoder samples passed");
  }
}
