import crypto from 'node:crypto';
import { verifyConnectTicket } from '../../../lib/nathoeng-connect-ticket.mjs';

const cookieName='nathoeng_health_session';
function signedSession(memberId, secret) {
 const body=Buffer.from(JSON.stringify({memberId,exp:Date.now()+12*60*60*1000})).toString('base64url');
 return body+'.'+crypto.createHmac('sha256',secret).update(body).digest('base64url');
}
export async function POST(request) {
 const secret=process.env.HEALTH_CONNECT_SIGNING_KEY;
 const sessionSecret=process.env.HEALTH_SESSION_SECRET;
 const base=process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!secret||!sessionSecret||sessionSecret.length<32||!base||!key) return Response.json({error:'Connect is not configured'},{status:503});
 let data;
 try { data=await request.json(); } catch {return Response.json({error:'Invalid request'},{status:400})}
 const ticket=verifyConnectTicket(data?.ticket,data?.signature,secret);
 if(!ticket)return Response.json({error:'Invalid or expired ticket'},{status:401});
 const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
 // Fail closed: require a persistent, uniquely indexed jti to prevent replay.
 const used=await fetch(base+'/rest/v1/health_connect_tickets',{method:'POST',headers:{...headers,Prefer:'return=minimal'},body:JSON.stringify({jti:ticket.ticketId,member_id:ticket.memberId})});
 if(!used.ok)return Response.json({error:'Ticket already used or replay protection unavailable'},{status:403});
 const auth=await fetch(base+'/rest/v1/health_members?member_id=eq.'+encodeURIComponent(ticket.memberId)+'&is_active=eq.true&select=member_id&limit=1',{headers,cache:'no-store'});
 if(!auth.ok || !(await auth.json())?.length)return Response.json({error:'Member is not authorized'},{status:403});
 const response=Response.json({success:true});
 response.headers.set('Set-Cookie',cookieName+'='+signedSession(ticket.memberId,sessionSecret)+'; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=43200');
 response.headers.set('Cache-Control','no-store');
 return response;
}
