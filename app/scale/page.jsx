"use client";
import {useEffect,useRef,useState} from "react";
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();
export default function ScalePage(){
 const [status,setStatus]=useState("พร้อมค้นหาเครื่องชั่ง"),[deviceName,setDeviceName]=useState(""),[packets,setPackets]=useState([]),[weight,setWeight]=useState(""),[confirmed,setConfirmed]=useState(false);
 const device=useRef(null),server=useRef(null),handlers=useRef([]),scan=useRef(null);
 const addPacket=(kind,uuid,bytes)=>{
  setPackets(old=>[{time:new Date().toLocaleTimeString("th-TH"),kind,uuid,hex:hex(bytes)},...old].slice(0,40));
 };
 async function connect(){
  if(!navigator.bluetooth){setStatus("เบราว์เซอร์นี้ไม่รองรับ Web Bluetooth กรุณาเปิดด้วย Chrome บน Android ผ่าน HTTPS");return}
  try{
   setStatus("เลือกเครื่องชั่งในหน้าต่าง Bluetooth...");
   const d=await navigator.bluetooth.requestDevice({acceptAllDevices:true,optionalServices:["0000181d-0000-1000-8000-00805f9b34fb","0000180f-0000-1000-8000-00805f9b34fb"]});
   device.current=d;setDeviceName(d.name||"เครื่องชั่ง Bluetooth");
   d.addEventListener("gattserverdisconnected",()=>setStatus("เครื่องชั่งตัดการเชื่อมต่อ"));
   server.current=await d.gatt.connect();
   setStatus("เชื่อมต่อแล้ว กำลังตรวจสอบข้อมูลเครื่องชั่ง...");
   const services=await server.current.getPrimaryServices();
   let count=0;
   for(const service of services){
    const chars=await service.getCharacteristics();
    for(const char of chars){
     if(char.properties.notify||char.properties.indicate){
      try{
       await char.startNotifications();
       const handler=e=>addPacket("GATT",char.uuid,new Uint8Array(e.target.value.buffer,e.target.value.byteOffset,e.target.value.byteLength));
       char.addEventListener("characteristicvaluechanged",handler);
       handlers.current.push([char,handler]);count++;
      }catch{}
     }
     if(char.properties.read){try{const v=await char.readValue();addPacket("read",char.uuid,new Uint8Array(v.buffer,v.byteOffset,v.byteLength))}catch{}}
    }
   }
   setStatus(count?"กำลังรับข้อมูลจากเครื่องชั่ง โปรดขึ้นชั่งและรอให้น้ำหนักนิ่ง":"เชื่อมต่อได้ แต่ไม่พบช่องแจ้งเตือนที่เปิดอ่านได้ เครื่องอาจใช้ BLE Advertising");
  }catch(e){setStatus(e.name==="NotFoundError"?"ยกเลิกการเลือกเครื่องชั่ง":("เชื่อมต่อไม่สำเร็จ: "+e.message))}
 }
 async function startAdvertisements(){
  if(!device.current?.watchAdvertisements){setStatus("เบราว์เซอร์นี้ไม่รองรับการอ่าน BLE Advertising ของอุปกรณ์ที่เลือก");return}
  try{
   const handler=e=>{
    for(const [id,bytes] of e.manufacturerData)addPacket("manufacturer",String(id),new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));
    for(const [uuid,bytes] of e.serviceData)addPacket("service",uuid,new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength));
   };
   device.current.addEventListener("advertisementreceived",handler);
   scan.current=handler;
   await device.current.watchAdvertisements();
   setStatus("กำลังฟังสัญญาณโฆษณา BLE — ขึ้นชั่งแล้วรอให้เครื่องสรุปผล");
  }catch(e){setStatus("อ่าน BLE Advertising ไม่ได้: "+e.message)}
 }
 function disconnect(){
  for(const [c,h] of handlers.current)c.removeEventListener("characteristicvaluechanged",h);
  handlers.current=[];
  if(device.current&&scan.current)device.current.removeEventListener("advertisementreceived",scan.current);
  device.current?.gatt?.disconnect();setStatus("ยกเลิกการเชื่อมต่อแล้ว");
 }
 useEffect(()=>()=>{for(const [c,h] of handlers.current)c.removeEventListener("characteristicvaluechanged",h);device.current?.gatt?.disconnect()},[]);
 const valid=Number(weight)>=2&&Number(weight)<=350;
 return <main style={{maxWidth:760,margin:"24px auto",padding:20,fontFamily:"sans-serif",lineHeight:1.6}}>
  <h1>⚖️ NATHOENG HEALTH — เครื่องชั่งน้ำหนัก</h1>
  <p>ทดลองเชื่อมต่อเครื่องชั่ง Scalefit ผ่าน Bluetooth บน Android Chrome</p>
  <div style={{padding:16,background:"#fff4d6",borderRadius:12}}>ระบบทดสอบ: ข้อมูล BLE ที่ได้รับยังไม่มีสูตรถอดรหัสน้ำหนักที่ยืนยันแล้ว จึงไม่แสดงตัวเลขจากแพ็กเก็ตเป็นค่าน้ำหนักโดยอัตโนมัติ เพื่อป้องกันการบันทึกค่าผิด</div>
  <section style={{marginTop:20,padding:20,border:"1px solid #ddd",borderRadius:12}}>
   <h2>เชื่อมต่อเครื่องชั่ง</h2>
   <button onClick={connect}>เชื่อมต่อ Bluetooth</button>{" "}<button onClick={startAdvertisements} disabled={!device.current}>อ่านสัญญาณ BLE</button>{" "}<button onClick={disconnect}>ตัดการเชื่อมต่อ</button>
   <p role="status">{status}</p><p>อุปกรณ์: {deviceName||"ยังไม่ได้เลือก"}</p>
   <p>เครื่องชั่งบางรุ่นส่งข้อมูลผ่าน Advertising เท่านั้น และบางรุ่นต้องเปิดแอปผู้ผลิตก่อน จึงอาจอ่านจากเว็บไม่ได้</p>
  </section>
  <section style={{marginTop:20,padding:20,border:"1px solid #ddd",borderRadius:12}}>
   <h2>ยืนยันค่าน้ำหนักจากหน้าจอเครื่อง</h2>
   <label>น้ำหนัก (กิโลกรัม) <input type="number" inputMode="decimal" min="2" max="350" step="0.01" value={weight} onChange={e=>{setWeight(e.target.value);setConfirmed(false)}} placeholder="เช่น 64.95"/></label>
   <p><label><input type="checkbox" checked={confirmed} disabled={!valid} onChange={e=>setConfirmed(e.target.checked)}/> ยืนยันว่าตรงกับตัวเลขที่เครื่องชั่งแสดง</label></p>
   <button disabled={!valid||!confirmed} onClick={()=>{try{localStorage.setItem("nathoeng_scale_last_verified",JSON.stringify({kg:Number(weight),measuredAt:new Date().toISOString(),source:"manual_verified"}));setStatus("บันทึกค่าที่ตรวจสอบแล้วไว้ในอุปกรณ์นี้ (ยังไม่ส่งเข้าฐานข้อมูล)") }catch{setStatus("ไม่สามารถบันทึกข้อมูลบนอุปกรณ์ได้")}}}>บันทึกค่าในอุปกรณ์นี้</button>
  </section>
  <section style={{marginTop:20,padding:20,border:"1px solid #ddd",borderRadius:12}}>
   <h2>ข้อมูล BLE ล่าสุด ({packets.length})</h2><button onClick={()=>setPackets([])}>ล้างรายการ</button>
   <div style={{overflowX:"auto"}}><table cellPadding="8"><thead><tr><th>เวลา</th><th>ประเภท</th><th>UUID/ID</th><th>HEX</th></tr></thead><tbody>{packets.map((p,i)=><tr key={i}><td>{p.time}</td><td>{p.kind}</td><td>{p.uuid}</td><td style={{fontFamily:"monospace",wordBreak:"break-all"}}>{p.hex}</td></tr>)}</tbody></table></div>
  </section><p><a href="/community">กลับสุขภาพชุมชน</a></p>
 </main>
}
