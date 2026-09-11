'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const path=require('node:path');const vm=require('node:vm');

function load(run){
  const calls={database:[],callable:[],initialized:0,command:[]};const database={name:'db'};
  class HttpsError extends Error{constructor(code,message,details){super(message);this.code=code;this.details=details}}
  const modules={
    'firebase-admin/app':{initializeApp:()=>{calls.initialized++}},
    'firebase-admin/database':{getDatabase:()=>database},
    'firebase-functions/v2/database':{onValueWritten:(options,handler)=>{calls.database.push(options);return handler}},
    'firebase-functions/v2/https':{HttpsError,onCall:(options,handler)=>{calls.callable.push(options);return handler}},
    'firebase-functions':{logger:{error(){}}},
    './booking-projection.cjs':{changes:()=>({}),apply:()=>null},
    './payout-verification.cjs':{handle:async()=>null},
    './booking-command-service.cjs':{execute:async(db,input)=>{calls.command.push([db,input]);return run?run(db,input):{ok:true}}},
  };
  const exported={};vm.runInNewContext(readFileSync(path.join(__dirname,'../functions-mobile/index.js'),'utf8'),{exports:exported,require:name=>{assert.ok(Object.hasOwn(modules,name),`Unexpected module ${name}`);return modules[name]}});
  return{calls,database,exported,HttpsError};
}

test('mobile deployment retains existing triggers and adds one App Check callable',()=>{
  const {calls,exported}=load();
  assert.deepEqual(Object.keys(exported),['syncCoachBookingSchedule','syncCoachPayoutVerification','executeBookingCommand']);
  assert.equal(calls.initialized,1);assert.equal(calls.database.length,2);assert.equal(calls.callable.length,1);
  assert.equal(calls.callable[0].region,'asia-southeast1');assert.equal(calls.callable[0].enforceAppCheck,true);
});

test('callable requires Firebase Auth and forwards only verified uid plus request data',async()=>{
  const {calls,database,exported}=load();
  await assert.rejects(()=>exported.executeBookingCommand({data:{bookingId:'BOOKING_123'}}),error=>error.code==='unauthenticated');
  const data={bookingId:'BOOKING_123',requestId:'request_12345678',action:'coach_confirm_paid'};
  assert.deepEqual(await exported.executeBookingCommand({auth:{uid:'coach_12345678'},data}),{ok:true});
  assert.equal(calls.command.length,1);assert.equal(calls.command[0][0],database);
  assert.equal(JSON.stringify(calls.command[0][1]),JSON.stringify({actorUid:'coach_12345678',input:data}));
});

test('callable maps expected conflicts and hides unexpected server errors',async()=>{
  const conflict=load(()=>{throw Object.assign(Error('private conflict'),{code:'SLOT_ALREADY_LOCKED'})});
  await assert.rejects(()=>conflict.exported.executeBookingCommand({auth:{uid:'coach_12345678'},data:{}}),error=>error.code==='failed-precondition'&&error.details.code==='SLOT_ALREADY_LOCKED'&&!error.message.includes('private'));
  const internal=load(()=>{throw Error('private database detail')});
  await assert.rejects(()=>internal.exported.executeBookingCommand({auth:{uid:'coach_12345678'},data:{}}),error=>error.code==='internal'&&!error.message.includes('private database'));
});
