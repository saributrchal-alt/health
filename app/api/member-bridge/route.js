import {processDeviceAdmin,DEVICE_ROUTE_SCOPE} from "../../../lib/health-device-admin.mjs";
import crypto from "node:crypto";
import {verifyHealthBridge,validateHealthBridge} from "../../../api/member-bridge.js";
export const runtime="nodejs";
export async function POST(request){
  // Explicitly dispatch kiosk device commands on the proven Member Bridge path.
  if(new URL(request.url).searchParams.get("scope")===DEVICE_ROUTE_SCOPE){
    let raw;try{raw=await request.text()}catch{return Response.json({success:false,endpoint:"health-kiosk-admin-device-v1"},{status:400})}
    const result=await processDeviceAdmin(raw,request.headers.get("x-health-signature"));
    return Response.json(result.body,{status:result.status,headers:{"Cache-Control":"no-store"}});
  }
  const headers={"Cache-Control":"no-store","Content-Type":"application/json"};
  const response=(status,obj)=>new Response(JSON.stringify(obj),{status,headers});
  const secret=process.env.HEALTH_BRIDGE_KEY;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!secret||!key||!url)return response(503,{success:false,message:"Bridge not configured"});
  let raw;
  try {raw=await request.text();} catch{return response(400,{success:false,message:"Unreadable request"})}
  if(!verifyHealthBridge(raw,request.headers.get("x-health-signature"),secret)) return response(403,{success:false,message:"Signature invalid"});
  let payload;
  try{payload=JSON.parse(raw)}catch{return response(400,{success:false,message:"Invalid JSON"})}
  if(!validateHealthBridge(payload))return response(400,{success:false,message:"Invalid or expired request"});
  const dbHeaders={apikey:key,...(key.startsWith("sb_secret_")?{}:{Authorization:"Bearer "+key}),"Content-Type":"application/json"};
  try{
    const result=await fetch(url+"/rest/v1/rpc/apply_health_bridge",{method:"POST",headers:dbHeaders,cache:"no-store",body:JSON.stringify({p_event_id:payload.event_id,p_member_id:payload.member_id,p_assigned_by:payload.assigned_by,p_is_active:payload.is_active,p_issued_at:payload.issued_at}),signal:AbortSignal.timeout(8000)});
    if(!result.ok){console.error("Health bridge rejected",result.status);return response(409,{success:false,message:"Bridge rejected; check actor, member or ordering"})}
    const value=await result.json();
    return response(200,{success:true,item:{member_id:value.member_id,is_active:value.is_active??payload.is_active,idempotent:!!value.idempotent}});
  }catch(e){console.error("Health bridge unavailable",e?.message);return response(503,{success:false,message:"Bridge temporarily unavailable"})}
}
export async function GET(){return new Response(JSON.stringify({success:false,message:"Method not allowed"}),{status:405,headers:{"Cache-Control":"no-store"}})}
