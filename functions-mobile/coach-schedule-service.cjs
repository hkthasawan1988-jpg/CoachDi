'use strict';
const {createHash}=require('node:crypto');
const availability=require('./booking-availability.cjs');

const REQUEST_ID=/^[A-Za-z0-9_.:-]{8,180}$/;
const ID=/^[A-Za-z0-9_-]{1,180}$/;
const INACTIVE=/cancel|reject|declin|refund|expired/i;
const ACTIONS=new Set(['time_off_upsert','time_off_delete','appointment_upsert','appointment_delete']);

class CoachScheduleError extends Error{constructor(code,message=code){super(message);this.name='CoachScheduleError';this.code=code}}
function nested(root,path){let node=root;for(const part of String(path).split('/').filter(Boolean)){if(node==null)return null;node=node[part]}return node??null}
function put(root,path,value){const parts=String(path).split('/').filter(Boolean);let node=root;for(const part of parts.slice(0,-1))node=node[part]||(node[part]={});node[parts.at(-1)]=value}
function remove(root,path){const parts=String(path).split('/').filter(Boolean);let node=root;for(const part of parts.slice(0,-1)){node=node?.[part];if(!node)return}delete node[parts.at(-1)]}
function rows(value){return Object.entries(value||{}).map(([id,row])=>({id,...row}))}
function text(value,max=180){return String(value||'').trim().replace(/\s+/g,' ').slice(0,max)}
function today(now){return new Date(Number(now)+7*3600000).toISOString().slice(0,10)}
function active(row){return row&&!INACTIVE.test(String(row.status||''))}
function overlap(left,right){const a=availability.window(left),b=availability.window(right);return !!a&&!!b&&a.start<b.end&&b.start<a.end}
function timeOffRange(row){const startDate=String(row?.startDate||row?.date||row?.start||''),endDate=String(row?.endDate||row?.date||row?.end||startDate);return availability.validDate(startDate)&&availability.validDate(endDate)&&endDate>=startDate?{startDate,endDate}:null}
function timeOffIntersects(left,right){const a=timeOffRange(left),b=timeOffRange(right);return !!a&&!!b&&a.startDate<=b.endDate&&b.startDate<=a.endDate}
function version(row){return Number(row?.revision??row?.updatedAt??row?.createdAt??0)}
function fingerprint(actorUid,input){const clean={actorUid,action:input.action,appointmentId:input.appointmentId||'',timeOffId:input.timeOffId||'',date:input.date||'',start:input.start??'',end:input.end??'',venueId:input.venueId||'',venueName:input.venueName||'',recurringUntil:input.recurringUntil||'',startDate:input.startDate||'',endDate:input.endDate||'',expectedVersion:Number(input.expectedVersion||0)};return createHash('sha256').update(JSON.stringify(clean)).digest('hex')}
function safeKey(value){return String(value).replace(/[^A-Za-z0-9_-]/g,'_')}
function dateAdd(date,days){const parsed=new Date(date+'T12:00:00Z');parsed.setUTCDate(parsed.getUTCDate()+days);return parsed.toISOString().slice(0,10)}
function startMs(date,start){const hour=Math.floor(start),minute=Math.round((start-hour)*60);return Date.parse(`${date}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00+07:00`)}
function validWindow(date,start,end,now){const item={date,start,end};return availability.validDate(date)&&availability.window(item)&&end-start<=12&&startMs(date,start)>now}
function coachCommitments(root,coachId){return{
  bookings:rows(root.bookings).filter(row=>row.coachId===coachId&&active(row)),
  appointments:rows(nested(root,`coachPublicSchedule/${coachId}`)).filter(active),
  groups:rows(nested(root,`coachGroupClasses/${coachId}`)).filter(active),
  timeOff:rows(nested(root,`coachTimeOff/${coachId}`)).filter(active),
}}
function conflictForAppointment(sources,target,ignoreId=''){
  if(sources.timeOff.some(row=>availability.timeOffMatches(row,target)))return'COACH_TIME_OFF';
  const rows=[...sources.bookings,...sources.appointments.filter(row=>row.id!==ignoreId),...sources.groups];
  return rows.some(row=>row.date===target.date&&overlap(row,target))?'TIME_CONFLICT':'';
}
function conflictForTimeOff(sources,target,ignoreId=''){
  if(sources.timeOff.some(row=>row.id!==ignoreId&&timeOffIntersects(row,target)))return'TIME_OFF_OVERLAP';
  const rows=[...sources.bookings,...sources.appointments,...sources.groups];
  return rows.some(row=>active(row)&&row.date>=target.startDate&&row.date<=target.endDate)?'TIME_CONFLICT':'';
}

async function execute(db,{actorUid,input,now=Date.now()}){
  const action=text(input?.action,40),requestId=text(input?.requestId,180);
  if(!ID.test(String(actorUid||'')))throw new CoachScheduleError('COACH_INACTIVE');
  if(!REQUEST_ID.test(requestId)||!ACTIONS.has(action))throw new CoachScheduleError('INVALID_SCHEDULE_COMMAND');
  const digest=fingerprint(actorUid,{...input,action}),commandPath=`coachScheduleCommandResults/${actorUid}/${requestId}`;let response,errorCode;
  const result=await db.ref().transaction(current=>{
    const root=current||{},existingCommand=nested(root,commandPath);
    if(existingCommand){if(existingCommand.fingerprint!==digest||existingCommand.action!==action){errorCode='REQUEST_CONFLICT';return}response={...existingCommand.result,replay:true};return root}
    const actor=nested(root,`users/${actorUid}`)||{};if(actor.role!=='coach'||actor.status!=='active'){errorCode='COACH_INACTIVE';return}
    const sources=coachCommitments(root,actorUid),base={actorUid,requestId,action,fingerprint:digest,status:'completed',createdAt:now,updatedAt:now};
    if(action==='time_off_upsert'){
      const timeOffId=text(input?.timeOffId),startDate=text(input?.startDate,10),endDate=text(input?.endDate,10),target={startDate,endDate,fullDay:true};
      if(!availability.validDate(startDate)||!availability.validDate(endDate)||endDate<startDate||startDate<today(now)){errorCode='INVALID_TIME_OFF';return}
      const id=timeOffId||`off_${safeKey(actorUid)}_${safeKey(requestId)}`;if(!ID.test(id)){errorCode='INVALID_TIME_OFF';return}
      const existing=nested(root,`coachTimeOff/${actorUid}/${id}`);if(timeOffId&&(!existing||version(existing)!==Number(input?.expectedVersion||0))){errorCode='SCHEDULE_CHANGED';return}
      if(!timeOffId&&existing){errorCode='SCHEDULE_ID_CONFLICT';return}
      const conflict=conflictForTimeOff(sources,target,id);if(conflict){errorCode=conflict;return}
      put(root,`coachTimeOff/${actorUid}/${id}`,{coachId:actorUid,startDate,endDate,fullDay:true,type:'วันหยุด',revision:Number(existing?.revision||0)+1,createdAt:Number(existing?.createdAt)||now,updatedAt:now});
      response={ok:true,replay:false,action,timeOffId:id,startDate,endDate};
    }else if(action==='time_off_delete'){
      const id=text(input?.timeOffId),existing=nested(root,`coachTimeOff/${actorUid}/${id}`);if(!ID.test(id)||!existing){errorCode='TIME_OFF_NOT_FOUND';return}
      if(version(existing)!==Number(input?.expectedVersion||0)){errorCode='SCHEDULE_CHANGED';return}
      remove(root,`coachTimeOff/${actorUid}/${id}`);response={ok:true,replay:false,action,timeOffId:id};
    }else if(action==='appointment_upsert'){
      const appointmentId=text(input?.appointmentId),date=text(input?.date,10),start=Number(input?.start),end=Number(input?.end),venueName=text(input?.venueName,120),venueId=text(input?.venueId,120)||'other',until=text(input?.recurringUntil,10);
      if(!validWindow(date,start,end,now)||venueName.length<2){errorCode='INVALID_APPOINTMENT';return}
      if(appointmentId&&until){errorCode='INVALID_APPOINTMENT';return}
      const dates=[date];if(until){if(!availability.validDate(until)||until<date){errorCode='INVALID_APPOINTMENT';return}for(let next=dateAdd(date,7);next<=until&&dates.length<52;next=dateAdd(next,7))dates.push(next);if(dateAdd(dates.at(-1),7)<=until){errorCode='RECURRENCE_LIMIT';return}}
      const existing=appointmentId?nested(root,`coachPublicSchedule/${actorUid}/${appointmentId}`):null;
      if(appointmentId&&(!existing||version(existing)!==Number(input?.expectedVersion||0))){errorCode='SCHEDULE_CHANGED';return}
      for(const day of dates){const target={date:day,start,end};const conflict=conflictForAppointment(sources,target,appointmentId);if(conflict){errorCode=conflict;return}}
      const ids=[];for(let index=0;index<dates.length;index++){
        const id=appointmentId||`appointment_${safeKey(actorUid)}_${safeKey(requestId)}_${index+1}`;if(nested(root,`coachPublicSchedule/${actorUid}/${id}`)&&!appointmentId){errorCode='SCHEDULE_ID_CONFLICT';return}
        ids.push(id);put(root,`coachPublicSchedule/${actorUid}/${id}`,{coachId:actorUid,date:dates[index],start,end,venueId,venueName,source:'coach_existing_appointment',recurrenceGroup:until?date:'',revision:Number(existing?.revision||0)+1,createdAt:Number(existing?.createdAt)||now,updatedAt:now});
      }
      response={ok:true,replay:false,action,appointmentIds:ids,count:ids.length};
    }else{
      const id=text(input?.appointmentId),existing=nested(root,`coachPublicSchedule/${actorUid}/${id}`);if(!ID.test(id)||!existing){errorCode='APPOINTMENT_NOT_FOUND';return}
      if(version(existing)!==Number(input?.expectedVersion||0)){errorCode='SCHEDULE_CHANGED';return}
      remove(root,`coachPublicSchedule/${actorUid}/${id}`);response={ok:true,replay:false,action,appointmentId:id};
    }
    put(root,`auditLogs/${actorUid}/schedule_${safeKey(requestId)}`,{userId:actorUid,actor:'coach',action,target:response.timeOffId||response.appointmentId||response.appointmentIds?.[0]||'',requestId,at:now});
    put(root,commandPath,{...base,result:response});return root;
  },undefined,false);
  if(!result.committed)throw new CoachScheduleError(errorCode||'SCHEDULE_COMMAND_FAILED');
  if(errorCode)throw new CoachScheduleError(errorCode);return response;
}

module.exports={ACTIONS,CoachScheduleError,REQUEST_ID,active,coachCommitments,conflictForAppointment,conflictForTimeOff,dateAdd,execute,fingerprint,nested,overlap,put,remove,startMs,timeOffIntersects,timeOffRange,today,validWindow,version};
