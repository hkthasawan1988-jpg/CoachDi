const { test, expect } = require('@playwright/test');
const { openIsolatedApp } = require('./helpers/app');

for (const [role, title] of [['athlete', 'เข้าสู่ระบบนักกีฬา'], ['coach', 'เข้าสู่ระบบ Coach'], ['admin', 'เข้าสู่ระบบ Admin']]) {
  test(`legacy ${role} entry and query route preserve the login portal`, async ({ page }) => {
    await openIsolatedApp(page, false, `/${role}.html`);
    await expect(page).toHaveURL(new RegExp(`index\\.html\\?portal=${role}`));
    await expect(page.locator('#loginTitle')).toHaveText(title);
    await expect(page.locator('#portal')).toBeHidden();
    await expect(page.locator(`#portalChooser [data-role="${role}"]`)).toHaveClass(/active/);
    expect(await page.evaluate(() => testWrites.length)).toBe(0);
  });
}

test('login keeps validation, password visibility and remembered-session behavior', async ({ page }) => {
  await openIsolatedApp(page);
  await page.evaluate(() => login());
  expect(await page.evaluate(() => testAuthCalls)).toEqual([]);
  await expect(page.locator('#authMessage')).not.toHaveText('กำลังเข้าสู่ระบบ...');
  await page.locator('#loginId').fill('athlete@example.invalid');
  await page.locator('#loginPass').fill('fixture-only-password');
  await page.locator('.passwordWrap button').click();
  await expect(page.locator('#loginPass')).toHaveAttribute('type', 'text');
  await page.locator('.passwordWrap button').click();
  await expect(page.locator('#loginPass')).toHaveAttribute('type', 'password');
  await page.locator('#loginBtn').click();
  await expect.poll(() => page.evaluate(() => testAuthCalls.length)).toBe(2);
  expect(await page.evaluate(() => testAuthCalls)).toEqual([
    { type: 'persistence', value: 'local' },
    { type: 'login', email: 'athlete@example.invalid', password: 'fixture-only-password' }
  ]);
  await page.locator('#rememberLogin').uncheck();
  await page.locator('#loginBtn').click();
  await expect.poll(() => page.evaluate(() => testAuthCalls.length)).toBe(4);
  expect(await page.evaluate(() => testAuthCalls[2].value)).toBe('session');
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});

test('coach registration still opens and cancels without creating an account', async ({ page }) => {
  await openIsolatedApp(page);
  await page.locator('#portalChooser [data-role="coach"]').click();
  await page.locator('#registerCoachBtn').click();
  await expect(page.locator('#c68Modal')).toBeVisible();
  await expect(page.locator('#c68Email')).toBeVisible();
  await page.locator('#c68Modal').getByRole('button', { name: 'ยกเลิก', exact: true }).click();
  await expect(page.locator('#c68Modal')).toHaveCount(0);
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});

test('venue confirmation validation and change handlers survive sheet rearrangement', async ({ page }) => {
  await openIsolatedApp(page);
  await page.evaluate(() => {
    state.coachId = 'test-coach';
    state.coaches = [{ uid: 'test-coach', displayName: 'Test Coach' }];
    cd392CourtWarning(TODAY, 10);
  });
  await page.getByRole('button', { name: 'รับทราบ', exact: true }).click();
  const messages = [];
  page.on('dialog', async dialog => { messages.push(dialog.message()); await dialog.dismiss(); });
  await page.getByRole('button', { name: 'ยืนยันสนาม', exact: true }).click();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toContain('กรุณาเลือกสนาม');
  await page.locator('#bookingVenueSelect').selectOption('visda');
  await page.getByRole('button', { name: 'ยืนยันสนาม', exact: true }).click();
  await expect.poll(() => messages.length).toBe(2);
  expect(messages[1]).toContain('กรุณายืนยัน');
  await page.locator('#bookingVenueSelect').selectOption('other');
  await expect(page.locator('#otherVenueBox')).not.toBeEmpty();
  await page.locator('#bookingVenueSelect').selectOption('visda');
  await expect(page.locator('#otherVenueBox')).toBeEmpty();
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});

test('non-booking location sheet keeps dynamically inserted form controls usable', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  const { pageErrors } = await openIsolatedApp(page);
  await page.evaluate(() => c47Location());
  await page.getByRole('button', { name: 'เลือกพื้นที่ด้วยตนเอง', exact: true }).click();
  await page.locator('#c47Province').fill('กรุงเทพมหานคร');
  await page.locator('#c47District').fill('จตุจักร');
  await page.getByRole('button', { name: 'ใช้พื้นที่นี้', exact: true }).click();
  await expect(page.locator('#sheetWrap')).toBeHidden();
  expect(await page.evaluate(() => localStorage.getItem('coachDiSearchArea'))).toBe('กรุงเทพมหานคร จตุจักร');
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});

for (const section of ['mybookings', 'history', 'profile', 'chat']) {
  test(`athlete ${section} page renders with existing mock records`, async ({ page }) => {
    const { pageErrors, missingAssets } = await openIsolatedApp(page);
    await page.evaluate(section => {
      state.role = 'athlete';
      state.user = { uid: 'test-athlete', email: 'athlete@example.invalid', displayName: 'Test Athlete' };
      testAuth.currentUser = state.user;
      state.allAthleteBookings = [
        { id: 'future-booking', coachId: 'test-coach', athleteId: 'test-athlete', date: isoAdd(TODAY, 1), start: 10, end: 11, status: 'confirmed', venue: 'Test Court' },
        { id: 'past-booking', coachId: 'test-coach', athleteId: 'test-athlete', date: isoAdd(TODAY, -1), start: 10, end: 11, status: 'confirmed', venue: 'History Court' }
      ];
      state.coaches = [{ uid: 'test-coach', displayName: 'Test Coach' }];
      loginView.classList.add('hidden'); portal.classList.remove('hidden');
      showAthleteMenu(section);
    }, section);
    await expect(page.locator('#s40AthleteDynamic')).toBeVisible();
    if (section === 'mybookings') await expect(page.locator('#s40AthleteDynamic')).toContainText('Test Court');
    if (section === 'history') await expect(page.locator('#s40AthleteDynamic')).toContainText('History Court');
    if (section === 'profile') await expect(page.locator('#athleteDisplayName')).toBeVisible();
    if (section === 'chat') await expect(page.locator('#s40ChatHost')).not.toBeEmpty();
    expect(pageErrors).toEqual([]);
    expect(missingAssets).toEqual([]);
  });
}

test('browser coach share link keeps the current web origin', async ({ page }) => {
  await openIsolatedApp(page);
  const url = await page.evaluate(() => { state.coachProfile = { coachDiId: 'CD-TEST' }; return c72CoachBookingUrl(); });
  expect(url).toBe('http://127.0.0.1:4173/?portal=athlete&coach=CD-TEST');
});
