"use client";
import {useEffect,useState} from "react";
export default function ConnectPage(){
 const [status,setStatus]=useState("กำลังเชื่อมต่อบัญชี...");
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   try{
    const hash=new URLSearchParams(location.hash.slice(1));
    const ticket=hash.get("ticket"),signature=hash.get("signature");
    history.replaceState(null,"",location.pathname);
    if(!ticket||!signature)throw Error("ไม่พบหลักฐานเข้าสู่ระบบ");
    const res=await fetch("/api/connect",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ticket,signature})});
    if(!res.ok)throw Error((await res.json()).error||"เชื่อมต่อไม่สำเร็จ");
    if(!cancelled){setStatus("เชื่อมต่อบัญชีสำเร็จ");location.replace("/community");}
   }catch(e){if(!cancelled)setStatus(e.message);}
  })();
  return()=>{cancelled=true};
 },[]);
 return <main style={{maxWidth:600,margin:"60px auto",padding:24}}><h1>สุขภาพชุมชน</h1><p role="status">{status}</p><a href="https://nathoeng.com/#my-dashboard">กลับไป My Dashboard</a></main>;
}
