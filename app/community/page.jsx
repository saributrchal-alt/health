"use client";
import {useEffect,useState} from "react";
export default function Community(){
 const [rows,setRows]=useState([]),[status,setStatus]=useState("กำลังโหลดข้อมูล"),[form,setForm]=useState({systolic:"",diastolic:"",pulse:""}),[busy,setBusy]=useState(false);
 async function load(){
  const res=await fetch("/api/community",{cache:"no-store"});
  if(!res.ok){setStatus("ยังไม่ได้เข้าสู่ระบบ หรือไม่ได้รับอนุญาต กรุณาเปิดจาก My Dashboard ของวัด");return}
  setRows((await res.json()).rows);setStatus("");
 }
 useEffect(()=>{load().catch(()=>setStatus("เชื่อมต่อไม่สำเร็จ"))},[]);
 async function save(e){
  e.preventDefault();setBusy(true);
  try{
   const res=await fetch("/api/community",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(Object.fromEntries(Object.entries(form).map(([k,v])=>[k,Number(v)])))});
   if(!res.ok)throw Error((await res.json()).error||"บันทึกไม่ได้");
   setForm({systolic:"",diastolic:"",pulse:""});await load();setStatus("บันทึกสำเร็จ");
  }catch(e){setStatus(e.message)}finally{setBusy(false)}
 }
 return <main style={{maxWidth:760,margin:"30px auto",padding:20,fontFamily:"sans-serif"}}>
 <h1>🩺 สุขภาพชุมชนนาเทิง</h1><p><a href="/scale">⚖️ เชื่อมต่อเครื่องชั่งน้ำหนัก Bluetooth</a></p><p>บันทึกความดันโลหิตและชีพจรของสมาชิก</p>
 <p role="status">{status}</p><a href="https://nathoeng.com/#my-dashboard">กลับ My Dashboard</a>
 <form onSubmit={save} style={{display:"grid",gap:12,marginTop:24}}>
 {[[ "systolic","ความดันตัวบน SYS"],["diastolic","ความดันตัวล่าง DIA"],["pulse","ชีพจร"]].map(([key,label])=><label key={key}>{label} <input required type="number" inputMode="numeric" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
 <button disabled={busy} type="submit">{busy?"กำลังบันทึก":"บันทึกผลการวัด"}</button></form>
 <h2>ประวัติการวัดของฉัน</h2><div style={{overflowX:"auto"}}><table cellPadding="9"><thead><tr><th>วันเวลา</th><th>SYS</th><th>DIA</th><th>ชีพจร</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{new Date(r.measured_at).toLocaleString("th-TH",{timeZone:"Asia/Bangkok"})}</td><td>{r.systolic}</td><td>{r.diastolic}</td><td>{r.pulse}</td></tr>)}</tbody></table></div>
 <p>ระบบนำร่อง ไม่ใช้แทนการวินิจฉัยของแพทย์</p></main>;
}
