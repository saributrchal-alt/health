package com.nathoeng.healthpilot;

import android.Manifest;
import android.app.Activity;
import android.app.PendingIntent;
import android.bluetooth.*;
import android.bluetooth.le.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.hardware.usb.*;
import android.os.*;
import android.view.*;
import android.widget.*;
import java.util.*;
import com.saributr.usbprobe.ThaiCard;
import com.saributr.usbprobe.UsbCardProbe;

/** Local hardware pilot only. NO login, device registration, medical history or data upload. */
public final class MainActivity extends Activity {
  private static final String USB_PERMISSION="com.nathoeng.healthpilot.USB_PERMISSION";
  private static final UUID BP_SERVICE=UUID.fromString("00001810-0000-1000-8000-00805f9b34fb");
  private static final UUID BP_VALUE=UUID.fromString("00002a35-0000-1000-8000-00805f9b34fb");
  private static final UUID HR_SERVICE=UUID.fromString("0000180d-0000-1000-8000-00805f9b34fb");
  private static final UUID HR_VALUE=UUID.fromString("00002a37-0000-1000-8000-00805f9b34fb");
  private static final UUID CCCD=UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
  private UsbManager usb;
  private BluetoothAdapter bluetooth;
  private BluetoothLeScanner bleScanner;
  private BluetoothGatt gatt;
  private TextView status, identity;
  private LinearLayout devices;
  private EditText systolic, diastolic, pulse;
  private boolean scanning=false, reading=false;
  private final Handler main=new Handler(Looper.getMainLooper());
  private final Set<String> seen=new HashSet<>();
  private int readGeneration=0;
  private final Runnable stopScan=()->stopBluetoothScan();
  private final BroadcastReceiver usbReceiver=new BroadcastReceiver(){
    @Override public void onReceive(Context context,Intent intent){
      String action=intent.getAction();
      if(USB_PERMISSION.equals(action)){
        // Recheck permissions from UsbManager; never trust forged extras.
        final UsbDevice device=firstReader();
        if(device!=null&&usb.hasPermission(device))readSmartCard(device);
        else message("ยังไม่ได้อนุญาตการเชื่อมต่อ USB");
      }else if(UsbManager.ACTION_USB_DEVICE_DETACHED.equals(action)){
        readGeneration++;clearIdentityAndValues();
        message("ถอดเครื่องอ่าน USB แล้ว ล้างข้อมูลบนหน้าจอแล้ว");
      }else if(UsbManager.ACTION_USB_DEVICE_ATTACHED.equals(action)){message("พบเครื่องอ่าน โปรดกดอ่านบัตร");}
    }
  };
  private final ScanCallback scanCallback=new ScanCallback(){
    @Override public void onScanResult(int type,ScanResult result){
      runOnUiThread(()->{
        BluetoothDevice device=result.getDevice();
        if(device==null||!seen.add(device.getAddress()))return;
        String name=null;try{name=device.getName();}catch(SecurityException ignored){}
        if(name==null||name.trim().isEmpty())name="BLE "+device.getAddress();
        final String label=name;
        Button button=button("เชื่อม Bluetooth: "+label);
        button.setOnClickListener(v->connectBluetooth(device,label));
        devices.addView(button);
      });
    }
    @Override public void onScanFailed(int error){runOnUiThread(()->{scanning=false;message("ค้นหา Bluetooth ไม่สำเร็จ รหัส "+error);});}
  };

  @Override public void onCreate(Bundle saved){
    super.onCreate(saved);
    usb=(UsbManager)getSystemService(USB_SERVICE);
    BluetoothManager bm=(BluetoothManager)getSystemService(BLUETOOTH_SERVICE);
    bluetooth=bm==null?null:bm.getAdapter();
    ScrollView scroll=new ScrollView(this);
    LinearLayout root=new LinearLayout(this);
    root.setOrientation(LinearLayout.VERTICAL);
    root.setPadding(28,35,28,35);
    scroll.addView(root);setContentView(scroll);
    TextView heading=text("NATHOENG HEALTH · Android Pilot",25);root.addView(heading);
    root.addView(text("ทดลองอุปกรณ์เท่านั้น • ไม่บันทึกข้อมูลสุขภาพ • ไม่ได้เข้าสู่ระบบสมาชิก",15));
    status=text("พร้อมทดสอบอุปกรณ์",16);root.addView(status);
    identity=text("ยังไม่ได้อ่านบัตร",16);root.addView(identity);
    Button read=button("1. อ่านบัตรประชาชนผ่าน Type-C OTG");read.setOnClickListener(v->requestCardRead());root.addView(read);
    Button clear=button("ล้างหน้าจอ / สิ้นสุดการทดลอง");clear.setOnClickListener(v->{readGeneration++;clearIdentityAndValues();disconnectBluetooth();message("ล้างข้อมูลแล้ว");});root.addView(clear);
    root.addView(text("2. ค่าความดันและชีพจร",20));
    systolic=number("SYS (ตัวบน) mmHg",root);
    diastolic=number("DIA (ตัวล่าง) mmHg",root);
    pulse=number("Pulse (ครั้ง/นาที)",root);
    Button validate=button("ตรวจค่าที่กรอก (ยังไม่บันทึก)");validate.setOnClickListener(v->previewValues());root.addView(validate);
    root.addView(text("3. รับค่าจาก Bluetooth LE (ถ้าเครื่องรองรับบริการมาตรฐาน)",19));
    Button scan=button("ค้นหาเครื่องวัด Bluetooth");scan.setOnClickListener(v->startBluetoothScan());root.addView(scan);
    devices=new LinearLayout(this);devices.setOrientation(LinearLayout.VERTICAL);root.addView(devices);
    root.addView(text("ค่าจาก Bluetooth จะถูกใส่ในช่องเพื่อให้ตรวจสอบก่อนเท่านั้น การเชื่อมต่อ OMRON HEM-7183T1-C ยังไม่ได้ยืนยัน และยังไม่มีการบันทึกหรือส่งค่าขึ้นเซิร์ฟเวอร์",14));
    IntentFilter f=new IntentFilter(USB_PERMISSION);
    f.addAction(UsbManager.ACTION_USB_DEVICE_ATTACHED);f.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
    if(Build.VERSION.SDK_INT>=33)registerReceiver(usbReceiver,f,Context.RECEIVER_NOT_EXPORTED);
    else registerReceiver(usbReceiver,f);
  }
  private TextView text(String label,int size){
    TextView t=new TextView(this);t.setText(label);t.setTextSize(size);t.setPadding(3,15,3,15);return t;
  }
  private Button button(String label){Button b=new Button(this);b.setText(label);b.setAllCaps(false);return b;}
  private EditText number(String hint,LinearLayout root){
    EditText n=new EditText(this);n.setSingleLine(true);n.setHint(hint);n.setInputType(android.text.InputType.TYPE_CLASS_NUMBER);root.addView(n);return n;
  }
  private void message(String text){status.setText(text);}
  private void clearIdentityAndValues(){
    identity.setText("ยังไม่ได้อ่านบัตร");
    if(systolic!=null)systolic.setText("");
    if(diastolic!=null)diastolic.setText("");
    if(pulse!=null)pulse.setText("");
  }
  private UsbDevice firstReader(){
    if(usb==null)return null;
    for(UsbDevice d:usb.getDeviceList().values())
      for(int i=0;i<d.getInterfaceCount();i++)
        if(d.getInterface(i).getInterfaceClass()==11)return d;
    return null;
  }
  private void requestCardRead(){
    if(reading)return;
    UsbDevice d=firstReader();
    if(d==null){message("ไม่พบเครื่องอ่าน CCID โปรดเสียบ USB Type-C OTG");return;}
    if(!usb.hasPermission(d)){
      Intent intent=new Intent(USB_PERMISSION).setPackage(getPackageName());
      int flags=PendingIntent.FLAG_UPDATE_CURRENT |
        (Build.VERSION.SDK_INT>=31?PendingIntent.FLAG_MUTABLE:0);
      PendingIntent reply=PendingIntent.getBroadcast(this,d.getDeviceId(),intent,flags);
      usb.requestPermission(d,reply);return;
    }
    readSmartCard(d);
  }
  private void readSmartCard(UsbDevice reader){
    if(reading)return;
    reading=true;int ticket=++readGeneration;message("กำลังอ่านบัตรจากชิป...");
    new Thread(()->{
      String result,error=null;
      try{
        ThaiCard.Data card=(ThaiCard.Data)UsbCardProbe.run(usb,reader,msg->runOnUiThread(()->{if(ticket==readGeneration)message(msg);}));
        String id=card.citizenId;
        String suffix=id!=null&&id.length()==13?id.substring(9):"----";
        result="อ่านบัตรสำเร็จ: "+card.name+" • ลงท้าย "+suffix+" (ยังไม่ได้ยืนยันสมาชิก)";
        // Do not write/store/full-display card number, photo, address, JSON or medical record.
        card.citizenId=null;card.photo=null;card.name=null;
      }catch(Exception e){result=null;error=e.getMessage();}
      final String ok=result,fail=error;
      runOnUiThread(()->{
        if(ticket!=readGeneration||isDestroyed())return;
        reading=false;
        if(ok==null){clearIdentityAndValues();message("อ่านบัตรไม่สำเร็จ: "+fail);}
        else {identity.setText(ok);message("อ่านบัตรได้แล้ว รอระบบยืนยันอุปกรณ์ + PIN ก่อนเปิดบัญชีจริง");}
      });
    },"health-otg-read").start();
  }
  private void previewValues(){
    try{
      BleMeasurement.validateManual(systolic.getText().toString(),diastolic.getText().toString(),pulse.getText().toString());
      message("ค่าตัวอย่าง "+systolic.getText()+"/"+diastolic.getText()+" ชีพจร "+pulse.getText()+" • ตรวจสอบแล้ว (ยังไม่บันทึก)");
    }catch(IllegalArgumentException e){message(e.getMessage());}
  }
  private boolean bluetoothPermission(){
    if(Build.VERSION.SDK_INT>=31){
      if(checkSelfPermission(Manifest.permission.BLUETOOTH_SCAN)!=PackageManager.PERMISSION_GRANTED||
        checkSelfPermission(Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED){
        requestPermissions(new String[]{Manifest.permission.BLUETOOTH_SCAN,Manifest.permission.BLUETOOTH_CONNECT},51);return false;
      }
    }else if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
      requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION},52);return false;
    }
    return true;
  }
  private void startBluetoothScan(){
    if(!bluetoothPermission()){message("อนุญาต Bluetooth แล้วกดค้นหาอีกครั้ง");return;}
    if(bluetooth==null||!bluetooth.isEnabled()){message("กรุณาเปิด Bluetooth ในมือถือก่อน");return;}
    stopBluetoothScan();
    seen.clear();devices.removeAllViews();
    bleScanner=bluetooth.getBluetoothLeScanner();
    if(bleScanner==null){message("Bluetooth LE ไม่พร้อม");return;}
    try{
      scanning=true;bleScanner.startScan(scanCallback);main.postDelayed(stopScan,12000);
      message("กำลังค้นหาเครื่อง Bluetooth 12 วินาที");
    }catch(SecurityException e){scanning=false;message("มือถือยังไม่ให้สิทธิ์ Bluetooth");}
  }
  private void stopBluetoothScan(){
    main.removeCallbacks(stopScan);
    if(scanning&&bleScanner!=null)try{bleScanner.stopScan(scanCallback);}catch(SecurityException ignored){}
    scanning=false;
  }
  private void connectBluetooth(BluetoothDevice device,String label){
    if(!bluetoothPermission())return;
    stopBluetoothScan();disconnectBluetooth();
    try{gatt=device.connectGatt(this,false,new BluetoothGattCallback(){
      @Override public void onConnectionStateChange(BluetoothGatt g,int status,int state){
        if(status!=BluetoothGatt.GATT_SUCCESS||state==BluetoothProfile.STATE_DISCONNECTED){
          runOnUiThread(()->message("Bluetooth หลุดการเชื่อมต่อ • ไม่บันทึกค่า"));
          g.close();return;
        }
        if(state==BluetoothProfile.STATE_CONNECTED)try{g.discoverServices();}catch(SecurityException ignored){}
      }
      @Override public void onServicesDiscovered(BluetoothGatt g,int status){
        if(status!=BluetoothGatt.GATT_SUCCESS){runOnUiThread(()->message("อ่านบริการ Bluetooth ไม่สำเร็จ"));return;}
        BluetoothGattCharacteristic chara=null;boolean indicate=false;
        BluetoothGattService bp=g.getService(BP_SERVICE);
        if(bp!=null){chara=bp.getCharacteristic(BP_VALUE);indicate=true;}
        if(chara==null){BluetoothGattService hr=g.getService(HR_SERVICE);if(hr!=null)chara=hr.getCharacteristic(HR_VALUE);}
        if(chara==null){runOnUiThread(()->message("อุปกรณ์นี้ไม่พบมาตรฐาน Blood Pressure 0x1810 / Heart Rate 0x180D"));return;}
        BluetoothGattDescriptor desc=chara.getDescriptor(CCCD);
        if(desc==null){runOnUiThread(()->message("อุปกรณ์ไม่รองรับการแจ้งค่ามาตรฐาน"));return;}
        try{
          g.setCharacteristicNotification(chara,true);
          byte[] v=indicate?BluetoothGattDescriptor.ENABLE_INDICATION_VALUE:BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
          if(Build.VERSION.SDK_INT>=33)g.writeDescriptor(desc,v);
          else{desc.setValue(v);g.writeDescriptor(desc);}
          runOnUiThread(()->message("เชื่อม Bluetooth แล้ว โปรดวัดจริงบนเครื่องเพื่อทดลองรับค่า"));
        }catch(SecurityException e){runOnUiThread(()->message("ไม่สามารถตั้งค่าการรับ Bluetooth"));}
      }
      @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c,byte[] value){received(c,value);}
      @Override public void onCharacteristicChanged(BluetoothGatt g,BluetoothGattCharacteristic c){received(c,c.getValue());}
    });message("กำลังเชื่อม Bluetooth: "+label);}
    catch(SecurityException e){message("มือถือยังไม่ให้สิทธิ์ Bluetooth");}
  }
  private void received(BluetoothGattCharacteristic c,byte[] bytes){
    if(c==null||bytes==null)return;
    try{
      if(BP_VALUE.equals(c.getUuid())){
        BleMeasurement.Pressure v=BleMeasurement.pressure(bytes);
        runOnUiThread(()->{
          systolic.setText(String.valueOf(v.systolic));diastolic.setText(String.valueOf(v.diastolic));
          if(v.pulse!=null)pulse.setText(String.valueOf(v.pulse));
          message("รับค่าความดันผ่าน Bluetooth แล้ว • โปรดตรวจเทียบหน้าจอเครื่อง ก่อนบันทึกเมื่อระบบยืนยันตัวตนพร้อม");
        });
      }else if(HR_VALUE.equals(c.getUuid())){
        int hr=BleMeasurement.heartRate(bytes);
        runOnUiThread(()->{pulse.setText(String.valueOf(hr));message("รับชีพจร Bluetooth "+hr+" • ตรวจสอบก่อนบันทึก");});
      }
    }catch(IllegalArgumentException e){runOnUiThread(()->message("ค่าจาก Bluetooth ไม่ถูกต้อง: "+e.getMessage()));}
  }
  private void disconnectBluetooth(){
    stopBluetoothScan();
    if(gatt!=null)try{gatt.disconnect();gatt.close();}catch(SecurityException ignored){}
    gatt=null;
  }
  @Override protected void onStop(){
    super.onStop();readGeneration++;identity.setText("ปิดข้อมูลบัตรเมื่อออกจากแอป");
    clearIdentityAndValues();disconnectBluetooth();
  }
  @Override protected void onDestroy(){unregisterReceiver(usbReceiver);disconnectBluetooth();super.onDestroy();}
}
