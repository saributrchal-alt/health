package com.nathoeng.healthpilot;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.app.PendingIntent;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.os.*;
import android.util.SparseArray;
import android.view.WindowManager;
import android.widget.*;
import com.saributr.usbprobe.UsbCardProbe;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public final class WeightKioskActivity extends Activity {
  private static final String USB_PERMISSION="com.nathoeng.healthpilot.WEIGHT_USB_PERMISSION";
  private final Handler main=new Handler(Looper.getMainLooper());
  private final ExecutorService io=Executors.newSingleThreadExecutor();
  private final Runnable poll=this::pollCard;
  private UsbManager usb;
  private BluetoothAdapter adapter;
  private BluetoothLeScanner scanner;
  private ScanCallback scan;
  private TextView status, weight;
  private Button start, save, configure;
  private String deviceId, scaleAddress, cardId, readingId;
  private UsbDevice cardReader;
  private boolean active, busy, verified, saved, weightPending;
  private volatile int generation;
  private int hundredths, samples;
  private long firstSample, lastSample;
  private final Runnable scanTimeout=()->{
    stopScan();
    if(readingId==null)status.setText("ยังไม่ได้ค่าน้ำหนัก ลองชั่งอีกครั้ง");
  };
  private final BroadcastReceiver detached=new BroadcastReceiver(){
    @Override public void onReceive(Context context,Intent intent){
      UsbDevice removed=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
      if(removed!=null&&removed.equals(cardReader))clearCard("ถอดเครื่องอ่านแล้ว");
    }
  };

  @Override protected void onCreate(Bundle state){
    super.onCreate(state);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE|WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    deviceId=getIntent().getStringExtra("device_id");
    usb=getSystemService(UsbManager.class);
    BluetoothManager manager=getSystemService(BluetoothManager.class);
    adapter=manager==null?null:manager.getAdapter();
    scaleAddress=getPreferences(MODE_PRIVATE).getString("scale_address","");
    LinearLayout column=new LinearLayout(this);
    column.setOrientation(LinearLayout.VERTICAL);
    column.setPadding(28,36,28,36);
    ScrollView scroll=new ScrollView(this);
    scroll.addView(column);setContentView(scroll);
    TextView title=new TextView(this);
    title.setText("ชั่งน้ำหนัก | Health Nathoeng");title.setTextSize(24);column.addView(title);
    status=new TextView(this);status.setTextSize(18);column.addView(status);
    weight=new TextView(this);weight.setTextSize(44);column.addView(weight);
    start=new Button(this);start.setText("เริ่มชั่ง");start.setOnClickListener(v->startScan());column.addView(start);
    save=new Button(this);save.setText("ยืนยันและบันทึก");save.setOnClickListener(v->saveWeight());column.addView(save);
    configure=new Button(this);configure.setText("ตั้งค่าเครื่องชั่ง");configure.setOnClickListener(v->configureScale());column.addView(configure);
    Button permission=new Button(this);permission.setText("อนุญาตเครื่องอ่าน USB");
    permission.setOnClickListener(v->authorizeReader());column.addView(permission);
    IntentFilter filter=new IntentFilter(UsbManager.ACTION_USB_DEVICE_DETACHED);
    if(Build.VERSION.SDK_INT>=33)registerReceiver(detached,filter,Context.RECEIVER_NOT_EXPORTED);
    else registerReceiver(detached,filter);
    clearCard("กรุณาเสียบบัตรประชาชน");
  }

  private UsbDevice reader(){
    for(UsbDevice device:usb.getDeviceList().values())
      for(int i=0;i<device.getInterfaceCount();i++)
        if(device.getInterface(i).getInterfaceClass()==UsbConstants.USB_CLASS_CSCID)return device;
    return null;
  }

  private void authorizeReader(){
    UsbDevice device=reader();
    if(device==null){status.setText("กรุณาต่อเครื่องอ่านบัตร USB-C");return;}
    if(usb.hasPermission(device))return;
    Intent intent=new Intent(USB_PERMISSION).setPackage(getPackageName());
    int flags=PendingIntent.FLAG_UPDATE_CURRENT|(Build.VERSION.SDK_INT>=31?PendingIntent.FLAG_MUTABLE:0);
    usb.requestPermission(device,PendingIntent.getBroadcast(this,device.getDeviceId(),intent,flags));
  }

  private void pollCard(){
    if(!active)return;
    main.postDelayed(poll,1500);
    if(busy||weightPending)return;
    UsbDevice device=reader();
    if(device==null||!usb.hasPermission(device)){
      clearCard(device==null?"กรุณาต่อเครื่องอ่านบัตร USB-C":"กรุณากดอนุญาตเครื่องอ่าน USB");
      return;
    }
    busy=true;
    final int ticket=generation;
    final boolean checkMember=cardId==null;
    io.execute(()->{
      String id=null;
      boolean allowed=false;
      try {
        id=UsbCardProbe.readCitizenId(usb,device);
        if(checkMember&&ticket==generation)allowed=HealthDeviceProof.checkBoundCard(deviceId,id);
      } catch(Exception ignored){}
      String seen=id;
      boolean eligible=allowed;
      main.post(()->{
        busy=false;
        if(!active||generation!=ticket)return;
        if(seen==null){
          clearCard(weightPending?"ถอดบัตรแล้ว กรุณาตรวจสอบผลกับผู้ดูแลหากเพิ่งกดบันทึก":"กรุณาเสียบบัตรประชาชน");
        } else if(checkMember){
          cardReader=device;cardId=seen;verified=eligible;
          status.setText(eligible?"ยืนยันสมาชิกแล้ว กดเริ่มชั่งและเสียบบัตรค้างไว้":"ตรวจสิทธิ์ Health ไม่สำเร็จ ถอดบัตรแล้วลองใหม่");
          updateButtons();
        } else if(!device.equals(cardReader)||!seen.equals(cardId)){
          clearCard("เปลี่ยนบัตร กำลังตรวจสิทธิ์สมาชิกคนใหม่");
        }
      });
    });
  }

  private void configureScale(){
    EditText address=new EditText(this);
    address.setSingleLine(true);address.setHint("AA:BB:CC:DD:EE:FF");address.setText(scaleAddress);
    new AlertDialog.Builder(this).setTitle("ที่อยู่ Bluetooth ของเครื่องชั่ง").setView(address)
      .setNegativeButton("ยกเลิก",null).setPositiveButton("บันทึก",(dialog,which)->{
        String value=address.getText().toString().trim().toUpperCase(Locale.ROOT);
        if(!BluetoothAdapter.checkBluetoothAddress(value)){status.setText("ที่อยู่ Bluetooth ไม่ถูกต้อง");return;}
        scaleAddress=value;
        getPreferences(MODE_PRIVATE).edit().putString("scale_address",value).apply();
        clearReading();
        status.setText(verified?"พร้อมชั่งน้ำหนัก":"บันทึกเครื่องชั่งแล้ว กรุณาเสียบบัตรประชาชน");
      }).show();
  }

  private void startScan(){
    if(!verified||saved||weightPending)return;
    if(scaleAddress.isEmpty()){status.setText("กรุณาตั้งค่าเครื่องชั่งก่อน");return;}
    String[] permissions=Build.VERSION.SDK_INT>=31
      ? new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT}
      : new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
    for(String permission:permissions){
      if(checkSelfPermission(permission)!=PackageManager.PERMISSION_GRANTED){requestPermissions(permissions,42);return;}
    }
    if(adapter==null||!adapter.isEnabled()){status.setText("กรุณาเปิด Bluetooth");return;}
    clearReading();
    scanner=adapter.getBluetoothLeScanner();
    if(scanner==null){status.setText("เปิดการค้นหา Bluetooth ไม่สำเร็จ");return;}
    long scanStarted=SystemClock.elapsedRealtimeNanos();
    scan=new ScanCallback(){
      @Override public void onScanResult(int type,ScanResult result){
        main.post(()->{
          if(scan==this&&result.getTimestampNanos()>=scanStarted)observe(result.getScanRecord());
        });
      }
      @Override public void onScanFailed(int error){
        main.post(()->{
          if(scan==this){stopScan();status.setText("ค้นหาเครื่องชั่งไม่สำเร็จ");}
        });
      }
    };
    try{
      ScanFilter filter=new ScanFilter.Builder().setDeviceAddress(scaleAddress).build();
      scanner.startScan(Collections.singletonList(filter),
        new ScanSettings.Builder().setScanMode(ScanSettings.SCAN_MODE_LOW_LATENCY).build(),scan);
      main.postDelayed(scanTimeout,60000);
      status.setText("ขึ้นเครื่องชั่งและยืนให้นิ่ง");
    }catch(SecurityException|IllegalStateException e){
      stopScan();status.setText("เปิดการค้นหาเครื่องชั่งไม่สำเร็จ");
    }
  }

  private void observe(ScanRecord record){
    if(record==null)return;
    SparseArray<byte[]> fields=record.getManufacturerSpecificData();
    for(int i=0;i<fields.size();i++){
      ScalefitWeight.Reading candidate=ScalefitWeight.fromManufacturer(fields.keyAt(i),fields.valueAt(i));
      if(candidate==null)continue;
      int value=(int)Math.round(candidate.kilograms*100);
      long now=SystemClock.elapsedRealtime();
      if(value!=hundredths||now-lastSample>3000){samples=0;firstSample=now;readingId=null;}
      hundredths=value;
      lastSample=now;
      samples++;
      if(samples>=3&&now-firstSample>=1000&&readingId==null)readingId=UUID.randomUUID().toString();
      weight.setText(String.format(Locale.ROOT,"%.2f กก.",candidate.kilograms));
      status.setText(readingId==null?"กำลังอ่านน้ำหนัก":"เทียบค่ากับหน้าจอเครื่องชั่ง แล้วกดยืนยัน");
      updateButtons();
      return;
    }
  }

  private void saveWeight(){
    if(!verified||saved||weightPending||readingId==null)return;
    if(SystemClock.elapsedRealtime()-lastSample>60000){
      clearReading();status.setText("ค่าน้ำหนักหมดเวลา กรุณาชั่งใหม่");return;
    }
    stopScan();
    weightPending=true;updateButtons();
    String expected=cardId, measurement=readingId;
    UsbDevice device=cardReader;
    int value=hundredths, ticket=generation;
    status.setText("กำลังตรวจบัตรใบเดิมและบันทึกน้ำหนัก");
    io.execute(()->{
      boolean result=false;
      try {
        result=HealthDeviceProof.saveWeight(deviceId,measurement,value,()->{
          if(ticket!=generation||!usb.hasPermission(device))throw new IllegalStateException();
          String current=UsbCardProbe.readCitizenId(usb,device);
          if(ticket!=generation||!expected.equals(current))throw new IllegalStateException();
          return current;
        });
      }catch(Exception ignored){}
      boolean ok=result;
      main.post(()->{
        if(!active||generation!=ticket)return;
        weightPending=false;saved=ok;
        if(ok)readingId=null;
        status.setText(ok?"บันทึกน้ำหนักแล้ว กรุณาถอดบัตร":"ยังยืนยันผลการบันทึกไม่ได้ กรุณาเสียบบัตรเดิมและกดบันทึกอีกครั้ง");
        updateButtons();
      });
    });
  }

  private void updateButtons(){
    start.setEnabled(verified&&!saved&&!weightPending);
    save.setEnabled(verified&&!saved&&!weightPending&&readingId!=null);
    configure.setEnabled(cardId==null&&!busy);
  }

  private void stopScan(){
    main.removeCallbacks(scanTimeout);
    ScanCallback previous=scan;
    scan=null;
    if(previous!=null&&scanner!=null)
      try{scanner.stopScan(previous);}catch(SecurityException|IllegalStateException ignored){}
  }

  private void clearReading(){
    stopScan();
    readingId=null;samples=0;lastSample=0;hundredths=0;
    weight.setText("— กก.");
    updateButtons();
  }

  private void clearCard(String prompt){
    generation++;
    cardId=null;cardReader=null;verified=false;saved=false;weightPending=false;
    clearReading();
    status.setText(prompt);
  }

  @Override protected void onStart(){
    super.onStart();
    active=true;
    main.post(poll);
  }

  @Override protected void onStop(){
    active=false;
    main.removeCallbacks(poll);
    clearCard("กรุณาเสียบบัตรประชาชน");
    super.onStop();
  }

  @Override protected void onDestroy(){
    unregisterReceiver(detached);
    io.shutdownNow();
    super.onDestroy();
  }
}
