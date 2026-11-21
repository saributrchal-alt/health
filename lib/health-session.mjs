import crypto from 'node:crypto';
export function readHealthSession(request) {
 const token=request.cookies.get('nathoeng_health_session')?.value;
 const secret=process.env.HEALTH_SESSION_SECRET;
 if(!token||!secret||secret.length<32)return null;
 const parts=token.split('.');
 if(parts.length!==2)return null;
 const expected=crypto.createHmac('sha256',secret).update(parts[0]).digest();
 let supplied;
 try{supplied=Buffer.from(parts[1],'base64url')}catch{return null}
 if(supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected))return null;
 try{
  const p=JSON.parse(Buffer.from(parts[0],'base64url').toString());
  if(!/^[0-9a-f-]{36}$/i.test(p.memberId)||!Number.isFinite(p.exp)||p.exp<Date.now())return null;
  return p.memberId;
 }catch{return null}
}
export async function approved(memberId) {
 const base=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!base||!key)return false;
 const res=await fetch(base+'/rest/v1/health_members?member_id=eq.'+encodeURIComponent(memberId)+'&is_active=eq.true&select=member_id&limit=1',{headers:{apikey:key,Authorization:'Bearer '+key},cache:'no-store'});
 return res.ok&&(await res.json()).length>0;
}
export function serviceConfig(){
 const base=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
 if(!base||!key)return null;
 return {base,headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'}};
}
