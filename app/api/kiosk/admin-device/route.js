import crypto from "node:crypto";
import {validUuid} from "../../../../lib/kiosk-proof.mjs";
export const runtime="nodejs";
const respond=(status,data)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(request){
 const secret=process.env.HEALTH_BRIDGE_KEY;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!secret||!url||!key)return respond(503,{success:false,message:"Not configured"});
 let raw;
 try{raw=await request.text();if(raw.length>3000)return respond(413,{success:false});}catch{return respond(400,{success:false})}
 const signature=request.headers.get("x-health-signature");
 if(!signature||!/^[0-9a-f]{64}$/i.test(signature)||secret.length<24)return respond(403,{success:false});
 const expected=crypto.createHmac("sha256",secret).update(raw).digest("hex");
 if(!crypto.timingSafeEqual(Buffer.from(signature,"hex"),Buffer.from(expected,"hex")))return respond(403,{success:false});
 let p;try{p=JSON.parse(raw)}catch{return respond(400,{success:false})}
 if(!validUuid(p.event_id)||!validUuid(p.device_id)||!validUuid(p.assigned_by)||
   !["register","approve","disable"].includes(p.action)||typeof p.label!=="string"||
   p.label.length<2||p.label.length>120||typeof p.public_key!=="string"||
   p.public_key.length<80||p.public_key.length>700||typeof p.issued_at!=="string"||
   Math.abs(Date.now()-Date.parse(p.issued_at))>300000)return respond(400,{success:false,message:"Invalid payload"});
 try{
   const pub=crypto.createPublicKey({key:Buffer.from(p.public_key,"base64"),format:"der",type:"spki"});
   if(pub.asymmetricKeyType!=="ec"||pub.asymmetricKeyDetails?.namedCurve!=="prime256v1")return respond(400,{success:false,message:"Unsupported key"});
   const headers={apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+key}),"Content-Type":"application/json"};
   const res=await fetch(url+"/rest/v1/rpc/health_admin_kiosk_device",{method:"POST",headers,cache:"no-store",signal:AbortSignal.timeout(8000),body:JSON.stringify({p_event_id:p.event_id,p_device_id:p.device_id,p_actor:p.assigned_by,p_action:p.action,p_label:p.label,p_public_key:p.public_key,p_issued_at:p.issued_at})});
   if(!res.ok)return respond(409,{success:false,message:"Device request rejected"});
   const result=await res.json();
   return respond(200,{success:true,device_id:result.device_id,enabled:result.enabled,idempotent:result.idempotent});
 }catch(e){console.error("Provisioning failed",e.message);return respond(503,{success:false,message:"Unavailable"})}
}
export async function GET(){return respond(405,{success:false})}
