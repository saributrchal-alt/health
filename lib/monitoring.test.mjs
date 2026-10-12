import test from "node:test";
import assert from "node:assert/strict";
import {addThaiDays,summaryForWeek,thaiDate,toThaiInstant} from "./monitoring.mjs";
test("Thai date boundary and timezone",()=>{
 assert.equal(thaiDate("2026-10-11T18:00:00Z"),"2026-10-12");
 assert.equal(addThaiDays("2026-10-31",1),"2026-11-01");
 assert.equal(toThaiInstant("2026-10-12T07:30").toISOString(),"2026-10-12T00:30:00.000Z");
});
test("Only a complete 7-day course exposes doctor-style averages, excluding day 1",()=>{
 const rows=[];
 for(let d=0;d<7;d++)for(const session of ["morning","bedtime"])for(const sequence of [1,2]){
   rows.push({measured_at:toThaiInstant(addThaiDays("2026-10-12",d)+"T07:30").toISOString(),session,sequence,systolic:d===0?180:120,diastolic:d===0?110:80,pulse:70});
 }
 const a=summaryForWeek(rows,"2026-10-12");
 assert.equal(a.received,28);assert.equal(a.complete,true);
 assert.equal(a.averages.systolic,120);assert.equal(a.averages.diastolic,80);
 const partial=summaryForWeek(rows.slice(1),"2026-10-12");
 assert.equal(partial.complete,false);assert.equal(partial.averages.systolic,null);
});
test("Duplicate slot is not counted twice",()=>{
 const r={measured_at:toThaiInstant("2026-10-12T07:30").toISOString(),session:"morning",sequence:1,systolic:120,diastolic:80,pulse:70};
 assert.equal(summaryForWeek([r,r],"2026-10-12").received,1);
});
