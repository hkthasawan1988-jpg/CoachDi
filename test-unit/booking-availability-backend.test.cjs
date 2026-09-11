'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
const availability=require('../functions-mobile/booking-availability.cjs');
const booking={id:'BOOKING_123',date:'2026-10-10',start:10,end:11,venueId:'visda'};
const policy={mandatoryBufferMinutes:45,unknownTravelMinutes:45,maxClassesPerDay:8,travelMinutesBetween:(from,to)=>from==='tropp'&&to==='visda'?30:null};

test('availability accepts a free valid slot',()=>assert.deepEqual(availability.evaluate(booking,{},policy),{ok:true}));
test('availability blocks full and partial time off',()=>{
  assert.equal(availability.evaluate(booking,{timeOff:{off:{startDate:'2026-10-09',endDate:'2026-10-11',fullDay:true}}},policy).code,'COACH_TIME_OFF');
  assert.equal(availability.evaluate(booking,{timeOff:{off:{date:booking.date,fullDay:false,startHour:10.5,endHour:12}}},policy).code,'COACH_TIME_OFF');
  assert.equal(availability.evaluate(booking,{timeOff:{off:{date:booking.date,fullDay:false,startHour:11,endHour:12}}},policy).ok,true);
});
test('availability includes confirmed bookings, appointments and group classes',()=>{
  for(const field of ['bookings','appointments','groupClasses']){
    const row={id:`${field}_123`,date:booking.date,start:10.5,end:11.5,status:field==='bookings'?'confirmed':'open',venueId:'visda'};
    assert.equal(availability.evaluate(booking,{[field]:[row]},policy).code,'TIME_CONFLICT');
  }
  assert.equal(availability.evaluate(booking,{bookings:[{id:'DECLINED_123',date:booking.date,start:10,end:11,status:'declined'}]},policy).ok,true);
  assert.equal(availability.evaluate(booking,{groupClasses:[{id:'GROUP_STRING',date:booking.date,start:'10:30',end:'11:30',status:'open'}]},policy).code,'TIME_CONFLICT');
});
test('availability enforces known travel plus buffer before and after',()=>{
  const before={id:'BEFORE_123',date:booking.date,start:8,end:9.5,status:'confirmed',venueId:'tropp'};
  const result=availability.evaluate(booking,{bookings:[before]},policy);
  assert.equal(result.code,'TRAVEL_BUFFER_INSUFFICIENT');assert.equal(result.requiredMinutes,75);assert.equal(result.availableMinutes,30);
  const after={...before,id:'AFTER_123',start:11.5,end:12,venueId:'tropp'};
  assert.equal(availability.evaluate(booking,{bookings:[after]},policy).code,'TRAVEL_BUFFER_INSUFFICIENT');
});
test('unknown routes use a conservative fallback while same venue needs only buffer',()=>{
  const previous={id:'PREVIOUS_123',date:booking.date,start:8,end:9.25,status:'confirmed',venueId:'unknown'};
  assert.equal(availability.evaluate(booking,{bookings:[previous]},policy).code,'TRAVEL_BUFFER_INSUFFICIENT');
  assert.equal(availability.evaluate(booking,{bookings:[{...previous,venueId:'visda'}]},policy).ok,true);
});
test('availability enforces the configured daily limit',()=>{
  const appointments=Array.from({length:2},(_,i)=>({id:`ROW_${i}1234`,date:booking.date,start:i*2,end:i*2+1,status:'open',venueId:'visda'}));
  assert.equal(availability.evaluate(booking,{appointments},{...policy,maxClassesPerDay:2}).code,'DAILY_LIMIT_REACHED');
});
test('invalid windows and policies fail closed',()=>{
  assert.equal(availability.evaluate({...booking,end:10},{},policy).code,'INVALID_BOOKING_WINDOW');
  assert.equal(availability.evaluate({...booking,date:'2026-02-30'},{},policy).code,'INVALID_BOOKING_WINDOW');
  assert.equal(availability.evaluate(booking,{}, {...policy,mandatoryBufferMinutes:-1}).code,'INVALID_TRAVEL_POLICY');
  assert.equal(availability.evaluate(booking,{}, {...policy,maxClassesPerDay:0}).code,'INVALID_DAILY_LIMIT');
  assert.equal(availability.evaluate(booking,{}, {...policy,now:Date.parse('2026-10-10T10:00:00+07:00')}).code,'BOOKING_IN_PAST');
});
