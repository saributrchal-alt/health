import crypto from "node:crypto";
const SECRET=()=>process.env.HEALTH_BRIDGE_KEY;
const REST=()=>process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY=()=>process.env.SUPABASE_SECRET_KEY;
export function verifyHealthBridge(raw,signature,secret=SECRET()){
  if(typeof raw!=="string" || raw.length>3000 || !secret || secret.length<24 || typeof signature!=="string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const a=Buffer.from(signature,"hex"),b=crypto.createHmac("sha256",secret).update(raw).digest();
  return a.length===b.length && crypto.timingSafeEqual(a,b);
}
export function validateHealthBridge(p,now=Date.now()){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
 if(!p || typeof p!=="object" || !uuid.test(p.event_id||"") || !uuid.test(p.member_id||"") || !uuid.test(p.assigned_by||"") || typeof p.is_active!=="boolean" || typeof p.issued_at!=="string" || !Number.isFinite(Date.parse(p.issued_at)) || Math.abs(now-Date.parse(p.issued_at))>300000) return false;
 return true;
}
export default async function handler(req,res){
 res.setHeader("Cache-Control","no-store");
 if(req.method!=="POST")return res.status(405).json({success:false,message:"Method not allowed"});
 if(!REST() || !KEY() || !SECRET())return res.status(503).json({success:false,message:"Bridge not configured"});
 const raw=typeof req.body==="string"?req.body:JSON.stringify(req.body||{});
 const sig=req.headers["x-health-signature"];
 if(!verifyHealthBridge(raw,sig))return res.status(403).json({success:false,message:"Signature invalid"});
 let p;try{p=JSON.parse(raw)}catch{return res.status(400).json({success:false,message:"Invalid JSON"})}
 if(!validateHealthBridge(p))return res.status(400).json({success:false,message:"Invalid or expired request"});
 const key=KEY();
 const headers={apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+key}),"Content-Type":"application/json"};
 try{
  const rr=await fetch(REST().replace(/\/$/,"")+"/rest/v1/rpc/apply_health_bridge",{method:"POST",headers,body:JSON.stringify({p_event_id:p.event_id,p_member_id:p.member_id,p_assigned_by:p.assigned_by,p_is_active:p.is_active,p_issued_at:p.issued_at}),cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!rr.ok){console.error("Health bridge DB reject",rr.status);return res.status(409).json({success:false,message:"Bridge rejected; check actor, member or ordering"})}
  const item=await rr.json();
  return res.status(200).json({success:true,item:{member_id:item.member_id,is_active:item.is_active??p.is_active,idempotent:!!item.idempotent}});
 }catch(e){console.error("Health bridge unavailable",e?.message);return res.status(503).json({success:false,message:"Bridge temporarily unavailable"})}
}
