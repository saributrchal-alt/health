import {validUuid,resultCardPresenceProof,pilotIdentityEligible} from "../../../../lib/kiosk-proof.mjs";
import {lookupCard} from "../../../../lib/card-binding.mjs";
import {isAcceptablePin,createPinVerifier,checkPinVerifier} from "../../../../lib/pin-verifier.mjs";
export const runtime="nodejs";
const reply=(status,body)=>Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const notVerified=()=>reply(403,{success:false,device_verified:false,member_verified:false,session_issued:false});
function config(){
 const secret=process.env.HEALTH_CARD_HMAC_SECRET;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!secret||secret.length<32||!url||!key)throw Error("Pilot identity not configured");
 return {secret,url,headers:{"apikey":key,...(key.startsWith("sb_secret_")?{}:{"Authorization":"Bearer "+key}),"Content-Type":"application/json"}};
}
async function db(c,path,init={}){
 const r=await fetch(c.url+"/rest/v1/"+path,{...init,cache:"no-store",signal:AbortSignal.timeout(7000),
   headers:{...c.headers,...init.headers}});
 if(!r.ok)throw Error("Pilot identity database request failed ("+r.status+")");
 return r.json();
}
/** Pilot-only demonstration: proves an approved member-card pairing exists.
 * No PIN enrollment, login token, medical access or session creation.
 * Never return member identifiers or card data to the caller.
 */
export async function POST(req){
 let p;
 try{
   if(Number(req.headers.get("content-length")||0)>2500)return reply(413,{success:false});
   const raw=await req.text();
   if(raw.length>2500)return reply(413,{success:false});
   p=JSON.parse(raw);
 }catch{return reply(400,{success:false,session_issued:false})}
 if(!validUuid(p?.device_id)||!validUuid(p?.challenge_id)||
    typeof p?.signature!=="string"||p.signature.length>700||
    typeof p?.citizen_id!=="string"||!/^[0-9]{13}$/.test(p.citizen_id))
   return reply(400,{success:false,session_issued:false});
 let c;
 try{c=config()}catch{return reply(503,{success:false,session_issued:false})}
 try{
   const device=(await db(c,"health_kiosk_devices?id=eq."+encodeURIComponent(p.device_id)+
    "&select=id,enabled,public_key_spki_base64&limit=1"))?.[0];
   const challenge=(await db(c,"health_kiosk_challenges?id=eq."+encodeURIComponent(p.challenge_id)+
    "&select=id,device_id,issued_at,used_at&limit=1"))?.[0];
   if(!resultCardPresenceProof(p,device,challenge))return notVerified();
   // Atomically consume the single-use 20-second device challenge before checking card bindings.
   const consumed=await db(c,"rpc/health_consume_kiosk_challenge",{method:"POST",body:JSON.stringify({
    p_challenge_id:p.challenge_id,p_device_id:p.device_id
   })});
   if(consumed!==true)return notVerified();
   const hmac=lookupCard(p.citizen_id,c.secret);
   const bindings=await db(c,"health_card_bindings?card_lookup_hmac=eq."+hmac+
    "&binding_status=eq.approved&select=member_id,binding_status,approved_at,consent_at&limit=2");
   if(!Array.isArray(bindings)||bindings.length!==1)return notVerified();
   const memberId=bindings[0].member_id;
   if(!validUuid(memberId))return notVerified();
   const [hm,tm]=await Promise.all([
    db(c,"health_members?member_id=eq."+encodeURIComponent(memberId)+
      "&select=member_id,is_active,kiosk_enabled&limit=1"),
    db(c,"members?id=eq."+encodeURIComponent(memberId)+
      "&select=id,membership_status,id_card_verified_at,tax_id&limit=1")
   ]);
   if(!pilotIdentityEligible(bindings[0],hm?.[0],tm?.[0],p.citizen_id))return notVerified();
   // A physical chip + registered device are required before each PIN operation.
   // PINs are accepted only for pilot verification: never create a login session.
   const action=p.action||"identity";
   if(!["identity","enroll_pin","verify_pin"].includes(action))
     return reply(400,{success:false,session_issued:false});
   if(action==="enroll_pin"){
     if(!isAcceptablePin(p.pin))return reply(400,{success:false,message:"Weak or invalid six-digit PIN",session_issued:false});
     const verifier=await createPinVerifier(p.pin);
     const response=await fetch(c.url+"/rest/v1/health_kiosk_credentials",{
       method:"POST",cache:"no-store",signal:AbortSignal.timeout(7000),
       headers:{...c.headers,"Prefer":"return=minimal"},
       body:JSON.stringify({member_id:memberId,pin_salt:verifier.salt,pin_hash:verifier.hash})
     });
     if(response.status===409)return reply(409,{success:false,message:"PIN is already configured",session_issued:false});
     if(!response.ok)throw Error("PIN setup rejected by database");
     return reply(200,{success:true,pin_enrolled:true,session_issued:false,medical_data_access:false,pilot_only:true});
   }
   if(action==="verify_pin"){
     if(typeof p.pin!=="string"||!/^[0-9]{6}$/.test(p.pin))
       return reply(400,{success:false,session_issued:false});
     // Atomic attempt reservation enforces a 5-guess/15-minute lock across all devices.
     const attempt=await db(c,"rpc/health_reserve_pin_attempt",{
       method:"POST",body:JSON.stringify({p_member_id:memberId})
     });
     if(attempt?.allowed!==true)return reply(429,{success:false,message:"PIN unavailable or locked",session_issued:false});
     const ok=await checkPinVerifier(p.pin,attempt.salt,attempt.hash);
     if(!ok)return reply(403,{success:false,message:"PIN not verified",session_issued:false});
     const cleared=await db(c,"rpc/health_reset_pin_attempts",{
       method:"POST",body:JSON.stringify({p_member_id:memberId,p_expected_hash:attempt.hash})
     });
     if(cleared!==true)return notVerified();
     return reply(200,{success:true,pin_verified:true,device_verified:true,member_verified:true,
       session_issued:false,medical_data_access:false,pilot_only:true});
   }

   // This is only a test status, deliberately NOT a Health account sign-in.
   return reply(200,{success:true,device_verified:true,member_verified:true,
     session_issued:false,medical_data_access:false,pilot_only:true});
 }catch(e){console.error("Health pilot identity check failed:",e?.message);
   return reply(503,{success:false,session_issued:false})}
}
export async function GET(){return reply(405,{success:false,session_issued:false})}
