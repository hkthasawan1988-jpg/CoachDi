'use strict';const{test}=require('node:test');const assert=require('node:assert/strict');const service=require('../functions-mobile/booking-athlete-service.cjs');
const clone=value=>value==null?value:structuredClone(value);class Snapshot{constructor(value){this.value=clone(value)}val(){return clone(this.value)}}
const parts=path=>String(path||'').split('/').filter(Boolean);function read(root,path){let node=root;for(const part of parts(path)){if(node==null)return null;node=node[part]}return node==null?null:node}function write(root,path,value){const keys=parts(path);if(!keys.length){for(const key of Object.keys(root))delete root[key];Object.assign(root,clone(value)||{});return}let node=root;for(const key of keys.slice(0,-1))node=node[key]||(node[key]={});const last=keys.at(-1);if(value===null)delete node[last];else node[last]=clone(value)}
class Ref{constructor(db,path){this.db=db;this.path=path}async get(){return new Snapshot(read(this.db.data,this.path))}async transaction(update){const current=clone(read(this.db.data,this.path)),next=update(current);if(next===undefined)return{committed:false,snapshot:new Snapshot(current)};write(this.db.data,this.path,next);return{committed:true,snapshot:new Snapshot(next)}}async update(updates){if(this.db.failUpdateOnce){this.db.failUpdateOnce=false;throw Error('simulated network loss')}for(const[path,value]of Object.entries(updates))write(this.db.data,[this.path,path].filter(Boolean).join('/'),value)}}class FakeDb{constructor(data){this.data=clone(data);this.failUpdateOnce=false}ref(path=''){return new Ref(this,path)}}
const now=Date.parse('2026-10-01T12:00:00+07:00'),actorUid='athlete_12345678',coachId='coach_12345678';
function booking(changed={}){return{athleteId:actorUid,coachId,date:'2026-10-10',start:10,end:11,status:'confirmed',paymentStatus:'payment_verified',priceSatang:100000,travelFeeSatang:10000,platformFeeSatang:5000,...changed}}
function seed(changed={}){return{users:{[actorUid]:{role:'athlete',status:'active',refundAccount:{bank:'ธนาคารทดสอบ',accountName:'Athlete Test',accountNumber:'0012345678'}}},bookings:{BOOKING_123:booking(changed)},coachSlotLocks:{[coachId]:{'2026-10-10':{booking_BOOKING_123:{bookingId:'BOOKING_123',date:'2026-10-10',start:10,end:11,status:'active'}}}}}}
const request=(action='athlete_cancel',requestId='request_12345678',input={})=>({actorUid,input:{bookingId:'BOOKING_123',requestId,action,...input},now});

test('paid cancellation writes one refund, releases the slot and creates deterministic records',async()=>{
  const db=new FakeDb(seed()),result=await service.execute(db,request());assert.deepEqual(result,{ok:true,replay:false,bookingId:'BOOKING_123',status:'cancelled_by_athlete',paymentStatus:'payment_verified',refundStatus:'requested'});assert.equal(read(db.data,'refunds/RF-BOOKING_123/amountSatang'),110000);assert.equal(read(db.data,`coachSlotLocks/${coachId}/2026-10-10/booking_BOOKING_123`),null);assert.equal(Object.keys(read(db.data,`notifications/${coachId}`)).length,1);
});
test('same cancellation replays without duplicating the refund or resetting a read notification',async()=>{
  const db=new FakeDb(seed());await service.execute(db,request());write(db.data,`notifications/${coachId}/booking_${actorUid}_request_12345678/read`,true);const result=await service.execute(db,request());assert.equal(result.replay,true);assert.equal(read(db.data,`notifications/${coachId}/booking_${actorUid}_request_12345678/read`),true);assert.equal(Object.keys(read(db.data,'refunds')).length,1);
});
test('same request id cannot change its action or reason',async()=>{
  const db=new FakeDb(seed());await service.execute(db,request());await assert.rejects(()=>service.execute(db,request('athlete_cancel','request_12345678',{reason:'changed'})),error=>error.code==='REQUEST_CONFLICT');
});
test('retry repairs side effects after the booking transition',async()=>{
  const db=new FakeDb(seed());db.failUpdateOnce=true;await assert.rejects(()=>service.execute(db,request()),/simulated network loss/);assert.equal(read(db.data,'bookings/BOOKING_123/status'),'cancelled_by_athlete');const result=await service.execute(db,request());assert.equal(result.replay,true);assert.equal(read(db.data,`bookingCommandResults/${actorUid}/request_12345678/status`),'completed');
});
test('unpaid cancellation does not create a refund',async()=>{
  const db=new FakeDb(seed({status:'pending_coach_approval',paymentStatus:'not_started'})),result=await service.execute(db,request());assert.equal(result.refundStatus,null);assert.equal(read(db.data,'refunds'),null);
});
