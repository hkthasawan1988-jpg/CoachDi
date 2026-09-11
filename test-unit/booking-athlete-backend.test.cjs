'use strict';const{test}=require('node:test');const assert=require('node:assert/strict');const athlete=require('../functions-mobile/booking-athlete.cjs');
const now=Date.parse('2026-10-01T12:00:00+07:00'),actorUid='athlete_12345678',account={bank:'ธนาคารทดสอบ',accountName:'Athlete Test',accountNumber:'0012345678'},user={role:'athlete',status:'active'};
const booking=(changed={})=>({id:'BOOKING_123',athleteId:actorUid,coachId:'coach_12345678',date:'2026-10-10',start:10,end:11,status:'confirmed',paymentStatus:'payment_verified',priceSatang:100000,travelFeeSatang:10000,platformFeeSatang:5000,...changed});
const context=(action,changed={})=>({actorUid,user,input:{requestId:'request_12345678',bookingId:'BOOKING_123',action,...changed.input},booking:booking(changed.booking),refundAccount:changed.refundAccount===undefined?account:changed.refundAccount,now});
const proof={path:`private/booking-slip/${actorUid}/row/proof.jpg`,url:'https://firebasestorage.googleapis.com/v0/b/test/o/proof',contentType:'image/jpeg',size:1024,name:'proof.jpg'};

test('payment submission requires owner, pending payment and owned private proof',()=>{
  const valid=context('athlete_submit_payment',{booking:{status:'coach_approved',paymentStatus:'pending_payment'},input:{paymentProof:proof}});assert.equal(athlete.evaluate(valid).ok,true);
  assert.equal(athlete.evaluate({...valid,actorUid:'other_12345678'}).code,'NOT_BOOKING_ATHLETE');
  assert.equal(athlete.evaluate(context('athlete_submit_payment',{booking:{status:'coach_approved',paymentStatus:'pending_payment'},input:{paymentProof:{...proof,path:'private/booking-slip/other/file.jpg'}}})).code,'PAYMENT_EVIDENCE_REQUIRED');
});
test('paid cancellation copies the saved refund destination and derives the amount',()=>{
  const decision=athlete.evaluate(context('athlete_cancel',{input:{reason:'ไม่สะดวก'}}));assert.equal(decision.ok,true);assert.equal(decision.refundRequired,true);assert.equal(decision.nextStatus,'cancelled_by_athlete');
  const patch=athlete.bookingPatch(decision,actorUid,{reason:'ไม่สะดวก'},now),saved={...booking(),...patch};assert.equal(saved.refundAccountNumber,'0012345678');assert.equal(saved.refundStatus,'requested');
  const refund=athlete.refundRecord(saved,decision,actorUid,now);assert.equal(refund.amountSatang,110000);assert.equal(refund.status,'requested');
});
test('paid cancellation needs an account while unpaid cancellation does not create a refund',()=>{
  assert.equal(athlete.evaluate(context('athlete_cancel',{refundAccount:null})).code,'REFUND_ACCOUNT_REQUIRED');
  const unpaid=athlete.evaluate(context('athlete_cancel',{booking:{paymentStatus:'not_started'},refundAccount:null}));assert.equal(unpaid.ok,true);assert.equal(unpaid.refundRequired,false);assert.equal(unpaid.nextStatus,'cancelled_by_athlete');
});
test('cancellation within 24 hours waits for the coach refund decision',()=>{
  const near=booking({date:'2026-10-02',start:10,end:11}),decision=athlete.evaluate({...context('athlete_cancel'),booking:near});assert.equal(decision.nextStatus,'refund_pending_coach_decision');
});
test('refund can be requested after coach decline and cannot be duplicated',()=>{
  const declined=context('athlete_request_refund',{booking:{status:'declined',paymentStatus:'payment_submitted',refundReviewRequired:true}});assert.equal(athlete.evaluate(declined).ok,true);
  assert.equal(athlete.evaluate({...declined,booking:{...declined.booking,refundRequestedAt:now,refundStatus:'requested'}}).code,'REFUND_ALREADY_REQUESTED');
});
test('past and completed bookings cannot be changed',()=>{
  assert.equal(athlete.evaluate(context('athlete_cancel',{booking:{date:'2026-09-01'}})).code,'BOOKING_IN_PAST');assert.equal(athlete.evaluate(context('athlete_cancel',{booking:{status:'completed'}})).code,'INVALID_STATE');
});
test('request fingerprints bind the financial action content',()=>{
  const base={bookingId:'BOOKING_123',action:'athlete_cancel',reason:'a'};assert.equal(athlete.requestFingerprint(actorUid,base),athlete.requestFingerprint(actorUid,{...base,ignored:true}));assert.notEqual(athlete.requestFingerprint(actorUid,base),athlete.requestFingerprint(actorUid,{...base,reason:'b'}));
});
