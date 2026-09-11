const { test, expect } = require('@playwright/test');
const { openIsolatedApp } = require('./helpers/app');
async function coach(page, section = 'messages') {
  await page.evaluate(section => {
    state.role = 'coach'; state.user = {uid:'test-coach'}; testAuth.currentUser = state.user;
    state.coachProfile = {displayName:'โค้ชทดสอบ'}; state.subscription = {trialEndsAt:Date.now()+86400000};
    state.bookings = [
      {id:'booking-one',coachId:'test-coach',athleteId:'athlete-one',athlete:'นักกีฬาชื่อภาษาไทยที่ยาวมากเพื่อทดสอบการตัดบรรทัด',date:TODAY,start:15,end:16,status:'confirmed',venue:'สนามที่นักกีฬาจองเอง'},
      {id:'booking-two',coachId:'test-coach',athleteId:'athlete-two',athlete:'นักกีฬาคนที่สอง',date:TODAY,start:17,end:18,status:'confirmed',venue:'สนามที่สอง'}];
    state.s42CoachBookings = state.bookings; state.c71CoachAppointments = [];
    state.s42View='today'; state.s42Date=TODAY;
    window.testRealtimeValues = {
      'userChats/test-coach/athlete-one/messages':{one:{senderId:'athlete-one',text:'ข้อความภาษาไทยยาว'.repeat(40),createdAt:1}},
      'userChats/test-coach/athlete-two/messages':{two:{senderId:'athlete-two',text:'ข้อความจากคนที่สอง',createdAt:2}}
    };
    loginView.classList.add('hidden'); portal.classList.remove('hidden'); renderNav(); showCoach(section);
  },section);
}
for (const width of [320,360,390,412,768]) {
  test(`coach chat has left inbox and right messages at ${width}px with long Thai`, async ({page}) => {
    await page.setViewportSize({width,height:740});
    const {pageErrors}=await openIsolatedApp(page,true); await coach(page);
    await expect(page.locator('#c43input')).toBeVisible();
    await expect(page.locator('#c43msgs')).toContainText('ข้อความภาษาไทยยาว');
    const metrics=await page.evaluate(()=>{
      const a=document.querySelector('.c43inbox').getBoundingClientRect(),b=document.getElementById('c43thread').getBoundingClientRect(),input=document.getElementById('c43input').getBoundingClientRect();
      return {left:a.right,right:b.left,topA:a.top,topB:b.top,bottom:input.bottom,width:innerWidth,scroll:document.documentElement.scrollWidth,font:parseFloat(getComputedStyle(document.getElementById('c43input')).fontSize)};
    });
    expect(metrics.right).toBeGreaterThanOrEqual(metrics.left-2); expect(Math.abs(metrics.topA-metrics.topB)).toBeLessThan(3);
    expect(metrics.bottom).toBeLessThanOrEqual(740); expect(metrics.scroll).toBeLessThanOrEqual(width); expect(metrics.font).toBeGreaterThanOrEqual(16);
    await page.locator('#c43input').fill('ข้อความที่ยังไม่ส่ง');
    await page.locator('[data-chat-user="athlete-two"]').click(); await expect(page.locator('#c43msgs')).toHaveText('ข้อความจากคนที่สอง');
    await page.locator('[data-chat-user="athlete-one"]').click(); await expect(page.locator('#c43input')).toHaveValue('ข้อความที่ยังไม่ส่ง');
    await page.locator('#c45ChatSearch').fill('คนที่สอง'); await expect(page.locator('#c43list button')).toHaveCount(1);
    expect(await page.evaluate(()=>testWrites.length)).toBe(0); expect(pageErrors).toEqual([]);
  });
}
test('chat remains usable when resizing from folded to unfolded and a short keyboard viewport',async({page})=>{
  await page.setViewportSize({width:390,height:800}); await openIsolatedApp(page,true); await coach(page);
  await page.locator('#c43input').fill('เก็บข้อความระหว่างกางจอ');
  for(const viewport of [{width:768,height:900},{width:390,height:480}]){
    await page.setViewportSize(viewport); await expect(page.locator('#c43input')).toHaveValue('เก็บข้อความระหว่างกางจอ');
    await expect.poll(()=>page.locator('#c43input').evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(viewport.height);
  }
});
test('athlete chat is side by side and composer fits at 320px',async({page})=>{
  await page.setViewportSize({width:320,height:740}); await openIsolatedApp(page,true);
  await page.evaluate(()=>{
    state.role='athlete';state.user={uid:'test-athlete'};testAuth.currentUser=state.user;
    state.allAthleteBookings=[{id:'b',coachId:'coach',athleteId:'test-athlete',coachName:'โค้ชชื่อยาวมาก',date:TODAY,start:10,end:11,venue:'สนาม'}];
    state.coaches=[{uid:'coach',displayName:'โค้ชชื่อยาวมาก'}];
    loginView.classList.add('hidden');portal.classList.remove('hidden');showAthleteMenu('chat');
  });
  await expect(page.locator('#s41LineInput')).toBeVisible();
  const m=await page.evaluate(()=>({left:document.querySelector('.s41LineInbox').getBoundingClientRect().right,right:document.getElementById('s41LineThread').getBoundingClientRect().left,bottom:document.getElementById('s41LineInput').getBoundingClientRect().bottom,width:document.documentElement.scrollWidth}));
  expect(m.right).toBeGreaterThanOrEqual(m.left-2); expect(m.bottom).toBeLessThanOrEqual(740);expect(m.width).toBeLessThanOrEqual(320);
});
test('click and drag select a coach appointment range without writes; save happens once',async({page})=>{
  await page.setViewportSize({width:412,height:915}); const {pageErrors}=await openIsolatedApp(page,true);await coach(page,'schedule');
  const from=page.locator('.cdGridCell[data-start="9"]'),to=page.locator('.cdGridCell[data-start="10"]');
  await from.scrollIntoViewIfNeeded();
  // Keep this range away from the auto-scroll edge so its coordinates stay fixed during the drag.
  await page.locator('.cdTimeGridScroll').evaluate(el=>{
    const target=el.querySelector('[data-start="9"]');
    el.scrollTop+=target.getBoundingClientRect().top-el.getBoundingClientRect().top-el.clientHeight/3;
  });
  const a=await from.boundingBox(),b=await to.boundingBox();
  await page.mouse.move(a.x+30,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+30,b.y+b.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('#c71Start')).toHaveValue('09:00');await expect(page.locator('#c71End')).toHaveValue('10:30');
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);
  await page.locator('#c71Venue').fill('สนามทดสอบลากตาราง');
  await page.evaluate(()=>{c71SaveAppointment('',document.getElementById('c71SaveBtn'));c71SaveAppointment('',document.getElementById('c71SaveBtn'));});
  await expect(page.locator('#csModalRoot')).toHaveCount(0);
  const writes=await page.evaluate(()=>testWrites.filter(w=>Object.keys(w.value||{}).some(k=>k.startsWith('coachPublicSchedule/'))));
  expect(writes).toHaveLength(1);const record=Object.values(writes[0].value)[0];expect(record.start).toBe(9);expect(record.end).toBe(10.5);
  expect(await page.evaluate(()=>testWrites.some(w=>Object.keys(w.value||{}).some(k=>k.startsWith('bookings/'))))).toBe(false);expect(pageErrors).toEqual([]);
});
test('coach selection cannot drag through an existing booking and rechecks before save',async({page})=>{
  await openIsolatedApp(page,true);await coach(page,'schedule');
  await expect(page.locator('.cdGridCell[data-start="15"]')).toHaveAttribute('data-free','false');
  await expect(page.locator('.cdGridCell[data-start="15"]')).toContainText('สนามที่นักกีฬาจองเอง');
  await page.locator('.cdGridCell[data-start="9"]').click();
  await page.locator('#c71Venue').fill('สนามทดสอบ');
  await page.evaluate(()=>{testData.bookings={new:{date:TODAY,start:9,end:10,status:'confirmed'}};});
  const messages=[];page.on('dialog',async d=>{messages.push(d.message());await d.dismiss();});
  await page.locator('#c71SaveBtn').click();await expect.poll(()=>messages.length).toBe(1);expect(messages[0]).toContain('เวลาชน');
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);await expect(page.locator('#c71SaveBtn')).toBeEnabled();
});
test('public booked slots show venue in blue while private booking data stays absent',async({page})=>{
  await openIsolatedApp(page,true);
  const result=await page.evaluate(()=>{
    state.role='athlete';state.coachId='coach';state.cdPublicBookings=[{date:TODAY,start:10,end:11,venueName:'สนามของการจองอื่น',venueId:'other',active:true}];
    renderSchedule();return dayCellStatus(TODAY,10);
  });
  expect(result.type).toBe('booked');expect(result.label).toBe('สนามของการจองอื่น');
  await expect(page.locator('.daySlot.booked').first()).toHaveAttribute('title','สนามของการจองอื่น');
  await expect(page.locator('#cdWeekVenues')).toContainText('สนามของการจองอื่น');
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);
});

test('group class calendar cells open the group screen and cannot become an appointment',async({page})=>{
  await openIsolatedApp(page,true); await coach(page,'schedule');
  await page.evaluate(()=>{
    state.c76GroupClasses=[{id:'group-one',date:TODAY,start:10,end:11,status:'open',venueName:'สนามคลาสกลุ่ม'}];
    showCoach('schedule');
    window.testOpenedSection=''; showCoach=section=>{window.testOpenedSection=section;};
  });
  await expect(page.locator('.cdGridCell[data-start="10"]')).toHaveAttribute('data-free','false');
  await page.locator('[data-group-class="group-one"]').first().click();
  expect(await page.evaluate(()=>testOpenedSection)).toBe('groupclasses');
  expect(await page.evaluate(()=>testWrites.length)).toBe(0);
});

test('creating recurring appointments allocates separate IDs for every date',async({page})=>{
  await openIsolatedApp(page,true); await coach(page,'schedule');
  await page.evaluate(()=>{
    let sequence=0;const originalRef=db.ref.bind(db);
    db.ref=path=>{const ref=originalRef(path);if(path==='coachPublicSchedule/test-coach')ref.push=()=>({key:'new-'+(++sequence)});return ref;};
    c71OpenAppointment();
    document.getElementById('c71Date').value=TODAY;
    document.getElementById('c71Start').value='09:00';
    document.getElementById('c71End').value='10:00';
    document.getElementById('c71Venue').value='สนามประจำ';
    document.getElementById('c71Recurring').checked=true;
    document.getElementById('c71Until').value=isoAdd(TODAY,14);
  });
  await page.locator('#c71SaveBtn').click(); await expect(page.locator('#csModalRoot')).toHaveCount(0);
  const writes=await page.evaluate(()=>testWrites.filter(w=>Object.keys(w.value||{}).some(k=>k.startsWith('coachPublicSchedule/'))));
  expect(writes).toHaveLength(1);expect(Object.keys(writes[0].value)).toEqual(['coachPublicSchedule/test-coach/new-1','coachPublicSchedule/test-coach/new-2','coachPublicSchedule/test-coach/new-3']);
  expect(new Set(Object.values(writes[0].value).map(v=>v.date)).size).toBe(3);
});

test('phone calendar stays above navigation and view labels do not break into letters',async({page})=>{
  await page.setViewportSize({width:320,height:740});await openIsolatedApp(page,true);await coach(page,'schedule');
  await expect.poll(()=>page.locator('.cdTimeGridScroll').evaluate(el=>el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(740);
  const metrics=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,grid:document.querySelector('.cdTimeGridScroll').getBoundingClientRect().bottom,nav:document.getElementById('mobileNav').getBoundingClientRect().top,wrap:getComputedStyle(document.querySelector('.c43tab.active')).whiteSpace}));
  expect(metrics.scroll).toBeLessThanOrEqual(320);expect(metrics.grid).toBeLessThanOrEqual(metrics.nav);expect(metrics.wrap).toBe('nowrap');
});

for(const width of [320,360,390,412]) test(`native notification, guide and logout controls fit at ${width}px`,async({page})=>{
  await page.clock.install();
  await page.setViewportSize({width,height:740});const {pageErrors}=await openIsolatedApp(page,true,'/',true);await coach(page);
  await page.evaluate(async()=>{
    const user=testAuth.currentUser;
    // Firebase notifies every observer; listener order changes as features are added.
    // Seed an existing, active account so the real session/bootstrap observers can run.
    const subscription={status:'trial',trialEndsAt:Date.now()+30*86400000};
    // The legacy account bootstrap reads completion flags and subscription on the
    // parent user record; the flat database fixture must also seed the child read.
    testData[`users/${user.uid}`]={role:'coach',status:'active',displayName:'โค้ชทดสอบ',registrationComplete:true,subscription};
    testData[`coachProfiles/${user.uid}`]={coachDiId:'ID_TEST',displayName:'โค้ชทดสอบ',status:'active',registrationComplete:true};
    testData[`users/${user.uid}/subscription`]=subscription;
    testData[`legalAcceptances/${user.uid}/${C62_TERMS_VERSION}`]={acceptedAt:1};
    testRealtimeValues[`coachPublicSchedule/${user.uid}`]={};
    localStorage.setItem(c91GuideKey(),'seen');
    await Promise.all([...testAuthListeners].map(listener=>listener(user)));
  });
  // Finish delayed login observers before selecting the chat screen under test.
  await page.clock.runFor(3000);
  await expect(page.locator('#portal')).toBeVisible();
  await coach(page);
  const writesBefore = await page.evaluate(() => testWrites.length);
  await page.evaluate(()=>c91InstallHelp());
  await expect(page.locator('#cdNativePushButton')).toBeVisible();
  await expect(page.locator('#cdNativePushButton')).toContainText('ปิด');
  await expect(page.locator('#cdNativePushButton')).toHaveAttribute('role','switch');
  const metrics=await page.evaluate(()=>({width:document.documentElement.scrollWidth,buttons:[...document.querySelectorAll('.topbar button')].filter(e=>e.getClientRects().length).map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,bottom:r.bottom};}),header:document.querySelector('.topbar').getBoundingClientRect().bottom}));
  expect(metrics.width).toBeLessThanOrEqual(width); for(const b of metrics.buttons){expect(b.left).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);expect(b.bottom).toBeLessThanOrEqual(metrics.header);}
  await expect.poll(()=>page.locator('#c43input').evaluate(e=>e.getBoundingClientRect().bottom)).toBeLessThanOrEqual(740);
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate((base)=>testWrites.slice(base),writesBefore)).toEqual([]);
});
