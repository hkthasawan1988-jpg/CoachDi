'use strict';
const athlete=require('./booking-athlete.cjs');
const command=require('./booking-command.cjs');
const slots=require('./booking-slot-lock.cjs');

class BookingAthleteError extends Error{constructor(code,message=code){super(message);this.name='BookingAthleteError';this.code=code}}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
function transaction(ref,updater){return ref.transaction(updater,undefined,false)}
async function writeOnce(ref,record){const result=await transaction(ref,current=>current||record);if(!result.committed)throw new BookingAthleteError('SIDE_EFFECT_WRITE_FAILED')}
function message(action,id,refundRequired){if(action==='athlete_submit_payment')return`นักกีฬาส่งหลักฐานชำระเงิน Booking ${id} แล้ว`;if(refundRequired)return`นักกีฬาส่งคำขอยกเลิก/คืนเงิน Booking ${id} แล้ว`;return`นักกีฬายกเลิก Booking ${id} แล้ว`}
async function execute(db,{actorUid,input,now=Date.now()}){
  const bookingId=String(input&&input.bookingId||'').trim(),requestId=String(input&&input.requestId||'').trim(),action=String(input&&input.action||'').trim();
  const key=command.commandKey(actorUid,requestId);if(!key)throw new BookingAthleteError('INVALID_REQUEST_ID');
  const fingerprint=athlete.requestFingerprint(actorUid,input),commandRef=db.ref(`bookingCommandResults/${actorUid}/${requestId}`);let requestConflict=false,commandReplay=false;
  const claim=await transaction(commandRef,current=>{if(current){if(current.bookingId!==bookingId||current.action!==action||current.fingerprint!==fingerprint){requestConflict=true;return}commandReplay=true;return current}return{actorUid,requestId,bookingId,action,fingerprint,status:'processing',createdAt:now,updatedAt:now}});
  if(!claim.committed)throw new BookingAthleteError(requestConflict?'REQUEST_CONFLICT':'COMMAND_CLAIM_FAILED');
  const bookingRef=db.ref(`bookings/${bookingId}`),[userSnapshot,bookingSnapshot,accountSnapshot]=await Promise.all([db.ref(`users/${actorUid}`).get(),bookingRef.get(),db.ref(`users/${actorUid}/refundAccount`).get()]);
  const user=value(userSnapshot),initial={id:bookingId,...(value(bookingSnapshot)||{})},refundAccount=value(accountSnapshot);
  let decision=athlete.evaluate({actorUid,user,input:{...input,bookingId,requestId,action},booking:initial,refundAccount,now});if(!decision.ok)throw new BookingAthleteError(decision.code);
  let transitionFailure,transitionReplay=decision.replay===true;
  const transitioned=await transaction(bookingRef,current=>{const latest={id:bookingId,...(current||{})},next=athlete.evaluate({actorUid,user,input:{...input,bookingId,requestId,action},booking:latest,refundAccount,now});if(!next.ok){transitionFailure=next;return}decision=next;transitionReplay=next.replay===true;return next.replay?current:{...current,...athlete.bookingPatch(next,actorUid,input,now)}});
  if(!transitioned.committed)throw new BookingAthleteError(transitionFailure&&transitionFailure.code||'BOOKING_CHANGED');
  const saved={id:bookingId,...(value(transitioned.snapshot)||{})};
  if(decision.refundRequired||saved.refundStatus==='requested'){
    const destination=decision.destination||{bank:saved.refundBank,accountName:saved.refundAccountName,accountNumber:saved.refundAccountNumber};
    const expected=athlete.refundRecord(saved,{...decision,refundRequired:true,destination},actorUid,Number(saved.refundRequestedAt)||now);if(!expected)throw new BookingAthleteError('INVALID_BOOKING_AMOUNT');
    const refundRef=db.ref(`refunds/RF-${bookingId}`);let conflict=false;const written=await transaction(refundRef,current=>{if(!current)return expected;if(athlete.sameRefund(current,expected))return current;conflict=true;return});if(!written.committed)throw new BookingAthleteError(conflict?'REFUND_RECORD_CONFLICT':'REFUND_RECORD_FAILED');
  }
  if(action==='athlete_cancel')await transaction(db.ref(`coachSlotLocks/${saved.coachId}/${saved.date}`),current=>slots.release(current,bookingId).value);
  const notice=message(action,bookingId,saved.refundReviewRequired===true),notificationId=`booking_${key}`,auditId=`booking_${requestId}`;
  await writeOnce(db.ref(`notifications/${saved.coachId}/${notificationId}`),{type:action,bookingId,senderId:actorUid,recipientId:saved.coachId,message:notice,read:false,createdAt:now});
  await writeOnce(db.ref(`bookingChats/${bookingId}/messages/system_${key}`),{senderId:actorUid,senderRole:'athlete',type:'system',text:notice,createdAt:now});
  await writeOnce(db.ref(`auditLogs/${actorUid}/${auditId}`),{userId:actorUid,actor:'athlete',action,target:bookingId,requestId,at:now});
  await db.ref(`bookingCommandResults/${actorUid}/${requestId}`).update({status:'completed',resultStatus:saved.status,resultPaymentStatus:saved.paymentStatus,completedAt:now,updatedAt:now});
  return{ok:true,replay:commandReplay||transitionReplay,bookingId,status:saved.status,paymentStatus:saved.paymentStatus,refundStatus:saved.refundStatus||null}
}
module.exports={BookingAthleteError,execute,message,writeOnce};
