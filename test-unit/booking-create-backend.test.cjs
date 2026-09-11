'use strict';const{test}=require('node:test');const assert=require('node:assert/strict');const create=require('../functions-mobile/booking-create.cjs');
const now=Date.parse('2026-10-01T12:00:00+07:00'),actorUid='athlete_12345678',requestId='request_12345678';
const athlete={role:'athlete',displayName:'Athlete Test',email:'athlete@example.invalid',phone:'0900000000'};
const coach={role:'coach',status:'active',subscription:{trialEndsAt:now+86400000}};
const pricing={p60:100000,p90:150000,p120:200000};
const proof={path:`private/booking-slip/${actorUid}/row/file.jpg`,url:'https://firebasestorage.googleapis.com/v0/b/test/o/file',contentType:'image/jpeg',size:1024,name:'proof.jpg',uploadedAt:now};
const context=(input={},changed={})=>({actorUid,athlete,coach,pricing,paymentAccount:{verificationStatus:'approved'},input:{requestId,coachId:'coach_12345678',date:'2026-10-10',start:10,durationMinutes:60,venueId:'visda',venueName:'VISDA',participants:1,paymentMode:'request',...input},now,...changed});

test('create contract derives a stable booking id and server price',()=>{
  const a=create.evaluate(context({priceSatang:1})),b=create.evaluate(context({priceSatang:999999}));assert.equal(a.ok,true);assert.equal(a.bookingId,b.bookingId);assert.equal(a.priceSatang,100000);assert.equal(a.platformFeeSatang,4500);
  assert.match(a.bookingId,/^BK_[A-F0-9]{20}$/);
});
test('create contract selects duration price and validates user supplied fields',()=>{
  assert.equal(create.evaluate(context({durationMinutes:90})).priceSatang,150000);
  for(const input of [{durationMinutes:45},{participants:0},{participants:21},{venueName:''},{paymentMode:'other'},{date:'2026-02-30'},{date:'2026-09-30'}])assert.equal(create.evaluate(context(input)).ok,false);
});
test('paid transfer requires an approved account and private owned image proof',()=>{
  assert.equal(create.evaluate(context({paymentMode:'paid_transfer'})).code,'PAYMENT_EVIDENCE_REQUIRED');
  assert.equal(create.evaluate(context({paymentMode:'paid_transfer',paymentProof:proof},{paymentAccount:{verificationStatus:'pending'}})).code,'PAYMENT_ACCOUNT_UNAVAILABLE');
  assert.equal(create.evaluate(context({paymentMode:'paid_transfer',paymentProof:{...proof,path:'private/booking-slip/other/file.jpg'}})).code,'PAYMENT_EVIDENCE_REQUIRED');
  assert.equal(create.evaluate(context({paymentMode:'paid_transfer',paymentProof:{...proof,url:'javascript:alert(1)'}})).code,'PAYMENT_EVIDENCE_REQUIRED');
  assert.equal(create.evaluate(context({paymentMode:'paid_transfer',paymentProof:proof})).ok,true);
});
test('record contains derived values and no arbitrary client fields',()=>{
  const decision=create.evaluate(context({paymentMode:'paid_transfer',paymentProof:proof,priceSatang:1,status:'confirmed'}));
  const record=create.record(decision,{actorUid,athlete,input:{},now});assert.equal(record.priceSatang,100000);assert.equal(record.status,'payment_submitted');assert.equal(record.paymentStatus,'payment_submitted');assert.equal(record.status==='confirmed',false);assert.equal(record.paymentProofStorage.path,proof.path);assert.equal(Object.hasOwn(record,'paymentProofDataUrl'),false);assert.equal(record.createCommandKey,`${actorUid}_${requestId}`);
});
test('venue booking is pending and cannot be counted as received money',()=>{
  const decision=create.evaluate(context({paymentMode:'venue'})),record=create.record(decision,{actorUid,athlete,input:{},now});assert.equal(record.status,'pending_coach_approval');assert.equal(record.paymentStatus,'pay_at_venue_pending');assert.equal(record.paymentCollectionMode,'venue');assert.equal(record.platformFeeSatang,0);
});
test('same compares immutable command identity, owners, time and price',()=>{
  const decision=create.evaluate(context()),record=create.record(decision,{actorUid,athlete,input:{},now});assert.equal(create.same(record,record),true);assert.equal(create.same({...record,coachId:'other'},record),false);assert.equal(create.same({...record,priceSatang:1},record),false);
});
test('request fingerprint changes when booking content changes',()=>{
  const first=create.requestFingerprint(actorUid,context().input),same=create.requestFingerprint(actorUid,{...context().input,ignored:'value'}),changed=create.requestFingerprint(actorUid,{...context().input,venueName:'สนามใหม่'});assert.equal(first,same);assert.notEqual(first,changed);
});
