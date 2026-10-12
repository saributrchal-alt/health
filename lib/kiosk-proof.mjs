import crypto from "node:crypto";
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validUuid(v){return typeof v==="string"&&uuid.test(v)}
export function signedKioskMessage(deviceId,challengeId){if(!validUuid(deviceId)||!validUuid(challengeId))throw Error("Invalid ids");return Buffer.from("nathoeng-health-kiosk-v1:"+deviceId+":"+challengeId,"utf8")}
export function validSignature(publicKeyBase64,payload,sigBase64){
  if(typeof publicKeyBase64!=="string"||publicKeyBase64.length>900||typeof sigBase64!=="string"||sigBase64.length>700)return false;
  try {
    const pub=crypto.createPublicKey({key:Buffer.from(publicKeyBase64,"base64"),format:"der",type:"spki"});
    if(pub.asymmetricKeyType!=="ec"||pub.asymmetricKeyDetails?.namedCurve!=="prime256v1")return false;
    const sig=Buffer.from(sigBase64,"base64");
    if(sig.length<65||sig.length>80)return false;
    return crypto.verify("sha256",payload,pub,sig);
  }catch{return false}
}
export function resultDeviceProof(proof,device,challenge,now=Date.now()){
 if(!proof||!validUuid(proof.device_id)||!validUuid(proof.challenge_id)||!device?.enabled||device.id!==proof.device_id||challenge?.device_id!==proof.device_id||challenge?.id!==proof.challenge_id||challenge.used_at)return false;
 const ts=Date.parse(challenge.issued_at);
 return Number.isFinite(ts)&&ts<=now+5000&&now-ts<20000&&validSignature(device.public_key_spki_base64,signedKioskMessage(proof.device_id,proof.challenge_id),proof.signature);
}
