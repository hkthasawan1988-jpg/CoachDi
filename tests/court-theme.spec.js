const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');
async function athlete(page,section='home'){
  await page.evaluate(section=>{
    state.role='athlete';state.user={uid:'court-athlete',email:'fixture@example.test'};testAuth.currentUser=state.user;
    state.userProfile={role:'athlete',displayName:'มะลิ นักกีฬาทดสอบ',nameEn:'Mali',photoURL:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6WQAAAAASUVORK5CYII='};
    localStorage.setItem('coachDiLocationConsent','denied');state.availability={start:8,end:20};state.weekStart=TODAY;
    state.coachId='fixture-coach';state.coaches=[{uid:'fixture-coach',displayName:'โค้ชทดสอบ',status:'active'}];
    state.venues=[{id:'venue-one',name:'สนามเทนนิสชื่อภาษาไทยยาวสำหรับทดสอบจอกาง',openStart:8,openEnd:22}];
    state.coachLocations=[{id:'location',date:isoAdd(TODAY,1),start:9,end:11,venueId:'venue-one'}];
    state.venues.push({id:'tropp',name:'Tropp Tennis Club',openStart:8,openEnd:22});state.coachLocations.push({id:'tropp-location',date:isoAdd(TODAY,3),start:9,end:10,venueId:'tropp'});
    state.cdPublicBookings=[{date:isoAdd(TODAY,2),start:10,end:11,venueName:'VISDA Premium Tennis Club',venueId:'visda',active:true}];
    loginView.classList.add('hidden');portal.classList.remove('hidden');logoutBtn.classList.remove('hidden');renderNav();c91InstallHelp();showAthleteMenu(section);
  },section);
}
async function calendar(page){
  await athlete(page);
  await page.evaluate(()=>{
    cd392ApplyFlow('profile');state.coachId='fixture-coach';
    for(const child of athletePage.children)child.style.display='none';
    document.querySelector('#athletePage>.athleteTabs').style.display='flex';
    document.getElementById('coachBookingTab').style.display='block';document.querySelector('#athletePage .scheduleShell').style.display='block';
    renderSchedule();c95InstallAdInquiry();
  });
}
for(const width of [320,360,390,412,656])test(`seven Monday–Sunday columns and venue legend fit ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.clock.install({time:new Date('2026-09-09T12:00:00+07:00')});const {pageErrors}=await openIsolatedApp(page,true);await calendar(page);
  await expect(page.locator('#scheduleTable .dayHead')).toHaveCount(7);await expect(page.locator('#scheduleTable .dow')).toHaveText(['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.']);
  const metrics=await page.locator('#scheduleTable').evaluate(el=>({width:el.getBoundingClientRect().width,scroll:el.closest('.tableScroller').scrollWidth,client:el.closest('.tableScroller').clientWidth}));
  expect(metrics.width).toBeLessThanOrEqual(width);expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await expect(page.locator('#cdWeekVenues')).toContainText('VISDA Premium Tennis Club');await expect(page.locator('#cdWeekVenues')).toContainText('สนามเทนนิสชื่อภาษาไทยยาว');
  const tropp=page.locator('#scheduleTable .daySlot[title="Tropp Tennis Club"]').first();await expect(tropp.locator('.venue')).toHaveText('Tro');await tropp.click();await expect(page.locator('#sheetContent')).toContainText('Tropp Tennis Club');await page.evaluate(()=>closeSheet());
  const booked=page.locator('#scheduleTable .daySlot.booked').first();await expect(booked.locator('.venue')).toHaveText('Visda');await booked.click();await expect(page.locator('#sheetContent')).toContainText('VISDA Premium Tennis Club');
  expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});
test('calendar moves by full weeks, retains Monday alignment and never books a past date',async({page})=>{
  await page.clock.install({time:new Date('2026-09-09T12:00:00+07:00')});await openIsolatedApp(page);await calendar(page);
  expect(await page.evaluate(()=>state.weekStart)).toBe('2026-09-07');
  await page.locator('[data-cd-slot="2026-09-07"]').first().click();await expect(page.locator('#sheetContent')).toContainText('ผ่านวันจองแล้ว');
  expect(await page.evaluate(()=>state.selectedCell)).toBeFalsy();await page.evaluate(()=>closeSheet());
  await page.getByRole('button',{name:'สัปดาห์ถัดไป',exact:true}).click();expect(await page.evaluate(()=>state.weekStart)).toBe('2026-09-14');
  await page.getByRole('button',{name:'สัปดาห์ก่อนหน้า',exact:true}).click();expect(await page.evaluate(()=>state.weekStart)).toBe('2026-09-07');
  await expect(page.getByRole('button',{name:'สัปดาห์ก่อนหน้า',exact:true})).toBeDisabled();
  await page.locator('[data-cd-slot="2026-09-09"][data-cd-hour="18"]').click();expect(await page.evaluate(()=>state.selectedCell.date)).toBe('2026-09-09');
  expect(await page.evaluate(()=>testWrites)).toEqual([]);
});
test('bottom navigation has text only and keeps notification counts and routes',async({page})=>{
  await page.setViewportSize({width:390,height:844});const {pageErrors}=await openIsolatedApp(page,true);await athlete(page);
  await page.evaluate(()=>{state.s40NotifCount=3;c110PaintMobileNotification();c92SyncMobileNav();});
  await expect(page.locator('#mobileNav>button>span')).toHaveCount(0);await expect(page.locator('#mobileNav .c95SideBadge')).toHaveText('3');
  await page.locator('#mobileNav [data-athlete-mobile="mybookings"]').click();await expect(page.locator('#s40AthleteDynamic')).toHaveAttribute('data-page','mybookings');
  await page.locator('#mobileNav .c92More').click();await expect(page.locator('#athleteProfilePanel')).toBeVisible();await expect(page.locator('#mobileNav .c92More')).toHaveAccessibleName('ตั้งค่า');expect(pageErrors).toEqual([]);
});
for(const native of [false,true])test(`athlete profile shows the saved photo and name in a round portrait (${native?'app':'web'})`,async({page})=>{
  await page.setViewportSize({width:320,height:740});const {pageErrors}=await openIsolatedApp(page,native);await athlete(page,'profile');
  await expect(page.locator('.cdPlayerHero h1')).toHaveText('มะลิ นักกีฬาทดสอบ');await expect(page.locator('.cdPlayerAvatar img')).toHaveAttribute('alt','รูปโปรไฟล์ มะลิ นักกีฬาทดสอบ');
  const avatar=await page.locator('.cdPlayerAvatar').evaluate(el=>({radius:getComputedStyle(el).borderRadius,w:el.getBoundingClientRect().width,h:el.getBoundingClientRect().height}));
  expect(avatar.radius).toBe('50%');expect(avatar.w).toBe(avatar.h);await expect(page.locator('#athleteDisplayName')).toHaveValue('มะลิ นักกีฬาทดสอบ');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});

test('outline bell really enables and disables native notifications and stays off on resume',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page,true,'/',true);await athlete(page);
  await page.evaluate(()=>{document.getElementById('cdNativePushButton').hidden=false;});
  const toggle=page.getByRole('switch',{name:'การแจ้งเตือนแอป'});
  await expect(toggle.locator('svg')).toHaveCount(1);await expect(toggle).toHaveText('ปิด');
  await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','true');await expect(toggle).toHaveText('เปิด');
  expect(await page.evaluate(()=>testNativeSession.enabled)).toBe(true);
  await toggle.click();await expect(toggle).toHaveAttribute('aria-checked','false');await expect(toggle).toHaveText('ปิด');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  expect(await page.evaluate(()=>testNativeSession.enabled)).toBe(false);
  expect(await page.evaluate(()=>testPushCalls)).toEqual(['permission','register']);
  expect(await page.evaluate(()=>localStorage.getItem('coachdi-push-preference:v1:court-athlete'))).toBe('off');
  expect(await page.evaluate(()=>testWrites.every(write=>write.path.startsWith('fcmTokens/')))).toBe(true);expect(pageErrors).toEqual([]);
});
