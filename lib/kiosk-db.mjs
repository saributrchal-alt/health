export function config(){
 const secret=process.env.HEALTH_CARD_HMAC_SECRET;
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/,"");
 const key=process.env.SUPABASE_SECRET_KEY;
 if(!secret||secret.length<32||!url||!key)throw Error("Kiosk database not configured");
 return {secret,url,headers:{"apikey":key,...(key.startsWith("sb_secret_")?{}:{"Authorization":"Bearer "+key}),"Content-Type":"application/json"}};
}
export async function db(c,path,init={}){
 const r=await fetch(c.url+"/rest/v1/"+path,{...init,cache:"no-store",signal:AbortSignal.timeout(7000),
   headers:{...c.headers,...init.headers}});
 if(!r.ok)throw Error("Kiosk database request failed ("+r.status+")");
 return r.json();
}
