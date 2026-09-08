const test=require('node:test');
const assert=require('node:assert/strict');
const C=require('../payout-approval-core.js');
const account={bank:'ธนาคารทดสอบ',accountNumber:'0123456789',coachLegalName:'โค้ชทดสอบ',accountName:'โค้ชทดสอบ',qrDataUrl:''};
const pending={...account,verificationStatus:'pending',submittedAt:100,requestId:'request-one'};

test('bank queue includes existing legacy requests independently of coach registration',()=>{
  const list=C.pending({first:pending,legacy:{...pending,requestId:undefined,submittedAt:1},approved:{...pending,verificationStatus:'approved'},rejected:{...pending,verificationStatus:'rejected'}},{first:{displayName:'Coach first',status:'active'}});
  assert.deepEqual(list.map(x=>x.uid),['legacy','first']);assert.equal(list[1].name,'Coach first');
});
test('repeated identical pending submission is a no-op; edited or rejected accounts can resubmit',()=>{
  assert.equal(C.submission(account,pending,200,'new-request'),undefined);
  for(const previous of [{...pending,accountName:'ชื่อเก่า'},{...pending,verificationStatus:'rejected',verifiedBy:'admin',verifiedAt:150,rejectionReason:'แก้ชื่อ'}]){
    const next=C.submission(account,previous,200,'new-request');assert.equal(next.verificationStatus,'pending');assert.equal(next.requestId,'new-request');assert.equal(next.verifiedBy,null);assert.equal(next.rejectionReason,null);
  }
});
test('stale review cannot approve a new request or altered account/QR even with the same request id',()=>{
  for(const change of [{requestId:'replacement'},{submittedAt:200},{accountNumber:'9999999999'},{accountName:'บัญชีอื่น'},{qrDataUrl:'data:image/png;base64,AAAA'},{verificationStatus:'approved'}])assert.equal(C.review({...pending,...change},pending,true,'admin',300,''),undefined);
  const reviewed=C.review(pending,pending,true,'admin',300,'');assert.equal(reviewed.verificationStatus,'approved');assert.equal(reviewed.accountNumber,account.accountNumber);assert.equal(reviewed.verifiedBy,'admin');
});
test('legacy request without a request id still has stale-review protection',()=>{
  const legacy={...account,verificationStatus:'pending',submittedAt:100};assert.equal(C.review(legacy,legacy,false,'admin',300,'ชื่อไม่ตรง').rejectionReason,'ชื่อไม่ตรง');assert.equal(C.review({...legacy,bank:'ธนาคารอื่น'},legacy,true,'admin',300,''),undefined);
});
test('account validation preserves leading zeroes and rejects letters instead of silently changing the number',()=>{
  assert.equal(C.account({...account,accountNumber:'012-345 6789'}).accountNumber,'0123456789');assert.equal(C.validate(account),'');assert.match(C.validate({...account,accountNumber:'0123oops456789'}),/8–20/);assert.ok(C.validate({...account,accountName:''}));assert.ok(C.validate({...account,bank:'ก'.repeat(101)}));
});
test('QR verification accepts only bounded supported images and rejects script, SVG and unrelated remote URLs',()=>{
  assert.equal(C.safeImage('data:image/png;base64,AAAA'),true);assert.equal(C.safeImage('https://firebasestorage.googleapis.com/v0/b/test/o/qr'),true);
  for(const value of ['javascript:alert(1)','data:image/svg+xml;base64,AAAA','https://example.invalid/qr.png','data:image/png;base64," onerror="alert(1)'])assert.equal(C.safeImage(value),false);
});
test('pending or rejected public projection removes account details and cannot be replaced by an older approval',()=>{
  const approved=C.publicProjection({...pending,verificationStatus:'approved',verifiedAt:200}),resubmitted=C.publicProjection({...pending,submittedAt:300,verifiedAt:null,requestId:'request-2'});
  assert.equal(approved.public.accountNumber,account.accountNumber);assert.equal(approved.profile.accountNumber,undefined);
  assert.deepEqual(Object.keys(resubmitted.public).sort(),['revision','updatedAt','verificationStatus']);
  assert.equal(C.newerProjection(resubmitted.public,approved.public),undefined);
  assert.equal(C.newerProjection(approved.public,resubmitted.public).verificationStatus,'pending');
  assert.equal(C.newerProjection(resubmitted.public,resubmitted.public),undefined);
});
