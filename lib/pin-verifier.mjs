import crypto from "node:crypto";

const PARAMS={N:32768,r:8,p:1,maxmem:64*1024*1024};
export function isAcceptablePin(pin) {
  return typeof pin==="string"&&/^[0-9]{6}$/.test(pin) &&
    !/^([0-9])\1{5}$/.test(pin) &&
    !["123456","654321","012345","987654","000000","111111"].includes(pin);
}
function scryptAsync(pin,salt) {
  return new Promise((resolve,reject)=>{
    crypto.scrypt(pin,salt,64,PARAMS,(err,key)=>err?reject(err):resolve(key));
  });
}
export async function createPinVerifier(pin){
  if(!isAcceptablePin(pin))throw Error("PIN policy failed");
  const salt=crypto.randomBytes(24);
  const key=await scryptAsync(pin,salt);
  return {salt:salt.toString("base64"),hash:key.toString("base64")};
}
export async function checkPinVerifier(pin,storedSalt,storedHash){
  if(typeof pin!=="string"||!/^[0-9]{6}$/.test(pin))return false;
  if(typeof storedSalt!=="string"||typeof storedHash!=="string")return false;
  try {
    const salt=Buffer.from(storedSalt,"base64"),expected=Buffer.from(storedHash,"base64");
    if(salt.length!==24||expected.length!==64)return false;
    const actual=await scryptAsync(pin,salt);
    return crypto.timingSafeEqual(actual,expected);
  } catch {return false;}
}
