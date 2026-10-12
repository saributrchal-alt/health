import {resultDeviceProof,validUuid} from "../../../../lib/kiosk-proof.mjs";
export const runtime="nodejs";
const response=(status,body)=>Response.json(body,{status,headers:{"Cache-Control":"no-store"}});
function config(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!url||!key)throw Error("Not configured");
 return {url,headers:{"apikey":key,...(key.startsWith("sb_secret_")?{}:{"Authorization":"Bearer "+key}),"Content-Type":"application/json"}};
}
async function db(c,path,init={}){
 const r=await fetch(c.url+"/rest/v1/"+path,{cache:"no-store",...init,headers:{...c.headers,...init.headers},signal:AbortSignal.timeout(7000)});
 if(!r.ok)throw Error("Database request rejected");
 return r.status===204?null:r.json();
}
export async function POST(request){
 let p;
 try{if(Number(request.headers.get("content-length")||0)>1800)return response(413,{success:false});
     p=await request.json();}catch{return response(400,{success:false,message:"Invalid request"})}
 if(!p||!validUuid(p.device_id)||!["challenge","verify"].includes(p.action))return response(400,{success:false,message:"Invalid device request"});
 try{
   const c=config();
   const rows=await db(c,"health_kiosk_devices?id=eq."+encodeURIComponent(p.device_id)+"&select=id,enabled,public_key_spki_base64&limit=1");
   const device=rows?.[0];
   if(!device?.enabled)return response(403,{success:false,message:"Device is not approved"});
   if(p.action==="challenge"){
     const challenges=await db(c,"health_kiosk_challenges?select=id,issued_at",{method:"POST",headers:{"Prefer":"return=representation"},body:JSON.stringify({device_id:p.device_id})});
     if(!challenges?.[0]?.id)throw Error("No challenge");
     return response(200,{success:true,challenge_id:challenges[0].id,expires_in_seconds:20});
   }
   if(!validUuid(p.challenge_id)||typeof p.signature!=="string")return response(400,{success:false,message:"Malformed proof"});
   const challenges=await db(c,"health_kiosk_challenges?id=eq."+encodeURIComponent(p.challenge_id)+"&select=id,device_id,issued_at,used_at&limit=1");
   if(!resultDeviceProof(p,device,challenges?.[0]))return response(403,{success:false,message:"Device proof invalid or expired"});
   const consumed=await db(c,"rpc/health_consume_kiosk_challenge",{method:"POST",body:JSON.stringify({p_challenge_id:p.challenge_id,p_device_id:p.device_id})});
   if(consumed!==true)return response(403,{success:false,message:"Challenge already used or expired"});
   // A valid device proof is NOT enough to identify a person or enter Health.
   return response(200,{success:true,device_verified:true,member_verified:false,session_issued:false});
 }catch(e){console.error("Health kiosk proof unavailable",e?.message);return response(503,{success:false,message:"Kiosk unavailable"})}
}
export async function GET(){return response(405,{success:false,message:"Method not allowed"})}
