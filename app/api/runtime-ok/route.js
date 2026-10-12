export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return Response.json({ok:true,route:'runtime-ok-v1'},{headers:{'Cache-Control':'no-store'}})}
