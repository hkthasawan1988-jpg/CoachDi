const {test,expect}=require('@playwright/test');
const {openIsolatedApp}=require('./helpers/app');

async function provider(page,kind){
  await page.evaluate(kind=>{
    state.user={uid:'provider-fixture'};state.role='coach';testAuth.currentUser=state.user;
    state.coachProfile={displayName:'Provider Fixture',providerKind:kind,status:'active'};
    state.subscription={status:'trial',trialEndsAt:Date.now()+86400000};
    testData['coachProfiles/provider-fixture']=state.coachProfile;
    testRealtimeValues={'coachProfiles/provider-fixture':state.coachProfile};
    loginView.classList.add('hidden');portal.classList.remove('hidden');showCoach('overview');
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedProviderLink=value;}}});
  },kind);
}
for(const width of [320,390,656])for(const kind of ['coach','knocker'])test(`${kind} overview exposes an account-specific profile link at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:740});const {pageErrors}=await openIsolatedApp(page,true);await provider(page,kind);
  await expect(page.locator('#csRoot')).toBeVisible();await expect(page.locator('#cdProviderShare')).toBeVisible();
  const button=page.getByRole('button',{name:'คัดลอกลิงก์โปรไฟล์',exact:true});await button.click();
  const url='https://coach-di.netlify.app/?portal=athlete&'+(kind==='knocker'?'knocker':'coach')+'=provider-fixture';
  expect(await page.evaluate(()=>copiedProviderLink)).toBe(url);await expect(page.locator('[data-provider-copy-status]')).toContainText('คัดลอกแล้ว');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  await page.evaluate(()=>showCoach('settings'));await expect(page.locator('#cdProviderShare')).toBeVisible();
  expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});

test('same UID in provider role never sees its athlete-side bookings in notifications',async({page})=>{
  await openIsolatedApp(page);await provider(page,'knocker');
  await page.evaluate(()=>{
    const athleteOnly={id:'old-athlete-booking',coachId:'pommy',athleteId:state.user.uid,coach:'Pommy old athlete side',date:TODAY,start:8,end:9,status:'confirmed'};
    const providerBooking={id:'provider-booking',coachId:state.user.uid,athleteId:'other-athlete',athlete:'Correct customer',date:TODAY,start:10,end:11,status:'confirmed'};
    state.allAthleteBookings=[athleteOnly];state.bookings=[athleteOnly,providerBooking,{...providerBooking,id:'unrelated',coachId:'unrelated'}];state.s42CoachBookings=[];
    c95OpenNotifications();
  });
  await expect(page.locator('#coachContent .c88StatusRow')).toHaveCount(1);await expect(page.locator('#coachContent')).toContainText('Correct customer');await expect(page.locator('#coachContent')).not.toContainText('Pommy old athlete side');
  expect(await page.evaluate(()=>c50Mine())).toEqual([]);await page.locator('#coachContent .c88StatusRow').click();expect(await page.evaluate(()=>state.role)).toBe('coach');await expect(page.locator('#athletePage')).toBeHidden();
});

test('account switch clears old bookings and notifications and ignores queued old callbacks',async({page})=>{
  const {pageErrors}=await openIsolatedApp(page);
  await page.evaluate(()=>{
    ensureCoachApprovalRequest=async(u,r,p)=>p;
    loadFirebaseData=async()=>{s40BindNotifications();const uid=state.user.uid,role=state.role;db.ref('bookings').orderByChild(role==='athlete'?'athleteId':'coachId').equalTo(uid).on('value',s=>{state.bookings=Object.values(s.val()||{});if(role==='athlete')state.allAthleteBookings=state.bookings;});};
    enterPortal=()=>{loginView.classList.add('hidden');portal.classList.remove('hidden');};
    window.switchFixture=async(uid,role)=>{testAuth.currentUser=uid?{uid,email:uid+'@example.invalid'}:null;if(uid)testData['users/'+uid]={role,status:'active'};await testAuthListeners[0](testAuth.currentUser);};
  });
  await page.evaluate(async()=>{
    await switchFixture('old-athlete','athlete');
    window.oldBookingListener=testSubscriptions.filter(s=>s.path==='bookings').at(-1);window.oldNoticeListener=testSubscriptions.filter(s=>s.path==='notifications/old-athlete').at(-1);
    oldBookingListener.callback({val:()=>({a:{id:'a',athleteId:'old-athlete',coachId:'pommy',coach:'PRIVATE OLD ATHLETE',date:TODAY,start:8,status:'confirmed'}})});
    oldNoticeListener.callback({val:()=>({n:{id:'n',message:'PRIVATE OLD NOTIFICATION',read:true}})});
    state.userProfile={displayName:'PRIVATE OLD NAME',refundAccount:{accountNumber:'00112233'}};
    await switchFixture('new-knocker','coach');
    oldBookingListener.callback({val:()=>({a:{id:'a',athleteId:'old-athlete',coachId:'pommy',coach:'PRIVATE OLD ATHLETE'}})});
    oldNoticeListener.callback({val:()=>({n:{message:'PRIVATE OLD NOTIFICATION'}})});
    c95OpenNotifications();
  });
  expect(await page.evaluate(()=>({bookings:state.bookings,athlete:state.allAthleteBookings,notifications:state.notifications,bank:state.userProfile.refundAccount,active:oldBookingListener.active||oldNoticeListener.active}))).toEqual({bookings:[],athlete:[],notifications:[],bank:undefined,active:false});
  await expect(page.locator('#coachContent')).not.toContainText('PRIVATE OLD');
  await page.evaluate(async()=>{await switchFixture('old-athlete','athlete');oldNoticeListener.callback({val:()=>({n:{message:'STALE RETURN'}})});});expect(await page.evaluate(()=>state.notifications)).toEqual([]);
  expect(await page.evaluate(()=>testWrites.some(w=>w.path.includes('notifications/old-athlete')||Object.keys(w.value||{}).some(k=>k.includes('notifications/old-athlete'))))).toBe(false);expect(pageErrors).toEqual([]);
});

for(const active of [true,false])test(`shared Knocker link ${active?'opens approved profile and request form':'does not expose an unapproved profile'}`,async({page})=>{
  const {pageErrors}=await openIsolatedApp(page,false,'/?portal=athlete&knocker=shared-knocker');
  await page.evaluate(active=>{
    state.user={uid:'customer'};testAuth.currentUser=state.user;state.role='athlete';
    testData['hittingPartnerProfiles/shared-knocker']={userId:'shared-knocker',displayName:'Shared Knocker Name',sport:'tennis',area:'Bangkok',hourlyRateSatang:30000,status:active?'active':'pending_review'};
    loginView.classList.add('hidden');portal.classList.remove('hidden');showAthleteMenu('home');
  },active);
  await page.evaluate(()=>c91ShowGuide(false));await expect(page.locator('#c91Guide')).toHaveCount(0);
  if(active){await expect(page.locator('#cdDirectProvider')).toContainText('Shared Knocker Name');await page.locator('[data-direct-knocker-request]').click();await expect(page.locator('#c69Modal')).toContainText('Shared Knocker Name');}
  else{await expect(page.locator('#cdDirectProvider')).toContainText('ยังไม่เปิดให้จอง');await expect(page.locator('#cdDirectProvider')).not.toContainText('Shared Knocker Name');await expect(page.locator('[data-direct-knocker-request]')).toHaveCount(0);}
  expect(await page.evaluate(()=>testWrites)).toEqual([]);expect(pageErrors).toEqual([]);
});

test('session reset releases the old athlete guide focus lock',async({page})=>{
  await openIsolatedApp(page);
  await page.evaluate(()=>{
    state.user={uid:'guide-athlete'};testAuth.currentUser=state.user;state.role='athlete';
    loginView.classList.add('hidden');portal.classList.remove('hidden');showAthleteMenu('home');c91ShowGuide(true);
  });
  await expect(page.locator('#c91Guide')).toBeVisible();expect(await page.evaluate(()=>portal.inert)).toBe(true);
  await page.evaluate(()=>accountSession.begin({uid:'next-knocker'},true));
  await expect(page.locator('#c91Guide')).toHaveCount(0);expect(await page.evaluate(()=>portal.inert)).toBe(false);
  await provider(page,'knocker');await expect(page.locator('[data-provider-copy]')).toBeEnabled();
});
