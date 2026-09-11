'use strict';
const create=require('./booking-create.cjs');
const availability=require('./booking-availability.cjs');

class BookingCreateError extends Error{constructor(code,message=code){super(message);this.name='BookingCreateError';this.code=code}}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
function entries(snapshot){return Object.entries(value(snapshot)||{}).map(([id,row])=>({id,...row}))}
function transaction(ref,updater){return ref.transaction(updater,undefined,false)}
function message(mode,id){return mode==='paid_transfer'?`มีคำขอจองใหม่ ${id} พร้อมหลักฐานการชำระเงิน`:mode==='venue'?`มีคำขอจองใหม่ ${id} เลือกชำระที่สนาม`:`มีคำขอจองใหม่ ${id} รอ Coach อนุมัติ`}
function modeOf(booking){return booking.paymentCollectionMode==='venue'?'venue':booking.paymentStatus==='payment_submitted'?'paid_transfer':'request'}
async function writeOnce(ref,record){const result=await transaction(ref,current=>current||record);if(!result.committed)throw new BookingCreateError('SIDE_EFFECT_WRITE_FAILED')}
async function finish(db,{actorUid,requestId,coachId,action,fingerprint,saved,replay,now}){
  const mode=modeOf(saved),key=saved.createCommandKey,notificationId=`booking_${key}`,chatId=`system_${key}`,auditId=`booking_${requestId}`,notice=message(mode,saved.id);
  await writeOnce(db.ref(`notifications/${coachId}/${notificationId}`),{type:mode==='paid_transfer'?'new_paid_booking':mode==='venue'?'new_booking_pay_at_venue':'new_booking',bookingId:saved.id,senderId:actorUid,recipientId:coachId,athleteId:actorUid,coachId,message:notice,read:false,createdAt:now});
  await writeOnce(db.ref(`userChats/${coachId}/${actorUid}/messages/${chatId}`),{senderId:actorUid,senderRole:'system',type:'system',bookingId:saved.id,text:`${notice} • ${saved.date} ${saved.start}–${saved.end} • ${saved.venue}`,createdAt:now});
  await writeOnce(db.ref(`auditLogs/${actorUid}/${auditId}`),{userId:actorUid,actor:'athlete',action,target:saved.id,requestId,at:now});
  await db.ref(`bookingCommandResults/${actorUid}/${requestId}`).update({status:'completed',resultStatus:saved.status,resultPaymentStatus:saved.paymentStatus,completedAt:now,updatedAt:now});
  return{ok:true,replay,bookingId:saved.id,status:saved.status,paymentStatus:saved.paymentStatus}
}

async function execute(db,{actorUid,input,now=Date.now()}){
  const requestId=String(input&&input.requestId||'').trim(),id=create.bookingId(actorUid,requestId);
  if(!id)throw new BookingCreateError('INVALID_REQUEST_ID');
  const coachId=String(input&&input.coachId||'').trim(),action='create_booking',fingerprint=create.requestFingerprint(actorUid,input);
  const commandRef=db.ref(`bookingCommandResults/${actorUid}/${requestId}`);let requestConflict=false,commandReplay=false;
  const claimed=await transaction(commandRef,current=>{
    if(current){if(current.action!==action||current.bookingId!==id||current.coachId!==coachId||current.fingerprint!==fingerprint){requestConflict=true;return}commandReplay=true;return current}
    return{actorUid,requestId,bookingId:id,coachId,action,fingerprint,status:'processing',createdAt:now,updatedAt:now}
  });
  if(!claimed.committed)throw new BookingCreateError(requestConflict?'REQUEST_CONFLICT':'COMMAND_CLAIM_FAILED');
  const bookingRef=db.ref(`bookings/${id}`),existingSnapshot=await bookingRef.get(),existing=value(existingSnapshot);
  if(existing){
    if(existing.createCommandKey!==`${actorUid}_${requestId}`||existing.athleteId!==actorUid||existing.coachId!==coachId)throw new BookingCreateError('BOOKING_ID_CONFLICT');
    return finish(db,{actorUid,requestId,coachId,action,fingerprint,saved:{id,...existing},replay:true,now});
  }
  const [athleteSnapshot,coachSnapshot,pricingSnapshot,paymentSnapshot,bookingsSnapshot,appointmentsSnapshot,groupsSnapshot,timeOffSnapshot,policySnapshot]=await Promise.all([
    db.ref(`users/${actorUid}`).get(),db.ref(`users/${coachId}`).get(),db.ref(`coachPricing/${coachId}`).get(),db.ref(`coachPaymentPublic/${coachId}`).get(),
    db.ref('bookings').orderByChild('coachId').equalTo(coachId).get(),db.ref(`coachPublicSchedule/${coachId}`).get(),db.ref(`coachGroupClasses/${coachId}`).get(),db.ref(`coachTimeOff/${coachId}`).get(),db.ref(`coachAvailability/${coachId}`).get(),
  ]);
  const evaluated=create.evaluate({actorUid,athlete:value(athleteSnapshot),coach:value(coachSnapshot),pricing:value(pricingSnapshot),paymentAccount:value(paymentSnapshot),input,now});
  if(!evaluated.ok)throw new BookingCreateError(evaluated.code);
  const policy=value(policySnapshot)||{},available=availability.evaluate(evaluated.target,{
    bookings:entries(bookingsSnapshot),appointments:entries(appointmentsSnapshot),groupClasses:entries(groupsSnapshot),timeOff:entries(timeOffSnapshot),
  },{now,mandatoryBufferMinutes:Number(policy.travelBufferMin??45),unknownTravelMinutes:45,maxClassesPerDay:Number(policy.maxClassesPerDay??8)});
  if(!available.ok)throw new BookingCreateError(available.code);
  const expected=create.record(evaluated,{actorUid,athlete:value(athleteSnapshot),input,now});let bookingConflict=false,bookingReplay=false;
  const written=await transaction(bookingRef,current=>{
    if(current){if(!create.same(current,expected)){bookingConflict=true;return}bookingReplay=true;return current}
    return expected
  });
  if(!written.committed)throw new BookingCreateError(bookingConflict?'BOOKING_ID_CONFLICT':'BOOKING_CREATE_FAILED');
  const saved={id,...(value(written.snapshot)||{})};
  return finish(db,{actorUid,requestId,coachId,action,fingerprint,saved,replay:commandReplay||bookingReplay,now});
}
module.exports={BookingCreateError,execute,finish,message,modeOf,writeOnce};
