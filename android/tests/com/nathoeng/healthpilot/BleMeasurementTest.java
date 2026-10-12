package com.nathoeng.healthpilot;
public class BleMeasurementTest {
  private static void check(boolean ok) {if(!ok)throw new AssertionError("Parser test failed");}
  public static void main(String[] ignored) {
    BleMeasurement.Pressure bp=BleMeasurement.pressure(new byte[]{4,120,0,80,0,90,0,72,0});
    check(bp.systolic==120 && bp.diastolic==80 && bp.pulse==72);
    check(BleMeasurement.pressure(new byte[]{0,120,0,80,0,90,0}).pulse==null);
    check(BleMeasurement.heartRate(new byte[]{0,72})==72);
    check(BleMeasurement.heartRate(new byte[]{1,(byte)150,0})==150);
    BleMeasurement.validateManual("120","80","72");
    boolean fails=false;try {BleMeasurement.pressure(new byte[]{4,120,0,80,0,90,0});}catch(IllegalArgumentException ok){fails=true;}check(fails);
    fails=false;try{BleMeasurement.pressure(new byte[]{0,50,0,80,0,90,0});}catch(IllegalArgumentException ok){fails=true;}check(fails);
    fails=false;try{BleMeasurement.validateManual("80","120","72");}catch(IllegalArgumentException ok){fails=true;}check(fails);
    System.out.println("Android health BLE parser tests passed");
  }
}
