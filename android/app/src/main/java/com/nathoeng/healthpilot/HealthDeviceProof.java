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
