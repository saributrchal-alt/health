package com.nathoeng.healthpilot;

/** Pure Java decoders for the standard Bluetooth SIG blood-pressure/heart-rate characteristics.
 * No readings are saved automatically. Values must be reviewed on screen first.
 */
public final class BleMeasurement {
  private BleMeasurement() {}
  public static final class Pressure {
    public final int systolic, diastolic;
    public final Integer pulse;
    public final String units;
    Pressure(int systolic, int diastolic, Integer pulse, String units) {
      this.systolic=systolic; this.diastolic=diastolic; this.pulse=pulse; this.units=units;
    }
  }
  private static int u8(byte[] v,int i) { return v[i]&255; }
  private static double sfloat(byte[] v,int i) {
    int raw=u8(v,i)|(u8(v,i+1)<<8);
    int mantissa=raw&0x0fff, exponent=raw>>12;
    if(mantissa>=0x07fd && mantissa<=0x0802) throw new IllegalArgumentException("Invalid BLE SFLOAT special value");
    if(mantissa>=0x0800)mantissa-=0x1000;
    if(exponent>=8)exponent-=16;
    double x=mantissa*Math.pow(10,exponent);
    if(!Double.isFinite(x))throw new IllegalArgumentException("Invalid value");
    return x;
  }
  public static Pressure pressure(byte[] v) {
    if(v==null||v.length<7) throw new IllegalArgumentException("Incomplete blood pressure measurement");
    int flags=u8(v,0), offset=7;
    double factor=(flags&1)!=0?7.50061683:1.0;
    double sys=sfloat(v,1)*factor, dia=sfloat(v,3)*factor;
    sfloat(v,5); // mean arterial pressure still needs to be valid
    if((flags&2)!=0) {
      if(v.length<offset+7)throw new IllegalArgumentException("Missing BLE timestamp");
      offset+=7;
    }
    Integer pulse=null;
    if((flags&4)!=0) {
      if(v.length<offset+2)throw new IllegalArgumentException("Missing BLE pulse");
      double hr=sfloat(v,offset);
      if(hr<30||hr>220)throw new IllegalArgumentException("Pulse outside pilot range");
      pulse=(int)Math.round(hr);
    }
    if(sys<60||sys>300||dia<30||dia>200||sys<=dia)
      throw new IllegalArgumentException("Pressure outside pilot range");
    return new Pressure((int)Math.round(sys),(int)Math.round(dia),pulse,"mmHg");
  }
  public static int heartRate(byte[] v) {
    if(v==null||v.length<2)throw new IllegalArgumentException("Incomplete heart-rate measurement");
    int flags=u8(v,0), value;
    if((flags&1)==0)value=u8(v,1);
    else {
      if(v.length<3)throw new IllegalArgumentException("Incomplete 16-bit heart rate");
      value=u8(v,1)|(u8(v,2)<<8);
    }
    if(value<30||value>220)throw new IllegalArgumentException("Heart rate outside pilot range");
    return value;
  }
  public static void validateManual(String sysText,String diaText,String pulseText) {
    final int sys,dia,pulse;
    try {
      if(!sysText.matches("[0-9]{2,3}")||!diaText.matches("[0-9]{2,3}")||!pulseText.matches("[0-9]{2,3}"))
        throw new NumberFormatException();
      sys=Integer.parseInt(sysText);dia=Integer.parseInt(diaText);pulse=Integer.parseInt(pulseText);
    }catch(Exception e){throw new IllegalArgumentException("กรอก SYS / DIA / Pulse เป็นตัวเลขทั้งหมด");}
    if(sys<60||sys>300||dia<30||dia>200||dia>=sys||pulse<30||pulse>220)
      throw new IllegalArgumentException("ตัวเลขอยู่นอกช่วงที่ระบบทดสอบรองรับ");
  }
}
