const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');
async function seed(page){
  await page.evaluate(()=>{
    state.role='athlete';state.user={uid:'settings-athlete',email:'settings@example.test'};testAuth.currentUser=state.user;
    state.userProfile={role:'athlete',displayName:'มะลิ นักกีฬา',phone:'0800000000',refundAccount:{bank:'ธนาคารทดสอบ',accountName:'มะลิ',accountNumber:'0012345678'}};
    testData['users/settings-athlete']=structuredClone(state.userProfile);testData['users/settings-athlete/refundAccount']=structuredClone(state.userProfile.refundAccount);
    localStorage.setItem('coachDiLocationConsent','denied');loginView.classList.add('hidden');portal.classList.remove('hidden');logoutBtn.classList.remove('hidden');renderNav();c91InstallHelp();showAthleteMenu('home');
  });
}
for(const width of [320,360,390,412,656])test(`athlete menu and refund settings fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});const {pageErrors}=await openIsolatedApp(page,true);await seed(page);
  await expect(page.locator('#athletePage>.athleteTabs [data-c60-group]')).toBeHidden();
  await expect(page.locator('#mobileNav [data-athlete-mobile="groupplay"]')).toBeVisible();
  await expect(page.locator('#mobileNav [data-athlete-mobile="mybookings"]')).toHaveText('การจองของฉัน');
  await expect(page.locator('#c47Home .c47Hero')).not.toContainText('เริ่มจากเลือกเวลาของ Coach');
  await page.getByRole('button',{name:'ตั้งค่า',exact:true}).last().click();
  await expect(page.locator('#athletePhotoFile')).toBeVisible();await expect(page.locator('#athleteDisplayName')).toHaveValue('มะลิ นักกีฬา');
  await expect(page.locator('#cdRefundSettings')).toContainText('ลงท้าย 5678');await expect(page.locator('#cdRefundSettings')).toContainText('เมื่อโค้ชยกเลิก');
  const bounds=await page.locator('#mobileNav>button:visible').evaluateAll(buttons=>buttons.map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right,height:r.height};}));
  expect(bounds).toHaveLength(5);for(const b of bounds){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);expect(b.height).toBeGreaterThanOrEqual(44);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});
test('settings saves refund bank details on the same account and preserves leading zeros',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page);await seed(page);await page.evaluate(()=>showAthleteMenu('profile'));
  await page.getByRole('button',{name:'แก้ไขบัญชีรับเงินคืน',exact:true}).click();
  await expect(page.locator('#cdrAccountNumber')).toHaveValue('0012345678');await page.locator('#cdrAccountNumber').fill('');
  await page.getByRole('button',{name:'บันทึกบัญชี',exact:true}).click();expect(await page.evaluate(()=>testWrites)).toEqual([]);
  await page.locator('#cdrAccountNumber').fill('0007654321');await page.getByRole('button',{name:'บันทึกบัญชี',exact:true}).click();
  await expect(page.locator('#cdrError')).toHaveText('บันทึกบัญชีแล้ว');await page.locator('[data-cdr="close"]').click();
  await expect(page.locator('#cdRefundSettings')).toContainText('ลงท้าย 4321');
  const writes=await page.evaluate(()=>testWrites);expect(writes).toHaveLength(1);expect(writes[0].path).toBe('users/settings-athlete/refundAccount');expect(writes[0].value.accountNumber).toBe('0007654321');expect(pageErrors).toEqual([]);
});
test('unread class counts remain on their menu without repeatedly repainting settings',async({page})=>{
  await openIsolatedApp(page);await seed(page);
  await page.evaluate(()=>{state.c94Counts={group:1,coach:0};c94Paint();window.settingsChanges=0;new MutationObserver(()=>settingsChanges++).observe(document.querySelector('#mobileNav .c92More'),{childList:true,subtree:true});});
  await page.waitForTimeout(600);
  expect(await page.evaluate(()=>settingsChanges)).toBe(0);
  await expect(page.locator('#mobileNav .c92More .c94Badge')).toHaveCount(0);
  await expect(page.locator('#athletePage>.athleteTabs [data-c76-groupclasses] .c94Badge')).toHaveText('1');
});
test('new first-entry guide navigates real pages without transactions and can be replayed',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page);await seed(page);
  await page.evaluate(()=>{localStorage.setItem(c91GuideKey(),'seen');c91MaybeShowGuide(state.user.uid);});
  const guide=page.locator('#c91Guide');await expect(guide).toBeVisible();await expect(guide.locator('h2')).toHaveText('เลือกกีฬาและโค้ช');
  const titles=['การจองของฉัน','หาเพื่อนตี','ติดตามการแจ้งเตือน','ตั้งค่ารูปและชื่อ','เตรียมบัญชีรับเงินคืน'];
  for(const title of titles){await guide.getByRole('button',{name:'ถัดไป',exact:true}).click();await expect(guide.locator('h2')).toHaveText(title);}
  await expect(page.locator('#cdRefundSettings')).toBeVisible();await guide.getByRole('button',{name:'เริ่มใช้งาน',exact:true}).click();
  await expect(guide).toHaveCount(0);expect(await page.evaluate(()=>portal.inert)).toBe(false);
  expect(await page.evaluate(()=>localStorage.getItem('coachdi-athlete-tour:v1:settings-athlete'))).toBe('seen');
  await page.evaluate(()=>{showAthleteMenu('home');c91ShowGuide(false);});await expect(guide).toHaveCount(0);
  await page.getByRole('button',{name:'วิธีใช้งาน',exact:true}).click();await expect(guide).toBeVisible();
  await page.keyboard.press('Escape');await expect(guide).toHaveCount(0);expect(await page.evaluate(()=>portal.inert)).toBe(false);
  expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});
for(const viewport of [{width:320,height:480},{width:656,height:360}])test(`guide controls fit ${viewport.width}x${viewport.height} with safe areas`,async({page})=>{
  await page.setViewportSize(viewport);const {pageErrors}=await openIsolatedApp(page,true);await seed(page);
  await page.evaluate(()=>{document.documentElement.style.setProperty('--safe-area-inset-top','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','24px');c91ShowGuide(true);});
  const guide=page.locator('#c91Guide');await expect(guide).toBeVisible();
  for(let step=0;step<6;step++){
    const metrics=await guide.locator('.cdTourPanel').evaluate(panel=>({box:panel.getBoundingClientRect().toJSON(),buttons:[...panel.querySelectorAll('button')].map(b=>b.getBoundingClientRect().toJSON())}));
    expect(metrics.box.left).toBeGreaterThanOrEqual(0);expect(metrics.box.right).toBeLessThanOrEqual(viewport.width);expect(metrics.box.top).toBeGreaterThanOrEqual(24);expect(metrics.box.bottom).toBeLessThanOrEqual(viewport.height-24);
    for(const b of metrics.buttons){expect(b.top).toBeGreaterThanOrEqual(metrics.box.top);expect(b.bottom).toBeLessThanOrEqual(metrics.box.bottom);expect(b.height).toBeGreaterThanOrEqual(44);}
    await guide.locator('[data-tour="next"]').click();
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);expect(pageErrors).toEqual([]);expect(await page.evaluate(()=>testWrites)).toEqual([]);
});
test('guide waits for an existing dialog and releases the app on account change',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page);await seed(page);
  await page.evaluate(()=>{sheetContent.innerHTML='<h2>รายการที่กำลังตรวจ</h2>';sheetWrap.classList.remove('hidden');c91ShowGuide(true);});
  await expect(page.locator('#c91Guide')).toHaveCount(0);await page.evaluate(()=>closeSheet());await expect(page.locator('#c91Guide')).toBeVisible();
  await page.evaluate(async()=>{testAuth.currentUser=null;await testAuthListeners.at(-1)(null);});
  await expect(page.locator('#c91Guide')).toHaveCount(0);expect(await page.evaluate(()=>portal.inert)).toBe(false);expect(pageErrors).toEqual([]);expect(await page.evaluate(()=>testWrites)).toEqual([]);
});
