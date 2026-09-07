const { test, expect } = require('@playwright/test');

async function openIsolatedApp(page) {
  // All external traffic is blocked: these tests cannot reach Production Firebase.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.fulfill({ status: 200, body: '', contentType: 'text/javascript' });
  });
  await page.addInitScript(() => {
    window.testWrites = [];
    const snapshot = value => ({ val: () => value, exists: () => value != null, forEach: () => false });
    const ref = path => ({
      key: 'test-key',
      child: name => ref(`${path}/${name}`),
      once: async () => snapshot(path.startsWith('users/') ? { displayName: 'Test Athlete', phone: '0800000000' } : null),
      on: () => {}, off: () => {},
      orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
      push: () => ref(`${path}/test-key`),
      set: async value => { window.testWrites.push({ path, value }); },
      update: async value => { window.testWrites.push({ path, value }); await new Promise(resolve => setTimeout(resolve, 80)); },
      remove: async () => { window.testWrites.push({ path, remove: true }); },
      transaction: async () => ({ committed: true, snapshot: snapshot(null) }),
    });
    const auth = { currentUser: null, onAuthStateChanged: () => () => {}, setPersistence: async () => {}, signOut: async () => {} };
    const authFn = () => auth;
    authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
    const database = () => ({ ref: path => ref(path || '') });
    database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
    window.firebase = { initializeApp: () => ({}), apps: [], auth: authFn, database };
  });
  await page.goto('/');
  await expect(page.locator('#loginView')).toBeVisible();
}

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
