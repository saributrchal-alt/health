import {lookupCard,verifyBridgeSignature} from "../../../../lib/card-binding.mjs";
import crypto from "node:crypto";
export const runtime="nodejs";
const reply=(status,data)=>Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
export async function POST(req){
 let raw;try{raw=await req.text()}catch{return reply(400,{success:false})}
 const key=process.env.HEALTH_BRIDGE_KEY;
 if(!verifyBridgeSignature(raw,req.headers.get("x-health-signature"),key))return reply(403,{success:false,message:"Unauthorized"});
 let p;try{p=JSON.parse(raw)}catch{return reply(400,{success:false})}
 const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
 if(!p||!uuid.test(p.event_id||"")||!uuid.test(p.member_id||"")||!uuid.test(p.actor_id||"")||
   !["prepare","approve","revoke"].includes(p.action)||typeof p.citizen_id!=="string"||
   (p.action!=="revoke"&&!/^[0-9]{13}$/.test(p.citizen_id))||typeof p.confirm_consent!=="boolean"||
   typeof p.issued_at!=="string"||Math.abs(Date.now()-Date.parse(p.issued_at))>300000)
   return reply(400,{success:false,message:"Invalid request"});
 // Physical chip-read proof flow is still under development.
 // Never accept legacy admin-only approval without a bound device claim.
 if(p.action==="approve"&&!/^[0-9]{9}$/.test(p.claim_code||""))return reply(409,{success:false,message:"CARD_PRESENT_PROOF_REQUIRED"});
 const secret=process.env.HEALTH_CARD_HMAC_SECRET;
 const supa=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const svc=process.env.SUPABASE_SECRET_KEY;
 if(!secret||secret.length<32||!supa||!svc)return reply(503,{success:false,message:"Card enrollment not configured"});
 const hash=p.action==="revoke"?null:lookupCard(p.citizen_id,secret);
 const headers={"apikey":svc,...(svc.startsWith("sb_secret_")?{}:{"Authorization":"Bearer "+svc}),"Content-Type":"application/json"};
 try{
  // Never allow a signed command to bind one person's card to another member record.
  if(p.action!=="revoke"){
  const memberRes=await fetch(supa+"/rest/v1/members?id=eq."+encodeURIComponent(p.member_id)+
    "&select=id,tax_id,id_card_verified_at,membership_status&limit=1",{headers,cache:"no-store",signal:AbortSignal.timeout(8000)});
  if(!memberRes.ok)return reply(503,{success:false,message:"Member verification unavailable"});
  const members=await memberRes.json(),m=members?.[0];
  if(!m||m.membership_status!=="active"||!m.id_card_verified_at||m.tax_id!==p.citizen_id)
    return reply(409,{success:false,message:"Member identity verification failed"});
  }
  const claimDigest=p.action==="approve"?crypto.createHash("sha256").update("nathoeng-health-claim-v1:"+p.claim_code).digest("hex"):null;
  const endpoint=p.action==="approve"?"health_admin_card_binding_with_claim":"health_admin_card_binding";
  const args=p.action==="approve"?
    {p_event_id:p.event_id,p_member_id:p.member_id,p_actor_id:p.actor_id,p_hmac:hash,
     p_code_digest:claimDigest,p_confirm_consent:p.confirm_consent,p_issued_at:p.issued_at}:
    {p_event_id:p.event_id,p_member_id:p.member_id,p_actor_id:p.actor_id,p_action:p.action,
     p_hmac:hash,p_confirm_consent:p.confirm_consent,p_issued_at:p.issued_at};
  const res=await fetch(supa+"/rest/v1/rpc/"+endpoint,{
   method:"POST",headers,cache:"no-store",signal:AbortSignal.timeout(8000),
   body:JSON.stringify(args)
  });
  if(!res.ok){console.error("Health card-binding request rejected",res.status);return reply(409,{success:false,message:"Card binding rejected"})}
  const applied=await res.json();
  if(applied?.success!==true)return reply(409,{success:false,message:"Card claim invalid, expired or not approved"});
  return reply(200,{success:true,action:p.action});
 }catch(e){console.error("Health card-binding unavailable",e?.message);return reply(503,{success:false,message:"Temporarily unavailable"})}
}
export async function GET(){return reply(405,{success:false})}
