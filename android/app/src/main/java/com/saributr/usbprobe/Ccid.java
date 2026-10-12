package com.saributr.usbprobe;
import java.io.IOException;
import java.util.Arrays;
public final class Ccid {
 public interface Transport {void write(byte[] b) throws IOException;byte[] read() throws IOException;}
 private final Transport transport;private int sequence;
 public Ccid(Transport t){transport=t;}
 public static final class Reply {
  public final int status; public final byte[] data;
  Reply(int s,byte[] d){status=s;data=d;}
 }
 public Reply command(int type,int expected) throws IOException {
  return command(type,expected,new byte[0]);
 }
 public Reply command(int type,int expected,byte[] payload) throws IOException {
  int seq=sequence++ &255;
  byte[] request=new byte[10+payload.length];request[0]=(byte)type;request[6]=(byte)seq;
  request[1]=(byte)payload.length;request[2]=(byte)(payload.length>>8);System.arraycopy(payload,0,request,10,payload.length);
  transport.write(request);
  // Bounded time-extension handling; each transport read also has a timeout.
  for(int attempts=0;attempts<8;attempts++){
   byte[] b=transport.read();
   if(b.length<10)throw new IOException("CCID: คำตอบสั้นกว่าที่กำหนด");
   long len=(b[1]&255L)|((b[2]&255L)<<8)|((b[3]&255L)<<16)|((b[4]&255L)<<24);
   if(len!=b.length-10)throw new IOException("CCID: ขนาดคำตอบไม่ตรง");
   if((b[0]&255)!=expected || b[5]!=0 || (b[6]&255)!=seq)throw new IOException("CCID: คำตอบไม่ตรงคำสั่ง กรุณาถอดเครื่องแล้วเสียบใหม่");
   int status=b[7]&255;int commandStatus=(status>>6)&3;
   if(commandStatus==2)continue;
   if(commandStatus!=0)throw new IOException(String.format("CCID: คำสั่งไม่สำเร็จ (status=%02X, error=%02X)",status,b[8]&255));
   if((status&3)==3)throw new IOException("CCID: สถานะบัตรไม่ถูกต้อง");
   return new Reply(status&3,Arrays.copyOfRange(b,10,b.length));
  }
  throw new IOException("เครื่องอ่านขอเวลานานเกินกำหนด กรุณาถอดเสียบใหม่");
 }
 public String probe() throws IOException {
  Reply slot=command(0x65,0x81);
  if(slot.status==2)return "✓ เครื่องอ่านตอบคำสั่งแล้ว\nยังไม่พบบัตร • เสียบบัตรให้ชิปสัมผัสกับหัวอ่าน แล้วกดทดสอบอีกครั้ง";
  boolean powered=false;
  try{
   powered=true;Reply atr=command(0x62,0x80);
   if(atr.status!=0 || atr.data.length<2 || atr.data.length>33 || ((atr.data[0]&255)!=0x3B && (atr.data[0]&255)!=0x3F))throw new IOException("พบบัตร แต่ยังไม่ได้รับ ATR ที่ถูกต้อง");
   StringBuilder hex=new StringBuilder();for(byte x:atr.data)hex.append(String.format("%02X ",x&255));
   return "✓ พบบัตร\n✓ ชิปตอบสนองและส่ง ATR กลับมา\nATR: "+hex.toString().trim()+"\n\nผ่านขั้นทดสอบการตอบสนองของชิป\nยังไม่ได้อ่านชื่อหรือข้อมูลส่วนตัว";
  }finally{if(powered){try{command(0x63,0x81);}catch(IOException ignored){/* Always close the USB connection in caller. */}}}
 }
}
