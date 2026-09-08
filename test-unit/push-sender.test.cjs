const test=require('node:test'),assert=require('node:assert/strict');
const {readFileSync}=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {payload,deliver}=require('../functions-push/sender.cjs');

test('deployment entry exposes exactly the existing database sender and forwards its event once',async()=>{
  const registered=[],configured=[],initialized=[],delivered=[];
  const database={},messaging={},logger={info(){}};
  const modules={
    'firebase-functions/v2':{setGlobalOptions:value=>configured.push(value)},
    'firebase-functions/v2/database':{onValueCreated:(options,handler)=>{registered.push(options);return handler;}},
    'firebase-functions':{logger},
    'firebase-admin/app':{initializeApp:options=>initialized.push(options)},
    'firebase-admin/database':{getDatabase:()=>database},
    'firebase-admin/messaging':{getMessaging:()=>messaging},
    './sender.cjs':{deliver:async(...args)=>delivered.push(args)}
  };
  const exported={};
  vm.runInNewContext(readFileSync(path.join(__dirname,'../functions-push/index.js'),'utf8'),{
    exports:exported,require:name=>{assert.ok(Object.hasOwn(modules,name),`Unexpected module ${name}`);return modules[name];}
  });
  assert.deepEqual(Object.keys(exported),['sendPushOnNotificationCreated']);
  assert.equal(registered.length,1);assert.equal(registered[0].ref,'/notifications/{userId}/{notificationId}');
  assert.equal(registered[0].instance,'coach-di-default-rtdb');
  assert.equal(configured.length,1);assert.equal(configured[0].region,'asia-southeast1');
  assert.equal(configured[0].preserveExternalChanges,true);
  assert.equal(initialized.length,1);assert.equal(initialized[0].databaseURL,'https://coach-di-default-rtdb.asia-southeast1.firebasedatabase.app');
  const event={params:{userId:'recipient',notificationId:'notice'}};
  await exported.sendPushOnNotificationCreated(event);
  assert.equal(delivered.length,1);assert.deepEqual(delivered[0],[database,messaging,event,logger]);
  const config=JSON.parse(readFileSync(path.join(__dirname,'../firebase.push.json'),'utf8'));
  assert.equal(config.functions.length,1);assert.equal(config.functions[0].source,'functions-push');
  assert.equal(config.functions[0].codebase,'default');
});
test('Android data push identifies recipient and requests prompt delivery while web behavior remains',()=>{
  const msg=payload({type:'chat_message',message:'ข้อความใหม่'},'user-A','notice-1','coach',['token-A']);
  assert.equal(msg.data.userId,'user-A');assert.equal(msg.data.notificationId,'notice-1');assert.equal(msg.android.priority,'high');
  assert.equal(msg.android.ttl,86400000);assert.equal(msg.notification,undefined);assert.equal(msg.android.notification,undefined);
  assert.equal(msg.webpush.headers.Urgency,'high');assert.equal(msg.webpush.fcmOptions.link,'https://coach-di.netlify.app/?portal=coach&notification=notice-1');
  assert.ok(Object.values(msg.data).every(value=>typeof value==='string'));
});
function fixture(records){const sent=[],reports=[],changes=[];const db={ref:path=>({get:async()=>({val:()=>path.startsWith('fcmTokens/')?records:'admin'}),transaction:async action=>{const id=path.split('/').at(-1),next=action(records[id]);if(next!==undefined){changes.push(path);records[id]=next;}return {committed:next!==undefined};}})};
  const event={params:{userId:'admin-A',notificationId:'n-1'},data:{val:()=>({type:'payout_verification_pending',message:'มีคำขอรอตรวจสอบ'}),ref:{child:()=>({set:async value=>reports.push(value)})}}};
  return {db,event,sent,reports,changes};}
test('unregistered devices are reported truthfully without contacting FCM',async()=>{
  const f=fixture({off:{enabled:false,token:'off'}});await deliver(f.db,{sendEachForMulticast:async()=>assert.fail('no FCM call expected')},f.event);
  assert.equal(f.reports[0].status,'no_enabled_devices');assert.equal(f.reports[0].attempted,0);
});
test('sender batches 500, counts delivery, filters disabled tokens and only removes the invalid unchanged token',async()=>{
  const records=Object.fromEntries(Array.from({length:501},(_,i)=>['d'+i,{enabled:true,token:'t'+i}]));records.off={enabled:false,token:'not-sent'};
  const f=fixture(records);let count=0;await deliver(f.db,{sendEachForMulticast:async msg=>{
    f.sent.push(msg);const responses=msg.tokens.map(()=>({success:true}));if(count++===0){responses[0]={success:false,error:{code:'messaging/registration-token-not-registered'}};responses[1]={success:false,error:{code:'messaging/invalid-registration-token'}};records.d1={enabled:true,token:'rotated'};return {successCount:498,failureCount:2,responses};}return {successCount:1,failureCount:0,responses};}},f.event);
  assert.deepEqual(f.sent.map(x=>x.tokens.length),[500,1]);assert.equal(records.d0,null);assert.equal(records.d1.token,'rotated');
  assert.equal(f.reports[0].status,'partial');assert.equal(f.reports[0].delivered,499);assert.equal(f.reports[0].attempted,501);
  assert.deepEqual(f.changes,['fcmTokens/admin-A/d0']);
});

test('transient FCM errors retain device registrations and record failure without exposing token values',async()=>{
  const records={temporary:{enabled:true,token:'private-token-one'},quota:{enabled:true,token:'private-token-two'}};
  const f=fixture(records),logs=[];
  await deliver(f.db,{sendEachForMulticast:async()=>({successCount:0,failureCount:2,responses:[
    {success:false,error:{code:'messaging/server-unavailable'}},
    {success:false,error:{code:'messaging/message-rate-exceeded'}}
  ]})},f.event,{info:(...args)=>logs.push(args)});
  assert.deepEqual(f.changes,[]);assert.equal(f.reports[0].status,'failed');assert.equal(f.reports[0].failed,2);
  assert.equal(JSON.stringify(logs).includes('private-token'),false);
});

test('a failed invalid-token cleanup does not skip later batches or their acceptance report',async()=>{
  const records=Object.fromEntries(Array.from({length:501},(_,i)=>['d'+i,{enabled:true,token:'private-token-'+i}]));
  const f=fixture(records),originalRef=f.db.ref,warnings=[];
  f.db.ref=target=>target==='fcmTokens/admin-A/d0'
    ?{transaction:async()=>{throw Object.assign(new Error('private cleanup details'),{code:'database/unavailable'});}}
    :originalRef(target);
  await deliver(f.db,{sendEachForMulticast:async message=>{
    f.sent.push(message);const responses=message.tokens.map(()=>({success:true}));
    if(f.sent.length===1){responses[0]={success:false,error:{code:'messaging/registration-token-not-registered'}};return{successCount:499,failureCount:1,responses};}
    return{successCount:1,failureCount:0,responses};
  }},f.event,{info(){},warn:(...args)=>warnings.push(args)});
  assert.deepEqual(f.sent.map(message=>message.tokens.length),[500,1]);
  assert.equal(f.reports[0].attempted,501);assert.equal(f.reports[0].delivered,500);
  assert.equal(f.reports[0].failed,1);assert.equal(f.reports[0].cleanupFailed,1);assert.equal(f.reports[0].status,'partial');
  assert.equal(warnings.length,1);assert.equal(warnings[0][1].code,'database/unavailable');
  assert.equal(JSON.stringify(warnings).includes('private'),false);
});
