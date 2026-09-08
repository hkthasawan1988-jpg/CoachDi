const {test}=require('node:test'),assert=require('node:assert/strict'),core=require('../court-theme-core.js');
test('Monday weeks include Sunday and span month/year and leap-year boundaries',()=>{
  assert.deepEqual(core.days('2027-01-03'),['2026-12-28','2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03']);
  assert.equal(core.monday('2026-09-07'),'2026-09-07');assert.equal(core.monday('2026-09-09'),'2026-09-07');assert.equal(core.monday('2024-02-29'),'2024-02-26');
});
test('invalid or normalized-overflow dates cannot select a wrong calendar week',()=>{
  for(const date of ['',null,'2026-02-30','2026-13-01','09/09/2026'])assert.throws(()=>core.days(date));
});
