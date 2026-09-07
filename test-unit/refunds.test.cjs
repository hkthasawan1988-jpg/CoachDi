const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../athlete-refunds-core.js');
const bank = { bank: 'ธนาคารทดสอบ', accountName: 'นักกีฬา ทดสอบ', accountNumber: '0012345678' };
const now = Date.parse('2026-09-07T00:00:00+07:00');
const b = { athleteId: 'athlete', coachId: 'original', sport: 'tennis', date: '2026-09-14', start: 10.5, end: 12,
  venueId: 'test-court', venue: 'สนามทดสอบ', status: 'declined', paymentStatus: 'payment_verified' };
const coach = { uid: 'next', status: 'active', sport: 'tennis', displayName: 'โค้ชถัดไป' };
const data = { availability: { start: 6, end: 22, travelBufferMin: 30, advanceDays: 30 },
  venues: { 'test-court': { name: 'สนามทดสอบ', openStart: 6, openEnd: 22 } }, schedule: {}, groups: {}, timeOff: {} };
test('optional account accepts blank; partial/invalid account is rejected without losing leading zeros', () => {
  assert.equal(C.account({}, false), null);
  assert.deepEqual(C.account({ ...bank, accountNumber: '๐๐๑-๒๓๔ ๕๖๗๘' }), bank);
  for (const accountNumber of ['12', '12345abc78', '123456789012345678901', '1e123456', '123456/7']) assert.throws(() => C.account({ ...bank, accountNumber }));
  assert.throws(() => C.account({ bank: bank.bank }, false));
});
test('coach cancellation requests refund on the same booking and preserves its status/payment', () => {
  const patch = C.refundPatch(b, 'athlete', bank, '', false, 123, now);
  assert.equal(patch.refundAccountNumber, '0012345678'); assert.equal(patch.refundStatus, 'requested');
  assert.equal(patch.status, undefined); assert.equal(patch.paymentStatus, undefined); assert.equal(patch.coachId, undefined);
  assert.throws(() => C.refundPatch({ ...b, ...patch }, 'athlete', bank, '', false, 124, now), /ส่งคำขอ/);
});
test('no payment, non-owner, completed/refunded and missing account cannot create refund requests', () => {
  for (const value of [{ ...b, paymentStatus: 'pay_at_venue_pending' }, { ...b, status: 'confirmed' }, { ...b, status: 'refunded' }, { ...b, status: 'completed' }])
    assert.throws(() => C.refundPatch(value, 'athlete', bank, '', false, 123, now));
  assert.throws(() => C.refundPatch(b, 'other', bank, '', false, 123, now));
  assert.throws(() => C.refundPatch(b, 'athlete', {}, '', false, 123, now));
});
test('paid cancellations require account both outside and inside 24h; unpaid cancellations do not', () => {
  const confirmed = { ...b, status: 'confirmed' };
  assert.throws(() => C.refundPatch(confirmed, 'athlete', {}, '', true, 123, now));
  assert.equal(C.refundPatch(confirmed, 'athlete', bank, 'ไม่สะดวก', true, 123, now).status, 'cancelled_by_athlete');
  const near = Date.parse('2026-09-14T09:00:00+07:00');
  assert.equal(C.refundPatch(confirmed, 'athlete', bank, '', true, 123, near).status, 'refund_pending_coach_decision');
  assert.equal(C.refundPatch({ ...confirmed, paymentStatus: 'pay_at_venue_pending' }, 'athlete', null, '', true, 123, now).refundStatus, undefined);
});
test('legacy cancelled booking can supply a missing refund account; past lessons cannot be cancelled', () => {
  assert.equal(C.refundPatch({ ...b, status: 'cancelled_by_athlete', cancelRequestedAt: 1 }, 'athlete', bank, '', false, 123, now).refundStatus, 'requested');
  assert.throws(() => C.refundPatch({ ...b, status: 'confirmed' }, 'athlete', bank, '', true, 123, now + 10 * 864e5));
});
test('recommendation matches exact sport, full duration and same venue, always awaiting confirmation', () => {
  const found = C.candidate(b, coach, data, now);
  assert.equal(found.uid, 'next'); assert.equal(found.start, 10.5); assert.equal(found.end, 12); assert.equal(found.needsConfirmation, true);
  assert.equal(C.candidate(b, { ...coach, sport: 'badminton' }, data, now), null);
  assert.equal(C.candidate(b, coach, { ...data, venues: {} }, now), null);
  assert.equal(C.candidate(b, coach, { ...data, availability: { start: 6, end: 11 } }, now), null);
});
test('recommendation excludes original aliases, suspended profiles, stale dates, failed reads and time off', () => {
  for (const c of [{ ...coach, uid: 'original' }, { ...coach, aliasUids: ['original', 'next'] }, { ...coach, status: 'suspended' }]) assert.equal(C.candidate(b, c, data, now), null);
  assert.equal(C.candidate(b, coach, { ...data, failed: true }, now), null);
  assert.equal(C.candidate(b, coach, data, now + 10 * 864e5), null);
  assert.equal(C.candidate(b, coach, { ...data, timeOff: { a: { date: b.date, fullDay: true } } }, now), null);
});
test('recommendations reject partial overlaps, group lessons, known bookings and insufficient travel gaps', () => {
  for (const key of ['schedule', 'groups', 'ownBookings']) assert.equal(C.candidate(b, coach, { ...data, [key]: { a: { date: b.date, start: '11:30', end: '12:30' } } }, now), null);
  assert.equal(C.candidate(b, coach, { ...data, schedule: { a: { date: b.date, start: 9, end: 10, venueName: 'สนามอื่น' } } }, now), null);
  assert.ok(C.candidate(b, coach, { ...data, schedule: { a: { date: b.date, start: 9, end: 10, venueName: b.venue } } }, now));
});
