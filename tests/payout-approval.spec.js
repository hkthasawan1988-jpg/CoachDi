const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');
const pending={bank:'ธนาคารทดสอบ',accountNumber:'0123456789',coachLegalName:'ชื่อโค้ชภาษาไทยที่ยาวสำหรับทดสอบการตัดบรรทัด',accountName:'ชื่อโค้ชภาษาไทยที่ยาวสำหรับทดสอบการตัดบรรทัด',qrDataUrl:'',verificationStatus:'pending',submittedAt:100,requestId:'request-1'};

async function admin(page,accounts={coach:pending},error=false){
  await page.evaluate(({accounts,error})=>{
    window.testPayoutListeners={};const base=db.ref.bind(db);db.ref=path=>{const ref=base(path),on=ref.on.bind(ref);ref.on=(event,callback,cancel)=>{if(path==='coachPaymentAccounts'||path==='coachProfiles'){testPayoutListeners[path]={callback,cancel};if(error&&path==='coachPaymentAccounts'){queueMicrotask(()=>cancel(Error('Permission denied')));return callback;}}return on(event,callback,cancel);};return ref;};
    window.testRealtimeValues={coachPaymentAccounts:accounts,coachProfiles:{coach:{displayName:'Coach ทดสอบ',status:'active'}}};for(const [uid,value] of Object.entries(accounts))testData['coachPaymentAccounts/'+uid]=value;
    state.role='admin';state.user={uid:'test-admin'};testAuth.currentUser=state.user;loginView.classList.add('hidden');portal.classList.remove('hidden');renderNav();
    return s41ShowAdmin('overview');
  },{accounts,error});
}

test('admin overview exposes previously hidden pending bank requests; queue updates live',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page);await admin(page);
  await expect(page.locator('#cdPayoutSummary')).toContainText('รออนุมัติ 1 รายการ');await expect(page.locator('[data-payout-nav]')).toHaveCount(1);
  await page.locator('[data-payout-action="open"]').click();await expect(page.locator('#cdPayoutRows')).toContainText('Coach ทดสอบ');
  await page.evaluate(()=>testPayoutListeners.coachPaymentAccounts.callback({val:()=>({})}));await expect(page.locator('#cdPayoutStatus')).toHaveText('ไม่มีบัญชีรับเงินรออนุมัติ');
  await page.evaluate(value=>testPayoutListeners.coachPaymentAccounts.callback({val:()=>({coach:value})}),pending);await expect(page.locator('#cdPayoutRows article')).toHaveCount(1);expect(pageErrors).toEqual([]);
});
test('permission failure cannot masquerade as an empty admin bank queue',async({page})=>{
  await openIsolatedApp(page);await admin(page,{},true);await page.evaluate(()=>s41ShowAdmin('verify'));
  await expect(page.locator('#cdPayoutStatus')).toContainText('โหลดคำขอไม่สำเร็จ');await expect(page.locator('#cdPayoutStatus')).not.toHaveText('ไม่มีบัญชีรับเงินรออนุมัติ');
});
test('failed admin review leaves the request actionable and rejecting requires a reason',async({page})=>{
  await openIsolatedApp(page);await admin(page);await page.evaluate(()=>s41ShowAdmin('verify'));
  await page.locator('[data-payout-action="reject-form"]').click();await page.locator('[data-payout-action="reject"]').click();await expect(page.locator('[data-payout-result]')).toContainText('กรุณาระบุเหตุผล');
  expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path.startsWith('coachPaymentAccounts/')))).toHaveLength(0);
  await page.evaluate(()=>testWriteError=true);await page.locator('[data-payout-action="approve"]').click();await expect(page.locator('#cdPayoutStatus')).toContainText('บันทึกผลไม่สำเร็จ');await expect(page.locator('[data-payout-action="approve"]')).toBeEnabled();
  await page.evaluate(()=>testWriteError=false);await page.locator('[data-payout-action="approve"]').click();await expect(page.locator('#cdPayoutStatus')).toContainText('อนุมัติบัญชีรับเงินแล้ว');
});
test('review primes a cold Firebase ref without replacing the displayed request snapshot',async({page})=>{
  await openIsolatedApp(page);await admin(page);await page.evaluate(()=>s41ShowAdmin('verify'));
  await page.evaluate(()=>{const original=db.ref.bind(db);db.ref=path=>{const ref=original(path);if(path==='coachPaymentAccounts/coach'){let primed=false;const once=ref.once.bind(ref),transaction=ref.transaction.bind(ref);ref.once=async()=>{const result=await once('value');primed=true;return result;};ref.transaction=callback=>primed?transaction(callback):Promise.resolve({committed:false,snapshot:{val:()=>null}});}return ref;};});
  await page.locator('[data-payout-action="approve"]').click();await expect(page.locator('#cdPayoutStatus')).toContainText('อนุมัติบัญชีรับเงินแล้ว');
  expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path==='coachPaymentAccounts/coach'))).toHaveLength(1);
});
test('a slow public sync from the previous admin cannot block or mutate the next admin session',async({page})=>{
  await openIsolatedApp(page);await admin(page);
  await page.evaluate(value=>{
    const original=db.ref.bind(db);let first=true;testData['coachPaymentAccounts/session-race']={...value,verificationStatus:'approved',verifiedAt:200};
    db.ref=path=>{const ref=original(path);if(path==='coachPaymentAccounts/session-race'){const once=ref.once.bind(ref);ref.once=async()=>{if(first){first=false;await new Promise(resolve=>window.releasePayoutRead=resolve);}return once('value');};}return ref;};
    window.firstPayoutSync=cdSyncPublicPayment('session-race');
  },pending);
  await page.evaluate(async()=>{state.user={uid:'admin-second'};testAuth.currentUser=state.user;await s41ShowAdmin('overview');await cdSyncPublicPayment('session-race');});
  expect(await page.evaluate(()=>testData['coachPaymentPublic/session-race']?.verificationStatus)).toBe('approved');
  const before=await page.evaluate(()=>testWrites.filter(w=>w.path==='coachPaymentPublic/session-race').length);
  await page.evaluate(async()=>{releasePayoutRead();await firstPayoutSync;});expect(await page.evaluate(()=>testWrites.filter(w=>w.path==='coachPaymentPublic/session-race').length)).toBe(before);
});
test('a deferred review transaction cancels when its admin session has ended',async({page})=>{
  await openIsolatedApp(page);await admin(page);await page.evaluate(()=>s41ShowAdmin('verify'));
  await page.evaluate(()=>{const original=db.ref.bind(db);db.ref=path=>{const ref=original(path);if(path==='coachPaymentAccounts/coach'){const transaction=ref.transaction.bind(ref);ref.transaction=async callback=>{await new Promise(resolve=>window.releasePayoutReview=resolve);return transaction(callback);};}return ref;};window.oldPayoutReview=adminVerifyPayout('coach',true);});
  await page.waitForFunction(()=>typeof releasePayoutReview==='function');
  await page.evaluate(async()=>{state.user={uid:'admin-next'};testAuth.currentUser=state.user;await s41ShowAdmin('overview');releasePayoutReview();await oldPayoutReview;});
  expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path==='coachPaymentAccounts/coach'))).toHaveLength(0);
});
test('admin stale review does not approve replaced bank details and duplicate decisions write once',async({page})=>{
  await openIsolatedApp(page);await admin(page);await page.evaluate(()=>s41ShowAdmin('verify'));
  await page.evaluate(()=>{testData['coachPaymentAccounts/coach']={...testData['coachPaymentAccounts/coach'],accountNumber:'9999999999',requestId:'new-request'};});await page.locator('[data-payout-action="approve"]').click();
  await expect(page.locator('#cdPayoutStatus')).toContainText('ถูกเปลี่ยน');expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path.startsWith('coachPaymentAccounts/')))).toHaveLength(0);
  await page.evaluate(value=>{testData['coachPaymentAccounts/coach']=value;testPayoutListeners.coachPaymentAccounts.callback({val:()=>({coach:value})});},pending);
  await page.evaluate(()=>{adminVerifyPayout('coach',true);adminVerifyPayout('coach',true);});await expect(page.locator('#cdPayoutStatus')).toContainText('อนุมัติบัญชีรับเงินแล้ว');expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path.startsWith('coachPaymentAccounts/')))).toHaveLength(1);
});
test('coach submission is not lost when nonessential audit fails, duplicate taps create one request',async({page})=>{
  await openIsolatedApp(page);await page.evaluate(()=>{state.role='coach';state.user={uid:'test-coach'};testAuth.currentUser=state.user;state.coachProfile={displayName:'Coach'};state.paymentAccount={};state.subscription={trialEndsAt:Date.now()+86400000};audit=async()=>{throw Error('audit unavailable');};loginView.classList.add('hidden');portal.classList.remove('hidden');showCoach('payments');});
  await page.locator('#payBank').fill(pending.bank);await page.locator('#payNumber').fill(pending.accountNumber);await page.locator('#payCoachName').fill(pending.coachLegalName);await page.locator('#payAccountName').fill(pending.accountName);
  await page.evaluate(()=>{submitPaymentVerification();submitPaymentVerification();});await expect(page.locator('#payMsg')).toContainText('เข้าคิว Admin แล้ว');expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path.startsWith('coachPaymentAccounts/')))).toHaveLength(1);
  await page.evaluate(()=>submitPaymentVerification());await expect(page.locator('#payMsg')).toContainText('ไม่ได้ส่งซ้ำ');expect(await page.evaluate(()=>testWrites.filter(w=>w.transaction&&w.path.startsWith('coachPaymentAccounts/')))).toHaveLength(1);
  expect(await page.evaluate(()=>testWrites.some(w=>w.path.startsWith('notifications/')))).toBe(false);
});
for(const width of [320,360,390,412])test(`complete menu opens bank approval at ${width}px with long Thai and expanded details`,async({page})=>{
  await page.setViewportSize({width,height:800});await openIsolatedApp(page,true);await admin(page);
  await page.getByRole('button',{name:'เปิดเมนูทั้งหมด',exact:true}).click();
  await page.locator('#c92MenuOverlay').getByRole('button',{name:/อนุมัติบัญชีรับเงิน/}).click();
  await expect(page.locator('#cdPayoutRows')).toBeVisible();await page.locator('#cdPayoutRows summary').click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);await page.locator('[data-payout-action="approve"]').scrollIntoViewIfNeeded();await expect(page.locator('[data-payout-action="approve"]')).toBeVisible();
});
