const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');
async function setup(page,width=390){
  await page.setViewportSize({width,height:844});await page.clock.install({time:new Date('2026-09-09T12:00:00+07:00')});const result=await openIsolatedApp(page,true);
  await page.evaluate(()=>{
    state.role='coach';state.user={uid:'holiday-coach'};testAuth.currentUser=state.user;state.coachProfile={displayName:'โค้ชทดสอบ'};state.subscription={trialEndsAt:Date.now()+86400000};
    state.bookings=[];state.s42CoachBookings=[];state.c71CoachAppointments=[];state.c76GroupClasses=[];state.s42View='timeoff';state.s42Date=TODAY;
    testData['coachTimeOff/holiday-coach']={};testData.bookings={};testData['coachPublicSchedule/holiday-coach']={};testData['coachGroupClasses/holiday-coach']={};
    loginView.classList.add('hidden');portal.classList.remove('hidden');renderNav();showCoach('schedule');
  });
  await expect(page.locator('#cdOffForm')).toBeVisible();return result;
}
async function dates(page,start,end){await page.locator('#cdOffStart').fill(start);await page.locator('#cdOffEnd').fill(end);await page.locator('#cdOffEnd').blur();}
for(const width of [320,360,390,412,656])test(`coach drags multiple holiday days and commits one range at ${width}px`,async({page})=>{
  const {pageErrors}=await setup(page,width);const first=page.locator('[data-off-day="2026-09-14"]'),last=page.locator('[data-off-day="2026-09-17"]');
  await first.scrollIntoViewIfNeeded();const a=await first.boundingBox(),b=await last.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:8});await page.mouse.up();
  await expect(page.locator('#cdOffStart')).toHaveValue('2026-09-14');await expect(page.locator('#cdOffEnd')).toHaveValue('2026-09-17');await expect(page.locator('.cdOffSelected')).toHaveCount(4);
  expect(await page.evaluate(()=>testWrites)).toEqual([]);
  await page.evaluate(()=>{document.getElementById('cdOffForm').requestSubmit();document.getElementById('cdOffForm').requestSubmit();});
  await expect(page.locator('#cdOffMessage')).toContainText('บันทึกวันหยุดแล้ว');
  const writes=await page.evaluate(()=>testWrites);expect(writes).toHaveLength(1);expect(writes[0].path).toBe('coachTimeOff/holiday-coach');expect(writes[0].value['test-key']).toMatchObject({coachId:'holiday-coach',startDate:'2026-09-14',endDate:'2026-09-17',fullDay:true});
  await page.evaluate(()=>{state.s42View='week';state.s42Date='2026-09-14';showCoach('schedule');});
  await expect(page.locator('.cdGridCell[data-date="2026-09-14"][data-start="9"]')).toHaveAttribute('data-free','false');await expect(page.locator('.cdOffGridEvent').first()).toContainText('วันหยุด');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);expect(pageErrors).toEqual([]);
});
test('cross-month dates, edit and cancellation use the same holiday record',async({page})=>{
  await setup(page);await dates(page,'2026-12-30','2027-01-03');await page.locator('#cdOffSave').click();await expect(page.locator('#cdOffMessage')).toContainText('บันทึกวันหยุดแล้ว');
  await page.getByRole('button',{name:'แก้ไข',exact:true}).click();await expect(page.locator('#cdOffStart')).toHaveValue('2026-12-30');
  await dates(page,'2026-12-30','2027-01-05');await page.locator('#cdOffSave').click();await expect(page.locator('#cdOffMessage')).toContainText('บันทึกวันหยุดแล้ว');
  expect(await page.evaluate(()=>Object.keys(testData['coachTimeOff/holiday-coach']))).toEqual(['test-key']);
  await page.evaluate(()=>{testData['coachTimeOff/holiday-coach/test-key']=testData['coachTimeOff/holiday-coach']['test-key'];});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'ยกเลิกวันหยุด',exact:true}).click();await expect(page.locator('#cdOffMessage')).toHaveText('ยกเลิกวันหยุดแล้ว');await expect(page.locator('[data-off-remove]')).toHaveCount(0);
});
for(const source of ['bookings','coachPublicSchedule/holiday-coach','coachGroupClasses/holiday-coach'])test(`fresh ${source} conflict prevents leave without modifying the booking`,async({page})=>{
  await setup(page);await dates(page,'2026-09-14','2026-09-17');
  await page.evaluate(source=>{testData[source]={busy:{date:'2026-09-15',start:'10:00',end:'11:00',status:'pending_coach_approval'}};},source);
  await page.locator('#cdOffSave').click();await expect(page.locator('#cdOffMessage')).toContainText('พบ 1 รายการ');expect(await page.evaluate(()=>testWrites)).toEqual([]);await expect(page.locator('#cdOffSave')).toBeEnabled();
});
test('overlapping leave, read failures, account changes and pointer cancellation never save a new range',async({page})=>{
  await setup(page);await dates(page,'2026-09-14','2026-09-17');
  await page.evaluate(()=>{testData['coachTimeOff/holiday-coach']={old:{start:'2026-09-15',end:'2026-09-16'}};});await page.locator('#cdOffSave').click();await expect(page.locator('#cdOffMessage')).toContainText('ทับวันหยุดเดิม');expect(await page.evaluate(()=>testWrites)).toEqual([]);
  await page.evaluate(()=>{testReadErrors={bookings:true};});await page.locator('#cdOffSave').click();await expect(page.locator('#cdOffMessage')).toContainText('Read failed');expect(await page.evaluate(()=>testWrites)).toEqual([]);
  await page.evaluate(()=>{testReadErrors={};testAuth.currentUser={uid:'other'};});await page.locator('#cdOffSave').click();await expect(page.locator('#cdOffMessage')).toContainText('บัญชีเปลี่ยน');expect(await page.evaluate(()=>testWrites)).toEqual([]);
  await page.evaluate(()=>{const button=document.querySelector('[data-off-day="2026-09-21"]');button.setPointerCapture=()=>{};button.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,button:0}));button.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1}));});await expect(page.locator('#cdOffStart')).toHaveValue('2026-09-14');
});
test('saved and legacy leave block athlete display, stale booking submission and a new Group Class',async({page})=>{
  await setup(page);await page.evaluate(()=>{state.role='athlete';state.user={uid:'holiday-athlete'};testAuth.currentUser=state.user;state.coachId='holiday-coach';testData['coachTimeOff/holiday-coach']={old:{start:'2026-09-14',end:'2026-09-17'}};});
  const error=await page.evaluate(async()=>{try{await c70WriteBooking('booking-1',{athleteId:'holiday-athlete',coachId:'holiday-coach',date:'2026-09-15',start:9,end:10});}catch(error){return error.message;}});expect(error).toContain('โค้ชกำหนดวันหยุด');expect(await page.evaluate(()=>testWrites)).toEqual([]);
  await page.evaluate(()=>{state.role='coach';state.user={uid:'holiday-coach'};testAuth.currentUser=state.user;c76OpenCreate();document.getElementById('c76Date').value='2026-09-15';document.getElementById('c76Start').value='10:00';document.getElementById('c76End').value='11:00';});
  const alerts=[];page.on('dialog',async d=>{alerts.push(d.message());await d.accept();});await page.evaluate(()=>c76CreateClass({preventDefault(){}}));expect(alerts[0]).toContain('วันหยุด');expect(await page.evaluate(()=>testWrites)).toEqual([]);
});
test('switching coaches replaces the holiday calendar and time-off details reveal no reason or bank data',async({page})=>{
  await setup(page);await page.evaluate(()=>{
    state.role='athlete';state.user={uid:'holiday-athlete'};testAuth.currentUser=state.user;state.coachId='other-coach';
    testData['coachTimeOff/other-coach']={old:{start:'2026-09-14',end:'2026-09-17',note:'private reason'}};CoachDiTimeOff.bind('other-coach');
  });
  await expect.poll(()=>page.evaluate(()=>dayCellStatus('2026-09-15',9).type)).toBe('timeoff');
  expect(await page.evaluate(()=>JSON.stringify(dayCellStatus('2026-09-15',9)))).not.toContain('private reason');
  await page.evaluate(()=>{state.coachId='free-coach';testData['coachTimeOff/free-coach']={};CoachDiTimeOff.bind('free-coach');});
  await expect.poll(()=>page.evaluate(()=>isTimeOff('2026-09-15',9))).toBe(false);expect(await page.evaluate(()=>testWrites)).toEqual([]);
});
