import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {processDeviceAdmin,DEVICE_ENDPOINT_ID,validateProvisioningInput} from "../lib/health-device-admin.mjs";
const secret="test-only-health-bridge-secret-long-enough";
const ids=["e8bc2a58-5234-4ee1-ada3-70f04936f7dd","715f3912-f990-4fda-88b4-29db3d865206","da3dfec3-bae1-49e7-9cf5-a44de5bcba86"];
const pub=crypto.generateKeyPairSync("ec",{namedCurve:"prime256v1"}).publicKey.export({format:"der",type:"spki"}).toString("base64");
const p={event_id:ids[1],device_id:ids[0],assigned_by:ids[2],action:"register",label:"Android test device",public_key:pub,issued_at:new Date().toISOString()};
const sign=raw=>crypto.createHmac("sha256",secret).update(raw).digest("hex");
const env={NEXT_PUBLIC_SUPABASE_URL:"https://unit-test.supabase.co",SUPABASE_SECRET_KEY:"unit-test-only-not-real",HEALTH_BRIDGE_KEY:secret};
test("valid signed kiosk command routes to provisioning RPC and is never member bridge",async()=>{
 const raw=JSON.stringify(p);let path="";
 const mock=async (url,options)=>{path=url;const data=JSON.parse(options.body);assert.equal(data.p_action,"register");return {ok:true,status:200,json:async()=>({device_id:p.device_id,enabled:false,idempotent:false})}};
 const r=await processDeviceAdmin(raw,sign(raw),env,mock);
 assert.equal(r.status,200);assert.equal(r.body.endpoint,DEVICE_ENDPOINT_ID);
 assert.equal(r.body.enabled,false);assert.ok(path.endsWith("/rpc/health_admin_kiosk_device"));
});
test("tamper and expired device commands do not access database",async()=>{
 let used=false;const mock=async()=>{used=true;throw Error("Unexpected database call")};
 const raw=JSON.stringify(p);
 assert.equal((await processDeviceAdmin(raw,sign("wrong"),env,mock)).status,403);
 const old={...p,issued_at:new Date(Date.now()-310000).toISOString()},oldRaw=JSON.stringify(old);
 assert.equal(validateProvisioningInput(old),false);
 assert.equal((await processDeviceAdmin(oldRaw,sign(oldRaw),env,mock)).status,400);
 assert.equal(used,false);
});
