'use strict';
const {test,before,after,beforeEach}=require('node:test');
const {readFileSync}=require('node:fs');
const assert=require('node:assert/strict');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
let env;
const db=uid=>env.authenticatedContext(uid,{email:uid+'@example.invalid'}).database();
const stamp=()=>Date.now();
const pending=()=>({bank:'Fixture Bank',accountNumber:'0012345678',masked:'•••• 5678',accountName:'Test Account',coachLegalName:'Test Coach',qrDataUrl:'data:image/png;base64,QQ==',requestId:'test-request-123',submittedAt:stamp(),verificationStatus:'pending'});
before(async()=>{
  if(!process.env.FIREBASE_DATABASE_EMULATOR_HOST?.startsWith('127.0.0.1:'))throw Error('Tests require the isolated local emulator');
  env=await initializeTestEnvironment({projectId:'demo-coach-di-payout',database:{host:'127.0.0.1',port:9000,rules:readFileSync('database.rules.json','utf8')}});
});
after(async()=>{if(env)await env.cleanup();});
beforeEach(async()=>{
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async ctx=>ctx.database().ref().set({users:{coach:{role:'coach',status:'active'},other:{role:'coach',status:'active'},admin:{role:'admin'},admin2:{role:'admin'},athlete:{role:'athlete'},pending:{role:'coach',status:'pending_approval'}},coachProfiles:{coach:{status:'active',registrationComplete:true,displayName:'Coach'}}}));
});
test('active coach submits privately and admin can list legacy and new pending requests',async()=>{
  const value=pending();await assertSucceeds(db('coach').ref('coachPaymentAccounts/coach').set(value));
  const list=await assertSucceeds(db('admin').ref('coachPaymentAccounts').once('value'));
  assert.equal(list.val().coach.accountNumber,'0012345678');
  await assertSucceeds(db('coach').ref('coachPaymentAccounts/coach').once('value'));
  for(const uid of ['athlete','other'])await assertFails(db(uid).ref('coachPaymentAccounts/coach').once('value'));
  await assertFails(env.unauthenticatedContext().database().ref('coachPaymentAccounts').once('value'));
  const legacy={...pending(),submittedAt:Date.now()+1};delete legacy.requestId;
  await assertSucceeds(db('coach').ref('coachPaymentAccounts/coach').set(legacy));
});
test('coach cannot approve, forge review metadata, delete the request or submit for another coach',async()=>{
  const ref=db('coach').ref('coachPaymentAccounts/coach'),value=pending();
  await assertSucceeds(ref.set(value));
  for(const patch of [{verificationStatus:'approved'},{verifiedBy:'admin'},{verifiedAt:stamp()},{rejectionReason:'Forged'}])await assertFails(ref.update(patch));
  await assertFails(ref.remove());
  await assertFails(db('other').ref('coachPaymentAccounts/coach').set(pending()));
  await assertFails(db('pending').ref('coachPaymentAccounts/pending').set(pending()));
});
test('admin review retains submitted details and only the first concurrent pending review commits',async()=>{
  const ref=db('admin').ref('coachPaymentAccounts/coach');
  await assertSucceeds(db('coach').ref('coachPaymentAccounts/coach').set(pending()));
  await assertFails(ref.update({verificationStatus:'approved',verifiedBy:'admin',verifiedAt:stamp(),accountNumber:'9987654321'}));
  const second=db('admin2').ref('coachPaymentAccounts/coach');
  // Each Admin screen reads the queue before reviewing; keep both clients' snapshots loaded.
  const listen=()=>{};ref.on('value',listen);second.on('value',listen);
  await Promise.all([ref.once('value'),second.once('value')]);
  const review=(target,uid)=>target.transaction(current=>current?.verificationStatus==='pending'?{...current,verificationStatus:'approved',verifiedBy:uid,verifiedAt:stamp()}:undefined);
  const results=await Promise.all([review(ref,'admin'),review(second,'admin2')]);
  ref.off('value',listen);second.off('value',listen);
  assert.equal(results.filter(result=>result.committed).length,1);
  assert.equal((await ref.once('value')).val().verificationStatus,'approved');
  await assertFails(ref.update({verificationStatus:'rejected',verifiedAt:stamp(),rejectionReason:'Outdated review'}));
});
test('resubmission removes review metadata and cannot reuse an older timestamp or authorize itself',async()=>{
  const value=pending(),ref=db('coach').ref('coachPaymentAccounts/coach');
  await assertSucceeds(ref.set(value));
  const verifiedAt=stamp();
  await assertSucceeds(db('admin').ref('coachPaymentAccounts/coach').update({verificationStatus:'rejected',verifiedBy:'admin',verifiedAt,rejectionReason:'Please correct the name'}));
  await assertFails(ref.set({...value,requestId:'second-request-456'}));
  await assertSucceeds(ref.set({...value,requestId:'second-request-456',submittedAt:Math.max(Date.now(),verifiedAt+1),accountName:'Corrected Account'}));
  assert.equal((await ref.once('value')).val().verifiedBy,undefined);
});
test('coach cannot publish their own approved payment snapshot but normal profile changes and admin sync work',async()=>{
  const profile=db('coach').ref('coachProfiles/coach');
  await assertSucceeds(profile.update({displayName:'Updated Coach'}));
  await assertFails(profile.child('paymentPublic').set({verificationStatus:'approved',accountName:'Forged'}));
  await assertFails(db('coach').ref('coachPaymentPublic/coach').set({verificationStatus:'approved'}));
  await assertSucceeds(db('admin').ref('coachPaymentPublic/coach').set({verificationStatus:'approved',accountNumber:'0012345678'}));
  await assertFails(db('coach').ref('coachPaymentPublic/coach/accountNumber').set('9987654321'));
  await assertFails(db('coach').ref('coachPaymentPublic/coach').remove());
  await assertSucceeds(db('admin').ref('coachProfiles/coach/paymentPublic').set({verificationStatus:'approved',accountName:'Reviewed'}));
  await assertSucceeds(profile.update({displayName:'Still Editable'}));
  await assertFails(profile.child('paymentPublic/accountName').set('Changed'));
  await assertFails(profile.child('paymentPublic').remove());
});
