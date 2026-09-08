const {test, expect} = require('@playwright/test');
const {openIsolatedApp} = require('./helpers/app');

async function sessionFixture(page, role, options={}) {
  await page.evaluate(({role,options}) => {
    window.testAuth.currentUser={uid:'session-fixture',email:role+'@example.invalid'};
    window.testData['users/session-fixture']={role,status:options.status||'active'};
    window.testAuth.signOut=async()=>{
      testAuthCalls.push({type:'signout'});testAuth.currentUser=null;await testAuthListeners[0](null);
    };
    // Keep these tests focused on session control, with no booking/payment side effects.
    ensureCoachApprovalRequest=async(user,ref,record)=>record;
    loadFirebaseData=async()=>{if(window.testLoadError)throw Error('offline');};
    enterPortal=()=>{loginView.classList.add('hidden');portal.classList.remove('hidden');};
  },{role,options});
}

for (const native of [false,true]) for(const role of ['athlete','coach','admin']) {
  test(`restored ${role} session opens the verified portal (${native?'native':'web'})`,async({page})=>{
    await openIsolatedApp(page,native);await sessionFixture(page,role);
    await page.evaluate(()=>testAuthListeners[0](testAuth.currentUser));
    await expect(page.locator('#portal')).toBeVisible();
    expect(await page.evaluate(()=>({role:state.role,selected:selectedLoginPortal,signouts:testAuthCalls.filter(x=>x.type==='signout').length})))
      .toEqual({role,selected:role,signouts:0});
    expect(await page.evaluate(()=>testWrites.length)).toBe(0);
  });
}

test('root and installed PWA restore the last Firebase scope; explicit portal URLs stay isolated',async({page})=>{
  await openIsolatedApp(page);
  expect(await page.evaluate(()=>{
    CoachDiSession.remember('coach','coach',true);
    return ['','?portal=athlete&pwa=1','?portal=admin','?portal=athlete'].map(query=>CoachDiSession.entry(query));
  })).toEqual([{scope:'coach',role:'coach'},{scope:'coach',role:'coach'},{scope:'admin',role:'admin'},{scope:'athlete',role:'athlete'}]);
});

test('profile/network failure retains credentials and recovers without signing in',async({page})=>{
  await openIsolatedApp(page);await sessionFixture(page,'coach');
  await page.evaluate(()=>{testReadErrors={'users/session-fixture':true};return testAuthListeners[0](testAuth.currentUser);});
  await expect(page.locator('#sessionStatus')).toContainText('ยังคงเข้าสู่ระบบอยู่');
  await expect(page.locator('#loginView')).toBeHidden();
  expect(await page.evaluate(()=>testAuth.currentUser.uid)).toBe('session-fixture');
  await page.evaluate(()=>{testReadErrors={};testLoadError=true;return retryCoachDiSession();});
  await expect(page.locator('#sessionStatus')).toBeVisible();
  await page.evaluate(()=>{testLoadError=false;window.dispatchEvent(new Event('online'));});
  await expect(page.locator('#portal')).toBeVisible();
  expect(await page.evaluate(()=>testAuthCalls.some(x=>x.type==='login'||x.type==='signout'))).toBe(false);
});

test('logout during a slow restore never reopens the prior account',async({page})=>{
  await openIsolatedApp(page);await sessionFixture(page,'athlete');
  await page.evaluate(()=>{
    loadFirebaseData=()=>new Promise(resolve=>window.finishSessionLoad=resolve);
    window.restorePending=testAuthListeners[0](testAuth.currentUser);
  });
  await expect.poll(()=>page.evaluate(()=>typeof finishSessionLoad)).toBe('function');
  await page.evaluate(async()=>{await logout();finishSessionLoad();await restorePending;});
  await expect(page.locator('#portal')).toBeHidden();await expect(page.locator('#loginView')).toBeVisible();
  expect(await page.evaluate(()=>localStorage.getItem('coachdi-session-route:v1'))).toBeNull();
});

test('explicit wrong portal sign-in and suspended coaches still fail access checks',async({page})=>{
  await openIsolatedApp(page);await sessionFixture(page,'coach');
  await page.evaluate(()=>restoreCoachDiSession(testAuth.currentUser,'athlete'));
  expect(await page.evaluate(()=>testAuth.currentUser)).toBeNull();
  await sessionFixture(page,'coach',{status:'suspended'});
  await page.evaluate(()=>restoreCoachDiSession(testAuth.currentUser));
  expect(await page.evaluate(()=>testAuth.currentUser)).toBeNull();
  await expect(page.locator('#portal')).toBeHidden();
});

test('remember opt-out stays session-only after restoring a tab and duplicate submit is ignored',async({page})=>{
  await openIsolatedApp(page);
  await page.locator('#loginId').fill('athlete@example.invalid');await page.locator('#loginPass').fill('fixture-only-password');
  await page.locator('#rememberLogin').uncheck();
  await page.evaluate(()=>Promise.all([login(),login()]));
  expect(await page.evaluate(()=>testAuthCalls.filter(x=>x.type==='login').length)).toBe(1);
  await sessionFixture(page,'athlete');await page.evaluate(()=>testAuthListeners[0](testAuth.currentUser));
  expect(await page.evaluate(()=>testAuthCalls.filter(x=>x.type==='persistence').map(x=>x.value))).toEqual(['session','session']);
  expect(await page.evaluate(()=>localStorage.getItem('coachdi-session-route:v1'))).toBeNull();
});
