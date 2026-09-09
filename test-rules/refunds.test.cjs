const { test, before, after, beforeEach } = require('node:test');
const { readFileSync } = require('node:fs');
const assert = require('node:assert/strict');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const C = require('../athlete-refunds-core.js');
const TimeOff = require('../coach-time-off-core.js');
let env;
const bank = { bank: 'ธนาคารทดสอบ', accountName: 'นักกีฬา ทดสอบ', accountNumber: '0012345678', updatedAt: 1 };
const original = { athleteId: 'athlete', coachId: 'coach', date: '2026-10-10', start: 10, end: 11, status: 'declined', paymentStatus: 'payment_verified' };
const db = uid => env.authenticatedContext(uid, { email: uid + '@example.invalid' }).database();
before(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST?.startsWith('127.0.0.1:')) throw Error('Tests require the isolated local emulator');
  env = await initializeTestEnvironment({ projectId: 'demo-coach-di-refunds', database: { host: '127.0.0.1', port: 9000, rules: readFileSync('database.rules.json','utf8') } });
});
after(async () => { if (env) await env.cleanup(); });
test('coach holiday transactions retain existing ranges, reject overlap and deny other users',async()=>{
  const ref=db('coach').ref('coachTimeOff/coach'),off=TimeOff.range('2026-10-01','2026-10-03');
  await assertSucceeds(ref.set({original:{coachId:'coach',...TimeOff.range('2026-11-01','2026-11-02')}}));
  const submit=id=>ref.transaction(value=>Object.values(value||{}).some(row=>TimeOff.intersects(off,row))?undefined:{...value,[id]:{coachId:'coach',...off}});
  const outcomes=await Promise.all([submit('one'),submit('two')]);assert.equal(outcomes.filter(row=>row.committed).length,1);
  assert.ok((await ref.once('value')).val().original);assert.equal(Object.keys((await ref.once('value')).val()).length,2);
  await assertSucceeds(db('athlete').ref('coachTimeOff/coach').once('value'));
  for(const user of ['athlete','stranger'])await assertFails(db(user).ref('coachTimeOff/coach/other').set(off));
});
beforeEach(async () => {
  await env.clearDatabase();
  await env.withSecurityRulesDisabled(async context => context.database().ref().set({
    users: { athlete: { role:'athlete', refundAccount: bank }, other: { role:'athlete' }, admin: { role:'admin' },
      coach: { role:'coach', status:'active', subscription:{ trialEndsAt: Date.now()+864e5 } }, stranger: { role:'coach', subscription:{ trialEndsAt: Date.now()+864e5 } } },
    bookings: { booking: original, unpaid: { ...original, paymentStatus: 'pay_at_venue_pending' } }
  }));
});
test('refund profile account is private to athlete and admin', async () => {
  for (const uid of ['athlete','admin']) await assertSucceeds(db(uid).ref('users/athlete/refundAccount').once('value'));
  for (const uid of ['other','coach','stranger']) await assertFails(db(uid).ref('users/athlete/refundAccount').once('value'));
  await assertFails(env.unauthenticatedContext().database().ref('users/athlete/refundAccount').once('value'));
});

test('account read boundary works with the Firebase compat SDK and preserves booking query restrictions',async()=>{
  const database=db('athlete'),auth={currentUser:{uid:'athlete'}},state={user:null,role:null,bookings:[]};
  const session=require('../account-session.js').install(database,auth,state);session.begin(auth.currentUser);state.user=auth.currentUser;state.role='athlete';
  const query=database.ref('bookings').orderByChild('athleteId').equalTo('athlete');
  assert.equal(Object.keys((await assertSucceeds(query.once('value'))).val()).length,2);
  await assertFails(database.ref('bookings').orderByChild('athleteId').equalTo('other').once('value'));
  await new Promise((resolve,reject)=>query.on('value',snapshot=>{state.bookings=Object.values(snapshot.val());resolve();},reject));
  assert.equal(state.bookings.length,2);auth.currentUser={uid:'different-account'};session.begin(auth.currentUser);
  assert.deepEqual(state.bookings,[]);assert.equal(session.subscriptionCount(),0);
  await assertSucceeds(database.ref('users/athlete/refundAccount').once('value'));
});

test('unrelated accounts cannot read another account notification feed',async()=>{
  await env.withSecurityRulesDisabled(context=>context.database().ref('notifications/athlete/n').set({type:'booking_confirmed',message:'Private fixture',read:false}));
  await assertSucceeds(db('athlete').ref('notifications/athlete').once('value'));
  for(const uid of ['other','coach','stranger'])await assertFails(db(uid).ref('notifications/athlete').once('value'));
});
test('account requires complete bounded strings and preserves leading zeros', async () => {
  const ref = db('athlete').ref('users/athlete/refundAccount');
  await assertSucceeds(ref.set(bank)); assert.equal((await ref.once('value')).val().accountNumber, '0012345678');
  for (const value of [{ bank:'Test' }, { ...bank, accountNumber:12345678 }, { ...bank, accountNumber:'123abc456' }, { ...bank, extra:'private' }]) await assertFails(ref.set(value));
  await assertFails(db('other').ref('users/athlete/refundAccount').set(bank));
});
test('athlete can request refund; participants can read only their booking', async () => {
  const patch = C.refundPatch(original,'athlete',bank,'',false,Date.now());
  await assertSucceeds(db('athlete').ref('bookings/booking').update(patch));
  for (const uid of ['athlete','coach','admin']) await assertSucceeds(db(uid).ref('bookings/booking').once('value'));
  for (const uid of ['other','stranger']) await assertFails(db(uid).ref('bookings/booking').once('value'));
  await assertFails(db('other').ref('bookings/booking').update(patch));
});
test('missing account and coach-submitted athlete refund requests are denied', async () => {
  const patch = C.refundPatch(original,'athlete',bank,'',false,Date.now());
  const incomplete = { ...patch }; delete incomplete.refundAccountNumber;
  await assertFails(db('athlete').ref('bookings/booking').update(incomplete));
  await assertFails(db('coach').ref('bookings/booking').update(patch));
});
test('submitted bank account and request identity cannot be changed or removed by coach', async () => {
  await assertSucceeds(db('athlete').ref('bookings/booking').update(C.refundPatch(original,'athlete',bank,'',false,Date.now())));
  await assertFails(db('coach').ref('bookings/booking/refundAccountNumber').set('9987654321'));
  await assertFails(db('coach').ref('bookings/booking/refundAccountNumber').remove());
  await assertFails(db('athlete').ref('bookings/booking/refundRequestedAt').set(Date.now()+100));
  await assertSucceeds(db('coach').ref('bookings/booking').update({ refundStatus:'refunded', status:'refunded' }));
});
test('concurrent refund submissions commit once and retain original coach/status/payment', async () => {
  const submit = async () => {
    return C.requestRefund(db('athlete').ref('bookings/booking'), { uid:'athlete', bank, stamp:Date.now });
  };
  const results = await Promise.allSettled([submit(), submit()]);
  assert.equal(results.filter(r => r.status === 'fulfilled' && r.value.committed).length, 1);
  const saved = (await db('athlete').ref('bookings/booking').once('value')).val();
  assert.equal(saved.coachId,'coach'); assert.equal(saved.status,'declined'); assert.equal(saved.paymentStatus,'payment_verified');
});
test('coach cannot delete paid/reimbursement records but can delete an unpaid declined record', async () => {
  await assertFails(db('coach').ref('bookings/booking').remove());
  await assertSucceeds(db('coach').ref('bookings/unpaid').remove());
});
test('existing athlete signup and unrelated booking updates remain allowed', async () => {
  await assertSucceeds(db('new-athlete').ref('users/new-athlete').set({ role:'athlete', email:'new-athlete@example.invalid' }));
  await assertSucceeds(db('athlete').ref('bookings/unpaid').update({ athleteNote:'ข้อความเดิม' }));
  await assertSucceeds(db('coach').ref('bookings/unpaid').update({ declineReason:'ตารางไม่ว่าง' }));
});

test('Android device tokens retain deployed owner/admin access and reject unrelated users', async () => {
  const token={token:'fixture-token-'.repeat(12),deviceId:'device',role:'athlete',enabled:true,platform:'android',createdAt:1,lastSeenAt:1};
  await assertSucceeds(db('athlete').ref('fcmTokens/athlete/device').set(token));
  await assertSucceeds(db('athlete').ref('fcmTokens/athlete/device').once('value'));
  await assertSucceeds(db('admin').ref('fcmTokens/athlete/device').once('value'));
  await assertFails(db('other').ref('fcmTokens/athlete').once('value'));
  await assertFails(db('coach').ref('fcmTokens/athlete/device').set(token));
  await assertSucceeds(db('athlete').ref('fcmTokens/athlete/device').update({enabled:false}));
});

test('public booking projection is readable without exposing or granting writes to private bookings', async () => {
  await env.withSecurityRulesDisabled(async context=>context.database().ref('coachBookingSchedule/coach/opaque').set({active:true,date:'2026-10-10',start:10,end:11,venueName:'สนามทดสอบ'}));
  await assertSucceeds(db('other').ref('coachBookingSchedule/coach').once('value'));
  await assertFails(db('other').ref('bookings/booking').once('value'));
  for (const uid of ['other','coach','admin']) await assertFails(db(uid).ref('coachBookingSchedule/coach/opaque').set({active:false}));
  await assertFails(env.unauthenticatedContext().database().ref('coachBookingSchedule/coach').once('value'));
});
