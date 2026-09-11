const { test, expect } = require('@playwright/test');
const { openIsolatedApp } = require('./helpers/app');

async function restoreAdmin(page) {
  const evidence = await openIsolatedApp(page, false, '/index.html?portal=admin');
  await page.evaluate(async () => {
    const date = CoachDiBackofficeCore.today();
    const data = {
      users: {
        'admin-fixture': { role: 'admin', status: 'active', displayName: 'Test Admin' },
        'coach-fixture': { role: 'coach', status: 'active', displayName: 'Test Coach' },
        'athlete-fixture': { role: 'athlete', status: 'active', displayName: 'Test Athlete' },
        'athlete-two': { role: 'athlete', status: 'active', displayName: 'Another Athlete' },
      },
      coachProfiles: { 'coach-fixture': { displayName: 'Test Coach', coachDiId: 'ID_TEST', status: 'active', sport: 'tennis' } },
      bookings: { 'booking-fixture': { coachId: 'coach-fixture', athleteId: 'athlete-fixture', athleteName: 'Test Athlete', date, start: '09:00', end: '10:00', venueName: 'Booking Test Venue', status: 'confirmed', price: 500, createdAt: Date.now() } },
      coachGroupClasses: { 'coach-fixture': { 'class-fixture': { title: 'Test Group Class', date, start: '12:00', end: '13:00', venueName: 'Group Test Venue', status: 'open' } } },
      coachPublicSchedule: { 'coach-fixture': { 'manual-fixture': { date, start: 15, end: 16, venueName: 'Manual Test Venue' } } },
      hittingPartnerProfiles: {}, omiseSubscriptionPayments: {}, paymentTransactions: {},
    };
    Object.assign(testData, data);
    for (const [uid, user] of Object.entries(data.users)) testData['users/' + uid] = user;
    testData['appConfig/pilotCoachId'] = 'coach-fixture';
    window.testRealtimeValues = data;
    testAuth.currentUser = { uid: 'admin-fixture', email: 'admin@example.invalid' };
    // Exercise the actual restore, loadFirebaseData and enterPortal wrappers.
    await testAuthListeners[0](testAuth.currentUser);
  });
  await expect(page.locator('#portal')).toBeVisible();
  await expect(page.locator('#cdTransactions')).toBeVisible();
  return evidence;
}

test('restored desktop Admin keeps grouped navigation, customer summary and coach summaries', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const { pageErrors, missingAssets } = await restoreAdmin(page);
  await expect(page.locator('#sidebar .bo-nav-section')).toHaveText(['บริหารการเงิน', 'บริหารจัดการคน', 'จัดการระบบ']);
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('2 คน');
  await expect(page.locator('#cdTxCoaches')).toContainText('Test Coach');
  await expect(page.locator('#boIncomeGraph')).toBeVisible();
  const sectionColor = await page.locator('#sidebar .bo-nav-section').first().evaluate(el => getComputedStyle(el).color);
  expect(sectionColor).toBe('rgb(101, 65, 138)');
  await page.locator('#sidebar [data-admin-page="schedule"]').click();
  await expect(page.locator('.bo-day')).toHaveCount(5);
  for (const venue of ['Booking Test Venue', 'Group Test Venue', 'Manual Test Venue']) {
    await expect(page.locator('.bo-calendar')).toContainText(venue);
  }
  await page.locator('#sidebar [data-admin-page="finance"]').click();
  await expect(page.getByRole('heading', { name: 'การเงินของ Platform', exact: true })).toBeVisible();
  await page.locator('#sidebar [data-admin-page="overview"]').click();
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('2 คน');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1440);
  expect(await page.evaluate(() => testWrites.filter(w => /^(bookings|paymentTransactions|coachGroupClasses|coachPublicSchedule)\//.test(w.path)))).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(missingAssets).toEqual([]);
});

test('restored mobile Admin exposes the same summaries and readable coach schedule', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { pageErrors } = await restoreAdmin(page);
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('2 คน');
  await expect(page.locator('#cdTxCoaches')).toContainText('Test Coach');
  await page.evaluate(() => s41ShowAdmin('schedule'));
  await expect(page.locator('.bo-day')).toHaveCount(5);
  await expect(page.locator('.bo-calendar')).toContainText('Manual Test Venue');
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(pageErrors).toEqual([]);
});
