'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const service=require('../functions-mobile/booking-command-service.cjs');

const clone=value=>value==null?value:structuredClone(value);
class Snapshot{constructor(value){this.value=clone(value)}val(){return clone(this.value)}}
function parts(path){return String(path||'').split('/').filter(Boolean)}
function read(root,path){let node=root;for(const part of parts(path)){if(node==null)return null;node=node[part]}return node==null?null:node}
function write(root,path,value){const keys=parts(path);if(!keys.length){for(const key of Object.keys(root))delete root[key];Object.assign(root,clone(value)||{});return}let node=root;for(const key of keys.slice(0,-1))node=node[key]||(node[key]={});const last=keys.at(-1);if(value===null)delete node[last];else node[last]=clone(value)}
class Ref{
  constructor(db,path,query=null){this.db=db;this.path=path;this.query=query}
  orderByChild(field){return new Ref(this.db,this.path,{field,value:null})}
  equalTo(value){return new Ref(this.db,this.path,{...this.query,value})}
  async get(){let result=clone(read(this.db.data,this.path));if(this.query){result=Object.fromEntries(Object.entries(result||{}).filter(([,row])=>row?.[this.query.field]===this.query.value))}return new Snapshot(result)}
  async transaction(update){const current=clone(read(this.db.data,this.path)),next=update(current);if(next===undefined)return{committed:false,snapshot:new Snapshot(current)};write(this.db.data,this.path,next);return{committed:true,snapshot:new Snapshot(next)}}
  async update(updates){if(this.db.failUpdateOnce){this.db.failUpdateOnce=false;throw Error('simulated network loss')}for(const [path,value] of Object.entries(updates))write(this.db.data,path,value)}
}
class FakeDb{constructor(data){this.data=clone(data);this.failUpdateOnce=false}ref(path=''){return new Ref(this,path)}}

const now=Date.parse('2026-10-01T12:00:00+07:00');
const user={role:'coach',status:'active',displayName:'Coach Test',subscription:{trialEndsAt:now+86400000}};
const booking=(id='BOOKING_123',start=10)=>({id,coachId:'coach_12345678',athleteId:'athlete_12345678',athlete:'Athlete Test',date:'2026-10-10',start,end:start+1,venueId:'visda',venue:'VISDA',status:'payment_submitted',paymentStatus:'payment_submitted',paymentProofDataUrl:'data:image/jpeg;base64,fixture',priceSatang:100000,travelFeeSatang:20000,platformFeeSatang:12000});
function seed(rows={BOOKING_123:booking()}){return{users:{coach_12345678:user},bookings:rows,coachPublicSchedule:{coach_12345678:{}},coachGroupClasses:{coach_12345678:{}},coachTimeOff:{coach_12345678:{}},coachAvailability:{coach_12345678:{travelBufferMin:45,maxClassesPerDay:8}}}}
const request=(bookingId='BOOKING_123',requestId='request_12345678')=>({actorUid:'coach_12345678',input:{bookingId,requestId,action:'coach_confirm_paid'},now});

test('service confirms a paid booking and writes deterministic server records',async()=>{
  const db=new FakeDb(seed()),result=await service.execute(db,request());
  assert.deepEqual(result,{ok:true,replay:false,bookingId:'BOOKING_123',status:'confirmed',paymentStatus:'payment_verified',refundReviewRequired:false});
  assert.equal(read(db.data,'bookings/BOOKING_123/paymentProofDataUrl'),null);
  assert.equal(read(db.data,'paymentTransactions/TX-BOOKING_123/netSatang'),108000);
  assert.equal(Object.keys(read(db.data,'notifications/athlete_12345678')).length,1);
  assert.equal(read(db.data,'bookingCommandResults/coach_12345678/request_12345678/status'),'completed');
  assert.equal(read(db.data,'coachSlotLocks/coach_12345678/2026-10-10/booking_BOOKING_123/bookingId'),'BOOKING_123');
});

test('same request replays without duplicate ledger, chat or notification',async()=>{
  const db=new FakeDb(seed());await service.execute(db,request());const again=await service.execute(db,request());
  assert.equal(again.replay,true);assert.equal(Object.keys(read(db.data,'paymentTransactions')).length,1);
  assert.equal(Object.keys(read(db.data,'notifications/athlete_12345678')).length,1);
  assert.equal(Object.keys(read(db.data,'bookingChats/BOOKING_123/messages')).length,1);
});

test('request id cannot be reused for another booking',async()=>{
  const rows={BOOKING_123:booking(),BOOKING_456:booking('BOOKING_456',12)},db=new FakeDb(seed(rows));
  await service.execute(db,request());
  await assert.rejects(()=>service.execute(db,request('BOOKING_456')),error=>error.code==='REQUEST_CONFLICT');
});

test('concurrent overlapping approvals allow only one booking',async()=>{
  const rows={BOOKING_123:booking(),BOOKING_456:booking('BOOKING_456')},db=new FakeDb(seed(rows));
  const outcomes=await Promise.allSettled([service.execute(db,request()),service.execute(db,request('BOOKING_456','request_87654321'))]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(item=>item.status==='rejected'&&item.reason.code==='SLOT_ALREADY_LOCKED').length,1);
  assert.equal(Object.values(read(db.data,'bookings')).filter(row=>row.status==='confirmed').length,1);
});

test('retry repairs deterministic side effects after a network loss',async()=>{
  const db=new FakeDb(seed());db.failUpdateOnce=true;
  await assert.rejects(()=>service.execute(db,request()),/simulated network loss/);
  assert.equal(read(db.data,'bookings/BOOKING_123/status'),'confirmed');assert.ok(read(db.data,'paymentTransactions/TX-BOOKING_123'));
  const retry=await service.execute(db,request());assert.equal(retry.replay,true);
  assert.equal(Object.keys(read(db.data,'notifications/athlete_12345678')).length,1);
});

test('time off and inactive subscription fail before changing the booking',async()=>{
  const offDb=new FakeDb(seed());write(offDb.data,'coachTimeOff/coach_12345678/off',{startDate:'2026-10-10',endDate:'2026-10-10',fullDay:true});
  await assert.rejects(()=>service.execute(offDb,request()),error=>error.code==='COACH_TIME_OFF');
  assert.equal(read(offDb.data,'bookings/BOOKING_123/status'),'payment_submitted');
  const inactiveDb=new FakeDb(seed());write(inactiveDb.data,'users/coach_12345678/status','suspended');
  await assert.rejects(()=>service.execute(inactiveDb,request()),error=>error.code==='COACH_INACTIVE');
});
test('same request cannot change decline details',async()=>{
  const declined=booking();declined.status='payment_submitted';const db=new FakeDb(seed({BOOKING_123:declined})),first={...request(),input:{...request().input,action:'coach_decline',reason:'ติดภารกิจ'}};await service.execute(db,first);await assert.rejects(()=>service.execute(db,{...first,input:{...first.input,reason:'เปลี่ยนเหตุผล'}}),error=>error.code==='REQUEST_CONFLICT');
});
