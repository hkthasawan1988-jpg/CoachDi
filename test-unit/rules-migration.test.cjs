const { test } = require('node:test');
const assert = require('node:assert/strict');
const { merge } = require('../scripts/prepare-refund-rules.cjs');
const proposed = require('../database.rules.json');
const deletion = "!newData.exists() && (data.child('status').val() === 'rejected_by_coach' || data.child('status').val() === 'declined')";
function current() { return { rules: { '.read':false, '.write':false, users: { $uid: { '.write':'CURRENT_AUTHORIZATION', '.validate':'CURRENT_COACH_APPROVAL_CHECK' } },
  bookings: { $bookingId: { '.read':'CURRENT_BOOKING_READ', '.write':'CURRENT_AUTHORIZATION && ('+deletion+')', '.validate':'CURRENT_PAYMENT_CHECK' } }, untouched:{ '.read':false, '.write':false } } }; }
test('migration preserves current auth/read/validation and all unrelated nodes without mutating input', () => {
  const input = current(), previous = structuredClone(input), next = merge(input,proposed);
  assert.deepEqual(input,previous); assert.deepEqual(next.rules.untouched,input.rules.untouched);
  assert.equal(next.rules.users.$uid['.write'],'CURRENT_AUTHORIZATION');
  assert.equal(next.rules.users.$uid['.validate'],'CURRENT_COACH_APPROVAL_CHECK');
  assert.equal(next.rules.bookings.$bookingId['.read'],'CURRENT_BOOKING_READ');
  assert.ok(next.rules.bookings.$bookingId['.validate'].startsWith('(CURRENT_PAYMENT_CHECK) && '));
  assert.ok(next.rules.bookings.$bookingId['.write'].includes("!data.child('refundRequestedAt').exists()"));
  assert.ok(next.rules.users.$uid.refundAccount);
});
test('migration refuses unknown deletion shape, existing account rules and permissive roots', () => {
  for (const change of [x=>x.rules['.read']=true,x=>x.rules.users.$uid.refundAccount={},x=>x.rules.bookings.$bookingId['.write']='CHANGED_RULE']) {
    const input=current(); change(input); assert.throws(()=>merge(input,proposed));
  }
});
