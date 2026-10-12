import {lookupCard,verifyBridgeSignature} from "../../../../lib/card-binding.mjs";
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
   !/^[0-9]{13}$/.test(p.citizen_id)||typeof p.confirm_consent!=="boolean"||
   typeof p.issued_at!=="string"||Math.abs(Date.now()-Date.parse(p.issued_at))>300000)
   return reply(400,{success:false,message:"Invalid request"});
 const secret=process.env.HEALTH_CARD_HMAC_SECRET;
 const supa=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const svc=process.env.SUPABASE_SECRET_KEY;
 if(!secret||secret.length<32||!supa||!svc)return reply(503,{success:false,message:"Card enrollment not configured"});
 const hash=lookupCard(p.citizen_id,secret);
 const headers={"apikey":svc,...(svc.startsWith("sb_secret_")?{}:{"Authorization":"Bearer "+svc}),"Content-Type":"application/json"};
 try{
  const res=await fetch(supa+"/rest/v1/rpc/health_admin_card_binding",{
   method:"POST",headers,cache:"no-store",signal:AbortSignal.timeout(8000),
   body:JSON.stringify({p_event_id:p.event_id,p_member_id:p.member_id,p_actor_id:p.actor_id,p_action:p.action,
     p_hmac:hash,p_confirm_consent:p.confirm_consent,p_issued_at:p.issued_at})
  });
  if(!res.ok){console.error("Health card-binding request rejected",res.status);return reply(409,{success:false,message:"Card binding rejected"})}
  return reply(200,{success:true,action:p.action});
 }catch(e){console.error("Health card-binding unavailable",e?.message);return reply(503,{success:false,message:"Temporarily unavailable"})}
}
export async function GET(){return reply(405,{success:false})}
