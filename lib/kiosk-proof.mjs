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

/** Proof only: binds the asserted chip identifier to this specific device challenge.
 * The Android app must independently re-read the physical chip before signing.
 * Does NOT open a member session or authorize health data access.
 */
export function signedCardPresenceMessage(deviceId,challengeId,citizenId){
 if(!validUuid(deviceId)||!validUuid(challengeId)||typeof citizenId!=="string"||!/^[0-9]{13}$/.test(citizenId))throw Error("Invalid card proof");
 return Buffer.from("nathoeng-health-card-presence-v1:"+deviceId+":"+challengeId+":"+citizenId,"utf8");
}
export function resultCardPresenceProof(proof,device,challenge,now=Date.now()){
 if(!proof||!validUuid(proof.device_id)||!validUuid(proof.challenge_id)||
    typeof proof.citizen_id!=="string"||!/^[0-9]{13}$/.test(proof.citizen_id)||
    !device?.enabled||device.id!==proof.device_id||
    challenge?.device_id!==proof.device_id||challenge?.id!==proof.challenge_id||challenge.used_at)return false;
 const ts=Date.parse(challenge.issued_at);
 return Number.isFinite(ts)&&ts<=now+5000&&now-ts>=0&&now-ts<20000&&
  validSignature(device.public_key_spki_base64,signedCardPresenceMessage(proof.device_id,proof.challenge_id,proof.citizen_id),proof.signature);
}
export function pilotIdentityEligible(binding,healthMember,templeMember,citizenId){
 return Boolean(binding?.binding_status==="approved"&&binding.approved_at&&binding.consent_at&&
   healthMember?.member_id===binding.member_id&&healthMember.is_active===true&&healthMember.kiosk_enabled===true&&
   templeMember?.id===binding.member_id&&templeMember.membership_status==="active"&&Boolean(templeMember.id_card_verified_at)&&templeMember.tax_id===citizenId);
}
