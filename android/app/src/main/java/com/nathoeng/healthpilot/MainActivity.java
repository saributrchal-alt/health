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
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
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
  private boolean scanning=false, reading=false, proofBusy=false;
  private int proofGeneration=0;
  private final Handler main=new Handler(Looper.getMainLooper());
  private final Set<String> seen=new HashSet<>();
  private int readGeneration=0;
  private final Runnable stopScan=()->stopBluetoothScan();
  private byte[] cardSalt,cardTag;
  private UsbDevice cardReader;
  private android.app.AlertDialog claimDialog, pinDialog;
  private boolean cardCheckRunning=false;
  private final Runnable cardCheck=()->verifySameCard();
  private void stopCardCheck(){
    if(claimDialog!=null){claimDialog.dismiss();claimDialog=null;}
    main.removeCallbacks(cardCheck);
    if(cardSalt!=null)Arrays.fill(cardSalt,(byte)0);
    if(cardTag!=null)Arrays.fill(cardTag,(byte)0);
    cardSalt=null;cardTag=null;cardReader=null;cardCheckRunning=false;
  }
  private static byte[] cardTag(String id,byte[] salt)throws Exception{
    MessageDigest sha=MessageDigest.getInstance("SHA-256");
    sha.update(salt);
    return sha.digest(id.getBytes(StandardCharsets.US_ASCII));
  }
  private void startCardCheck(UsbDevice reader,String id){
    stopCardCheck();
    byte[] salt=new byte[32];new SecureRandom().nextBytes(salt);
    try{cardSalt=salt;cardTag=cardTag(id,salt);cardReader=reader;main.postDelayed(cardCheck,2000);}
    catch(Exception ignored){clearIdentityAndValues();message("เริ่มตรวจการเสียบบัตรไม่สำเร็จ");}
  }
  /** Fail closed on removal, quick card swaps, permission loss, USB errors or reader failure. */
  private void verifySameCard(){
    if(cardReader==null||cardTag==null||cardSalt==null||cardCheckRunning||reading)return;
    final UsbDevice reader=cardReader;
    final int ticket=readGeneration;
    final byte[] expected=cardTag.clone(),salt=cardSalt.clone();
    cardCheckRunning=true;
    new Thread(()->{
      boolean matches=false;
      try{
        if(usb.hasPermission(reader)){
          String id=UsbCardProbe.readCitizenId(usb,reader);
          matches=MessageDigest.isEqual(expected,cardTag(id,salt));
        }
      }catch(Exception ignored){/* Fail closed: no valid evidence that the same card is still inserted. */}
      finally{Arrays.fill(expected,(byte)0);Arrays.fill(salt,(byte)0);}
      final boolean valid=matches;
      runOnUiThread(()->{
        if(isDestroyed()||ticket!=readGeneration)return;
        cardCheckRunning=false;
        if(!valid){
          readGeneration++;clearIdentityAndValues();
          message("ไม่พบบัตรเดิมหรืออ่านชิปไม่ได้ • ล้างข้อมูลแล้ว กรุณาเสียบบัตรและอ่านใหม่");
        }else main.postDelayed(cardCheck,2000);
      });
    },"health-card-presence-check").start();
  }
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
        message("ถอดเครื่องอ่าน USB แล้ว ล้างข้อมูลบนหน้าจอแล้…14149 tokens truncated…nDestroy(){
    unregisterReceiver(detached);
    io.shutdownNow();
    super.onDestroy();
  }
}
