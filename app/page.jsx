"use client";
import {useEffect,useRef,useState} from "react";
import {createClient} from "@supabase/supabase-js";
import {addThaiDays,nowThaiInput,SLOTS,summaryForWeek,thaiDate,toThaiInstant} from "../lib/monitoring.mjs";
const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const db=url&&key?createClient(url,key):null;
const empty=()=>({systolic:"",diastolic:"",pulse:"",measured_at:nowThaiInput(),session:"morning",sequence:"1",notes:""});
const showDate=iso=>new Date(iso).toLocaleString("th-TH",{timeZone:"Asia/Bangkok",day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
const round=n=>n==null?"—":n.toFixed(1);
export default function Home(){
 const [session,setSession]=useState(null),[checking,setChecking]=useState(true),[email,setEmail]=useState("");
 const [form,setForm]=useState(empty),[rows,setRows]=useState([]),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[courseStart,setCourseStart]=useState(thaiDate(new Date()));
 const choseStart=useRef(false);
 useEffect(()=>{
   if(!db){setChecking(false);return}
   db.auth.getSession().then(({data,error})=>{setSession(data?.session||null);if(error)setMessage(error.message);setChecking(false)}).catch(()=>setChecking(false));
   const {data:{subscription}}=db.auth.onAuthStateChange((_event,s)=>setSession(s));
   return()=>subscription.unsubscribe();
 },[]);
 useEffect(()=>{if(!session||!db){setRows([]);return}let active=true;
   db.from("health_measurements").select("id,systolic,diastolic,pulse,measured_at,session,sequence,notes").order("measured_at",{ascending:false}).limit(500).then(({data,error})=>{
     if(!active)return;
     if(error){setMessage("อ่านประวัติไม่สำเร็จ: "+error.message);return}
     setRows(data||[]);
     if(data?.length&&!choseStart.current){const dates=data.map(r=>thaiDate(r.measured_at)).sort();const last=dates[dates.length-1];const first=dates[0];setCourseStart(last>addThaiDays(first,6)?addThaiDays(last,-6):first)}
   });return()=>{active=false}
 },[session]);
 const summary=summaryForWeek(rows,courseStart);
 const dated=courseStart+" ถึง "+addThaiDays(courseStart,6);
 async function login(e){e.preventDefault();if(!db)return;setBusy(true);setMessage("");
   try{const {error}=await db.auth.signInWithOtp({email:email.trim(),options:{emailRedirectTo:window.location.origin,shouldCreateUser:false}});
     setMessage(error?"ไม่สามารถส่งลิงก์ได้: "+error.message:"ส่งลิงก์เข้าสู่ระบบให้บัญชีทดสอบที่ลงทะเบียนไว้แล้ว โปรดตรวจอีเมล");
   }catch(e){setMessage("เชื่อมต่อระบบเข้าสู่ระบบไม่สำเร็จ")}finally{setBusy(false)}
 }
 async function save(e){e.preventDefault();if(!db||!session)return;setMessage("");
   const sys=Number(form.systolic),dia=Number(form.diastolic),pulse=Number(form.pulse);
   const measured=toThaiInstant(form.measured_at);
   if(!measured||measured.getTime()>Date.now()+5*60*1000){setMessage("กรุณาตรวจสอบวันเวลา (ใช้เวลาไทย และห้ามระบุเวลาในอนาคต)");return}
   if(![sys,dia,pulse].every(Number.isInteger)||sys<60||sys>300||dia<30||dia>200||dia>=sys||pulse<30||pulse>220){setMessage("ค่าความดันหรือชีพจรไม่อยู่ในช่วงที่ฟอร์มรองรับ กรุณาตรวจสอบเครื่องวัด");return}
   const date=thaiDate(measured),seq=Number(form.sequence);
   if(rows.some(r=>thaiDate(r.measured_at)===date&&r.session===form.session&&Number(r.sequence)===seq)){setMessage("มีข้อมูลช่วงเวลาและครั้งที่นี้แล้ว โปรดตรวจสอบประวัติก่อนบันทึกซ้ำ");return}
   setBusy(true);
   try{
     const {error}=await db.from("health_measurements").insert({user_id:session.user.id,systolic:sys,diastolic:dia,pulse,measured_at:measured.toISOString(),session:form.session,sequence:seq,notes:form.notes.trim(),source:"manual"});
     if(error){setMessage(error.code==="23505"?"บันทึกซ้ำในช่วงเวลาเดียวกันไม่ได้":("บันทึกไม่สำเร็จ: "+error.message));return}
     setMessage("บันทึกสำเร็จแล้ว");
     setForm(empty());
     const {data, error:reloadError}=await db.from("health_measurements").select("id,systolic,diastolic,pulse,measured_at,session,sequence,notes").order("measured_at",{ascending:false}).limit(500);
     if(reloadError)setMessage("บันทึกแล้ว แต่ยังโหลดประวัติใหม่ไม่ได้");else setRows(data||[]);
   }catch(e){setMessage("ไม่สามารถเชื่อมต่อฐานข้อมูลได้")}finally{setBusy(false)}
 }
 const danger=rows.some(r=>r.systolic>=180||r.diastolic>=120);
 return <main>
 <header className="hero"><div className="eyebrow">WAT PHUTTHA UTHAYAN NATHOENG</div><h1>🩺 NATHOENG HEALTH</h1><p>สมุดบันทึกความดันโลหิตและชีพจรของชุมชน</p><p>ระยะที่ 1 · บันทึกค่าจากเครื่องวัดด้วยตนเอง</p></header>
 <div className="banner"><strong>ระบบทดลองเท่านั้น</strong> — กรุณาใช้ข้อมูลจำลอง ไม่กรอกข้อมูลผู้ป่วยจริง จนกว่าการตรวจสอบความปลอดภัย การอนุญาตข้อมูลสุขภาพ และการทดสอบระบบจะเสร็จสิ้น</div>
 {!db?<section className="panel error">ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL และ NEXT_PUBLIC_SUPABASE_ANON_KEY ใน Deployment นี้</section>:checking?<section className="panel">กำลังตรวจสอบการเข้าสู่ระบบ...</section>:!session?
 <section className="panel"><h2>เข้าสู่ระบบสำหรับผู้ทดสอบ</h2><p className="muted">ใช้ Supabase Auth ผ่านอีเมลสำหรับบัญชีทดสอบที่ได้รับอนุญาตเท่านั้น ยังไม่ได้เชื่อม Member Bridge กับ Temple</p><form onSubmit={login}><label className="field">อีเมลบัญชีทดสอบ<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="tester@example.com"/></label><button type="submit" className="primary" disabled={busy} style={{marginTop:15}}>ส่งลิงก์เข้าสู่ระบบ</button></form><p className="small muted">ผู้ดูแลต้องสร้างบัญชีทดสอบใน Supabase Auth และเพิ่ม URL เว็บไซต์นี้ใน Redirect URLs ก่อน</p></section>
 :<>
 <div className="topline no-print"><span>เข้าสู่ระบบ: <strong>{session.user.email||"บัญชีทดสอบ"}</strong></span><button className="secondary" onClick={()=>db.auth.signOut()}>ออกจากระบบ</button></div>
 <section className="panel"><div className="topline"><h2>ติดตามความดัน 7 วัน</h2><label className="field no-print">วันที่เริ่มวัด (วันแรก)<input type="date" value={courseStart} onChange={e=>{if(e.target.value){choseStart.current=true;setCourseStart(e.target.value)}}}/></label></div><p className="muted">รอบวันที่ {dated} • เช้า 2 ครั้ง และก่อนนอน 2 ครั้ง รวม 28 รายการ</p><div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={28} aria-valuenow={summary.received}><span style={{width:(summary.received/28*100)+"%"}}/></div><p><strong>{summary.received}/28</strong> ครั้ง ({Math.round(summary.received/28*100)}%)</p>
 <div className="daygrid">{summary.days.map(d=><div className={"day"+(d.count===4?" done":"")} key={d.date}><strong>วันที่ {d.day}</strong><div className="small">{d.date}</div><div>{d.count===4?"✓ ครบ":d.count+"/4 ครั้ง"}</div><div className="small muted">{d.day===1?"ไม่คิดเฉลี่ย":"คิดค่าเฉลี่ย"}</div></div>)}</div>
 {summary.complete?<><div className="stats"><div className="stat">ค่าเฉลี่ย SYS<strong>{round(summary.averages.systolic)}</strong></div><div className="stat">ค่าเฉลี่ย DIA<strong>{round(summary.averages.diastolic)}</strong></div><div className="stat">ชีพจรเฉลี่ย<strong>{round(summary.averages.pulse)}</strong></div></div><p className="small muted">คำนวณจาก 24 รายการของวันที่ 2–7 เท่านั้น (mmHg / ครั้งต่อนาที) ตามรูปแบบบันทึกที่ได้รับ</p></>:<p className="muted">ยังวัดไม่ครบ 7 วัน จึงยังไม่แสดงค่าเฉลี่ยสำหรับรายงานแพทย์</p>}
 </section>
 <section className="panel no-print"><h2>บันทึกค่าความดันด้วยตนเอง</h2><p className="muted">วัดด้วยเครื่องที่บ้านหรือที่วัด แล้วพิมพ์ผลจากเครื่องตามจริง ระบบใช้เวลาไทย (UTC+7)</p><form onSubmit={save}><div className="inputs">
 <label className="field">ความดันตัวบน SYS (mmHg)<input required inputMode="numeric" type="number" min="60" max="300" value={form.systolic} onChange={e=>setForm({...form,systolic:e.target.value})}/></label>
 <label className="field">ความดันตัวล่าง DIA (mmHg)<input required inputMode="numeric" type="number" min="30" max="200" value={form.diastolic} onChange={e=>setForm({...form,diastolic:e.target.value})}/></label>
 <label className="field">ชีพจร (ครั้ง/นาที)<input required inputMode="numeric" type="number" min="30" max="220" value={form.pulse} onChange={e=>setForm({...form,pulse:e.target.value})}/></label>
 <label className="field">วันเวลาไทยที่วัด<input required type="datetime-local" value={form.measured_at} onChange={e=>setForm({...form,measured_at:e.target.value})}/></label>
 <label className="field">ช่วงที่วัด<select value={form.session} onChange={e=>setForm({...form,session:e.target.value})}><option value="morning">ช่วงเช้า</option><option value="bedtime">ช่วงก่อนนอน</option></select></label>
 <label className="field">ครั้งที่<select value={form.sequence} onChange={e=>setForm({...form,sequence:e.target.value})}><option value="1">ครั้งที่ 1</option><option value="2">ครั้งที่ 2</option></select></label>
 </div><label className="field">หมายเหตุ (ไม่ต้องระบุชื่อหรือข้อมูลระบุตัวบุคคล)<textarea maxLength={500} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label><button className="primary" type="submit" disabled={busy} style={{marginTop:16}}>{busy?"กำลังบันทึก...":"บันทึกผลการวัด"}</button></form></section>
 <section className="panel"><div className="topline"><h2>ประวัติผลการวัด</h2><button className="secondary no-print" onClick={()=>window.print()}>พิมพ์ / บันทึก PDF</button></div><p className="muted small">ข้อมูลส่วนตัวของบัญชีที่เข้าสู่ระบบเท่านั้น • แสดงล่าสุดไม่เกิน 500 รายการ</p><div className="scroll"><table><thead><tr>{["วันที่และเวลา","ช่วงเวลา","ครั้ง","SYS","DIA","ชีพจร"].map(x=><th key={x}>{x}</th>)}</tr></thead><tbody>{rows.map(r=><tr key={r.id}><td>{showDate(r.measured_at)}</td><td>{r.session==="morning"?"เช้า":"ก่อนนอน"}</td><td>{r.sequence}</td><td>{r.systolic}</td><td>{r.diastolic}</td><td>{r.pulse}</td></tr>)}{rows.length===0&&<tr><td colSpan={6}>ยังไม่มีข้อมูลสำหรับบัญชีนี้</td></tr>}</tbody></table></div></section>
 {danger&&<div className="danger">ในประวัติมีค่าความดันสูงมาก (ตัวบนตั้งแต่ 180 หรือตัวล่างตั้งแต่ 120 mmHg) ควรวัดซ้ำอย่างถูกวิธีและปรึกษาบุคลากรแพทย์โดยเร็ว หากมีอาการเจ็บหน้าอก หายใจลำบาก อ่อนแรง หรือพูดผิดปกติ โทร 1669 ทันที</div>}
 </>}
 {message&&<div role="status" className={message.includes("ไม่สำเร็จ")||message.includes("ไม่ได้")||message.includes("ซ้ำ")?"error":"message"} style={{marginTop:14}}>{message}</div>}
 <footer>ระบบทดลองเพื่อบันทึกผล ไม่ใช้แทนการวินิจฉัยหรือรักษาของแพทย์ • ข้อมูลสุขภาพต้องได้รับการคุ้มครองตามสิทธิ์ของเจ้าของข้อมูล • งานระบบแพทย์และ Member Bridge ยังไม่เปิดใช้งาน</footer>
 </main>;
}
