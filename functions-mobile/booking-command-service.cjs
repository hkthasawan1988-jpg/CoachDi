'use strict';
const command=require('./booking-command.cjs');
const availability=require('./booking-availability.cjs');
const slots=require('./booking-slot-lock.cjs');

const BOOKING_ID=/^[A-Za-z0-9_-]{4,100}$/;
const TRAVEL={
  visda:{visda:0,tropp:35,skyline:35,citypark:45,other:45},
  tropp:{visda:35,tropp:0,skyline:45,citypark:45,other:45},
  skyline:{visda:35,tropp:45,skyline:0,citypark:30,other:45},
  citypark:{visda:45,tropp:45,skyline:30,citypark:0,other:45},
  other:{visda:45,tropp:45,skyline:45,citypark:45,other:45},
};

class BookingCommandError extends Error{
  constructor(code,message=code){super(message);this.name='BookingCommandError';this.code=code;}
}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null;}
function entries(snapshot){return Object.entries(value(snapshot)||{}).map(([id,row])=>({id,...row}));}
function route(from,to){return Number.isFinite(Number(TRAVEL?.[from]?.[to]))?Number(TRAVEL[from][to]):null;}
function publicResult(booking,decision){return{ok:true,replay:decision.replay===true,bookingId:booking.id,status:booking.status,paymentStatus:booking.paymentStatus,refundReviewRequired:booking.refundReviewRequired===true};}
function message(decision,booking){
  if(decision.action==='coach_decline')return `Booking ${booking.id} ถูกปฏิเสธ กรุณาตรวจสอบรายละเอียดในแอป`;
  if(decision.action==='record_venue_payment')return `Coach ยืนยันรับเงินที่สนามสำหรับ Booking ${booking.id} แล้ว`;
  if(decision.action==='coach_confirm_venue')return `Coach ยืนยัน Booking ${booking.id} แล้ว กรุณาชำระที่สนาม`;
  return `Coach ยืนยัน Booking ${booking.id} แล้ว`;
}
function transaction(ref,updater){return ref.transaction(updater,undefined,false);}

async function execute(db,{actorUid,input,now=Date.now()}){
  const bookingId=String(input&&input.bookingId||'').trim(),requestId=String(input&&input.requestId||'').trim();
  if(!BOOKING_ID.test(bookingId))throw new BookingCommandError('BOOKING_NOT_FOUND');
  const key=command.commandKey(actorUid,requestId);if(!key)throw new BookingCommandError('INVALID_REQUEST_ID');
  const action=String(input&&input.action||'').trim();
  const commandRef=db.ref(`bookingCommandResults/${actorUid}/${requestId}`);let requestConflict=false;
  const commandClaim=await transaction(commandRef,current=>{
    if(current){
      if(current.bookingId!==bookingId||current.action!==action){requestConflict=true;return;}
      return current;
    }
    return{actorUid,requestId,bookingId,action,status:'processing',createdAt:now,updatedAt:now};
  });
  if(!commandClaim.committed)throw new BookingCommandError(requestConflict?'REQUEST_CONFLICT':'COMMAND_CLAIM_FAILED');

  const bookingRef=db.ref(`bookings/${bookingId}`);
  const [userSnapshot,bookingSnapshot]=await Promise.all([db.ref(`users/${actorUid}`).get(),bookingRef.get()]);
  const user=value(userSnapshot),initial={id:bookingId,...(value(bookingSnapshot)||{})};
  let decision=command.evaluate({actorUid,user,input:{...input,bookingId,requestId,action},booking:initial,now});
  if(!decision.ok)throw new BookingCommandError(decision.code);

  let dayRef=null,lockAcquired=false;
  if(!decision.replay&&['coach_confirm_paid','coach_confirm_venue'].includes(action)){
    const [bookingsSnapshot,appointmentsSnapshot,groupsSnapshot,timeOffSnapshot,policySnapshot]=await Promise.all([
      db.ref('bookings').orderByChild('coachId').equalTo(actorUid).get(),
      db.ref(`coachPublicSchedule/${actorUid}`).get(),db.ref(`coachGroupClasses/${actorUid}`).get(),
      db.ref(`coachTimeOff/${actorUid}`).get(),db.ref(`coachAvailability/${actorUid}`).get(),
    ]);
    const policy=value(policySnapshot)||{};
    const available=availability.evaluate(initial,{
      bookings:entries(bookingsSnapshot),appointments:entries(appointmentsSnapshot),
      groupClasses:entries(groupsSnapshot),timeOff:entries(timeOffSnapshot),
    },{now,mandatoryBufferMinutes:Number(policy.travelBufferMin??45),unknownTravelMinutes:45,maxClassesPerDay:Number(policy.maxClassesPerDay??8),travelMinutesBetween:route});
    if(!available.ok)throw new BookingCommandError(available.code);
    dayRef=db.ref(`coachSlotLocks/${actorUid}/${initial.date}`);let lockResult;
    const locked=await transaction(dayRef,current=>{
      lockResult=slots.claim(current,initial,now,key);return lockResult.ok?lockResult.value:undefined;
    });
    if(!locked.committed)throw new BookingCommandError(lockResult?.code||'SLOT_LOCK_FAILED');
    lockAcquired=lockResult?.replay===false;
  }

  let transitionFailure,transitionWasReplay=decision.replay===true;
  const transitioned=await transaction(bookingRef,current=>{
    const latest={id:bookingId,...(current||{})};
    const next=command.evaluate({actorUid,user,input:{...input,bookingId,requestId,action},booking:latest,now});
    if(!next.ok){transitionFailure=next;return;}
    decision=next;transitionWasReplay=next.replay===true;
    return next.replay?current:{...current,...command.bookingPatch(next,actorUid,input,now)};
  });
  if(!transitioned.committed){
    if(lockAcquired&&dayRef)await transaction(dayRef,current=>slots.release(current,bookingId,key).value);
    throw new BookingCommandError(transitionFailure?.code||'BOOKING_CHANGED');
  }
  const saved={id:bookingId,...(value(transitioned.snapshot)||{})};
  const finalDecision=command.evaluate({actorUid,user,input:{...input,bookingId,requestId,action},booking:saved,now});
  if(!finalDecision.ok)throw new BookingCommandError(finalDecision.code);

  const ledger=command.paymentLedger(saved,finalDecision,now);
  if(ledger){
    const ledgerRef=db.ref(`paymentTransactions/TX-${bookingId}`);let ledgerConflict=false;
    const ledgerWrite=await transaction(ledgerRef,current=>{
      if(!current)return ledger;
      if(command.sameLedger(current,ledger))return current;
      ledgerConflict=true;return;
    });
    if(!ledgerWrite.committed)throw new BookingCommandError(ledgerConflict?'PAYMENT_LEDGER_CONFLICT':'PAYMENT_LEDGER_FAILED');
  }

  const notificationId=`booking_${key}`,chatId=`system_${key}`,auditId=`booking_${requestId}`;
  const updates={
    [`notifications/${saved.athleteId}/${notificationId}`]:{type:`booking_${action}`,bookingId,senderId:actorUid,recipientId:saved.athleteId,message:message(finalDecision,saved),read:false,createdAt:now},
    [`bookingChats/${bookingId}/messages/${chatId}`]:{senderId:actorUid,senderRole:'coach',type:'system',text:message(finalDecision,saved),createdAt:now},
    [`auditLogs/${actorUid}/${auditId}`]:{userId:actorUid,actor:'coach',action,target:bookingId,requestId,at:now},
    [`bookingCommandResults/${actorUid}/${requestId}`]:{actorUid,requestId,bookingId,action,status:'completed',resultStatus:saved.status,resultPaymentStatus:saved.paymentStatus,completedAt:now,updatedAt:now},
  };
  if(['coach_confirm_paid','coach_confirm_venue'].includes(action))updates[`coachCalendar/${actorUid}/${bookingId}`]={bookingId,date:saved.date,start:Number(saved.start),end:Number(saved.end),venue:String(saved.venue||''),venueId:String(saved.venueId||''),athleteId:saved.athleteId,athlete:String(saved.athlete||saved.athleteName||''),status:'confirmed',updatedAt:now};
  await db.ref().update(updates);
  return publicResult(saved,{...finalDecision,replay:transitionWasReplay});
}

module.exports={BookingCommandError,execute,message,publicResult,route};
