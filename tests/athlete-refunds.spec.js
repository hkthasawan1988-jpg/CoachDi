const { test, expect } = require('@playwright/test');
const { openIsolatedApp } = require('./helpers/app');
async function seed(page, overrides = {}) {
  await page.evaluate(overrides => {
    state.role = 'athlete'; state.user = { uid: 'test-athlete' }; testAuth.currentUser = state.user;
    const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0,10);
    const b = { id:'booking-fixture', athleteId:'test-athlete', coachId:'original-coach', sport:'tennis', date, start:10, end:11,
      venueId:'court', venue:'สนามทดสอบ', status:'declined', paymentStatus:'payment_verified', ...overrides };
    state.bookings = [b]; state.allAthleteBookings = [b];
    testData['bookings/booking-fixture'] = b;
    testData['users/test-athlete/refundAccount'] = null;
    testData.coachProfiles = { 'original-coach': { displayName:'โค้ชเดิม', sport:'tennis' }, next: { displayName:'โค้ชถัดไป', sport:'tennis' }, busy: { displayName:'โค้ชไม่ว่าง', sport:'tennis' } };
    for (const uid of ['next','busy']) {
      testData['coachAvailability/'+uid] = { start:6, end:22, advanceDays:30 };
      testData['coachVenues/'+uid] = { court:{ name:'สนามทดสอบ',openStart:6,openEnd:22 } };
      testData['coachPublicSchedule/'+uid] = uid === 'busy' ? { conflict:{ date,start:10.5,end:12 } } : null;
    }
  }, overrides);
}
async function bank(page) {
  await page.locator('#cdrBank').fill('ธนาคารทดสอบ');
  await page.locator('#cdrAccountName').fill('นักกีฬา ทดสอบ');
  await page.locator('#cdrAccountNumber').fill('001-234-5678');
}
test('athlete signup allows no bank and writes an athlete profile without banking fields', async ({ page }) => {
  await openIsolatedApp(page);
  await page.getByRole('button',{name:'สร้างบัญชีนักกีฬา',exact:true}).click();
  await page.locator('#cdrEmail').fill('athlete@example.invalid'); await page.locator('#cdrPassword').fill('test-password-only');
  await page.locator('[data-cdr="register"]').click();
  await expect.poll(() => page.evaluate(() => testWrites.filter(x=>x.path==='users/test-athlete').length)).toBe(1);
  const saved = await page.evaluate(() => testData['users/test-athlete']);
  expect(saved.role).toBe('athlete'); expect(saved.refundAccount).toBeUndefined();
});
test('signup rejects partial banking data and saves a complete optional bank account privately once', async ({ page }) => {
  await openIsolatedApp(page); await page.evaluate(() => registerAthlete());
  await page.locator('#cdrEmail').fill('athlete@example.invalid'); await page.locator('#cdrPassword').fill('test-password-only');
  await page.locator('#cdrBank').fill('ธนาคารทดสอบ'); await page.locator('[data-cdr="register"]').click();
  await expect(page.locator('#cdrError')).toContainText('ชื่อเจ้าของบัญชี'); expect(await page.evaluate(() => testAuthCalls.some(x=>x.type==='register'))).toBe(false);
  await bank(page); await page.locator('[data-cdr="register"]').dblclick();
  await expect.poll(() => page.evaluate(() => testWrites.filter(x=>x.path==='users/test-athlete').length)).toBe(1);
  expect(await page.evaluate(() => testData['users/test-athlete'].refundAccount.accountNumber)).toBe('0012345678');
  expect(await page.evaluate(() => testWrites.every(x=>x.path==='users/test-athlete'))).toBe(true);
});
test('refund requires bank and explicit confirmation; double click writes a single existing booking transaction', async ({ page }) => {
  await openIsolatedApp(page); await seed(page); await page.evaluate(() => CoachDiRefunds.openRecovery('booking-fixture'));
  await page.locator('[data-cdr="submit-refund"]').click(); await expect(page.locator('#cdrError')).toContainText('ธนาคาร');
  await bank(page); await page.locator('[data-cdr="submit-refund"]').click(); await expect(page.locator('#cdrError')).toContainText('ยืนยันข้อมูลบัญชี');
  await page.locator('#cdrConfirmAccount').check(); await page.locator('[data-cdr="submit-refund"]').dblclick();
  await expect(page.locator('#cdrError')).toContainText('ส่งคำขอแล้ว');
  const writes = await page.evaluate(() => testWrites);
  expect(writes.filter(x=>x.transaction)).toHaveLength(1);
  expect(writes.filter(x=>x.path.startsWith('bookings/')).map(x=>x.path)).toEqual(['bookings/booking-fixture']);
  expect(writes.find(x=>x.transaction).value.status).toBe('declined');
  expect(JSON.stringify(writes.filter(x=>x.path.startsWith('notifications/')))).not.toContain('0012345678');
  await page.evaluate(() => CoachDiRefunds.openRecovery('booking-fixture'));
  await expect(page.locator('[data-cdr="submit-refund"]')).toHaveCount(0);
});
test('refund write failure does not show success or create another booking', async ({ page }) => {
  await openIsolatedApp(page); await seed(page); await page.evaluate(() => CoachDiRefunds.openRecovery('booking-fixture'));
  await bank(page); await page.locator('#cdrConfirmAccount').check(); await page.evaluate(() => { testWriteError=true; });
  await page.locator('[data-cdr="submit-refund"]').click(); await expect(page.locator('#cdrError')).toContainText('Write failed');
  expect(await page.evaluate(() => testWrites.length)).toBe(0); await expect(page.locator('[data-cdr="submit-refund"]')).toBeEnabled();
});
test('recommendations exclude the cancelled coach and overlapping schedules; selecting only navigates', async ({ page }) => {
  await openIsolatedApp(page); await seed(page);
  await page.evaluate(() => { window.chosenCoach=''; changeAthleteCoach=async uid=>{chosenCoach=uid;}; showAthleteMenu=()=>{}; renderSchedule=()=>{}; });
  await page.evaluate(() => CoachDiRefunds.openRecovery('booking-fixture'));
  await expect(page.locator('.cdr-candidate')).toHaveCount(1); await expect(page.locator('.cdr-candidate')).toContainText('โค้ชถัดไป');
  await expect(page.locator('.cdr-candidate')).toContainText('รอโค้ชยืนยัน');
  await page.locator('[data-cdr="select-coach"]').click();
  await expect.poll(() => page.evaluate(() => chosenCoach)).toBe('next'); expect(await page.evaluate(() => testWrites.length)).toBe(0);
});
test('recommendations recheck before selection and exclude unavailable/failed reads', async ({ page }) => {
  await openIsolatedApp(page); await seed(page); await page.evaluate(() => CoachDiRefunds.openRecovery('booking-fixture'));
  await expect(page.locator('.cdr-candidate')).toHaveCount(1);
  await page.evaluate(() => { testReadErrors={'coachPublicSchedule/next':true}; });
  await page.locator('[data-cdr="select-coach"]').click(); await expect(page.locator('#cdrError')).toContainText('ตารางโค้ชเปลี่ยน');
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});
test('profile exposes an account editor and account changes during a request cannot write', async ({ page }) => {
  await openIsolatedApp(page); await seed(page);
  expect(await page.evaluate(() => athleteProfileView())).toContain('จัดการบัญชีรับเงินคืน');
  await page.evaluate(() => CoachDiRefunds.editAccount()); await bank(page);
  await page.locator('[data-cdr="save-account"]').click(); await expect(page.locator('#cdrError')).toContainText('บันทึกบัญชีแล้ว');
  expect(await page.evaluate(() => testWrites[0].path)).toBe('users/test-athlete/refundAccount');
  await page.evaluate(() => { testAuth.currentUser={uid:'other'}; testWrites=[]; });
  await page.locator('[data-cdr="save-account"]').click(); await expect(page.locator('#cdrError')).toContainText('บัญชีเปลี่ยน');
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});
test('coach sees the submitted account and cannot start two refund methods concurrently', async ({ page }) => {
  await openIsolatedApp(page);
  await seed(page, { refundRequestedAt:123, refundStatus:'requested', refundBank:'ธนาคารทดสอบ', refundAccountName:'นักกีฬา ทดสอบ', refundAccountNumber:'0012345678' });
  await page.evaluate(() => {
    state.role='coach'; state.user={uid:'original-coach'}; testAuth.currentUser=state.user;
    window.coinCalls=0; window.cashCalls=0;
    CoachDiBookingServer.refundAction=async()=>{coinCalls++;await new Promise(r=>setTimeout(r,150));};
    CoachDiBookingServer.cashRefund=async()=>{cashCalls++;};
    s38RefundDecision('booking-fixture');
  });
  await expect(page.locator('[data-refund-view]')).toContainText('0012345678');
  await page.evaluate(() => {
    document.querySelector('[data-cdr="refund-coin"]').click();
    document.querySelector('[data-cdr="refund-cash"]').click();
  });
  await expect.poll(()=>page.evaluate(()=>coinCalls)).toBe(1);
  expect(await page.evaluate(()=>cashCalls)).toBe(0);
  await expect(page.locator('#cdrError')).toBeEmpty();
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);
});

for (const width of [320,360,390,412,768]) test(`refund form, long Thai account name and footer fit ${width}px including folded/expanded layout`, async ({ page }) => {
  await page.setViewportSize({width,height:568}); await openIsolatedApp(page); await seed(page);
  await page.evaluate(() => CoachDiRefunds.openRecovery('booking-fixture')); await bank(page);
  await page.locator('#cdrAccountName').fill('นักกีฬาชื่อภาษาไทยยาว'.repeat(6));
  for (const height of [568,320]) {
    await page.setViewportSize({width,height});
    const button = page.locator('[data-cdr="submit-refund"]');
    await expect.poll(async () => { const r=await button.boundingBox(); return r.y+r.height; }).toBeLessThanOrEqual(height);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
