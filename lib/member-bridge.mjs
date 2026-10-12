import crypto from "node:crypto";
export function verifyHealthBridge(raw,signature,secret=process.env.HEALTH_BRIDGE_KEY){
  if(typeof raw!=="string" || raw.length>3000 || typeof secret!=="string" || secret.length<24 ||
     typeof signature!=="string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const supplied=Buffer.from(signature,"hex"),expected=crypto.createHmac("sha256",secret).update(raw).digest();
  return supplied.length===expected.length&&crypto.timingSafeEqual(supplied,expected);
}
export function validateHealthBridge(p,now=Date.now()){
  const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  return Boolean(p&&typeof p==="object"&&uuid.test(p.event_id||"")&&uuid.test(p.member_id||"")&&
   uuid.test(p.assigned_by||"")&&typeof p.is_active==="boolean"&&typeof p.issued_at==="string"&&
   Number.isFinite(Date.parse(p.issued_at))&&Math.abs(now-Date.parse(p.issued_at))<=300000);
}
