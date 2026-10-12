import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {validSignature,signedKioskMessage,resultDeviceProof} from "../lib/kiosk-proof.mjs";
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
