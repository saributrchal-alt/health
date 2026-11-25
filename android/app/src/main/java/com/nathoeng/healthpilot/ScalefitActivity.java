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
  private long lastSeen=0, firstMatch=0;
  private int matches=0, lastHundredths=-1;
  private boolean candidate=false;
  private Button confirm;
  private final Runnable timeout=()->{
    if(scanning) {
      stopScan();
      status.setText(candidate ? "ค่าล่าสุด • เทียบหน้าจอเครื่องชั่งก่อนยืนยัน" : "หมดเวลาสแกน • กดเริ่มชั่งใหม่");
    }
  };
  private final ScanCallback callback=new ScanCallback() {
    @Override public void onScanResult(int type,ScanResult result) {
      if(!scanning || result==null)return;
      ScanRecord record=result.getScanRecord();
      if(record==null)return;
      SparseArray<byte[]> data=record.getManufacturerSpecificData();
      if(data==null)return;
      for(int i=0;i<data.size();i++) {
        byte[] payload=data.valueAt(i);
        if(payload==null || payload.length!=13 || !java.util.Arrays.equals(java.util.Arrays.copyOfRange(payload,7,13),new byte[]{8,(byte)0xB8,(byte)0xD0,(byte)0x8A,0x4A,0x37}))continue;
        ScalefitWeight.Reading weight=ScalefitWeight.fromManufacturer(data.keyAt(i),payload);
        if(weight==null)continue;
        long now=android.os.SystemClock.elapsedRealtime();
        int current=(int)Math.round(weight.kilograms*100);
        if(current!=lastHundredths || now-lastSeen>3000){matches=0;firstMatch=now;}
        matches++;lastHundredths=current;lastSeen=now;
        candidate=matches>=3 && now-firstMatch>=1000;
        reading.setText(String.format(java.util.Locale.US,"%.2f kg",weight.kilograms));
        confirm.setEnabled(candidate);
        status.setText(candidate?"น้ำหนักคงที่เบื้องต้น • โปรดตรวจสอบและยืนยัน":"กำลังอ่านน้ำหนัก…");
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
    TextView title=new TextView(this);title.setTextSize(23);title.setText("ScaleFit • เครื่องชั่งน้ำหนัก");column.addView(title);
    status=new TextView(this);status.setTextSize(17);status.setText("ยังไม่เริ่มสแกน");column.addView(status);
    reading=new TextView(this);reading.setTextSize(54);reading.setText("— kg");reading.setGravity(android.view.Gravity.CENTER);reading.setPadding(0,48,0,48);column.addView(reading);
    Button start=new Button(this);start.setText("เริ่มชั่ง / ชั่งใหม่");start.setOnClickListener(v->startScan());column.addView(start);
    Button stop=new Button(this);stop.setText("หยุดสแกน / ล้างค่า");stop.setOnClickListener(v->{
      stopScan();reading.setText("— kg");lastSeen=0;matches=0;candidate=false;confirm.setEnabled(false);status.setText("หยุดแล้ว");
    });column.addView(stop);
    confirm=new Button(this);confirm.setText("ยืนยันน้ำหนัก");confirm.setEnabled(false);confirm.setOnClickListener(v->{if(!candidate)return;stopScan();confirm.setEnabled(false);status.setText("ยืนยันผลบนหน้าจอแล้ว • ไม่บันทึกข้อมูล");});column.addView(confirm);
    TextView warning=new TextView(this);warning.setText(
      "แอปอิสระ • ไม่ต้องเข้าสู่ระบบ ไม่บันทึกหรือส่งข้อมูลออกจากมือถือ "+
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
    if(scanning)stopScan();
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
      lastSeen=0;matches=0;lastHundredths=-1;candidate=false;confirm.setEnabled(false);
      reading.setText("— kg");
      scanner.startScan(null,new android.bluetooth.le.ScanSettings.Builder().setScanMode(android.bluetooth.le.ScanSettings.SCAN_MODE_LOW_LATENCY).build(),callback);
      handler.postDelayed(timeout,60000);
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
