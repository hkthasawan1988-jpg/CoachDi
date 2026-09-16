'use strict';
const {createHash}=require('node:crypto');
const command=require('./booking-command.cjs');
const create=require('./booking-create.cjs');

const PAID=/paid|received|verified|payment_submitted|payment_uploaded|pending_verification/i;
const CANCELLED=/cancel|reject|declin/i;
function failure(code){return{ok:false,code}}
function account(value){
  const bank=command.text(value&&value.bank,100),accountName=command.text(value&&value.accountName,160);
  const accountNumber=String(value&&value.accountNumber||'').replace(/[๐-๙]/g,x=>String(x.charCodeAt(0)-3664)).replace(/[\s-]/g,'');
  return bank.length>=2&&accountName.length>=2&&/^[0-9]{6,20}$/.test(accountNumber)?{bank,accountName,accountNumber}:null;
}
function paid(booking){return !!(booking&&(booking.paymentProofStorage||booking.paymentProofDataUrl||booking.paymentProofUrl||PAID.test(String(booking.paymentStatus||''))))}
function startsAt(booking){
  const start=Number(booking&&booking.start),date=String(booking&&booking.date||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(start))return NaN;
  return Date.parse(`${date}T00:00:00+07:00`)+start*3600000;
}
function requestFingerprint(actorUid,input={}){
  const canonical={actorUid:command.text(actorUid,80),bookingId:command.text(input.bookingId,100),action:command.text(input.action,40),reason:command.text(input.reason,500),proofPath:command.text(input.paymentProof&&input.paymentProof.path,240),proofSize:String(input.paymentProof&&input.paymentProof.size||''),proofType:command.text(input.paymentProof&&input.paymentProof.contentType,80)};
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}
function replay(booking,key,action){
  if(booking.lastCommandKey!==key)return null;
  if(booking.lastCommandAction!==action)return failure('REQUEST_CONFLICT');
  return{ok:true,replay:true,action,commandKey:key,nextStatus:booking.status,nextPaymentStatus:booking.paymentStatus,refundRequired:booking.refundReviewRequired===true,refundStatus:booking.refundStatus||null};
}
function evaluate({actorUid,user,input,booking,refundAccount,now}){
  const action=command.text(input&&input.action,40),key=command.commandKey(actorUid,input&&input.requestId);
  if(!key)return failure('INVALID_REQUEST_ID');
  if(!booking||command.text(input&&input.bookingId,100)!==command.text(booking.id,100))return failure('BOOKING_NOT_FOUND');
  if(!user||user.role!=='athlete'||user.status==='suspended')return failure('ATHLETE_INACTIVE');
  if(actorUid!==booking.athleteId)return failure('NOT_BOOKING_ATHLETE');
  const repeated=replay(booking,key,action);if(repeated)return repeated;
  const at=startsAt(booking);if(!Number.isFinite(at)||at<=now)return failure('BOOKING_IN_PAST');
  if(action==='athlete_submit_payment'){
    if(!['coach_approved','pending_payment'].includes(String(booking.status||''))||!['pending_payment','not_started',''].includes(String(booking.paymentStatus||'')))return failure('INVALID_STATE');
    const proof=create.privateProof(actorUid,input.paymentProof);if(!proof)return failure('PAYMENT_EVIDENCE_REQUIRED');
    if(booking.paymentCollectionMode==='venue')return failure('PAYMENT_METHOD_MISMATCH');
    return{ok:true,replay:false,action,commandKey:key,nextStatus:'payment_submitted',nextPaymentStatus:'payment_submitted',proof,refundRequired:false,refundStatus:null};
  }
  if(action==='athlete_cancel'){
    if(CANCELLED.test(String(booking.status||''))||['refunded','completed'].includes(String(booking.status||''))||booking.refundRequestedAt||['requested','refunded','pending_admin_coin_credit'].includes(String(booking.refundStatus||'')))return failure('INVALID_STATE');
    const refundRequired=paid(booking),destination=refundRequired?account(refundAccount):null;
    if(refundRequired&&!destination)return failure('REFUND_ACCOUNT_REQUIRED');
    return{ok:true,replay:false,action,commandKey:key,nextStatus:refundRequired&&at-now<=86400000?'refund_pending_coach_decision':'cancelled_by_athlete',nextPaymentStatus:booking.paymentStatus,refundRequired,refundStatus:refundRequired?'requested':null,destination};
  }
  if(action==='athlete_request_refund'){
    if(!CANCELLED.test(String(booking.status||''))&&!booking.refundReviewRequired)return failure('INVALID_STATE');
    if(!paid(booking))return failure('REFUND_NOT_REQUIRED');
    if(booking.refundRequestedAt||['requested','refunded','pending_admin_coin_credit'].includes(String(booking.refundStatus||'')))return failure('REFUND_ALREADY_REQUESTED');
    const destination=account(refundAccount);if(!destination)return failure('REFUND_ACCOUNT_REQUIRED');
    return{ok:true,replay:false,action,commandKey:key,nextStatus:booking.status,nextPaymentStatus:booking.paymentStatus,refundRequired:true,refundStatus:'requested',destination};
  }
  return failure('UNKNOWN_ACTION');
}
function bookingPatch(decision,actorUid,input,now){
  const patch={status:decision.nextStatus,paymentStatus:decision.nextPaymentStatus,lastCommandKey:decision.commandKey,lastCommandAction:decision.action,lastCommandAt:now,lastCommandBy:actorUid,updatedAt:now};
  if(decision.action==='athlete_submit_payment')Object.assign(patch,{paymentProofStorage:{path:decision.proof.path,name:decision.proof.name,size:decision.proof.size,contentType:decision.proof.contentType,uploadedAt:decision.proof.uploadedAt||now},paymentSubmittedAt:now,courtConfirmed:true,courtConfirmedByAthleteAt:now});
  if(decision.action==='athlete_cancel')Object.assign(patch,{cancelledBy:'athlete',cancelRequestedAt:now,cancellationReason:command.text(input.reason,500)});
  if(decision.refundRequired)Object.assign(patch,{refundBank:decision.destination.bank,refundAccountName:decision.destination.accountName,refundAccountNumber:decision.destination.accountNumber,refundRequestedAt:now,refundRequestedBy:actorUid,refundStatus:'requested',refundReviewRequired:true});
  return patch;
}
function refundRecord(booking,decision,actorUid,now){
  if(!decision.refundRequired)return null;const money=command.amounts(booking);if(!money)return null;
  return{bookingId:booking.id,coachId:booking.coachId,athleteId:booking.athleteId,amountSatang:money.grossSatang,method:'pending_coach_decision',status:'requested',bank:decision.destination.bank,accountName:decision.destination.accountName,accountNumber:decision.destination.accountNumber,requestedAt:now,requestedBy:actorUid,commandKey:decision.commandKey,updatedAt:now};
}
function sameRefund(current,expected){return !!current&&!!expected&&['bookingId','coachId','athleteId','amountSatang','status','bank','accountName','accountNumber','commandKey'].every(field=>current[field]===expected[field])}
module.exports={account,bookingPatch,evaluate,paid,refundRecord,requestFingerprint,sameRefund,startsAt};
