import crypto from "node:crypto";
import {validUuid} from "./kiosk-proof.mjs";

// This is an administrator-only provisioning command, NOT a member login.
export const DEVICE_ENDPOINT_ID="health-kiosk-admin-device-v1";
export const DEVICE_ROUTE_SCOPE="health-kiosk-device-v1";
const response=(status,data)=>({status,body:{...data,endpoint:DEVICE_ENDPOINT_ID}});
export function validateProvisioningInput(p,now=Date.now()){
 if(!p||typeof p!=="object"||!validUuid(p.event_id)||!validUuid(p.device_id)||
    !validUuid(p.assigned_by)||!["register","approve","disable"].includes(p.action)||
    typeof p.label!=="string"||p.label.length<2||p.label.length>120||
    typeof p.public_key!=="string"||p.public_key.length<80||p.public_key.length>700||
    typeof p.issued_at!=="string")return false;
 const at=Date.parse(p.issued_at);
 return Number.isFinite(at)&&Math.abs(now-at)<=300000;
}
export function validateDevicePublicKey(s){
 try {
  if(typeof s!=="string"||!(/^[A-Za-z0-9+/]+={0,2}$/.test(s)))return false;
  const key=crypto.createPublicKey({key:Buffer.from(s,"base64"),format:"der",type:"spki"});
  return key.asymmetricKeyType==="ec"&&key.asymmetricKeyDetails?.namedCurve==="prime256v1";
 }catch{return false}
}
export function verifyProvisioningSignature(raw,signature,key){
 if(typeof raw!=="string"||raw.length>3000||typeof key!=="string"||key.length<24||
    typeof signature!=="string"||!/^[a-f0-9]{64}$/i.test(signature))return false;
 const supplied=Buffer.from(signature,"hex");
 const expected=crypto.createHmac("sha256",key).update(raw).digest();
 return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);
}
export async function processDeviceAdmin(raw,signature,env=process.env,fetcher=fetch){
 const secret=env.HEALTH_BRIDGE_KEY;
 const url=env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const key=env.SUPABASE_SECRET_KEY;
 if(!secret||!url||!key)return response(503,{success:false,message:"Not configured"});
 if(!verifyProvisioningSignature(raw,signature,secret))return response(403,{success:false,message:"Signature invalid"});
 let p;
 try{p=JSON.parse(raw)}catch{return response(400,{success:false,message:"Invalid JSON"})}
 if(!validateProvisioningInput(p))return response(400,{success:false,message:"Invalid or expired kiosk command"});
 if(!validateDevicePublicKey(p.public_key))return response(400,{success:false,message:"Unsupported public key"});
 const headers={apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+key}),"Content-Type":"application/json"};
 try{
  const res=await fetcher(url+"/rest/v1/rpc/health_admin_kiosk_device",{
   method:"POST",headers,cache:"no-store",signal:AbortSignal.timeout(8000),
   body:JSON.stringify({p_event_id:p.event_id,p_device_id:p.device_id,p_actor:p.assigned_by,
     p_action:p.action,p_label:p.label,p_public_key:p.public_key,p_issued_at:p.issued_at})
  });
  if(!res.ok){
   let code="UNKNOWN";
   try{const err=await res.json(); if(typeof err?.code==="string" && /^[A-Z0-9_]{3,14}$/i.test(err.code))code=err.code;}catch{}
   console.error("Health kiosk provisioning DB rejected",res.status,code);
   return response(409,{success:false,message:"Device request rejected",db_code:code});
  }
  const result=await res.json();
  return response(200,{success:true,device_id:result.device_id,enabled:result.enabled,idempotent:result.idempotent});
 }catch(e){
  console.error("Health kiosk provisioning unavailable",e?.message);
  return response(503,{success:false,message:"Kiosk provisioning unavailable"});
 }
}
