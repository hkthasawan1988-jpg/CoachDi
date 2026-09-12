const { test, expect } = require('@playwright/test');
const { openIsolatedApp } = require('./helpers/app');

test('booking submit uses the App Check callable once and performs no critical client write', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await openIsolatedApp(page);
  await page.evaluate(() => {
    state.role = 'athlete';
    state.user = { uid: 'test-athlete', email: 'test@example.invalid' };
    testAuth.currentUser = state.user;
    state.coachId = 'test-coach';
    state.selectedDate = '2026-10-10';
    state.selectedCell = { date: '2026-10-10', h: 10, venueId: 'visda' };
    state.venues = [{ id: 'visda', name: 'สนามทดสอบ' }];
    state.pricing = { p60: 10000 };
    showAthleteMenu = () => {};
    sheetContent.innerHTML = '<button id="submit" onclick="createBooking(\'visda\',10)">ส่งคำขอ</button>';
    sheetWrap.classList.remove('hidden');
  });
  await page.locator('#submit').dblclick();
  await expect.poll(() => page.evaluate(() => testFunctionCalls.filter(call => call.name === 'createBookingCommand').length)).toBe(1);
  expect(await page.evaluate(() => testWrites.filter(write => !write.backend && (write.path === '' || String(write.path).startsWith('bookings/'))).length)).toBe(0);
  await expect(page.locator('#inlineBookingTicket')).toContainText('ส่งคำขอจองให้ Coach แล้ว');
  await expect(page.locator('#inlineBookingTicket')).not.toContainText('หลักฐาน');
});

test('refund request is executed by the athlete callable and stores only the private account client-side', async ({ page }) => {
  await openIsolatedApp(page);
  await page.evaluate(() => {
    state.role = 'athlete'; state.user = { uid: 'test-athlete' }; testAuth.currentUser = state.user;
    const date = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const booking = { id: 'refund-booking', athleteId: 'test-athlete', coachId: 'test-coach', date, start: 10, end: 11,
      venueId: 'visda', venue: 'สนามทดสอบ', status: 'declined', paymentStatus: 'payment_verified' };
    state.bookings = [booking]; state.allAthleteBookings = [booking]; testData['bookings/refund-booking'] = booking;
    CoachDiRefunds.openRecovery('refund-booking');
  });
  await page.locator('#cdrBank').fill('ธนาคารทดสอบ');
  await page.locator('#cdrAccountName').fill('นักกีฬา ทดสอบ');
  await page.locator('#cdrAccountNumber').fill('001-234-5678');
  await page.locator('#cdrConfirmAccount').check();
  await page.locator('[data-cdr="submit-refund"]').dblclick();
  await expect.poll(() => page.evaluate(() => testFunctionCalls.filter(call => call.name === 'executeAthleteBookingCommand').length)).toBe(1);
  const clientWrites = await page.evaluate(() => testWrites.filter(write => !write.transaction));
  expect(clientWrites.map(write => write.path)).toEqual(['users/test-athlete/refundAccount']);
});
