package com.saributr.usbprobe;
import java.io.*;
import java.nio.charset.Charset;
import java.time.LocalDate;
import java.util.Arrays;
public final class ThaiCard {
 public interface Progress {void update(String text);}
 public static final class Data {public String nameTitle,firstName,lastName,nameEn,birthIso,gender,citizenId,name,birth,address,photoError,addressHouseNo,addressVillageNo,addressExtra,addressSubdistrict,addressDistrict,addressProvince;public byte[] photo;}
 private final Ccid ccid;private int responseP2;
 public ThaiCard(Ccid c){ccid=c;}
 private byte[] exchange(byte[] cmd)throws IOException{
  Ccid.Reply r=ccid.command(0x6F,0x80,cmd);
  if(r.status!=0||r.data.length<2)throw new IOException("บัตรไม่พร้อมหรือคำตอบ APDU ไม่ครบ");return r.data;
 }
 byte[] apdu(byte[] cmd)throws IOException{
  ByteArrayOutputStream data=new ByteArrayOutputStream();byte[] current=cmd;
  for(int loop=0;loop<12;loop++){
   byte[] b=exchange(current);int sw1=b[b.length-2]&255,sw2=b[b.length-1]&255;
   if(sw1==0x6C&&current.length==5){current=current.clone();current[4]=(byte)sw2;continue;}
   data.write(b,0,b.length-2);
   if(data.size()>8192)throw new IOException("คำตอบบัตรใหญ่เกินกำหนด");
   if(sw1==0x90&&sw2==0)return data.toByteArray();
   if(sw1==0x61){current=new byte[]{0,(byte)0xC0,0,(byte)responseP2,(byte)sw2};continue;}
   throw new IOException(String.format("บัตรตอบรหัส %02X%02X",sw1,sw2));
  }
  throw new IOException("บัตรส่งคำตอบต่อเนื่องเกินกำหนด");
 }
 private byte[] read(int offset,int count)throws IOException{
  byte[] data=apdu(new byte[]{(byte)0x80,(byte)0xB0,(byte)(offset>>8),(byte)offset,2,0,(byte)count});
  if(data.length!=count)throw new IOException("ข้อมูลจากบัตรไม่ครบ ("+data.length+"/"+count+")");return data;
 }
 public static String thai(byte[] b){return new String(b,Charset.forName("TIS-620")).replace('\u0000',' ').replace('#',' ').trim().replaceAll(" +"," ");}
 public static String birth(byte[] b)throws IOException{
  String raw=new String(b,Charset.forName("US-ASCII")).trim();
  if(!raw.matches("[0-9]{8}"))throw new IOException("รูปแบบวันเกิดไม่ถูกต้อง");
  int year=Integer.parseInt(raw.substring(0,4)),month=Integer.parseInt(raw.substring(4,6)),day=Integer.parseInt(raw.substring(6,8));
  if(year<2400||year>2800)throw new IOException("ปีเกิดอยู่นอกช่วงที่รองรับ");
  if(month==0&&day==0)return "พ.ศ. "+year+" (บัตรไม่ระบุเดือนและวัน)";
  if(month>=1&&month<=12&&day==0)return String.format("เดือน %02d พ.ศ. %d (บัตรไม่ระบุวัน)",month,year);
  try{LocalDate.of(year-543,month,day);}catch(Exception e){throw new IOException("วันเกิดจากบัตรไม่ถูกต้อง");}
  return String.format("%02d/%02d/%04d (พ.ศ.)",day,month,year);
 }
 public Data readAll(Progress progress)throws IOException{
  if(ccid.command(0x65,0x81).status==2)throw new IOException("ยังไม่พบบัตร กรุณาเสียบบัตร");
  try{
   Ccid.Reply atr=ccid.command(0x62,0x80);
   if(atr.status!=0||atr.data.length<2)throw new IOException("ชิปไม่ตอบสนอง");
   responseP2=(atr.data[0]==0x3B&&atr.data[1]==0x67)?1:0;
   progress.update("กำลังเลือกข้อมูลบัตรประชาชน…");
   apdu(new byte[]{0,(byte)0xA4,4,0,8,(byte)0xA0,0,0,0,0x54,0x48,0,1});
   Data d=new Data();progress.update("กำลังอ่านชื่อและวันเกิด…");
   d.citizenId=new String(read(0x04,13),Charset.forName("US-ASCII"));
   if(!d.citizenId.matches("[0-9]{13}"))throw new IOException("เลขประจำตัวประชาชนจากบัตรไม่ครบ 13 หลัก");
   byte[] nameBytes=read(0x11,100);d.name=thai(nameBytes);if(d.name.isEmpty())throw new IOException("ไม่พบชื่อในบัตร");
   String[] parts=new String(nameBytes,Charset.forName("TIS-620")).replace('\u0000',' ').trim().split("#",-1);
   if(parts.length<4)throw new IOException("แยกชื่อจากบัตรไม่ได้ กรุณาตรวจรูปแบบ");
   d.nameTitle=parts[0].trim();d.firstName=(parts[1]+" "+parts[2]).trim().replaceAll(" +"," ");d.lastName=parts[3].trim();
   // English name starts immediately after the 100-byte Thai name field.
   // Some cards do not expose it; preserve the rest of the card read.
   try{d.nameEn=new String(read(0x75,100),Charset.forName("US-ASCII"))
     .replace('\u0000',' ').replace('#',' ').trim().replaceAll(" +"," ");}
   catch(IOException ignored){d.nameEn="";}
   byte[] dob=read(0xD9,8);d.birth=birth(dob);String rawDob=new String(dob,Charset.forName("US-ASCII"));
   d.birthIso=rawDob.substring(4,6).equals("00")||rawDob.substring(6,8).equals("00")?"":String.format(java.util.Locale.US,"%04d-%s-%s",Integer.parseInt(rawDob.substring(0,4))-543,rawDob.substring(4,6),rawDob.substring(6,8));
   String sex=new String(read(0xE1,1),Charset.forName("US-ASCII"));d.gender=sex.equals("1")?"male":sex.equals("2")?"female":"";
   progress.update("กำลังอ่านที่อยู่ตามบัตร…");byte[] addressBytes=read(0x1579,100);
   d.address=thai(addressBytes);
   String[] addressParts=new String(addressBytes,Charset.forName("TIS-620")).replace('\u0000',' ').trim().split("#",-1);
   if(addressParts.length>=8){
    d.addressHouseNo=addressParts[0].trim();d.addressVillageNo=addressParts[1].trim();
    d.addressExtra=(addressParts[2]+" "+addressParts[3]+" "+addressParts[4]).trim().replaceAll(" +"," ");
    d.addressSubdistrict=addressParts[5].trim();d.addressDistrict=addressParts[6].trim();d.addressProvince=addressParts[7].trim();
   }
   try{
    ByteArrayOutputStream photo=new ByteArrayOutputStream();
    for(int n=0;n<20;n++){progress.update("กำลังอ่านรูป "+(n+1)+"/20…");photo.write(read(0x17B+n*255,255));}
    byte[] bytes=photo.toByteArray();if((bytes[0]&255)!=255||(bytes[1]&255)!=216)throw new IOException("รูปไม่ได้อยู่ในรูปแบบ JPEG");
    int end=-1;for(int i=2;i<bytes.length-1;i++)if((bytes[i]&255)==255&&(bytes[i+1]&255)==217){end=i+2;break;}
    if(end<0)throw new IOException("ข้อมูลรูปไม่ครบ");d.photo=Arrays.copyOf(bytes,end);
   }catch(IOException e){d.photoError=e.getMessage();}
   return d;
  }finally{try{ccid.command(0x63,0x81);}catch(IOException ignored){}}
 }
}
