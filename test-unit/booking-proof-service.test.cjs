'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const proof=require('../functions-mobile/booking-proof-service.cjs');
function snapshot(value){return{val:()=>value}}
function context({booking,user,actorUid='coach_12345678',metadata={contentType:'image/jpeg'}}={}){
  const rows={bookings:{B1:booking||{coachId:'coach_12345678',athleteId:'athlete_12345678',paymentProofStorage:{path:'private/booking-slip/athlete_12345678/request/proof.jpg'},refundProofStorage:{path:'private/refund-slip/coach_12345678/request/refund.jpg'}}},users:{[actorUid]:user||{role:'coach'}}};
  const db={ref:path=>({get:async()=>snapshot(path==='bookings/B1'?rows.bookings.B1:rows.users[path.split('/')[1]])})};
  const calls=[];const file={getMetadata:async()=>[metadata],getSignedUrl:async options=>{calls.push(options);return['https://signed.invalid/proof']}};
  const storage={bucket:()=>({file:path=>{calls.push(path);return file}})};
  return{db,storage,calls};
}
test('participant receives a five minute signed payment proof URL',async()=>{
  const {db,storage,calls}=context(),now=1000,result=await proof.execute(db,storage,{actorUid:'coach_12345678',input:{bookingId:'B1',kind:'payment'},now});
  assert.equal(result.url,'https://signed.invalid/proof');assert.equal(result.expiresAt,301000);assert.equal(calls[0],'private/booking-slip/athlete_12345678/request/proof.jpg');assert.deepEqual(calls[1],{action:'read',expires:301000});
});
test('unrelated users and forged paths cannot read booking evidence',async()=>{
  let c=context({actorUid:'other_12345678',user:{role:'athlete'}});await assert.rejects(()=>proof.execute(c.db,c.storage,{actorUid:'other_12345678',input:{bookingId:'B1'}}),error=>error.code==='NOT_BOOKING_PARTICIPANT');
  c=context({booking:{coachId:'coach_12345678',athleteId:'athlete_12345678',paymentProofStorage:{path:'private/booking-slip/other/proof.jpg'}}});await assert.rejects(()=>proof.execute(c.db,c.storage,{actorUid:'coach_12345678',input:{bookingId:'B1'}}),error=>error.code==='PROOF_NOT_FOUND');
});
test('admin may inspect evidence but non-images fail closed',async()=>{
  const c=context({actorUid:'admin_12345678',user:{role:'admin'}});assert.equal((await proof.execute(c.db,c.storage,{actorUid:'admin_12345678',input:{bookingId:'B1'}})).ok,true);
  const invalid=context({metadata:{contentType:'text/html'}});await assert.rejects(()=>proof.execute(invalid.db,invalid.storage,{actorUid:'coach_12345678',input:{bookingId:'B1'}}),error=>error.code==='PROOF_NOT_FOUND');
});
