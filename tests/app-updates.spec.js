const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');
const future=new Date(Date.now()+86400000*5).toISOString().slice(0,10);
const row={id:'new-class',coachId:'coach-one',coachName:'โค้ชทดสอบ',title:'คลาสใหม่สำหรับนักกีฬาที่ต้องการฝึกทักษะและพัฒนาฝีมือกับเพื่อนนักกีฬา'.repeat(3),date:future,start:'10:00',end:'11:00',venueName:'สนามเทนนิสสำหรับฝึกซ้อมและแข่งขันในกรุงเทพมหานคร'.repeat(3),status:'open',capacity:8,approvedCount:2,priceSatang:20000,createdAt:Date.now()};
async function athlete(page,rows=[row],uid='updates-athlete'){
  await page.evaluate(({rows,uid})=>{state.role='athlete';state.user={uid};testAuth.currentUser=state.user;loginView.classList.add('hidden');portal.classList.remove('hidden');renderNav();state.c94GroupRows=rows;c94Refresh();},{rows,uid});
}
test('admin customer count updates live and cannot show zero on permission error',async({page})=>{
  await openIsolatedApp(page);
  await page.evaluate(async()=>{
    window.customerCallbacks=[];const base=db.ref.bind(db);db.ref=path=>{const ref=base(path);if(path==='users')ref.on=(event,cb,error)=>{customerCallbacks.push({cb,error});return cb;};return ref;};
    state.role='admin';state.user={uid:'count-admin'};testAuth.currentUser=state.user;loginView.classList.add('hidden');portal.classList.remove('hidden');await s41ShowAdmin('overview');
  });
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('กำลังโหลด…');
  await page.evaluate(()=>customerCallbacks.forEach(({cb})=>cb({val:()=>({a:{role:'athlete'},b:{role:'athlete'},c:{role:'coach'},d:{role:'admin'}})})));
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('2 คน');
  await page.evaluate(()=>customerCallbacks.forEach(({error})=>error?.(Error('permission denied'))));
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('โหลดข้อมูลไม่สำเร็จ');
  await page.evaluate(()=>customerCallbacks.forEach(({cb})=>cb({val:()=>({a:{role:'athlete'}})})));
  await expect(page.locator('#cdCustomerSummary strong')).toHaveText('1 คน');
  await page.locator('[data-cd-customers]').click();expect(await page.evaluate(()=>state.c47AdminPage)).toBe('customers');
});
test('class announcement is read once, survives reload, separates accounts, and returns for a newly created class',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page);await athlete(page);
  await expect(page.locator('#cdClassLaunch')).toBeVisible();await page.getByRole('button',{name:'รับทราบ',exact:true}).click();
  await page.evaluate(()=>c94Refresh());await expect(page.locator('#cdClassLaunch')).toHaveCount(0);
  await page.reload();await athlete(page);await expect(page.locator('#cdClassLaunch')).toHaveCount(0);
  await athlete(page,[{...row,id:'next-class',createdAt:Date.now()+1000}]);await expect(page.locator('#cdClassLaunch')).toBeVisible();
  await page.getByRole('button',{name:'ดูคลาสทั้งหมด',exact:true}).click();await expect(page.locator('#cdClassLaunch')).toHaveCount(0);await expect(page.locator('#c76AthleteGrid')).toBeVisible();
  await athlete(page,[row],'another-athlete');await expect(page.locator('#cdClassLaunch')).toBeVisible();
  expect(await page.evaluate(()=>testWrites.filter(w=>w.path.startsWith('bookings/')||w.path.startsWith('coachGroupClassRequests/')))).toHaveLength(0);expect(pageErrors).toEqual([]);
});
test('opening group and coach menus clears unread glow and a later class lights it again',async({page})=>{
  await openIsolatedApp(page);await page.evaluate(()=>localStorage.setItem('coachdi-seen-group:v2:athlete:updates-athlete','1'));await athlete(page);
  expect(await page.evaluate(()=>state.c94Counts.group)).toBe(1);
  await page.getByRole('button',{name:'รับทราบ',exact:true}).click();await page.evaluate(()=>showAthleteMenu('groupclasses'));
  expect(await page.evaluate(()=>state.c94Counts.group)).toBe(0);await expect(page.locator('[data-c76-groupclasses].c94Pulse')).toHaveCount(0);
  await page.evaluate(value=>{state.c94GroupRows.push({...value,id:'later',createdAt:Date.now()+100});c94Refresh();},row);
  expect(await page.evaluate(()=>state.c94Counts.group)).toBe(1);
  await page.evaluate(()=>{state.role='admin';state.user={uid:'admin-glow'};testAuth.currentUser=state.user;localStorage.setItem(c94Key('coach'),'1');state.c94CoachRows=[{status:'active',createdAt:100}];c94Refresh();});
  expect(await page.evaluate(()=>state.c94Counts.coach)).toBe(1);await page.evaluate(()=>s41ShowAdmin('coaches'));expect(await page.evaluate(()=>state.c94Counts.coach)).toBe(0);
});
for(const width of [320,360,390,412,840])test(`new class alert stays within ${width}px and its footer remains usable with long Thai`,async({page})=>{
  await page.setViewportSize({width,height:width===840?380:740});const {pageErrors}=await openIsolatedApp(page,true);await athlete(page,Array.from({length:8},(_,i)=>({...row,id:'class-'+i})));
  const box=await page.locator('#cdClassLaunch section').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(width===840?380:740);
  const body=page.locator('.cdClassLaunchBody');expect(await body.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
  await expect(page.getByRole('button',{name:'รับทราบ',exact:true})).toBeInViewport();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.getByRole('button',{name:'รับทราบ',exact:true}).click();await expect(page.locator('#cdClassLaunch')).toHaveCount(0);expect(pageErrors).toEqual([]);
});
test('past class including earlier today is blocked before any writes; a future class submits once',async({page})=>{
  await openIsolatedApp(page);await page.evaluate(()=>{state.role='coach';state.user={uid:'coach-create'};testAuth.currentUser=state.user;state.coachProfile={displayName:'Coach'};state.subscription={trialEndsAt:Date.now()+86400000};loginView.classList.add('hidden');portal.classList.remove('hidden');audit=async()=>{};c76OpenCreate();});
  await page.locator('#c76Title').fill('คลาสทดสอบ');await page.locator('#c76Price').fill('200');await page.locator('#c76Venue').selectOption('__other');await page.locator('#c76OtherVenue').fill('สนามทดสอบ');
  await page.evaluate(()=>{const local=new Date(Date.now()+7*3600000).toISOString();document.getElementById('c76Date').value=local.slice(0,10);document.getElementById('c76Start').value='00:00';document.getElementById('c76End').value='23:59';return c76CreateClass({preventDefault(){}});});
  await expect(page.locator('#cdClassDateError')).toContainText('เลยเวลามาแล้ว');expect(await page.evaluate(()=>testWrites)).toHaveLength(0);
  await page.locator('#c76Date').fill(future);await page.locator('#c76Start').fill('10:00');await page.locator('#c76End').fill('11:00');
  await page.evaluate(()=>Promise.all([c76CreateClass({preventDefault(){}}),c76CreateClass({preventDefault(){}})]));
  await expect(page.locator('#c76Modal')).toHaveCount(0);expect(await page.evaluate(()=>testFunctionCalls.filter(row=>row.name==='executeGroupClassCommand'&&row.data.action==='create'))).toHaveLength(1);expect(await page.evaluate(()=>testWrites.filter(w=>w.path.startsWith('coachGroupClasses/')&&!w.backend))).toHaveLength(0);
});
test('rescheduling and reopening a past class cannot write',async({page})=>{
  await openIsolatedApp(page);await page.evaluate(value=>{state.role='coach';state.user={uid:'coach-one'};testAuth.currentUser=state.user;state.c76GroupClasses=[{...value,date:'2020-01-01'}];state.coachProfile={};loginView.classList.add('hidden');portal.classList.remove('hidden');c111OpenGroupClassEdit('new-class');},row);
  await page.evaluate(()=>c111SaveGroupClassEdit({preventDefault(){}},'new-class'));await expect(page.locator('#cdClassDateError')).toContainText('เลยเวลามาแล้ว');
  page.once('dialog',dialog=>dialog.accept());await page.evaluate(()=>c76SetClassStatus('new-class','open',{}));expect(await page.evaluate(()=>testWrites)).toHaveLength(0);expect(await page.evaluate(()=>testFunctionCalls.filter(row=>row.name==='executeGroupClassCommand'))).toHaveLength(0);
});
test('paid Group Class submit and coach decision use private upload and server commands only',async({page})=>{
  const{pageErrors}=await openIsolatedApp(page);await page.evaluate(()=>{state.role='athlete';state.user={uid:'group-athlete'};testAuth.currentUser=state.user;document.body.insertAdjacentHTML('beforeend','<input id="c90GroupConsent" type="checkbox" checked><input id="c90GroupSlip" type="file">');const transfer=new DataTransfer();transfer.items.add(new File(['proof'],'proof.jpg',{type:'image/jpeg'}));document.getElementById('c90GroupSlip').files=transfer.files;});
  await page.evaluate(()=>c90SubmitGroupBooking('coach-one','new-class',document.createElement('button')));
  expect(await page.evaluate(()=>testWrites.filter(row=>row.storage).map(row=>row.path))).toEqual([expect.stringMatching(/^private\/group-class-slip\/group-athlete\//)]);
  expect(await page.evaluate(()=>testWrites.filter(row=>!row.storage&&!row.backend))).toHaveLength(0);
  expect(await page.evaluate(()=>testFunctionCalls.filter(row=>row.name==='executeGroupClassCommand').map(row=>row.data.action))).toEqual(['submit_paid']);
  await page.evaluate(()=>{state.role='coach';state.user={uid:'coach-one'};testAuth.currentUser=state.user;return c76Decide('new-class','group-athlete','approved',document.createElement('button'));});
  expect(await page.evaluate(()=>testFunctionCalls.filter(row=>row.name==='executeGroupClassCommand').map(row=>row.data.action))).toEqual(['submit_paid','decide']);expect(pageErrors).toEqual([]);
});
test('historical Group Class income reconciliation runs on the server without client ledger writes',async({page})=>{
  const{pageErrors}=await openIsolatedApp(page);await page.evaluate(()=>{state.role='coach';state.user={uid:'coach-one'};testAuth.currentUser=state.user;loginView.classList.add('hidden');portal.classList.remove('hidden');return c113BackfillGroupTransactions()});
  expect(await page.evaluate(()=>testFunctionCalls.filter(row=>row.name==='executeGroupClassCommand').map(row=>row.data.action))).toEqual(['reconcile_income']);
  expect(await page.evaluate(()=>testWrites.filter(row=>String(row.path||'').startsWith('paymentTransactions/')))).toHaveLength(0);expect(pageErrors).toEqual([]);
});
