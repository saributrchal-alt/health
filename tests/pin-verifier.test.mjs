import test from "node:test";
import assert from "node:assert/strict";
import {isAcceptablePin,createPinVerifier,checkPinVerifier} from "../lib/pin-verifier.mjs";

test("six-digit PIN policy rejects repeated or sequential values",()=>{
 assert.equal(isAcceptablePin("583927"),true);
 for(const x of ["123456","654321","012345","999999","12345","abc123"])assert.equal(isAcceptablePin(x),false);
});
test("salted PIN verifier accepts only correct PIN and salts differ",async()=>{
 const a=await createPinVerifier("583927");
 const b=await createPinVerifier("583927");
 assert.notEqual(a.salt,b.salt);
 assert.notEqual(a.hash,b.hash);
 assert.equal(await checkPinVerifier("583927",a.salt,a.hash),true);
 assert.equal(await checkPinVerifier("583926",a.salt,a.hash),false);
 assert.equal(await checkPinVerifier("583927","broken","broken"),false);
});
