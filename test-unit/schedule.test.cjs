const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../schedule-core.js');
const P = require('../functions-mobile/booking-projection.cjs');
const date = '2026-10-10';
test('drag selects half-hour cells in either direction and cannot cross an occupied interval', () => {
  assert.deepEqual(C.range(date,9,10.5,[]),{date,start:9,end:11});
  assert.deepEqual(C.range(date,10.5,9,[]),{date,start:9,end:11});
  assert.equal(C.range(date,9,10.5,[{date,start:10,end:11,status:'confirmed'}]),null);
  assert.deepEqual(C.range(date,9,10.5,[{date,start:10,end:11,status:'cancelled'}]),{date,start:9,end:11});
  assert.equal(C.range(date,6,23,[]),null);
  assert.deepEqual(C.range(date,23.5,23.5,[]),{date,start:23.5,end:24});
});
test('public booking projection exposes venue/time without athlete, payment or booking ID', () => {
  const b = {coachId:'coach',date,start:10,end:11,venue:'สนามทดสอบ',status:'confirmed',athleteId:'private',phone:'private',refundAccountNumber:'private',paymentProofDataUrl:'private'};
  const data = P.changes('secret-booking',null,b,'2026-09-07T09:00:00.1Z');
  assert.equal(Object.keys(data).length,1);
  assert.equal(Object.values(data)[0].venueName,'สนามทดสอบ');
  for (const privateValue of ['secret-booking','athleteId','phone','refundAccount','paymentProof','private']) assert.ok(!JSON.stringify(data).includes(privateValue));
});
test('cancel/delete retain a version tombstone so delayed events cannot resurrect occupied slots', () => {
  const b = {coachId:'coach',date,start:10,end:11,status:'confirmed'};
  const first = Object.values(P.changes('b',null,b,'2026-09-07T09:00:00.1Z'))[0];
  const cancel = Object.values(P.changes('b',b,{...b,status:'cancelled'},'2026-09-07T09:00:00.11Z'))[0];
  assert.equal(cancel.active,false); assert.equal(P.apply(cancel,first),undefined);
  assert.equal(P.apply(cancel,cancel),undefined);
  assert.equal(Object.values(P.changes('b',b,null,'2026-09-07T10:00:00Z'))[0].active,false);
  const moved = P.changes('b',b,{...b,coachId:'other'},'2026-09-07T11:00:00Z');
  assert.equal(Object.keys(moved).length,2);
  assert.equal(Object.values(moved)[0].active,false); assert.equal(Object.values(moved)[1].active,true);
});
