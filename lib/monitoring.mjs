const thaiParts = new Intl.DateTimeFormat("en-GB", {timeZone:"Asia/Bangkok",year:"numeric",month:"2-digit",day:"2-digit"});
export function thaiDate(value) {
  const parts=Object.fromEntries(thaiParts.formatToParts(new Date(value)).filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
  return parts.year+"-"+parts.month+"-"+parts.day;
}
export function addThaiDays(ymd,offset) {
  const d=new Date(ymd+"T00:00:00+07:00");
  d.setUTCDate(d.getUTCDate()+offset);
  return thaiDate(d);
}
export function nowThaiInput() {
  const date=thaiDate(new Date());
  const t=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Bangkok",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date());
  return date+"T"+t;
}
export function toThaiInstant(input) {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const date=new Date(input+":00+07:00");
  return Number.isNaN(date.getTime())||thaiDate(date)!==input.slice(0,10)?null:date;
}
export const SLOTS=[["morning",1],["morning",2],["bedtime",1],["bedtime",2]];
export function summaryForWeek(readings,startDate) {
  const days=Array.from({length:7},(_,i)=>addThaiDays(startDate,i));
  const bySlot=new Map();
  for (const r of readings||[]) {
    if(!r.measured_at || !["morning","bedtime"].includes(r.session) || ![1,2].includes(Number(r.sequence))) continue;
    const date=thaiDate(r.measured_at),key=date+"|"+r.session+"|"+r.sequence;
    if(!bySlot.has(key))bySlot.set(key,r);
  }
  const entries=days.map((date,i)=>{
    const readings=SLOTS.map(([period,seq])=>bySlot.get(date+"|"+period+"|"+seq)||null);
    return {date,day:i+1,readings,count:readings.filter(Boolean).length};
  });
  const received=entries.reduce((sum,d)=>sum+d.count,0);
  const complete=received===28;
  const eligible=complete?entries.slice(1).flatMap(d=>d.readings):[];
  const avg=key=>eligible.length?eligible.reduce((sum,r)=>sum+Number(r[key]),0)/eligible.length:null;
  return {days:entries,received,total:28,complete,averages:{systolic:avg("systolic"),diastolic:avg("diastolic"),pulse:avg("pulse")}};
}
