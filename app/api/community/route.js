import {readHealthSession,approved,serviceConfig} from '../../../lib/health-session.mjs';
async function authorized(request) {
 const memberId=readHealthSession(request);
 if(!memberId||!await approved(memberId))return null;
 return memberId;
}
export async function GET(request) {
 const memberId=await authorized(request),cfg=serviceConfig();
 if(!memberId)return Response.json({error:'Not authorized'},{status:401});
 if(!cfg)return Response.json({error:'Unavailable'},{status:503});
 const response=await fetch(cfg.base+'/rest/v1/community_health_measurements?member_id=eq.'+memberId+'&select=id,systolic,diastolic,pulse,measured_at&order=measured_at.desc&limit=100',{headers:cfg.headers,cache:'no-store'});
 if(!response.ok)return Response.json({error:'Database error'},{status:502});
 return Response.json({rows:await response.json()},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request) {
 const memberId=await authorized(request),cfg=serviceConfig();
 if(!memberId)return Response.json({error:'Not authorized'},{status:401});
 if(!cfg)return Response.json({error:'Unavailable'},{status:503});
 let p;try{p=await request.json()}catch{return Response.json({error:'Invalid JSON'},{status:400})}
 const sys=p?.systolic,dia=p?.diastolic,pulse=p?.pulse;
 if(![sys,dia,pulse].every(Number.isInteger)||sys<60||sys>300||dia<30||dia>200||dia>=sys||pulse<30||pulse>220)return Response.json({error:'Invalid measurement'},{status:400});
 const response=await fetch(cfg.base+'/rest/v1/community_health_measurements',{method:'POST',headers:{...cfg.headers,Prefer:'return=minimal'},body:JSON.stringify({member_id:memberId,systolic:sys,diastolic:dia,pulse})});
 if(!response.ok)return Response.json({error:'Could not save'},{status:502});
 return Response.json({success:true});
}
