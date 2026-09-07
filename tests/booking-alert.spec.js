const { test, expect } = require('@playwright/test');

const { openIsolatedApp } = require('./helpers/app');

async function warning(page, text = 'โค้ชทดสอบ') {
  await page.evaluate(name => {
    state.coachId = 'test-coach';
    state.coaches = [{ uid: 'test-coach', displayName: name }];
    state.venues = [{ id: 'visda', name: 'สนามทดสอบ', openStart: 6, openEnd: 24 }];
    cd392CourtWarning('2026-10-10', 10);
  }, text);
  await expect(page.locator('#sheetContent > .cdSheetBody')).toBeVisible();
}

for (const width of [320, 360, 390, 412]) {
  test(`Thai warning keeps acknowledgement visible at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 568 });
    await openIsolatedApp(page);
    await warning(page, 'โค้ชภาษาไทยชื่อยาวมากพร้อมรายละเอียดสนามและเงื่อนไขการเดินทาง'.repeat(35));
    const body = page.locator('.cdSheetBody');
    const button = page.getByRole('button', { name: 'รับทราบ', exact: true });
    const initial = await button.boundingBox();
    expect(initial.y).toBeGreaterThanOrEqual(0);
    expect(initial.y + initial.height).toBeLessThanOrEqual(568);
    expect(initial.x).toBeGreaterThanOrEqual(0);
    expect(initial.x + initial.width).toBeLessThanOrEqual(width);
    expect(await body.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
    expect((await button.boundingBox()).y).toBeCloseTo(initial.y, 0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await button.click();
    await expect(page.getByRole('heading', { name: 'เลือกสนามที่ยืนยันแล้ว' })).toBeVisible();
    await expect(page.locator('#bookingVenueSelect')).toHaveCount(1);
    expect(await page.evaluate(() => testWrites.length)).toBe(0);
  });
}

test('safe areas, short landscape screen and viewport resize keep the footer reachable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 320 });
  await openIsolatedApp(page);
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-area-inset-top', '24px');
    document.documentElement.style.setProperty('--safe-area-inset-bottom', '34px');
  });
  await warning(page, 'รายละเอียด'.repeat(300));
  for (const height of [320, 260, 568]) {
    await page.setViewportSize({ width: 390, height });
    const button = page.getByRole('button', { name: 'รับทราบ', exact: true });
    await expect.poll(async () => (await button.boundingBox()).y + (await button.boundingBox()).height).toBeLessThanOrEqual(height - 34);
    expect((await button.boundingBox()).y).toBeGreaterThanOrEqual(24);
  }
});

test('reopening the alert preserves single controls, focus and no booking writes', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openIsolatedApp(page);
  await page.locator('#loginBtn').focus();
  for (let count = 0; count < 4; count++) {
    await warning(page);
    await expect(page.locator('.cdSheetBody')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'รับทราบ', exact: true })).toHaveCount(1);
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/cd-overlay-open/);
  }
  await expect(page.locator('#loginBtn')).toBeFocused();
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});

test('the existing submit handler runs once on rapid double click', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openIsolatedApp(page);
  await page.evaluate(() => {
    state.role = 'athlete'; state.user = { uid: 'test-athlete', email: 'test@example.invalid' };
    state.coachId = 'test-coach'; state.selectedDate = '2026-10-10';
    state.selectedCell = { date: '2026-10-10', h: 10, venueId: 'visda' };
    state.venues = [{ id: 'visda', name: 'สนามทดสอบ' }]; state.pricing = { p60: 10000 };
    // Avoid unrelated post-success rendering; the original submit and write functions run.
    showAthleteMenu = () => {};
    sheetContent.innerHTML = '<h2>ส่งคำขอจอง</h2><div class="sheetActions"><button id="testSubmit" onclick="c65CreateVenuePayBooking(\'visda\',10,this)">ส่งคำขอ</button></div>';
    sheetWrap.classList.remove('hidden');
  });
  await page.locator('#testSubmit').dblclick();
  await expect.poll(() => page.evaluate(() => testWrites.filter(w => Object.keys(w.value || {}).some(k => k.startsWith('bookings/'))).length)).toBe(1);
  await expect(page.locator('#sheetWrap')).toBeHidden();
  const writes = await page.evaluate(() => testWrites.filter(w => Object.keys(w.value || {}).some(k => k.startsWith('bookings/'))));
  expect(Object.keys(writes[0].value).filter(k => k.startsWith('bookings/'))).toHaveLength(1);
});

test('booking tags and long Thai tickets stay inside the mobile viewport', async ({ page }) => {
  await openIsolatedApp(page);
  await page.evaluate(() => {
    loginView.classList.add('hidden');
    portal.classList.remove('hidden');
    athletePage.classList.remove('hidden');
    c94SetAlert(document.getElementById('courtTabBtn'), 125);
    showBookingSuccessTicket('test-booking', {
      date: '2026-10-10', start: 10, end: 11,
      venue: 'สนามเทนนิสชื่อภาษาไทยยาวมากพร้อมรายละเอียด'.repeat(35)
    });
  });
  for (const width of [320, 360, 390, 412]) {
    await page.setViewportSize({ width, height: 640 });
    const button = await page.locator('#courtTabBtn').boundingBox();
    const badge = await page.locator('#courtTabBtn > .c94Badge').boundingBox();
    expect(badge.x).toBeGreaterThanOrEqual(button.x);
    expect(badge.y).toBeGreaterThanOrEqual(button.y);
    expect(badge.x + badge.width).toBeLessThanOrEqual(button.x + button.width);
    expect(badge.y + badge.height).toBeLessThanOrEqual(button.y + button.height);
    const ticket = page.locator('#inlineBookingTicket');
    expect(await ticket.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});

test('native app shares a public coach URL and keeps Web Push hidden', async ({ page }) => {
  await openIsolatedApp(page, true);
  await expect(page.locator('html')).toHaveClass(/cd-native/);
  const url = await page.evaluate(() => {
    state.coachProfile = { coachDiId: 'CD-TEST-001' };
    const button = document.getElementById('c105PushButton');
    button.classList.remove('hidden');
    document.body.append(button);
    return c72CoachBookingUrl();
  });
  expect(url).toBe('https://coach-di.netlify.app/?portal=athlete&coach=CD-TEST-001');
  await expect(page.locator('#c105PushButton')).toBeHidden();
  expect(await page.evaluate(() => testWrites.length)).toBe(0);
});
