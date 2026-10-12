import crypto from "node:crypto";
import {validUuid,validSignature,signedKioskMessage} from "../../../../lib/kiosk-proof.mjs";
import {lookupCard} from "../../../../lib/card-binding.mjs";
export const runtime="nodejs";
const reply=(s,x)=>Response.json(x,{status:s,headers:{"Cache-Control":"no-store"}});
export async function POST(req){
 let p;try{if(Number(req.headers.get("content-length")||0)>2500)return reply(413,{success:false});p=await req.json()}catch{return reply(400,{success:false})}
 if(!validUuid(p?.device_id)||!validUuid(p?.challenge_id)||typeof p?.signature!=="string"||
    !/^[0-9]{13}$/.test(p?.citizen_id||""))return reply(400,{success:false});
 const secret=process.env.HEALTH_CARD_HMAC_SECRET,supa=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SECRET_KEY;
 if(!secret||secret.length<32||!supa||!key)return reply(503,{success:false});
 const headers={"apikey":key,...(key.startsWith("sb_secret_")?{}:{"Authorization":"Bearer "+key}),"Content-Type":"application/json"};
 async function call(path,opts={}){const r=await fetch(supa+"/rest/v1/"+path,{cache:"no-store",signal:AbortSignal.timeout(7000),...opts,headers:{...headers,...opts.headers}});if(!r.ok)throw Error("Supabase reject "+r.status);return r.json()}
 try{
 const d=(await call("health_kiosk_devices?id=eq."+encodeURIComponent(p.device_id)+"&select=id,enabled,public_key_spki_base64&limit=1"))?.[0];
 const c=(await call("health_kiosk_challenges?id=eq."+encodeURIComponent(p.challenge_id)+"&select=id,device_id,issued_at,used_at&limit=1"))?.[0];
 if(!d?.enabled||!c||c.used_at||c.device_id!==d.id)return reply(403,{success:false});
 const age=Date.now()-Date.parse(c.issued_at);
 if(!Number.isFinite(age)||age< -5000||age>=20000||
   !validSignature(d.public_key_spki_base64,signedKioskMessage(p.device_id,p.challenge_id),p.signature))
   return reply(403,{success:false});
 // 9-digit single-use, 3-minute admin claim. Never return a member identifier.
 const code=String(crypto.randomInt(0,1000000000)).padStart(9,"0");
 const digest=crypto.createHash("sha256").update("nathoeng-health-claim-v1:"+code).digest("hex");
 const hmac=lookupCard(p.citizen_id,secret);
 const issued=await call("rpc/health_issue_card_claim_with_challenge",{method:"POST",body:JSON.stringify({
  p_device_id:p.device_id,p_challenge_id:p.challenge_id,p_card_hmac:hmac,p_code_digest:digest
 })});
 if(issued!==true)return reply(429,{success:false,message:"Claim unavailable or rate limited"});
 return reply(200,{success:true,code,expires_in_seconds:180});
 }catch(e){console.error("Card claim unavailable",e?.message);return reply(503,{success:false,message:"Unavailable"})}
}
export async function GET(){return reply(405,{success:false})}
