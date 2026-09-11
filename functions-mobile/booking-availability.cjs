'use strict';

const INACTIVE = /cancel|reject|declin|refund|expired/i;

function validDate(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))return false;
  const parsed=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
}
function number(value) {
  if(value==null||value==='')return null;
  if(typeof value==='string'&&/^\d{1,2}:\d{2}$/.test(value)){
    const [hour,minute]=value.split(':').map(Number);
    return hour>=0&&hour<=24&&minute>=0&&minute<60&&!(hour===24&&minute>0)?hour+minute/60:null;
  }
  const parsed=Number(value);return Number.isFinite(parsed)?parsed:null;
}
function active(row) { return !!row && !INACTIVE.test(String(row.status || '')); }
function sameVenue(left,right) {
  const leftId=String(left.venueId||'').trim().toLowerCase(),rightId=String(right.venueId||'').trim().toLowerCase();
  if(leftId&&rightId)return leftId===rightId;
  const leftName=String(left.venue||left.venueName||'').trim().toLowerCase(),rightName=String(right.venue||right.venueName||'').trim().toLowerCase();
  return !!leftName&&leftName===rightName;
}
function window(row) {
  const start=number(row&&row.start),end=number(row&&row.end);
  return start!=null&&end!=null&&start>=0&&end<=24&&end>start?{start,end}:null;
}
function overlap(left,right){const a=window(left),b=window(right);return !!a&&!!b&&a.start<b.end&&b.start<a.end;}
function timeOffMatches(row,booking){
  if(!active(row))return false;
  const startDate=String(row.startDate||row.date||row.start||''),endDate=String(row.endDate||row.date||row.end||startDate);
  if(!validDate(startDate)||!validDate(endDate)||booking.date<startDate||booking.date>endDate)return false;
  if(row.fullDay!==false)return true;
  const start=number(row.startHour??0),end=number(row.endHour??24),target=window(booking);
  return start!=null&&end!=null&&!!target&&start<target.end&&end>target.start;
}
function normalized(rows,type){
  if(!rows)return[];
  const list=Array.isArray(rows)?rows:Object.entries(rows).map(([id,row])=>({id,...row}));
  return list.filter(active).map((row,index)=>({id:String(row.id||`${type}_${index}`),type,...row}));
}
function evaluate(booking,sources={},policy={}){
  const target=window(booking),date=String(booking&&booking.date||'');
  if(!target||!validDate(date))return{ok:false,code:'INVALID_BOOKING_WINDOW'};
  const [hour,minute]=[Math.floor(target.start),Math.round((target.start%1)*60)];
  const startMs=Date.parse(`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+07:00`);
  if(!Number.isFinite(startMs))return{ok:false,code:'INVALID_BOOKING_WINDOW'};
  if(Number.isFinite(Number(policy.now))&&startMs<=Number(policy.now))return{ok:false,code:'BOOKING_IN_PAST'};
  const off=normalized(sources.timeOff,'time_off').find(row=>timeOffMatches(row,booking));
  if(off)return{ok:false,code:'COACH_TIME_OFF',conflictingId:off.id,conflictingType:off.type};
  const bookings=normalized(sources.bookings,'booking').filter(row=>row.id!==booking.id&&['confirmed','completed'].includes(String(row.status||'')));
  const appointments=normalized(sources.appointments,'appointment');
  const groups=normalized(sources.groupClasses,'group_class');
  const commitments=[...bookings,...appointments,...groups].filter(row=>row.date===date);
  const direct=commitments.find(row=>overlap(row,booking));
  if(direct)return{ok:false,code:'TIME_CONFLICT',conflictingId:direct.id,conflictingType:direct.type};
  const buffer=number(policy.mandatoryBufferMinutes??45),unknown=number(policy.unknownTravelMinutes??45);
  if(buffer==null||buffer<0||unknown==null||unknown<0)return{ok:false,code:'INVALID_TRAVEL_POLICY'};
  const route=typeof policy.travelMinutesBetween==='function'?policy.travelMinutesBetween:()=>null;
  for(const row of commitments){
    const item=window(row);if(!item)continue;
    const before=item.end<=target.start,after=item.start>=target.end;if(!before&&!after)continue;
    const gap=(before?target.start-item.end:item.start-target.end)*60;
    let travel=0;
    if(!sameVenue(row,booking)){
      const value=before?route(row.venueId,booking.venueId):route(booking.venueId,row.venueId);
      travel=number(value);if(travel==null)travel=unknown;
      if(travel<0)return{ok:false,code:'INVALID_TRAVEL_POLICY'};
    }
    if(gap<travel+buffer)return{ok:false,code:'TRAVEL_BUFFER_INSUFFICIENT',conflictingId:row.id,conflictingType:row.type,requiredMinutes:travel+buffer,availableMinutes:gap};
  }
  const max=number(policy.maxClassesPerDay??8);
  if(max==null||!Number.isInteger(max)||max<1)return{ok:false,code:'INVALID_DAILY_LIMIT'};
  if(commitments.length>=max)return{ok:false,code:'DAILY_LIMIT_REACHED'};
  return{ok:true};
}
module.exports={active,evaluate,overlap,sameVenue,timeOffMatches,validDate,window};
