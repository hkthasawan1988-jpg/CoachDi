'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const lock = require('../functions-mobile/booking-slot-lock.cjs');

const booking={ id:'BOOKING_123',date:'2026-10-10',start:10,end:11,status:'confirmed' };

test('day lock claims the whole interval and replays the same booking',()=>{
  const first=lock.claim({},booking,1);assert.equal(first.ok,true);assert.equal(first.replay,false);
  const again=lock.claim(first.value,booking,2);assert.equal(again.ok,true);assert.equal(again.replay,true);
  assert.equal(again.value.booking_BOOKING_123.updatedAt,1);
});

test('day lock blocks exact, partial and enclosing overlap',()=>{
  const current=lock.claim({},booking,1).value;
  for(const [id,start,end] of [['SAME_123',10,11],['LEFT_123',9.5,10.5],['RIGHT_123',10.5,11.5],['WIDE_123',9,12]]){
    const result=lock.claim(current,{id,date:booking.date,start,end,status:'confirmed'},2);
    assert.equal(result.ok,false);assert.equal(result.code,'SLOT_ALREADY_LOCKED');assert.equal(result.conflictingBookingId,booking.id);
  }
});

test('adjacent and inactive intervals remain available',()=>{
  const current=lock.claim({},booking,1).value;
  assert.equal(lock.claim(current,{...booking,id:'BEFORE_123',start:9,end:10},2).ok,true);
  assert.equal(lock.claim(current,{...booking,id:'AFTER_123',start:11,end:12},2).ok,true);
  const inactive={ legacy:{bookingId:'OLD_123',date:booking.date,start:10,end:11,status:'cancelled'} };
  assert.equal(lock.claim(inactive,booking,2).ok,true);
});

test('legacy hour locks participate in overlap checks',()=>{
  const legacy={ '10':{bookingId:'LEGACY_123',date:booking.date,start:10,end:11,status:'active'} };
  assert.equal(lock.claim(legacy,booking,2).code,'SLOT_ALREADY_LOCKED');
});

test('invalid normalized dates, windows and ids are rejected',()=>{
  for(const changed of [
    {id:'x'},{date:'2026-02-30'},{start:11,end:10},{start:-1},{end:25},{start:0,end:13},
  ]) assert.equal(lock.claim({}, {...booking,...changed},1).code,'INVALID_BOOKING_WINDOW');
});

test('release removes only the matching canonical lock',()=>{
  const current={...lock.claim({},booking,1,'COMMAND_123').value,legacy:{bookingId:'OTHER_123',start:1,end:2}};
  assert.equal(lock.release(current,booking.id,'OTHER_COMMAND').changed,false);
  const result=lock.release(current,booking.id,'COMMAND_123');assert.equal(result.changed,true);
  assert.equal(result.value.booking_BOOKING_123,undefined);assert.ok(result.value.legacy);
});
