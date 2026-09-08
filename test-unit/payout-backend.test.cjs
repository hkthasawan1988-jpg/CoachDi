'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const payout = require('../functions-mobile/payout-verification.cjs');
const browser = require('../payout-approval-core.js');
const migration = require('../scripts/prepare-payout-rules.cjs');
const baseline = require('../test-rules/production-baseline.rules.json');
const sample = { requestId:'fixture-request-1', submittedAt:1000, verificationStatus:'pending', bank:'Private Bank', coachLegalName:'Private Legal Name', accountName:'Private Account Name', accountNumber:'0012345678', masked:'•••• 5678', qrDataUrl:'data:image/png;base64,QQ==' };
const time = '2026-09-08T12:00:00.123Z';

test('payout notifications use a stable key and contain no bank details, QR, legal name or rejection reason', () => {
  for (const status of ['pending','approved','rejected']) {
    const row = payout.notification('coach','recipient',{...sample,rejectionReason:'private explanation'},status,time);
    assert.deepEqual(row,payout.notification('coach','recipient',{...sample,rejectionReason:'changed explanation'},status,time));
    for (const sensitive of [sample.bank,sample.coachLegalName,sample.accountName,sample.accountNumber,sample.qrDataUrl,'private explanation']) assert.ok(!JSON.stringify(row.value).includes(sensitive));
    assert.equal(row.value.read,false);
    assert.equal(payout.createOnce({...row.value,read:true},row.value),undefined);
  }
});

test('pending resubmission alerts once per version, reviews alert once and unchanged snapshots do not alert', () => {
  assert.equal(payout.transition(null,sample),'pending');
  assert.equal(payout.transition(sample,{...sample} ),null);
  assert.equal(payout.transition(sample,{...sample,requestId:'fixture-request-2',submittedAt:2000}),'pending');
  assert.equal(payout.transition(sample,{...sample,verificationStatus:'approved'}),'approved');
  assert.equal(payout.transition(null,{...sample,verificationStatus:'approved'}),null);
  assert.equal(payout.transition(sample,null),null);
  const legacy = {...sample}; delete legacy.requestId;
  assert.notEqual(payout.notification('coach','admin',legacy,'pending',time).id,payout.notification('coach','admin',{...legacy,submittedAt:2000},'pending',time).id);
});

test('public payout projection matches browser and strips sensitive fields from pending/rejected records', () => {
  for (const verificationStatus of ['pending','approved','rejected','unknown']) {
    for (const qrDataUrl of [sample.qrDataUrl,'javascript:alert(1)','https://firebasestorage.googleapis.com/v0/file']) {
      const account = {...sample,verificationStatus,qrDataUrl,verifiedAt:verificationStatus==='pending'?null:1500};
      const expected = browser.publicProjection(account);
      assert.deepEqual(payout.publicAccount(account,time),expected.public);
      assert.deepEqual(payout.publicAccount(account,time,true),expected.profile);
      assert.equal(expected.profile.accountNumber,undefined);
      if(verificationStatus!=='approved') assert.deepEqual(Object.keys(expected.public).sort(),['revision','updatedAt','verificationStatus']);
    }
  }
});

test('newer pending tombstone blocks delayed approvals; later review updates the same submitted version', () => {
  const approved = payout.publicAccount({...sample,verificationStatus:'approved',verifiedAt:1500},time);
  const resubmitted = payout.publicAccount({...sample,requestId:'fixture-2',submittedAt:2000},time);
  assert.equal(payout.applyPublic(resubmitted,approved),undefined);
  assert.deepEqual(payout.applyPublic(approved,resubmitted),resubmitted);
  const reviewed = payout.publicAccount({...sample,submittedAt:2000,verifiedAt:2000,verificationStatus:'approved'},time);
  assert.deepEqual(payout.applyPublic(resubmitted,reviewed),reviewed);
});

function fixture(current) {
  const rows = {'coachPaymentAccounts/coach':current};
  const db = {ref(path) {return {
    once:async()=>({val:()=>path==='users'?{admin:{role:'admin'},other:{role:'athlete'}}:rows[path]??null}),
    orderByChild(){return this;},equalTo(){return this;},
    transaction:async update=>{const next=update(rows[path]??null);if(next!==undefined)rows[path]=next;return {committed:next!==undefined};}
  };}};
  return {db,rows};
}
const event = (before,after)=>({params:{coachId:'coach'},time,data:{before:{val:()=>before},after:{val:()=>after}}});

test('repeated and concurrent function deliveries create one generic admin alert without resetting read state', async () => {
  const {db,rows}=fixture(sample);
  await Promise.all([payout.handle(db,event(null,sample)),payout.handle(db,event(null,sample))]);
  const keys=Object.keys(rows).filter(key=>key.startsWith('notifications/'));
  assert.equal(keys.length,1);assert.ok(keys[0].startsWith('notifications/admin/'));
  rows[keys[0]].read=true;
  await payout.handle(db,event(null,sample));
  assert.equal(rows[keys[0]].read,true);
  assert.equal(rows['coachPaymentPublic/coach'].verificationStatus,'pending');
});

test('superseded account events do nothing and a completed review notifies only its coach',async()=>{
  const approved={...sample,verificationStatus:'approved',verifiedAt:2000,verifiedBy:'admin'};
  const {db,rows}=fixture(approved);
  await payout.handle(db,event(null,sample));
  assert.equal(Object.keys(rows).length,1);
  await payout.handle(db,event(sample,approved));
  assert.equal(Object.keys(rows).filter(key=>key.startsWith('notifications/coach/')).length,1);
  assert.equal(Object.keys(rows).filter(key=>key.startsWith('notifications/admin/')).length,0);
});

test('payout rules migration preserves unrelated rules, adds only scoped protections and rejects unknown authorization',()=>{
  const next=migration.merge(baseline);
  for(const key of Object.keys(baseline.rules)) if(!['coachPaymentAccounts','coachProfiles','coachPaymentPublic'].includes(key)) assert.deepEqual(next.rules[key],baseline.rules[key]);
  assert.equal(next.rules.coachProfiles.$coachId['.write'],baseline.rules.coachProfiles.$coachId['.write']);
  assert.deepEqual(migration.merge(next),next);
  const changed=structuredClone(baseline);changed.rules.coachPaymentAccounts.$coachId['.write']='unexpected';
  assert.throws(()=>migration.merge(changed),/changed/);
});

test('payout rules migration rejects partial or misleading pending guards instead of silently skipping protection',()=>{
  const next=migration.merge(baseline);
  for(const mutate of [
    x=>x.rules.coachPaymentAccounts.$coachId['.write']="auth != null || newData.child('verificationStatus').val() === 'pending'",
    x=>delete x.rules.coachPaymentAccounts.$coachId['.validate'],
    x=>delete x.rules.coachProfiles.$coachId['.validate'],
    x=>x.rules.coachPaymentPublic.$coachId['.write']='auth != null'
  ]){const changed=structuredClone(next);mutate(changed);assert.throws(()=>migration.merge(changed),/changed|incomplete/);}
  const prior=structuredClone(next);prior.rules.coachPaymentPublic.$coachId['.write']=baseline.rules.coachPaymentPublic.$coachId['.write'];
  assert.deepEqual(migration.merge(prior),next);
});
