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

test('booking chat uses one App Check callable and never creates client-side messages or notifications', async ({ page }) => {
  await openIsolatedApp(page);
  await page.evaluate(() => {
    state.role = 'athlete'; state.user = { uid: 'test-athlete' }; testAuth.currentUser = state.user;
    const booking = { id: 'chat-booking', athleteId: 'test-athlete', coachId: 'test-coach', athlete: 'Athlete Test', coachName: 'Coach Test' };
    state.bookings = [booking]; state.allAthleteBookings = [booking]; s40ChatBookingId = booking.id;
    document.body.insertAdjacentHTML('beforeend', '<div id="chat-test"><input id="s40ChatInput" value="ข้อความทดสอบ"><button onclick="s40SendMessage()">ส่ง</button></div>');
  });
  await page.locator('#chat-test button').dblclick();
  await expect.poll(() => page.evaluate(() => testFunctionCalls.filter(call => call.name === 'sendBookingChatMessage').length)).toBe(1);
  const result = await page.evaluate(() => ({
    value: document.getElementById('s40ChatInput').value,
    call: testFunctionCalls.find(call => call.name === 'sendBookingChatMessage'),
    clientWrites: testWrites.filter(write => !write.backend && (/^bookingChats\//.test(write.path) || /^notifications\//.test(write.path))),
  }));
  expect(result.value).toBe(''); expect(result.call.data.bookingId).toBe('chat-booking'); expect(result.call.data.text).toBe('ข้อความทดสอบ'); expect(result.clientWrites).toEqual([]);
});

test('support chat uses one App Check callable and never creates client-side messages or Admin alerts', async ({ page }) => {
  await openIsolatedApp(page);
  await page.evaluate(() => {
    state.role = 'athlete'; state.user = { uid: 'test-athlete' }; testAuth.currentUser = state.user;
    document.body.insertAdjacentHTML('beforeend', '<div id="support-test"><input id="cdSupportInput395" value="ขอความช่วยเหลือ"><button onclick="cd395SendSupport()">ส่ง</button></div>');
  });
  await page.locator('#support-test button').dblclick();
  await expect.poll(() => page.evaluate(() => testFunctionCalls.filter(call => call.name === 'sendSupportChatMessage').length)).toBe(1);
  const result = await page.evaluate(() => ({
    value: document.getElementById('cdSupportInput395').value,
    call: testFunctionCalls.find(call => call.name === 'sendSupportChatMessage'),
    clientWrites: testWrites.filter(write => !write.backend && (/^supportChats\//.test(write.path) || /^adminSupportNotifications\//.test(write.path) || /^notifications\//.test(write.path))),
  }));
  expect(result.value).toBe(''); expect(result.call.data.threadUid).toBe('test-athlete'); expect(result.call.data.text).toBe('ขอความช่วยเหลือ'); expect(result.clientWrites).toEqual([]);
});

test('direct chat send and delete use App Check commands without client-side message writes', async ({ page }) => {
  await openIsolatedApp(page);
  page.on('dialog', dialog => dialog.accept());
  await page.evaluate(() => {
    state.role = 'athlete'; state.user = { uid: 'test-athlete' }; testAuth.currentUser = state.user;
    state.allAthleteBookings = [{ id: 'direct-booking', athleteId: 'test-athlete', coachId: 'test-coach', coachName: 'Coach Test', createdAt: 1 }];
    document.body.insertAdjacentHTML('beforeend', '<div class="s41LineConv active"></div><div class="s41Composer"><input id="s41LineInput" value="ข้อความถึงโค้ช"><button class="s41Send" onclick="s41SendLineMessage()">ส่ง</button></div>');
  });
  await page.locator('.s41Send').dblclick();
  await expect.poll(() => page.evaluate(() => testFunctionCalls.filter(call => call.name === 'executeDirectChatCommand').length)).toBe(1);
  await page.evaluate(() => c50DeleteMessage('test-coach', 'test-athlete', 'message-1'));
  await expect.poll(() => page.evaluate(() => testFunctionCalls.filter(call => call.name === 'executeDirectChatCommand').length)).toBe(2);
  const result = await page.evaluate(() => ({
    value: document.getElementById('s41LineInput').value,
    calls: testFunctionCalls.filter(call => call.name === 'executeDirectChatCommand'),
    clientWrites: testWrites.filter(write => !write.backend && /^userChats\//.test(write.path)),
  }));
  expect(result.value).toBe('');
  expect(result.calls[0].data).toMatchObject({ action: 'send', coachId: 'test-coach', athleteId: 'test-athlete', bookingId: 'direct-booking', text: 'ข้อความถึงโค้ช' });
  expect(result.calls[1].data).toMatchObject({ action: 'delete', coachId: 'test-coach', athleteId: 'test-athlete', messageId: 'message-1' });
  expect(result.clientWrites).toEqual([]);
});
