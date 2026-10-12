import {processDeviceAdmin} from "../../../../lib/health-device-admin.mjs";
export const runtime="nodejs";
export async function POST(request){
 let raw;
 try{raw=await request.text();}catch{return Response.json({success:false,endpoint:"health-kiosk-admin-device-v1"},{status:400})}
 const {status,body}=await processDeviceAdmin(raw,request.headers.get("x-health-signature"));
 return Response.json(body,{status,headers:{"Cache-Control":"no-store","X-Health-Endpoint":"health-kiosk-admin-device-v1"}});
}
export async function GET(){return Response.json({success:false,endpoint:"health-kiosk-admin-device-v1"},{status:405})}
