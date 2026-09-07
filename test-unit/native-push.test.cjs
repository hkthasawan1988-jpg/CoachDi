const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const {readFileSync} = require('node:fs');
const {webcrypto} = require('node:crypto');
const tick = () => new Promise(resolve=>setImmediate(resolve));
async function setup(granted=true) {
  let registered;
  const registrationComplete = new Promise(resolve => { registered = resolve; });
  const events={},calls=[],elements={},writes=[];let authChanged;
  const element=()=>({hidden:false,disabled:false,textContent:'',className:''});
  const push={addListener:async(name,cb)=>{events[name]=cb;},checkPermissions:async()=>({receive:'prompt'}),requestPermissions:async()=>{calls.push('permission');return{receive:granted?'granted':'denied'};},createChannel:async()=>{},register:async()=>{calls.push('register');events.registration({value:'fixture-token-12345678901234567890'});},unregister:async()=>{calls.push('unregister');}};
  const session={configureSession:async data=>{calls.push(data.enabled?'native-on':'native-off');if(data.enabled)registered();},getSession:async()=>({uid:''}),getPending:async()=>({}),clearPending:async()=>{}};
  const sandbox={console,crypto:webcrypto,TextEncoder,setTimeout,clearTimeout,state:{role:'athlete'},firebase:{database:{ServerValue:{TIMESTAMP:1}}},
    auth:{currentUser:null,onAuthStateChanged:cb=>{authChanged=cb;}},
    db:{ref:path=>({transaction:async update=>{const value=update(null);writes.push({path,value});return{committed:true};},update:async value=>writes.push({path,value})})},
    document:{createElement:element,getElementById:id=>id==='logoutBtn'?{insertAdjacentElement:(_,el)=>{elements[el.id]=el;}}:elements[id]},
    Capacitor:{isNativePlatform:()=>true,Plugins:{PushNotifications:push,CoachDiNotifications:session}},
    alert:()=>calls.push('alert'),enterPortal:()=>{},logout:async()=>calls.push('signed-out')};
  sandbox.window=sandbox;vm.runInNewContext(readFileSync('native-push.js','utf8'),sandbox);
  for(let i=0;i<5;i++)await tick();
  return {sandbox,calls,writes,elements,events,authChanged,registrationComplete};
}
test('native push requests permission on user action and records an owner-scoped Android token',{timeout:5000},async()=>{
  const t=await setup();assert.equal(t.calls.includes('permission'),false);
  t.sandbox.auth.currentUser={uid:'athlete'};await t.authChanged(t.sandbox.auth.currentUser);
  assert.equal(t.calls.includes('permission'),false);
  await t.elements.cdNativePushButton.onclick();
  await t.registrationComplete;
  assert.ok(t.calls.includes('register'));assert.equal(t.writes.length,1);
  assert.ok(t.writes[0].path.startsWith('fcmTokens/athlete/'));assert.equal(t.writes[0].value.platform,'android');
  assert.equal(t.writes[0].value.enabled,true);
  await t.sandbox.logout();assert.ok(t.calls.indexOf('native-off')<t.calls.indexOf('signed-out'));
  assert.equal(t.writes.at(-1).value.enabled,false);assert.equal(t.calls.at(-1),'signed-out');
});
test('denying Android permission leaves booking/login usable and never registers a token',async()=>{
  const t=await setup(false);t.sandbox.auth.currentUser={uid:'athlete'};await t.authChanged(t.sandbox.auth.currentUser);
  await t.elements.cdNativePushButton.onclick();assert.equal(t.calls.includes('register'),false);assert.equal(t.writes.length,0);
  assert.equal(t.elements.cdNativePushButton.disabled,false);assert.ok(t.calls.includes('native-off'));
});
