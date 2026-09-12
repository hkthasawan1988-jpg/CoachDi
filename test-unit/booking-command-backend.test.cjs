'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../functions-mobile/booking-command.cjs');

const now = Date.UTC(2026, 8, 20);
const user = { role:'coach', status:'active', subscription:{ trialEndsAt:now + 86400000 } };
const booking = {
  id:'BOOKING_123', coachId:'coach_12345678', athleteId:'athlete_12345678',
  status:'payment_submitted', paymentStatus:'payment_submitted',
  paymentProofDataUrl:'data:image/jpeg;base64,fixture', priceSatang:100000,
  travelFeeSatang:20000, platformFeeSatang:12000,
};
const context = (input = {}, changed = {}) => ({
  actorUid:'coach_12345678', user,
  input:{ bookingId:booking.id, requestId:'request_12345678', action:'coach_confirm_paid', ...input },
  booking:{ ...booking, ...changed }, now,
});

test('backend derives ledger money and never accepts client money fields', () => {
  const decision = core.evaluate(context({ grossSatang:1, platformFeeSatang:0 }));
  assert.equal(decision.ok,true); assert.equal(decision.grossSatang,120000); assert.equal(decision.netSatang,108000);
  const ledger = core.paymentLedger(booking,decision,now);
  assert.deepEqual(ledger,{
    bookingId:booking.id,coachId:booking.coachId,athleteId:booking.athleteId,
    grossSatang:120000,platformFeeSatang:12000,netSatang:108000,status:'received',
    method:'transfer',commandKey:'coach_12345678_request_12345678',receivedAt:now,
  });
});

test('backend requires an active assigned coach with current entitlement', () => {
  assert.equal(core.evaluate({ ...context(), actorUid:'coach_87654321' }).code,'NOT_ASSIGNED_COACH');
  assert.equal(core.evaluate({ ...context(), user:{ ...user, status:'suspended' } }).code,'COACH_INACTIVE');
  assert.equal(core.evaluate({ ...context(), user:{ ...user, subscription:{ trialEndsAt:now-3*86400000-1 } } }).code,'COACH_INACTIVE');
});

test('backend validates evidence, states, method and bounded integer amounts', () => {
  assert.equal(core.evaluate(context({}, { paymentProofDataUrl:null })).code,'PAYMENT_EVIDENCE_REQUIRED');
  assert.equal(core.evaluate(context({}, { status:'completed' })).code,'INVALID_STATE');
  assert.equal(core.evaluate(context({}, { paymentCollectionMode:'venue' })).code,'PAYMENT_METHOD_MISMATCH');
  assert.equal(core.evaluate(context({}, { platformFeeSatang:999999 })).code,'INVALID_BOOKING_AMOUNT');
  assert.equal(core.evaluate(context({}, { priceSatang:1.25 })).code,'INVALID_BOOKING_AMOUNT');
});

test('venue confirmation does not record revenue until coach marks payment received', () => {
  const confirmed = core.evaluate(context({ action:'coach_confirm_venue' },{
    status:'pending_coach_approval',paymentStatus:'pay_at_venue_pending',paymentCollectionMode:'venue',paymentProofDataUrl:null,
  }));
  assert.equal(confirmed.ok,true); assert.equal(confirmed.paymentLedgerRequired,false); assert.equal(core.paymentLedger(booking,confirmed,now),null);
  const paidBooking = { ...booking,status:'confirmed',paymentStatus:'due_at_venue',paymentCollectionMode:'venue',paymentProofDataUrl:null };
  const received = core.evaluate({ ...context({ action:'record_venue_payment' }), booking:paidBooking });
  assert.equal(received.ok,true); assert.equal(received.paymentLedgerRequired,true); assert.equal(core.paymentLedger(paidBooking,received,now).method,'venue');
});

test('declining a submitted payment requires refund review', () => {
  const decision=core.evaluate(context({ action:'coach_decline',reason:'ติดภารกิจ',note:'แจ้งลูกค้าแล้ว' }));
  assert.equal(decision.refundReviewRequired,true);
  assert.deepEqual(core.bookingPatch(decision,booking.coachId,{reason:'ติดภารกิจ',note:'แจ้งลูกค้าแล้ว'},now),{
    status:'declined',paymentStatus:'payment_submitted',lastCommandKey:'coach_12345678_request_12345678',
    lastCommandAction:'coach_decline',lastCommandAt:now,lastCommandBy:booking.coachId,
    declineReason:'ติดภารกิจ',declineNote:'แจ้งลูกค้าแล้ว',declinedAt:now,declinedBy:booking.coachId,refundReviewRequired:true,
  });
});

test('coach approval reserves an unpaid request and asks the athlete to pay',()=>{
  const decision=core.evaluate(context({action:'coach_approve_request'},{status:'pending_coach_approval',paymentStatus:'not_started',paymentProofDataUrl:null}));assert.equal(decision.ok,true);assert.equal(decision.nextStatus,'coach_approved');assert.equal(decision.nextPaymentStatus,'pending_payment');assert.equal(decision.paymentLedgerRequired,false);
});

test('same request replays and different action with same request is rejected', () => {
  const key='coach_12345678_request_12345678';
  const replay=core.evaluate(context({}, { status:'confirmed',paymentStatus:'payment_verified',lastCommandKey:key,lastCommandAction:'coach_confirm_paid' }));
  assert.equal(replay.ok,true); assert.equal(replay.replay,true); assert.equal(replay.paymentLedgerRequired,true);
  assert.equal(core.evaluate(context({action:'coach_decline'},{lastCommandKey:key,lastCommandAction:'coach_confirm_paid'})).code,'REQUEST_CONFLICT');
});

test('ledger recovery accepts only the exact existing command result', () => {
  const decision=core.evaluate(context()), expected=core.paymentLedger(booking,decision,now);
  assert.equal(core.sameLedger(expected,expected),true);
  assert.equal(core.sameLedger({...expected,netSatang:1},expected),false);
  assert.equal(core.sameLedger({...expected,commandKey:'different_123'},expected),false);
});
