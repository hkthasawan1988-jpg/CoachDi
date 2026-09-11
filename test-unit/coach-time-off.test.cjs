const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../coach-time-off-core.js'),court=require('../court-theme-core.js');
test('holiday ranges support reverse dragging, leap days and long cross-year leave',()=>{
  assert.deepEqual(C.range('2027-01-03','2026-12-30'),{startDate:'2026-12-30',endDate:'2027-01-03',fullDay:true});
  assert.equal(C.count(C.range('2024-02-28','2024-03-01')),3);
  assert.equal(C.count(C.range('2026-01-01','2027-12-31')),730);
  for(const value of ['','2026-02-30','2026-13-01','01/01/2026'])assert.equal(C.range(value,'2026-12-31'),null);
});
test('current, legacy and partial-day holidays block only their actual date/time ranges',()=>{
  for(const row of [{startDate:'2026-10-01',endDate:'2026-10-03'},{start:'2026-10-01',end:'2026-10-03'}]){
    assert.equal(C.matches(row,'2026-10-02',8,9),true);assert.equal(C.matches(row,'2026-10-04',8,9),false);
  }
  const part={date:'2026-10-02',fullDay:false,startHour:10,endHour:12};
  assert.equal(C.matches(part,part.date,9,10),false);assert.equal(C.matches(part,part.date,9.5,10.5),true);assert.equal(C.matches(part,part.date,12,13),false);
  assert.equal(C.matches({...part,status:'cancelled'},part.date,10,11),false);
});
test('leave conflicts include pending bookings and closed scheduled classes, exclude cancelled entries',()=>{
  const off=C.range('2026-10-01','2026-10-03'),rows=['confirmed','pending_coach_approval','closed','cancelled'].map(status=>({date:'2026-10-02',status,start:'10:00',end:'11:00'}));
  assert.equal(C.conflicts(off,rows).length,3);assert.equal(C.intersects(off,{start:'2026-10-03',end:'2026-10-05'}),true);
});
test('recognizable venue names replace numeric codes without shortening unknown Thai names',()=>{
  assert.equal(court.venueLabel('TROPP Tennis Club'),'Tro');assert.equal(court.venueLabel('VISDA Premium Tennis Club'),'Visda');
  assert.equal(court.venueLabel('สนามภาษาไทยชื่อยาว'),'สนามภาษาไทยชื่อยาว');assert.equal(court.venueLabel('  New   Court  '),'New Court');
});
