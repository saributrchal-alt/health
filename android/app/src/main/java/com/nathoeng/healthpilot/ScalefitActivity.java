package com.nathoeng.healthpilot;

import android.Manifest;
import android.app.Activity;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothManager;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanRecord;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.SparseArray;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** Scalefit experimental scan preview. No identity association, storage or network requests. */
public final class ScalefitActivity extends Activity {
  private static final int PERMISSION_REQUEST=42;
  private final Handler handler=new Handler(Looper.getMainLooper());
  private BluetoothLeScanner scanner;
  private BluetoothAdapter adapter;
  private TextView status, reading;
  private boolean scanning=false;
  private static final String SCALE_MAC="08:B8:D0:8A:4A:37";
  private long lastSeen=0;
  private double lastWeight=-1;
  private int matchingFrames=0;
  private long firstMatchTime=0;
  private final Runnable timeout=()->{
    if(scanning) {
      stopScan();
      status.setText("หยุดสแกนอัตโนมัติหลัง 30 วินาที");
    }
  };
  private final ScanCallback callback=new ScanCallback() {
    @Override public void onScanResult(int type,ScanResult result) {
      if(!scanning || result==null)return;
      if(result.getDevice()==null)return;
      String address;
      try{address=result.getDevice().getAddress();}catch(SecurityException e){return;}
      if(!SCALE_MAC.equalsIgnoreCase(address))return;
      ScanRecord record=result.getScanRecord();
      if(record==null)return;
      SparseArray<byte[]> data=record.getManufacturerSpecificData();
      if(data==null)return;
      for(int i=0;i<data.size();i++) {
        ScalefitWeight.Reading weight=ScalefitWeight.fromManufacturer(data.keyAt(i),data.valueAt(i));
        if(weight==null)continue;
        long now=android.os.SystemClock.elapsedRealtime();
        lastSeen=now;
        if(lastWeight>=0 && Math.abs(weight.kilograms-lastWeight)<=0.05 && now-firstMatchTime<=10000)matchingFrames++;
        else{matchingFrames=1;firstMatchTime=now;}
        lastWeight=weight.kilograms;
        boolean stableCandidate=matchingFrames>=4 && now-firstMatchTime>=1500;
        reading.setText(String.format(java.util.Locale.US,
          "ค่าชั่วคราว %.2f kg\nRSSI %d dBm\nManufacturer 0x%04X\nยังไม่ยืนยันความนิ่งหรือเจ้าของข้อมูล",
          weight.kilograms,result.getRssi(),weight.companyId));
        status.setText(stableCandidate?"น้ำหนักนิ่งเบื้องต้น ("+matchingFrames+" เฟรม) • ยังไม่ยืนยันจบการชั่ง":"กำลังอ่าน ("+matchingFrames+" เฟรม) • ตรวจสอบกับเครื่องชั่ง");
        break;
      }
    }
    @Override public void onScanFailed(int code) {
      runOnUiThread(()->{stopScan();status.setText("BLE scan failed: "+code);});
    }
  };
  @Override public void onCreate(Bundle state) {
    super.onCreate(state);
    BluetoothManager manager=(BluetoothManager)getSystemService(BLUETOOTH_SERVICE);
    adapter=manager==null?null:manager.getAdapter();
    ScrollView scroll=new ScrollView(this);
    LinearLayout column=new LinearLayout(this);
    column.setOrientation(LinearLayout.VERTICAL);
    column.setPadding(30,35,30,35);
    scroll.addView(column);setContentView(scroll);
    TextView title=new TextView(this);title.setTextSize(23);title.setText("Scalefit • ทดลองอ่านน้ำหนัก");column.addView(title);
    status=new TextView(this);status.setTextSize(17);status.setText("ยังไม่เริ่มสแกน");column.addView(status);
    reading=new TextView(this);reading.setTextSize(22);reading.setText("— kg");column.addView(reading);
    Button start=new Button(this);start.setText("เริ่มอ่าน BLE (30 วินาที)");start.setOnClickListener(v->startScan());column.addView(start);
    Button stop=new Button(this);stop.setText("หยุดสแกน / ล้างค่า");stop.setOnClickListener(v->{
      stopScan();reading.setText("— kg");lastSeen=0;lastWeight=-1;matchingFrames=0;firstMatchTime=0;status.setText("หยุดแล้ว");
    });column.addView(stop);
    TextView warning=new TextView(this);warning.setText(
      "ทดลองอุปกรณ์เท่านั้น ไม่บันทึก ไม่ส่งข้อมูลขึ้น Health และไม่ผูกกับสมาชิก "+
      "ค่าที่แสดงเป็นการตีความข้อมูล BLE เบื้องต้น ต้องเทียบกับเครื่องชั่งจริง");
    column.addView(warning);
  }
  private boolean hasPermissions() {
    if(Build.VERSION.SDK_INT>=31)
      return checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)==PackageManager.PERMISSION_GRANTED
        &&checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)==PackageManager.PERMISSION_GRANTED;
    return checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED;
  }
  private void startScan() {
    if(scanning)return;
    if(!hasPermissions()) {
      if(Build.VERSION.SDK_INT>=31)
        requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT},PERMISSION_REQUEST);
      else requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},PERMISSION_REQUEST);
      return;
    }
    if(adapter==null||!adapter.isEnabled()) {status.setText("โปรดเปิด Bluetooth ก่อน");return;}
    try {
      scanner=adapter.getBluetoothLeScanner();
      if(scanner==null){status.setText("ไม่พบ BLE Scanner");return;}
      scanning=true;
      reading.setText("กำลังรอเครื่องชั่ง...");lastWeight=-1;matchingFrames=0;firstMatchTime=0;
      scanner.startScan(callback);
      handler.postDelayed(timeout,30000);
      status.setText("กำลังสแกน • โปรดเหยียบเครื่องชั่ง");
    }catch(SecurityException|IllegalStateException e) {
      scanning=false;status.setText("ไม่สามารถเริ่มสแกน: "+e.getClass().getSimpleName());
    }
  }
  private void stopScan() {
    handler.removeCallbacks(timeout);
    if(!scanning)return;
    scanning=false;
    if(scanner!=null)try{scanner.stopScan(callback);}catch(SecurityException|IllegalStateException ignored){}
  }
  @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
    super.onRequestPermissionsResult(request,permissions,results);
    if(request==PERMISSION_REQUEST) {
      if(hasPermissions())startScan();
      else status.setText("ไม่ได้รับสิทธิ์ Bluetooth/Location ที่จำเป็น");
    }
  }
  @Override protected void onStop(){stopScan();super.onStop();}
  @Override protected void onDestroy(){stopScan();super.onDestroy();}
}
