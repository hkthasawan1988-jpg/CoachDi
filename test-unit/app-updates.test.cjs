const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../app-updates-core');
const now=Date.parse('2026-09-08T10:30:00+07:00');
test('group class validates past days, earlier today, exact start, future, and reversed end in Thai time',()=>{
  for(const [date,time] of [['2026-09-07','18:00'],['2026-09-08','10:29'],['2026-09-08','10:30']])assert.match(C.dateError(date,time,'19:00',now),/เลยเวลามาแล้ว/);
  assert.equal(C.dateError('2026-09-08','10:31','11:00',now),'');
  assert.equal(C.dateError('2026-09-09','00:00','01:00',now),'');
  assert.match(C.dateError('2026-09-08','11:00','10:59',now),/สิ้นสุด/);
});
test('invalid and normalized-overflow dates cannot bypass validation',()=>{
  for(const [date,time] of [['2027-02-29','11:00'],['2026-04-31','11:00'],['2026-09-08','24:00'],['','11:00'],['2026-09-08','11:99']])assert.ok(C.dateError(date,time,'23:00',now));
  assert.equal(C.startTime('2028-02-29','09:00'),Date.parse('2028-02-29T02:00:00Z'));
});
test('new class recommendations exclude past, full, closed and cancelled classes and preserve distinct coaches',()=>{
  const base={id:'same-id',coachId:'one',status:'open',date:'2026-09-08',start:'11:00',capacity:4,approvedCount:0};
  const rows=[base,{...base,coachId:'two'},...['closed','cancelled','full'].map(status=>({...base,status})),{...base,approvedCount:4},{...base,start:'10:00'}];
  assert.deepEqual(C.available(rows,now).map(C.classKey),['one/same-id','two/same-id']);
});
test('customer summary counts registered athlete accounts including suspended accounts, excluding coaches, admins and malformed records',()=>{
  assert.equal(C.customers({a:{role:'athlete'},b:{role:'athlete',status:'suspended'},c:{role:'coach'},d:{role:'admin'},e:null,f:{}}),2);
  assert.equal(C.customers(null),0);
});
