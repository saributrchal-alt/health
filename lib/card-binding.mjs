import crypto from "node:crypto";
export function lookupCard(id,secret) {
 if(typeof id!=="string"||!/^[0-9]{13}$/.test(id)||typeof secret!=="string"||secret.length<32) throw Error("Invalid lookup input");
 return crypto.createHmac("sha256",secret).update("nathoeng-health-card-v1:"+id,"utf8").digest("hex");
}
export function verifyBridgeSignature(raw,signature,key){
 if(typeof raw!=="string"||raw.length>3000||typeof key!=="string"||key.length<24||typeof signature!=="string"||!/^[0-9a-f]{64}$/i.test(signature))return false;
 return crypto.timingSafeEqual(Buffer.from(signature,"hex"),crypto.createHmac("sha256",key).update(raw).digest());
}
