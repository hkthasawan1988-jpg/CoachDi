'use strict';
const {createHash}=require('node:crypto');

const IDENTIFIER = /^[A-Za-z0-9_-]{8,80}$/;
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const PAID_EVIDENCE = new Set(['payment_submitted', 'payment_uploaded', 'pending_verification', 'payment_verified']);
const PENDING_COACH = new Set(['pending_coach_approval', 'payment_submitted', 'pending_verification']);

function text(value, max = 160) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function commandKey(uid, requestId) {
  const actorUid = text(uid, 80), id = text(requestId, 80);
  return IDENTIFIER.test(actorUid) && IDENTIFIER.test(id) ? `${actorUid}_${id}` : null;
}
function requestFingerprint(actorUid,input={}){
  const canonical={actorUid:text(actorUid,80),bookingId:text(input.bookingId,100),action:text(input.action,40),reason:text(input.reason,160),note:text(input.note,500)};
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function coachEligible(user, now) {
  if (!user || user.role !== 'coach' || user.status !== 'active') return false;
  const subscription = user.subscription || {};
  const current = Number(subscription.currentPeriodEndsAt || 0);
  const trial = Number(subscription.trialEndsAt || 0);
  return Math.max(current, trial) + THREE_DAYS_MS >= now;
}

function amounts(booking) {
  const price = Number(booking.priceSatang), travel = Number(booking.travelFeeSatang || 0);
  const fee = Number(booking.platformFeeSatang || 0), gross = price + travel;
  if (![price, travel, fee].every(value => Number.isSafeInteger(value) && value >= 0) || fee > gross) return null;
  return { grossSatang: gross, platformFeeSatang: fee, netSatang: gross - fee };
}

function failure(code) {
  return { ok: false, code };
}

function evaluate({ actorUid, user, input, booking, now }) {
  const action = text(input && input.action, 40);
  const key = commandKey(actorUid, input && input.requestId);
  if (!key) return failure('INVALID_REQUEST_ID');
  if (!booking || !text(input && input.bookingId, 80) || text(input.bookingId, 80) !== text(booking.id, 80)) {
    return failure('BOOKING_NOT_FOUND');
  }
  if (!coachEligible(user, now)) return failure('COACH_INACTIVE');
  if (actorUid !== booking.coachId) return failure('NOT_ASSIGNED_COACH');
  const money = amounts(booking);
  if (!money) return failure('INVALID_BOOKING_AMOUNT');
  if (booking.lastCommandKey === key && booking.lastCommandAction !== action) return failure('REQUEST_CONFLICT');
  if (booking.lastCommandKey === key) {
    return {
      ok: true, replay: true, action, commandKey: key,
      nextStatus: booking.status, nextPaymentStatus: booking.paymentStatus,
      refundReviewRequired: booking.refundReviewRequired === true,
      paymentLedgerRequired: action === 'coach_confirm_paid' || action === 'record_venue_payment',
      ...money,
    };
  }

  if (action === 'coach_approve_request') {
    if (booking.status !== 'pending_coach_approval' || !['not_started', 'pending_payment', ''].includes(String(booking.paymentStatus || ''))) return failure('INVALID_STATE');
    if (booking.paymentCollectionMode === 'venue') return failure('PAYMENT_METHOD_MISMATCH');
    return { ok:true, replay:false, action, commandKey:key, nextStatus:'coach_approved', nextPaymentStatus:'pending_payment', refundReviewRequired:false, paymentLedgerRequired:false, ...money };
  }

  if (action === 'coach_confirm_paid') {
    if (!['payment_submitted', 'pending_verification'].includes(booking.status)
      || !PAID_EVIDENCE.has(booking.paymentStatus)) return failure('INVALID_STATE');
    if (!(booking.paymentProofDataUrl || booking.paymentProofStorage)) return failure('PAYMENT_EVIDENCE_REQUIRED');
    if (booking.paymentCollectionMode === 'venue') return failure('PAYMENT_METHOD_MISMATCH');
    return { ok: true, replay: false, action, commandKey:key, nextStatus:'confirmed', nextPaymentStatus:'payment_verified', refundReviewRequired:false, paymentLedgerRequired:true, ...money };
  }
  if (action === 'coach_confirm_venue') {
    if (booking.status !== 'pending_coach_approval' || booking.paymentStatus !== 'pay_at_venue_pending') return failure('INVALID_STATE');
    if (booking.paymentCollectionMode !== 'venue') return failure('PAYMENT_METHOD_MISMATCH');
    return { ok:true, replay:false, action, commandKey:key, nextStatus:'confirmed', nextPaymentStatus:'due_at_venue', refundReviewRequired:false, paymentLedgerRequired:false, ...money };
  }
  if (action === 'record_venue_payment') {
    if (!['confirmed', 'completed'].includes(booking.status) || booking.paymentStatus !== 'due_at_venue') return failure('INVALID_STATE');
    if (booking.paymentCollectionMode !== 'venue') return failure('PAYMENT_METHOD_MISMATCH');
    return { ok:true, replay:false, action, commandKey:key, nextStatus:booking.status, nextPaymentStatus:'payment_verified', refundReviewRequired:false, paymentLedgerRequired:true, ...money };
  }
  if (action === 'coach_decline') {
    if (!PENDING_COACH.has(booking.status)) return failure('INVALID_STATE');
    return { ok:true, replay:false, action, commandKey:key, nextStatus:'declined', nextPaymentStatus:booking.paymentStatus, refundReviewRequired:PAID_EVIDENCE.has(booking.paymentStatus), paymentLedgerRequired:false, ...money };
  }
  return failure('UNKNOWN_ACTION');
}

function bookingPatch(decision, actorUid, input, now) {
  if (!decision.ok) throw Error('Cannot patch a rejected command');
  const patch = {
    status: decision.nextStatus,
    paymentStatus: decision.nextPaymentStatus,
    lastCommandKey: decision.commandKey,
    lastCommandAction: decision.action,
    lastCommandAt: now,
    lastCommandBy: actorUid,
  };
  if (decision.action === 'coach_approve_request') {
    Object.assign(patch, { coachApprovedAt:now, coachApprovedBy:actorUid });
  } else if (decision.action === 'coach_confirm_paid') {
    Object.assign(patch, { verifiedAt:now, verifiedBy:actorUid, paymentProofDataUrl:null, paymentProofDeletedAt:now });
  } else if (decision.action === 'coach_confirm_venue') {
    Object.assign(patch, { coachConfirmedAt:now, coachConfirmedBy:actorUid });
  } else if (decision.action === 'record_venue_payment') {
    Object.assign(patch, { paymentReceivedMethod:'venue', paymentVerifiedAt:now, paymentVerifiedBy:actorUid });
  } else if (decision.action === 'coach_decline') {
    Object.assign(patch, {
      declineReason:text(input.reason || 'Coach ไม่สะดวกรับการจอง', 160),
      declineNote:text(input.note, 500),
      declinedAt:now,
      declinedBy:actorUid,
      refundReviewRequired:decision.refundReviewRequired,
    });
  }
  return patch;
}

function paymentLedger(booking, decision, now) {
  if (!decision.ok || !decision.paymentLedgerRequired) return null;
  return {
    bookingId:booking.id,
    coachId:booking.coachId,
    athleteId:booking.athleteId,
    grossSatang:decision.grossSatang,
    platformFeeSatang:decision.platformFeeSatang,
    netSatang:decision.netSatang,
    status:'received',
    method:decision.action === 'record_venue_payment' ? 'venue' : 'transfer',
    commandKey:decision.commandKey,
    receivedAt:now,
  };
}

function sameLedger(current, expected) {
  if (!current || !expected) return false;
  return ['bookingId','coachId','athleteId','grossSatang','platformFeeSatang','netSatang','status','method','commandKey']
    .every(field => current[field] === expected[field]);
}

module.exports = { amounts, bookingPatch, coachEligible, commandKey, evaluate, paymentLedger, requestFingerprint, sameLedger, text };
