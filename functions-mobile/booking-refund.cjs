'use strict';
const {createHash}=require('node:crypto');
const command=require('./booking-command.cjs');
const athlete=require('./booking-athlete.cjs');

const CANCELLED=/cancel|reject|declin/i;
function failure(code){return{ok:false,code}}
function proof(actorUid,value){
  if(!value||typeof value!=='object')return null;const path=command.text(value.path,240),contentType=command.text(value.contentType,80),size=Number(value.size);
  if(!path.startsWith(`private/refund-slip/${actorUid}/`)||!/^image\/(jpeg|png|webp)$/.test(contentType)||!Number.isSafeInteger(size)||size<=0||size>10*1024*1024)return null;
  return{path,name:command.text(value.name,120),size,contentType,uploadedAt:Number(value.uploadedAt)||null};
}
function requestFingerprint(actorUid,input={}){const canonical={actorUid:command.text(actorUid,80),bookingId:command.text(input.bookingId,100),action:command.text(input.action,50),reason:command.text(input.reason,500),proofPath:command.text(input.refundProof&&input.refundProof.path,240),proofSize:String(input.refundProof&&input.refundProof.size||''),proofType:command.text(input.refundProof&&input.refundProof.contentType,80)};return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')}
function replay(booking,key,action){if(booking.lastCommandKey!==key)return null;if(booking.lastCommandAction!==action)return failure('REQUEST_CONFLICT');return{ok:true,replay:true,action,commandKey:key,nextStatus:booking.status,nextPaymentStatus:booking.paymentStatus,refundStatus:booking.refundStatus||null,refundRequired:booking.refundReviewRequired===true}}
function evaluate({actorUid,user,input,booking,refundAccount,refund,now}){
  const action=command.text(input&&input.action,50),key=command.commandKey(actorUid,input&&input.requestId);if(!key)return failure('INVALID_REQUEST_ID');
  if(!booking||command.text(input&&input.bookingId,100)!==command.text(booking.id,100))return failure('BOOKING_NOT_FOUND');
  if(!command.coachEligible(user,now))return failure('COACH_INACTIVE');if(actorUid!==booking.coachId)return failure('NOT_ASSIGNED_COACH');
  const repeated=replay(booking,key,action);if(repeated)return repeated;
  const money=command.amounts(booking);if(!money)return failure('INVALID_BOOKING_AMOUNT');
  if(action==='coach_cancel'){
    if(CANCELLED.test(String(booking.status||''))||['refunded','completed'].includes(String(booking.status||''))||booking.refundRequestedAt||['requested','refunded','pending_admin_coin_credit'].includes(String(booking.refundStatus||'')))return failure('INVALID_STATE');
    const at=athlete.startsAt(booking);if(!Number.isFinite(at)||at<=now)return failure('BOOKING_IN_PAST');
    const refundRequired=athlete.paid(booking),destination=refundRequired?athlete.account(refundAccount):null;
    return{ok:true,replay:false,action,commandKey:key,nextStatus:'cancelled_by_coach',nextPaymentStatus:booking.paymentStatus,refundRequired,refundStatus:destination?'requested':null,destination,...money};
  }
  if(action==='coach_complete_cash_refund'||action==='coach_select_coin_refund'){
    if(!booking.refundRequestedAt||booking.refundStatus!=='requested'||!refund||refund.status!=='requested')return failure('REFUND_NOT_REQUESTED');
    if(refund.bookingId!==booking.id||refund.coachId!==actorUid||refund.athleteId!==booking.athleteId||Number(refund.amountSatang)!==money.grossSatang)return failure('REFUND_RECORD_CONFLICT');
    if(action==='coach_complete_cash_refund'){const refundProof=proof(actorUid,input.refundProof);if(!refundProof)return failure('REFUND_EVIDENCE_REQUIRED');return{ok:true,replay:false,action,commandKey:key,nextStatus:'refunded',nextPaymentStatus:'refunded',refundRequired:true,refundStatus:'refunded',refundProof,...money}}
    return{ok:true,replay:false,action,commandKey:key,nextStatus:'refund_pending_admin_coin_credit',nextPaymentStatus:booking.paymentStatus,refundRequired:true,refundStatus:'pending_admin_coin_credit',...money};
  }
  return failure('UNKNOWN_ACTION');
}
function bookingPatch(decision,actorUid,input,now){const patch={status:decision.nextStatus,paymentStatus:decision.nextPaymentStatus,lastCommandKey:decision.commandKey,lastCommandAction:decision.action,lastCommandAt:now,lastCommandBy:actorUid,updatedAt:now};
  if(decision.action==='coach_cancel')Object.assign(patch,{cancelledBy:'coach',cancelledAt:now,cancellationReason:command.text(input.reason||'Coach ไม่สะดวก',500),refundReviewRequired:decision.refundRequired});
  if(decision.action==='coach_cancel'&&decision.destination)Object.assign(patch,{refundBank:decision.destination.bank,refundAccountName:decision.destination.accountName,refundAccountNumber:decision.destination.accountNumber,refundRequestedAt:now,refundRequestedBy:actorUid,refundStatus:'requested'});
  if(decision.action==='coach_complete_cash_refund')Object.assign(patch,{refundMethod:'cash_transfer',refundStatus:'refunded',refundProofStorage:{...decision.refundProof,uploadedAt:decision.refundProof.uploadedAt||now},refundedAt:now,refundedBy:actorUid,refundReviewRequired:false});
  if(decision.action==='coach_select_coin_refund')Object.assign(patch,{refundMethod:'coin',refundStatus:'pending_admin_coin_credit',refundSelectedAt:now,refundSelectedBy:actorUid});return patch}
function requestedRefund(booking,decision,actorUid,now){if(!decision.destination)return null;return{bookingId:booking.id,coachId:booking.coachId,athleteId:booking.athleteId,amountSatang:decision.grossSatang,method:'pending_coach_decision',status:'requested',bank:decision.destination.bank,accountName:decision.destination.accountName,accountNumber:decision.destination.accountNumber,requestedAt:now,requestedBy:actorUid,commandKey:decision.commandKey,updatedAt:now}}
function refundPatch(decision,actorUid,now){if(decision.action==='coach_complete_cash_refund')return{method:'cash_transfer',status:'refunded',refundProofStorage:{...decision.refundProof,uploadedAt:decision.refundProof.uploadedAt||now},refundedAt:now,refundedBy:actorUid,completionCommandKey:decision.commandKey,updatedAt:now};if(decision.action==='coach_select_coin_refund')return{method:'coin',status:'pending_admin_coin_credit',selectedAt:now,selectedBy:actorUid,completionCommandKey:decision.commandKey,updatedAt:now};return null}
module.exports={bookingPatch,evaluate,proof,refundPatch,requestFingerprint,requestedRefund};
