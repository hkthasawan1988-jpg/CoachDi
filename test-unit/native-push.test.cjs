const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {webcrypto} = require('node:crypto');
const tick = () => new Promise(resolve => setImmediate(resolve));
const pause = () => new Promise(resolve => setTimeout(resolve,10));
const deferred = () => { let resolve, reject; const promise = new Promise((yes,no) => {resolve=yes;reject=no;});return {promise,resolve,reject}; };
async function until(condition, timeoutMs=5000) {
  const deadline=Date.now()+timeoutMs;
  while(Date.now()<deadline){if(condition())return;await pause();}
  assert.ok(condition(),'Expected asynchronous push state');
}
async function setup(options={}) {
  const events={},calls=[],elements={},writes=[],timers=new Map(),surfaceEvents={},reads=[];
  let authChanged,timerId=0,permission=options.permission || 'prompt',status={appEnabled:true,channelEnabled:true,...options.status};
  let nativeSession={uid:'',deviceId:'',...options.nativeSession};
  const element=()=>({hidden:false,disabled:false,textContent:'',className:'',attributes:{},setAttribute(key,value){this.attributes[key]=value;}});
  const stored=options.storage||new Map();
  const push={
    addListener:async(name,cb)=>{events[name]=cb;},
    checkPermissions:async()=>({receive:permission}),
    requestPermissions:async()=>{calls.push('permission');permission=options.granted===false?'denied':'granted';return{receive:permission};},
    register:async()=>{calls.push('register');if(options.emit!==false)events.registration({value:'fixture-token-'+ 'a'.repeat(100)});}
  };
  const session={
    configureSession:async data=>{nativeSession={...data};calls.push(data.enabled?'native-on':'native-off');},
    getSession:async()=>({...nativeSession}),getPending:async()=>options.pending || {},clearPending:async()=>{calls.push('clear-pending');if(options.clearPending)await options.clearPending();},
    prepareChannel:async()=>calls.push('channel'),getStatus:async()=>({...status}),
    openSettings:async data=>calls.push(data.channel?'channel-settings':'app-settings'),
    unregister:async()=>{calls.push('unregister');if(options.reset)await options.reset();calls.push('unregistered');}
  };
  const sandbox={console,crypto:webcrypto,TextEncoder,localStorage:{getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value)},
    setTimeout:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),
    state:{role:'athlete'},firebase:{database:{ServerValue:{TIMESTAMP:1}}},
    auth:{currentUser:null,onAuthStateChanged:cb=>{authChanged=cb;}},
    db:{ref:path=>({transaction:async update=>{const value=update(null);writes.push({path,value});if(options.transaction)return options.transaction(update,path,value);return{committed:true};},
      update:async value=>{writes.push({path,value});if(options.update)return options.update(path,value);},
      once:async()=>{reads.push(path);return{val:()=>options.notice || null};}})},
    document:{hidden:false,addEventListener:(name,cb)=>surfaceEvents[name]=cb,createElement:element,
      getElementById:id=>id==='logoutBtn'?{insertAdjacentElement:(_,el)=>{elements[el.id]=el;}}:elements[id]},
    addEventListener:(name,cb)=>surfaceEvents[name]=cb,
    Capacitor:{isNativePlatform:()=>true,getPlatform:()=>options.platform||'android',Plugins:{PushNotifications:push,CoachDiNotifications:session}},
    enterPortal:()=>{},logout:async()=>{calls.push('signed-out');sandbox.auth.currentUser=null;},
    showAthleteMenu:page=>calls.push('navigate-'+page),showCoach:page=>calls.push('navigate-'+page),s41ShowAdmin:page=>calls.push('navigate-'+page)};
  sandbox.window=sandbox;vm.runInNewContext(readFileSync('native-push.js','utf8'),sandbox);
  await until(()=>authChanged);
  return {sandbox,calls,writes,elements,events,reads,timers,stored,
    get nativeSession(){return nativeSession;},
    login:async(uid='athlete')=>{sandbox.auth.currentUser={uid};await authChanged(sandbox.auth.currentUser);},
    changeUser:user=>{sandbox.auth.currentUser=user;return authChanged(user);},
    setPermission:value=>permission=value,setStatus:value=>status={...status,...value},
    dispatch:async name=>{surfaceEvents[name]();for(let i=0;i<10;i++)await tick();},
    runTimer:async ms=>{const entry=[...timers].find(([,value])=>value.ms===ms);assert.ok(entry,`Missing ${ms}ms timer`);timers.delete(entry[0]);entry[1].fn();for(let i=0;i<10;i++)await tick();}
  };
}

test('native push prompts only on user action, saves an Android token and disables it before logout',async()=>{
  const t=await setup();await t.login();assert.equal(t.calls.includes('permission'),false);
  await t.elements.cdNativePushButton.onclick();await until(()=>t.calls.includes('native-on'));
  const record=t.writes.find(x=>x.value?.enabled===true);
  assert.ok(record.path.startsWith('fcmTokens/athlete/'));assert.equal(record.value.platform,'android');
  assert.equal(t.nativeSession.deviceId,record.value.deviceId);
  await t.sandbox.logout();assert.ok(t.calls.indexOf('native-off')<t.calls.indexOf('signed-out'));
  assert.equal(t.writes.at(-1).value.enabled,false);assert.equal(t.calls.at(-1),'signed-out');
});

test('native push labels an iOS token for server-side routing',async()=>{
  const t=await setup({platform:'ios'});await t.login();await t.elements.cdNativePushButton.onclick();await until(()=>t.calls.includes('native-on'));
  const record=t.writes.find(x=>x.value?.enabled===true);
  assert.equal(record.value.platform,'ios');
});

test('denied permission offers system settings without registering',async()=>{
  const t=await setup({granted:false});await t.login();await t.elements.cdNativePushButton.onclick();
  assert.equal(t.calls.includes('register'),false);assert.equal(t.writes.length,0);
  assert.equal(t.elements.cdNativePushButton.disabled,false);assert.ok(t.calls.includes('app-settings'));
});

test('blocked channel is detected and returning from settings automatically registers',async()=>{
  const t=await setup({permission:'granted',status:{channelEnabled:false}});await t.login();
  assert.equal(t.calls.includes('register'),false);assert.match(t.elements.cdNativePushButton.title,/ตั้งค่า/);
  await t.elements.cdNativePushButton.onclick();assert.ok(t.calls.includes('channel-settings'));
  t.setStatus({channelEnabled:true});await t.dispatch('visibilitychange');await until(()=>t.calls.includes('native-on'));
  assert.equal(t.calls.includes('permission'),false);
});

test('a transient database rejection retries registration without another permission prompt',async()=>{
  let attempts=0;
  const t=await setup({permission:'granted',transaction:async()=>{if(++attempts===1)throw Error('offline');return{committed:true};}});
  await t.login();await until(()=>[...t.timers.values()].some(x=>x.ms===2000));
  assert.equal(t.calls.includes('native-on'),false);await t.runTimer(2000);await until(()=>t.calls.includes('native-on'));
  assert.equal(attempts,2);assert.equal(t.calls.includes('permission'),false);
});

test('offline registration does not block logout or re-enable the signed-out native session',async()=>{
  const network=deferred();const t=await setup({permission:'granted',transaction:()=>network.promise});
  await t.login();await until(()=>t.writes.length===1);await t.sandbox.logout();
  assert.ok(t.calls.includes('signed-out'));assert.equal(t.nativeSession.enabled,false);
  network.resolve({committed:true});for(let i=0;i<20;i++)await tick();
  assert.equal(t.calls.includes('native-on'),false);
  t.events.registration({value:'late-token'});for(let i=0;i<5;i++)await tick();assert.equal(t.calls.includes('native-on'),false);
});

test('registration callback failure retries instead of leaving a permanently disabled button',async()=>{
  const t=await setup({permission:'granted',emit:false});await t.login();
  t.events.registrationError({error:'unavailable'});assert.equal(t.elements.cdNativePushButton.disabled,false);
  await t.runTimer(2000);assert.equal(t.calls.filter(x=>x==='register').length,2);
});

test('switching accounts waits for native token deletion before registering again',async()=>{
  const deleted=deferred();const t=await setup({permission:'granted',reset:()=>deleted.promise});
  await t.login();await until(()=>t.calls.includes('native-on'));await t.sandbox.logout();
  const login=t.login('coach');for(let i=0;i<20;i++)await tick();
  assert.equal(t.calls.filter(x=>x==='register').length,1);
  deleted.resolve();await login;await until(()=>t.calls.filter(x=>x==='native-on').length===2);
  assert.equal(t.nativeSession.uid,'coach');assert.ok(t.calls.lastIndexOf('unregistered')<t.calls.lastIndexOf('register'));
});

test('logout after app restart cleans up the persisted device registration before sign-out',async()=>{
  const t=await setup({permission:'granted',emit:false,nativeSession:{uid:'athlete',deviceId:'prior-device',enabled:true}});
  await t.login();await t.sandbox.logout();
  assert.ok(t.writes.some(x=>x.path==='fcmTokens/athlete/prior-device'&&x.value.enabled===false));
});

test('an aborted database transaction never reports notifications enabled',async()=>{
  const t=await setup({permission:'granted',transaction:async()=>({committed:false})});await t.login();
  await until(()=>[...t.timers.values()].some(x=>x.ms===2000));
  assert.equal(t.calls.includes('native-on'),false);assert.match(t.elements.cdNativePushButton.title,/อีกครั้ง/);
});

test('notification taps validate recipient and database ownership and clear pending intents',async()=>{
  const t=await setup({permission:'granted',notice:{type:'chat_message'}});await t.login();await until(()=>t.calls.includes('native-on'));
  t.events.pushNotificationActionPerformed({notification:{data:{userId:'other',notificationId:'notice'}}});
  for(let i=0;i<10;i++)await tick();assert.equal(t.reads.length,0);
  t.events.pushNotificationActionPerformed({notification:{data:{userId:'athlete',notificationId:'notice'}}});
  await until(()=>t.calls.includes('navigate-chat'));assert.deepEqual(t.reads,['notifications/athlete/notice']);
  const clearCount=t.calls.filter(x=>x==='clear-pending').length;await t.sandbox.logout();
  assert.ok(t.calls.filter(x=>x==='clear-pending').length>clearCount);
});

test('a new login is preserved when the previous signed-out callback finishes later',async()=>{
  const cleared=deferred();const t=await setup({permission:'granted',clearPending:()=>cleared.promise});
  await t.login();await until(()=>t.calls.includes('native-on'));
  const signedOut=t.changeUser(null);await until(()=>t.calls.includes('clear-pending'));
  const signedIn=t.login('coach');cleared.resolve();await Promise.all([signedOut,signedIn]);
  await until(()=>t.nativeSession.uid==='coach'&&t.nativeSession.enabled);
});

test('an offline token-disable write has a bounded wait before logout',async()=>{
  const network=deferred();const t=await setup({permission:'granted',update:()=>network.promise});
  await t.login();await until(()=>t.calls.includes('native-on'));
  const logout=t.sandbox.logout();await until(()=>[...t.timers.values()].some(x=>x.ms===750));
  assert.equal(t.nativeSession.enabled,false);await t.runTimer(750);await logout;
  assert.ok(t.calls.includes('signed-out'));network.resolve();
});

test('missing native registration callback times out and leaves a retry action',async()=>{
  const t=await setup({permission:'granted',emit:false});await t.login();await t.runTimer(12000);
  assert.equal(t.elements.cdNativePushButton.disabled,false);assert.match(t.elements.cdNativePushButton.title,/อีกครั้ง/);
  await t.runTimer(2000);assert.equal(t.calls.filter(x=>x==='register').length,2);
});

test('payout verification taps open the verified account section for coach and admin',async()=>{
  for(const [role,target] of [['coach','settings'],['admin','verify']]) {
    const t=await setup({permission:'granted',notice:{type:'payout_verification_pending'}});
    t.sandbox.state.role=role;await t.login(role);await until(()=>t.calls.includes('native-on'));
    t.events.pushNotificationActionPerformed({notification:{data:{userId:role,notificationId:'verification-notice'}}});
    await until(()=>t.calls.includes('navigate-'+target));
  }
});

test('turning notifications off persists per account and stays off after resume and app restart',async()=>{
  const storage=new Map(),t=await setup({permission:'granted',storage});await t.login();await until(()=>t.nativeSession.enabled);
  await t.elements.cdNativePushButton.onclick();assert.equal(t.nativeSession.enabled,false);assert.equal(t.elements.cdNativePushButton.attributes['aria-checked'],'false');
  const registrations=t.calls.filter(x=>x==='register').length;
  await t.dispatch('focus');await t.dispatch('online');await t.dispatch('visibilitychange');assert.equal(t.calls.filter(x=>x==='register').length,registrations);
  const restarted=await setup({permission:'granted',storage});await restarted.login();assert.equal(restarted.calls.includes('register'),false);
  await restarted.elements.cdNativePushButton.onclick();await until(()=>restarted.nativeSession.enabled);assert.equal(restarted.elements.cdNativePushButton.attributes['aria-checked'],'true');
  assert.equal(restarted.calls.includes('permission'),false);
});
test('a saved off preference does not disable a different account',async()=>{
  const storage=new Map([['coachdi-push-preference:v1:athlete','off']]);const t=await setup({permission:'granted',storage});
  await t.login();assert.equal(t.calls.includes('register'),false);await t.login('coach');await until(()=>t.nativeSession.enabled);assert.equal(t.nativeSession.uid,'coach');
});
test('a token callback arriving after an explicit off choice cannot enable the native session',async()=>{
  const t=await setup({permission:'granted'});await t.login();await until(()=>t.nativeSession.enabled);await t.elements.cdNativePushButton.onclick();
  const enabled=t.calls.filter(x=>x==='native-on').length;t.events.registration({value:'late-token'});await t.dispatch('focus');
  assert.equal(t.nativeSession.enabled,false);assert.equal(t.calls.filter(x=>x==='native-on').length,enabled);
});

