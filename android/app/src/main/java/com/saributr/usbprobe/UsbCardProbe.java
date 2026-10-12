package com.saributr.usbprobe;
import android.hardware.usb.*;
import java.io.*;
public final class UsbCardProbe {
 public static String run(UsbManager manager,UsbDevice device) throws IOException {return (String)run(manager,device,null);}
 public static Object run(UsbManager manager,UsbDevice device,ThaiCard.Progress progress) throws IOException {
  UsbInterface face=null;UsbEndpoint in=null,out=null;
  for(int i=0;i<device.getInterfaceCount();i++){
   UsbInterface f=device.getInterface(i);if(f.getInterfaceClass()!=11)continue;
   UsbEndpoint a=null,b=null;
   for(int j=0;j<f.getEndpointCount();j++){UsbEndpoint e=f.getEndpoint(j);if(e.getType()==UsbConstants.USB_ENDPOINT_XFER_BULK){if(e.getDirection()==UsbConstants.USB_DIR_IN)a=e;else b=e;}}
   if(a!=null&&b!=null){face=f;in=a;out=b;break;}
  }
  if(face==null)throw new IOException("ไม่พบช่องรับส่ง CCID แบบ Bulk");
  final UsbDeviceConnection connection=manager.openDevice(device);
  if(connection==null)throw new IOException("เปิดเครื่องอ่านไม่ได้ กรุณาอนุญาต USB แล้วลองใหม่");
  boolean claimed=false;
  try{
   claimed=connection.claimInterface(face,false);
   if(!claimed)throw new IOException("เครื่องอ่านถูกใช้งานอยู่ กรุณาปิดแอปอ่านบัตรอื่นแล้วลองใหม่");
   final UsbEndpoint input=in,output=out;
   Ccid.Transport transport=new Ccid.Transport(){
    public void write(byte[] b)throws IOException{
     if(Thread.currentThread().isInterrupted())throw new IOException("ยกเลิกการทดสอบแล้ว");
     if(connection.bulkTransfer(output,b,b.length,2000)!=b.length)throw new IOException("ส่งคำสั่งไม่ได้ • ตรวจสายและลองถอดเสียบใหม่");
    }
    public byte[] read()throws IOException{
     ByteArrayOutputStream data=new ByteArrayOutputStream();int required=-1;
     long deadline=System.nanoTime()+4000000000L;
     while(System.nanoTime()<deadline){
      if(Thread.currentThread().isInterrupted())throw new IOException("ยกเลิกการทดสอบแล้ว");
      byte[] buffer=new byte[4096];int n=connection.bulkTransfer(input,buffer,buffer.length,1000);
      if(n<0)throw new IOException("ไม่ได้รับคำตอบจากเครื่องอ่าน • ลองถอดเสียบใหม่");
      if(n==0)continue;
      data.write(buffer,0,n);byte[] all=data.toByteArray();
      if(all.length>=10&&required<0){long size=(all[1]&255L)|((all[2]&255L)<<8)|((all[3]&255L)<<16)|((all[4]&255L)<<24);if(size>4096)throw new IOException("คำตอบใหญ่เกินขอบเขตทดสอบ");required=10+(int)size;}
      if(required>=0&&all.length>=required){if(all.length!=required)throw new IOException("คำตอบ CCID ซ้อนกัน กรุณาถอดเสียบใหม่");return all;}
     }
     throw new IOException("รอคำตอบเกินกำหนด");
    }
   };
   Ccid c=new Ccid(transport);
   if(progress==null)return c.probe();
   byte[] descriptors=connection.getRawDescriptors();int features=-1;int currentInterface=-1;
   if(descriptors!=null)for(int at=0;at+2<=descriptors.length;){int size=descriptors[at]&255;if(size<2||at+size>descriptors.length)break;
    int type=descriptors[at+1]&255;
    if(type==4&&size>=9)currentInterface=descriptors[at+2]&255;
    if(type==0x21&&size>=54&&currentInterface==face.getId())features=(descriptors[at+40]&255)|((descriptors[at+41]&255)<<8)|((descriptors[at+42]&255)<<16)|((descriptors[at+43]&255)<<24);
    at+=size;
   }
   if(features<0||(features&0x70000)==0)throw new IOException("เครื่องอ่านใช้โหมดที่ต้องเพิ่มการรองรับ (features="+Integer.toHexString(features)+")");
   return new ThaiCard(c).readAll(progress);
  }finally{if(claimed)connection.releaseInterface(face);connection.close();}
 }
}
