const {test,expect,chromium}=require('@playwright/test');
const fs=require('node:fs/promises');
const path=require('node:path');
const project='demo-coach-di-session';
const emulator='http://127.0.0.1:9099';
const origin='http://127.0.0.1:4173';

async function account(request,role){
  const email=role+'-'+Date.now()+'@example.invalid',password='test-only-session-password';
  const response=await request.post(`${emulator}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key`,{data:{email,password,returnSecureToken:true}});
  expect(response.ok()).toBeTruthy();return {email,password,role};
}

async function attach(context,role){
  const sdk={};
  for(const name of ['firebase-app-compat.js','firebase-auth-compat.js'])sdk[name]=await fs.readFile(path.join('.auth-test-sdk',name),'utf8');
  await context.addInitScript(({role})=>{
    // Profile/render stubs isolate real Firebase Authentication persistence from live business data.
    window.sessionTestRole=role;window.Capacitor={isNativePlatform:()=>false};
    window.sessionWrites=[];
    const snapshot=value=>({val:()=>value,exists:()=>value!=null,forEach:()=>false});
    const ref=key=>({key:'test-key',child:part=>ref(key+'/'+part),
      once:async()=>{if(window.sessionReadFailure)throw Error('test network unavailable');return snapshot(key.startsWith('users/')?{role,status:'active',displayName:'Session Test'}:null);},
      on:()=>{},off:()=>{},orderByChild(){return this},equalTo(){return this},limitToLast(){return this},
      set:async value=>sessionWrites.push({key,value}),update:async value=>sessionWrites.push({key,value}),remove:async()=>{},push:()=>ref(key+'/test-key')});
    window.sessionTestDb={ref:key=>ref(key||'')};
  },{role});
  await context.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin===emulator)return route.continue();
    const sdkName=url.pathname.split('/').at(-1);
    if(url.hostname==='www.gstatic.com'&&sdk[sdkName])return route.fulfill({status:200,contentType:'text/javascript',body:sdk[sdkName]});
    if(url.origin!==origin)return route.fulfill({status:200,contentType:'text/javascript',body:''});
    if(url.pathname==='/'||url.pathname==='/index.html'){
      const response=await route.fetch();let html=await response.text();
      html=html.replace(/const firebaseConfig=\{[^\n]+\};/,`const firebaseConfig={apiKey:'demo-key',projectId:'${project}',authDomain:'localhost'};`);
      const marker='const auth=coachDiFirebaseApp.auth(),db=coachDiFirebaseApp.database();';
      expect(html.includes(marker)).toBeTruthy();
      html=html.replace(marker,`firebase.database=()=>window.sessionTestDb;firebase.database.ServerValue={TIMESTAMP:{'.sv':'timestamp'}};
        const auth=coachDiFirebaseApp.auth(),db=window.sessionTestDb;
        auth.useEmulator('${emulator}',{disableWarnings:true});
        const sessionRealListener=auth.onAuthStateChanged.bind(auth);let sessionPrimaryListener=true;
        auth.onAuthStateChanged=function(callback){if(!sessionPrimaryListener)return ()=>{};sessionPrimaryListener=false;return sessionRealListener(async user=>{
          if(document.readyState==='loading')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
          ensureCoachApprovalRequest=async(user,ref,record)=>record;loadFirebaseData=async()=>{};
          enterPortal=()=>{loginView.classList.add('hidden');portal.classList.remove('hidden');};
          window.sessionObserved=true;return callback(user);
        });};`);
      html += `<script>ensureCoachApprovalRequest=async(user,ref,record)=>record;
        loadFirebaseData=async()=>{};
        enterPortal=()=>{loginView.classList.add('hidden');portal.classList.remove('hidden');};</script>`;
      return route.fulfill({response,body:html});
    }
    return route.continue();
  });
}

async function open(context,url='/'){
  const page=await context.newPage();await page.goto(origin+url);
  await expect.poll(()=>page.evaluate(()=>!!window.sessionObserved)).toBe(true);return page;
}
async function loginAs(page,user,remember=true){
  await expect(page.locator('#loginView')).toBeVisible();
  await page.locator(`#portalChooser [data-role="${user.role}"]`).click();
  await page.locator('#loginId').fill(user.email);await page.locator('#loginPass').fill(user.password);
  await page.locator('#rememberLogin').setChecked(remember);await page.locator('#loginBtn').click();
  await expect(page.locator('#portal')).toBeVisible();
  expect(await page.evaluate(()=>auth.app.options.projectId)).toBe(project);
}

for(const role of ['athlete','coach','admin'])test(`${role}: Firebase LOCAL survives a browser process restart and PWA start`,async({request},testInfo)=>{
  const user=await account(request,role),profile=testInfo.outputPath('browser-profile');
  let context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});
  try{
    await attach(context,role);let page=await open(context,role==='athlete'?'/':'/index.html?portal='+role);
    await loginAs(page,user);const uid=await page.evaluate(()=>auth.currentUser.uid);
    await context.close();context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});
    await attach(context,role);page=await open(context,'/?portal=athlete&pwa=1');
    await expect(page.locator('#portal')).toBeVisible();
    expect(await page.evaluate(()=>({uid:auth.currentUser.uid,role:state.role}))).toEqual({uid,role});
    expect(await page.evaluate(()=>sessionWrites.length)).toBe(0);
    await page.evaluate(()=>auth.currentUser.getIdToken(true)); // Real SDK refresh against the Auth emulator.
    await page.reload();await expect(page.locator('#portal')).toBeVisible();
    await page.evaluate(()=>logout());await expect(page.locator('#loginView')).toBeVisible();
    await context.close();context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});
    await attach(context,role);page=await open(context);
    await expect(page.locator('#loginView')).toBeVisible();expect(await page.evaluate(()=>auth.currentUser)).toBeNull();
  }finally{await context.close();}
});

test('coach selected on default athlete route survives reload without a role-mismatch signout',async({browser,request})=>{
  const user=await account(request,'coach'),context=await browser.newContext();
  try{await attach(context,'coach');const page=await open(context);await loginAs(page,user);
    await page.reload();await expect(page.locator('#portal')).toBeVisible();
    expect(await page.evaluate(()=>state.role)).toBe('coach');
  }finally{await context.close();}
});

test('SESSION opt-out ends when the browser process closes',async({request},testInfo)=>{
  const user=await account(request,'athlete'),profile=testInfo.outputPath('browser-profile');
  let context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});
  try{
    await attach(context,'athlete');let page=await open(context);await loginAs(page,user,false);
    await page.reload();await expect(page.locator('#portal')).toBeVisible();
    await context.close();context=await chromium.launchPersistentContext(profile,{headless:true,serviceWorkers:'block'});
    await attach(context,'athlete');page=await open(context);await expect(page.locator('#loginView')).toBeVisible();
    expect(await page.evaluate(()=>auth.currentUser)).toBeNull();await expect(page.locator('#rememberLogin')).not.toBeChecked();
  }finally{await context.close();}
});
