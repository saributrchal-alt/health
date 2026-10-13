import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {validSignature,signedKioskMessage,resultDeviceProof,signedCardPresenceMessage,resultCardPresenceProof,pilotIdentityEligible} from "../lib/kiosk-proof.mjs";
const id="c90b7c1d-4048-4e55-a427-3864ccf7bc32",ch="4d8d724a-dcf0-4ff0-8f5d-4cc4ba0c5a45";
const {publicKey,privateKey}=crypto.generateKeyPairSync("ec",{namedCurve:"prime256v1"});
const pub=publicKey.export({format:"der",type:"spki"}).toString("base64");
const signature=crypto.sign("sha256",signedKioskMessage(id,ch),privateKey).toString("base64");
const dev={id,enabled:true,public_key_spki_base64:pub},challenge={id:ch,device_id:id,issued_at:new Date().toISOString(),used_at:null};
test("device-signature rejects altered or malformed proofs",()=>{
 assert.equal(validSignature(pub,signedKioskMessage(id,ch),signature),true);
 assert.equal(validSignature(pub,signedKioskMessage(id,"8322b9dd-a1ae-4c80-8904-d0f7d8aa64ae"),signature),false);
 assert.equal(validSignature("bad",signedKioskMessage(id,ch),signature),false);
});
test("kiosk proof fail closed unless registered enabled fresh unused",()=>{
 const proof={device_id:id,challenge_id:ch,signature};
 assert.equal(resultDeviceProof(proof,dev,challenge),true);
 assert.equal(resultDeviceProof(proof,{...dev,enabled:false},challenge),false);
 assert.equal(resultDeviceProof(proof,dev,{...challenge,used_at:new Date().toISOString()}),false);
 assert.equal(resultDeviceProof(proof,dev,{...challenge,issued_at:new Date(Date.now()-30000).toISOString()}),false);
 assert.equal(resultDeviceProof({...proof,signature:"fake"},dev,challenge),false);
});

const citizen="1234567890123",otherCitizen="1234567890124";
const cardSignature=crypto.sign("sha256",signedCardPresenceMessage(id,ch,citizen),privateKey).toString("base64");
test("pilot card proof binds device, challenge, chip ID and one-time freshness",()=>{
 const p={device_id:id,challenge_id:ch,citizen_id:citizen,signature:cardSignature};
 assert.equal(resultCardPresenceProof(p,dev,challenge),true);
 assert.equal(resultCardPresenceProof({...p,citizen_id:otherCitizen},dev,challenge),false);
 assert.equal(resultCardPresenceProof({...p,citizen_id:"123"},dev,challenge),false);
 assert.equal(resultCardPresenceProof({...p,signature},dev,challenge),false); // device-only signature can't pass
 assert.equal(resultCardPresenceProof(p,{...dev,enabled:false},challenge),false);
 assert.equal(resultCardPresenceProof(p,dev,{...challenge,used_at:new Date().toISOString()}),false);
 assert.equal(resultCardPresenceProof(p,dev,{...challenge,issued_at:new Date(Date.now()-21000).toISOString()}),false);
 assert.equal(resultCardPresenceProof(p,dev,{...challenge,device_id:"b7bdde73-2e4b-4e42-9391-29e60a6cc08f"}),false);
});
test("pilot identity approval requires active member, explicit consent and verified card",()=>{
 const m="823d9bc2-dd0b-49fe-92a7-ea742727614c";
 const b={member_id:m,binding_status:"approved",approved_at:new Date().toISOString(),consent_at:new Date().toISOString()};
 const h={member_id:m,is_active:true,kiosk_enabled:true};
 const t={id:m,membership_status:"active",id_card_verified_at:new Date().toISOString()};
 assert.equal(pilotIdentityEligible(b,h,t),true);
 assert.equal(pilotIdentityEligible({...b,binding_status:"revoked"},h,t),false);
 assert.equal(pilotIdentityEligible({...b,consent_at:null},h,t),false);
 assert.equal(pilotIdentityEligible(b,{...h,kiosk_enabled:false},t),false);
 assert.equal(pilotIdentityEligible(b,h,{...t,membership_status:"cancelled"}),false);
 assert.equal(pilotIdentityEligible(b,h,{...t,id_card_verified_at:null}),false);
 assert.equal(pilotIdentityEligible(b,{...h,member_id:"1395396f-c0b0-46a3-a500-774bd611cfa0"},t),false);
});
