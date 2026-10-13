package com.nathoeng.healthpilot;

import org.json.JSONObject;
import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * Device-only challenge/response. A successful proof does not identify a member,
 * read medical data, establish a user session or enroll a new device.
 */
public final class HealthDeviceProof {
  private static final String ENDPOINT="https://health.nathoeng.com/api/kiosk/device-proof";
  private HealthDeviceProof() {}
  private static JSONObject post(JSONObject request) throws Exception {
    HttpURLConnection conn=(HttpURLConnection)new URL(ENDPOINT).openConnection();
    try {
      conn.setRequestMethod("POST");
      conn.setConnectTimeout(7000);
      conn.setReadTimeout(7000);
      conn.setInstanceFollowRedirects(false);
      conn.setUseCaches(false);
      conn.setDoOutput(true);
      conn.setRequestProperty("Content-Type","application/json; charset=utf-8");
      conn.setRequestProperty("Accept","application/json");
      conn.setRequestProperty("Cache-Control","no-store");
      byte[] bytes=request.toString().getBytes(StandardCharsets.UTF_8);
      if(bytes.length>1500)throw new IOException("คำขอมีขนาดผิดปกติ");
      try(OutputStream out=conn.getOutputStream()){out.write(bytes);}
      final int status=conn.getResponseCode();
      if(status<200||status>=300){
        if(status==403)throw new IOException("อุปกรณ์ยังไม่ได้รับสิทธิ์ หรือหลักฐานอุปกรณ์ไม่ผ่าน");
        if(status==400||status==405)throw new IOException("ข้อมูลคำขอตรวจสอบไม่ถูกต้อง");
        if(status==429)throw new IOException("มีคำขอมากเกินไป กรุณารอสักครู่");
        throw new IOException("Health Server ไม่พร้อม (HTTP "+status+")");
      }
      if(conn.getContentType()==null||!conn.getContentType().toLowerCase(java.util.Locale.ROOT).contains("application/json"))
        throw new IOException("Health Server ส่งข้อมูลผิดรูปแบบ");
      try(InputStream in=conn.getInputStream(); ByteArrayOutputStream out=new ByteArrayOutputStream()){
        byte[] buf=new byte[512];int n;
        while((n=in.read(buf))>=0){out.write(buf,0,n);if(out.size()>4096)throw new IOException("ข้อมูลตอบกลับใหญ่เกินไป");}
        return new JSONObject(out.toString("UTF-8"));
      }
    }finally{conn.disconnect();}
  }
  public static String makeClaim(String deviceId,String cardId) throws Exception {
    JSONObject challenge=post(new JSONObject().put("action","challenge").put("device_id",deviceId));
    String id=challenge.getString("challenge_id");
    String signature=DeviceIdentity.signChallenge(deviceId,id);
    JSONObject payload=new JSONObject().put("device_id",deviceId).put("challenge_id",id)
      .put("signature",signature).put("citizen_id",cardId);
    HttpURLConnection c=(HttpURLConnection)new URL("https://health.nathoeng.com/api/kiosk/card-claim").openConnection();
    try{
      c.setRequestMethod("POST");c.setConnectTimeout(7000);c.setReadTimeout(7000);
      c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json");
      c.setInstanceFollowRedirects(false);
      try(OutputStream out=c.getOutputStream()){out.write(payload.toString().getBytes(StandardCharsets.UTF_8));}
      if(c.getResponseCode()!=200)throw new IOException("ขอรหัสไม่สำเร็จ");
      try(InputStream in=c.getInputStream()){
        byte[] data=in.readNBytes(1024);
        JSONObject answer=new JSONObject(new String(data,StandardCharsets.UTF_8));
        String code=answer.getString("code");
        if(!answer.optBoolean("success")||!code.matches("[0-9]{9}"))throw new IOException("ผลตอบกลับไม่ถูกต้อง");
        return code;
      }
    }finally{c.disconnect();}
  }
  /** Pilot PIN check with a new chip-bound challenge; creates no session. */
  public static boolean pilotPin(String deviceId,String cardId,String pin,boolean enroll)throws Exception{
    if(!pin.matches("[0-9]{6}"))throw new IOException("PIN ต้องมี 6 หลัก");
    JSONObject ch=post(new JSONObject().put("action","challenge").put("device_id",deviceId));
    String nonce=ch.getString("challenge_id");
    String proof=DeviceIdentity.signCardPresence(deviceId,nonce,cardId);
    JSONObject payload=new JSONObject().put("device_id",deviceId).put("challenge_id",nonce)
      .put("citizen_id",cardId).put("signature",proof).put("pin",pin)
      .put("action",enroll?"enroll_pin":"verify_pin");
    HttpURLConnection c=(HttpURLConnection)new URL("https://health.nathoeng.com/api/kiosk/pilot-identity-check").openConnection();
    try{
      c.setRequestMethod("POST");c.setConnectTimeout(7000);c.setReadTimeout(7000);
      c.setDoOutput(true);c.setInstanceFollowRedirects(false);c.setUseCaches(false);
      c.setRequestProperty("Content-Type","application/json");c.setRequestProperty("Cache-Control","no-store");
      byte[] data=payload.toString().getBytes(StandardCharsets.UTF_8);
      if(data.length>2200)throw new IOException("Invalid request");
      try(OutputStream out=c.getOutputStream()){out.write(data);}
      int status=c.getResponseCode();
      if(status==409)throw new IOException("ตั้ง PIN ไว้แล้ว");
      if(status==429)throw new IOException("PIN ถูกล็อกชั่วคราว กรุณารอ 15 นาที");
      if(status==403)throw new IOException("PIN ไม่ผ่านหรือบัตรไม่ตรง");
      if(status!=200)throw new IOException("เซิร์ฟเวอร์ไม่พร้อมหรือ PIN ไม่ถูกต้อง");
      JSONObject answer;
      try(InputStream in=c.getInputStream()){
        byte[] response=in.readNBytes(1025);
        if(response.length>1024)throw new IOException("Invalid response");
        answer=new JSONObject(new String(response,StandardCharsets.UTF_8));
      }
      return answer.optBoolean("success",false)&&answer.optBoolean(enroll?"pin_enrolled":"pin_verified",false)
        &&answer.optBoolean("pilot_only",false)&&!answer.optBoolean("session_issued",true)
        &&!answer.optBoolean("medical_data_access",true);
    }finally{c.disconnect();}
  }
  /** Read-only pilot identity check: never opens a member/medical session. */
  public static boolean checkBoundCard(String deviceId,String citizenId)throws Exception{
    java.util.UUID.fromString(deviceId);
    if(citizenId==null||!citizenId.matches("[0-9]{13}"))throw new IOException("อ่านข้อมูลบัตรไม่ถูกต้อง");
    JSONObject challenge=post(new JSONObject().put("action","challenge").put("device_id",deviceId));
    if(!challenge.optBoolean("success",false))throw new IOException("ไม่ได้รับคำท้าทายใหม่");
    String id=challenge.getString("challenge_id");
    java.util.UUID.fromString(id);
    String signed=DeviceIdentity.signCardPresence(deviceId,id,citizenId);
    JSONObject payload=new JSONObject().put("device_id",deviceId).put("challenge_id",id)
      .put("signature",signed).put("citizen_id",citizenId);
    HttpURLConnection c=(HttpURLConnection)new URL("https://health.nathoeng.com/api/kiosk/pilot-identity-check").openConnection();
    try{
      c.setRequestMethod("POST");c.setConnectTimeout(7000);c.setReadTimeout(7000);
      c.setDoOutput(true);c.setUseCaches(false);c.setInstanceFollowRedirects(false);
      c.setRequestProperty("Content-Type","application/json; charset=utf-8");
      c.setRequestProperty("Accept","application/json");c.setRequestProperty("Cache-Control","no-store");
      byte[] body=payload.toString().getBytes(StandardCharsets.UTF_8);
      if(body.length>2000)throw new IOException("ข้อมูลคำขอใหญ่เกินไป");
      try(OutputStream out=c.getOutputStream()){out.write(body);}
      int status=c.getResponseCode();
      if(status==403)throw new IOException("ยังไม่พบสมาชิกที่ผูกบัตรและได้รับสิทธิ์ Health หรือบัตรไม่ตรง");
      if(status!=200)throw new IOException("ตรวจสมาชิกไม่สำเร็จ (HTTP "+status+")");
      if(c.getContentType()==null||!c.getContentType().toLowerCase(java.util.Locale.ROOT).contains("application/json"))
        throw new IOException("Server ส่งผลผิดรูปแบบ");
      JSONObject result;
      try(InputStream in=c.getInputStream()){
        byte[] bytes=in.readNBytes(1025);
        if(bytes.length>1024)throw new IOException("ผลตอบกลับใหญ่เกินไป");
        result=new JSONObject(new String(bytes,StandardCharsets.UTF_8));
      }
      if(!result.optBoolean("success",false)||!result.optBoolean("device_verified",false)||
        !result.optBoolean("member_verified",false)||result.optBoolean("session_issued",true)||
        result.optBoolean("medical_data_access",true)||!result.optBoolean("pilot_only",false))
        throw new IOException("Server ส่งผลการยืนยันตัวตนไม่ถูกต้อง");
      return true;
    }finally{c.disconnect();}
  }
  public static boolean verify(String deviceId) throws Exception {
    java.util.UUID.fromString(deviceId);
    // Ensure private key still exists on the approved, current app installation.
    DeviceIdentity.publicKeyBase64();
    JSONObject request=new JSONObject().put("action","challenge").put("device_id",deviceId);
    JSONObject challenge=post(request);
    String challengeId=challenge.optString("challenge_id","");
    if(!challenge.optBoolean("success",false) || challengeId.isEmpty() ||
       challenge.optInt("expires_in_seconds",0)<1||challenge.optInt("expires_in_seconds",0)>20)
      throw new IOException("Health Server ไม่ส่งคำท้าทายที่ถูกต้อง");
    java.util.UUID.fromString(challengeId);
    String signed=DeviceIdentity.signChallenge(deviceId,challengeId);
    JSONObject proof=new JSONObject().put("action","verify").put("device_id",deviceId)
      .put("challenge_id",challengeId).put("signature",signed);
    JSONObject result=post(proof);
    // Explicitly reject any unexpected user authorization, even if service changes.
    if(!result.optBoolean("success",false) || !result.optBoolean("device_verified",false) ||
       result.optBoolean("member_verified",true) || result.optBoolean("session_issued",true))
      throw new IOException("Health Server ตอบผลตรวจเครื่องไม่ถูกต้อง");
    return true;
  }
}
