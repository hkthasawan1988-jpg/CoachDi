'use strict';const{test}=require('node:test');const assert=require('node:assert/strict');const service=require('../functions-mobile/booking-create-service.cjs');const create=require('../functions-mobile/booking-create.cjs');
const clone=value=>value==null?value:structuredClone(value);class Snapshot{constructor(value){this.value=clone(value)}val(){return clone(this.value)}}
const parts=path=>String(path||'').split('/').filter(Boolean);function read(root,path){let node=root;for(const part of parts(path)){if(node==null)return null;node=node[part]}return node==null?null:node}function write(root,path,value){const keys=parts(path);if(!keys.length){for(const key of Object.keys(root))delete root[key];Object.assign(root,clone(value)||{});return}let node=root;for(const key of keys.slice(0,-1))node=node[key]||(node[key]={});const last=keys.at(-1);if(value===null)delete node[last];else node[last]=clone(value)}
class Ref{constructor(db,path,query=null){this.db=db;this.path=path;this.query=query}orderByChild(field){return new Ref(this.db,this.path,{field,value:null})}equalTo(value){return new Ref(this.db,this.path,{...this.query,value})}async get(){let result=clone(read(this.db.data,this.path));if(this.query)result=Object.fromEntries(Object.entries(result||{}).filter(([,row])=>row?.[this.query.field]===this.query.value));return new Snapshot(result)}async transaction(update){const current=clone(read(this.db.data,this.path)),next=update(current);if(next===undefined)return{committed:false,snapshot:new Snapshot(current)};write(this.db.data,this.path,next);return{committed:true,snapshot:new Snapshot(next)}}async update(updates){if(this.db.failUpdateOnce){this.db.failUpdateOnce=false;throw Error('simulated network loss')}for(const[path,value]of Object.entries(updates))write(this.db.data,[this.path,path].filter(Boolean).join('/'),value)}}class FakeDb{constructor(data){this.data=clone(data);this.failUpdateOnce=false}ref(path=''){return new Ref(this,path)}}
const now=Date.parse('2026-10-01T12:00:00+07:00'),actorUid='athlete_12345678',coachId='coach_12345678',requestId='request_12345678';
const proof={path:`private/booking-slip/${actorUid}/row/file.jpg`,url:'https://firebasestorage.googleapis.com/v0/b/test/o/file',contentType:'image/jpeg',size:1024,name:'proof.jpg',uploadedAt:now};
function seed(){return{users:{[actorUid]:{role:'athlete',displayName:'Athlete Test',email:'athlete@example.invalid',phone:'0900000000'},[coachId]:{role:'coach',status:'active',subscription:{trialEndsAt:now+86400000}}},coachPricing:{[coachId]:{p60:100000,p90:150000,p120:200000}},coachPaymentPublic:{[coachId]:{verificationStatus:'approved'}},bookings:{},coachPublicSchedule:{[coachId]:{}},coachGroupClasses:{[coachId]:{}},coachTimeOff:{[coachId]:{}},coachAvailability:{[coachId]:{travelBufferMin:45,maxClassesPerDay:8}}}}
const request=(input={})=>({actorUid,input:{requestId,coachId,date:'2026-10-10',start:10,durationMinutes:60,venueId:'visda',venueName:'VISDA',participants:1,paymentMode:'request',...input},now});

test('create service writes one server-priced booking and deterministic side effects',async()=>{
  const db=new FakeDb(seed()),result=await service.execute(db,request({priceSatang:1})),id=create.bookingId(actorUid,requestId),saved=read(db.data,`bookings/${id}`);
  assert.deepEqual(result,{ok:true,replay:false,bookingId:id,status:'pending_coach_approval',paymentStatus:'not_started'});assert.equal(saved.priceSatang,100000);assert.equal(saved.athleteId,actorUid);assert.equal(Object.keys(read(db.data,`notifications/${coachId}`)).length,1);assert.equal(read(db.data,`bookingCommandResults/${actorUid}/${requestId}/status`),'completed');
});
test('repeated and concurrent same request create one booking and one notification',async()=>{
  const db=new FakeDb(seed()),outcomes=await Promise.all([service.execute(db,request()),service.execute(db,request())]);assert.equal(outcomes.filter(x=>x.replay).length,1);assert.equal(Object.keys(read(db.data,'bookings')).length,1);assert.equal(Object.keys(read(db.data,`notifications/${coachId}`)).length,1);
  const notificationId=`booking_${actorUid}_${requestId}`;write(db.data,`notifications/${coachId}/${notificationId}/read`,true);await service.execute(db,request());assert.equal(read(db.data,`notifications/${coachId}/${notificationId}/read`),true);
});
test('same request cannot target a different coach',async()=>{
  const db=new FakeDb(seed());await service.execute(db,request());await assert.rejects(()=>service.execute(db,request({coachId:'coach_87654321'})),error=>error.code==='REQUEST_CONFLICT');
});
test('same request cannot change booking content',async()=>{
  const db=new FakeDb(seed());await service.execute(db,request());await assert.rejects(()=>service.execute(db,request({venueName:'สนามใหม่'})),error=>error.code==='REQUEST_CONFLICT');
});
test('paid booking persists only validated private proof metadata',async()=>{
  const db=new FakeDb(seed()),result=await service.execute(db,request({paymentMode:'paid_transfer',paymentProof:proof})),saved=read(db.data,`bookings/${result.bookingId}`);assert.equal(saved.status,'payment_submitted');assert.equal(saved.paymentProofStorage.path,proof.path);assert.equal(Object.hasOwn(saved,'paymentProofDataUrl'),false);
});
test('time off and confirmed commitments block creation before a booking is written',async()=>{
  const off=new FakeDb(seed());write(off.data,`coachTimeOff/${coachId}/off`,{startDate:'2026-10-10',endDate:'2026-10-10',fullDay:true});await assert.rejects(()=>service.execute(off,request()),error=>error.code==='COACH_TIME_OFF');assert.equal(Object.keys(read(off.data,'bookings')).length,0);
  const busy=new FakeDb(seed());write(busy.data,'bookings/existing',{id:'existing',coachId,date:'2026-10-10',start:10,end:11,status:'confirmed',venueId:'visda'});await assert.rejects(()=>service.execute(busy,request()),error=>error.code==='TIME_CONFLICT');assert.equal(Object.keys(read(busy.data,'bookings')).length,1);
});
test('retry repairs notification after booking write even when availability later changes',async()=>{
  const db=new FakeDb(seed());db.failUpdateOnce=true;await assert.rejects(()=>service.execute(db,request()),/simulated network loss/);const id=create.bookingId(actorUid,requestId);assert.ok(read(db.data,`bookings/${id}`));write(db.data,`coachTimeOff/${coachId}/off`,{startDate:'2026-10-10',endDate:'2026-10-10',fullDay:true});const result=await service.execute(db,request());assert.equal(result.replay,true);assert.equal(Object.keys(read(db.data,`notifications/${coachId}`)).length,1);
});
