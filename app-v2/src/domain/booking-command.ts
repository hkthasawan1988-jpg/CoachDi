import type { BookingStatus } from './booking';
import { commandIdentity } from './idempotency';

export type BookingCommandAction =
  | 'coach_confirm_paid'
  | 'coach_confirm_venue'
  | 'coach_decline'
  | 'record_venue_payment';

export interface CommandBooking {
  id: string;
  coachId: string;
  athleteId: string;
  status: BookingStatus | 'payment_submitted' | 'pending_verification';
  paymentStatus: string;
  paymentCollectionMode?: string;
  paymentProofPresent?: boolean;
  priceSatang: number;
  travelFeeSatang: number;
  platformFeeSatang: number;
  lastCommandKey?: string;
  lastCommandAction?: BookingCommandAction;
}

export interface BookingCommandContext {
  actorUid: string;
  actorRole: 'athlete' | 'coach' | 'admin';
  requestId: string;
  action: BookingCommandAction;
  booking: CommandBooking;
}

export type BookingCommandFailure =
  | 'INVALID_REQUEST_ID'
  | 'NOT_ASSIGNED_COACH'
  | 'INVALID_BOOKING_AMOUNT'
  | 'INVALID_STATE'
  | 'PAYMENT_EVIDENCE_REQUIRED'
  | 'PAYMENT_METHOD_MISMATCH'
  | 'REQUEST_CONFLICT';

export type BookingCommandDecision =
  | {
      ok: true;
      replay: boolean;
      commandKey: string;
      nextStatus: CommandBooking['status'];
      nextPaymentStatus: string;
      writePaymentLedger: boolean;
      paymentLedgerRequired: boolean;
      refundReviewRequired: boolean;
      grossSatang: number;
      platformFeeSatang: number;
      netSatang: number;
    }
  | { ok: false; failure: BookingCommandFailure };

const paidEvidence = new Set(['payment_submitted', 'payment_uploaded', 'pending_verification', 'payment_verified']);
const pendingCoachDecision = new Set(['pending_coach_approval', 'payment_submitted', 'pending_verification']);

export function evaluateBookingCommand(context: BookingCommandContext): BookingCommandDecision {
  const commandKey = commandIdentity(context.actorUid, context.requestId);
  if (!commandKey) return { ok: false, failure: 'INVALID_REQUEST_ID' };
  const { booking } = context;
  if (context.actorRole !== 'coach' || context.actorUid !== booking.coachId) {
    return { ok: false, failure: 'NOT_ASSIGNED_COACH' };
  }

  const grossSatang = booking.priceSatang + booking.travelFeeSatang;
  const validAmounts = [booking.priceSatang, booking.travelFeeSatang, booking.platformFeeSatang]
    .every(value => Number.isSafeInteger(value) && value >= 0)
    && booking.platformFeeSatang <= grossSatang;
  if (!validAmounts) return { ok: false, failure: 'INVALID_BOOKING_AMOUNT' };

  const result = (
    nextStatus: CommandBooking['status'],
    nextPaymentStatus: string,
    writePaymentLedger: boolean,
    refundReviewRequired = false,
  ): Extract<BookingCommandDecision, { ok: true }> => ({
    ok: true,
    replay: booking.lastCommandKey === commandKey,
    commandKey,
    nextStatus,
    nextPaymentStatus,
    writePaymentLedger,
    paymentLedgerRequired: writePaymentLedger,
    refundReviewRequired,
    grossSatang,
    platformFeeSatang: booking.platformFeeSatang,
    netSatang: grossSatang - booking.platformFeeSatang,
  });

  if (booking.lastCommandKey === commandKey && booking.lastCommandAction !== context.action) {
    return { ok: false, failure: 'REQUEST_CONFLICT' };
  }
  if (booking.lastCommandKey === commandKey) {
    const ledgerRequired = context.action === 'coach_confirm_paid' || context.action === 'record_venue_payment';
    const replay = result(booking.status, booking.paymentStatus, ledgerRequired);
    return { ...replay, replay: true, writePaymentLedger: false, paymentLedgerRequired: ledgerRequired };
  }

  switch (context.action) {
    case 'coach_confirm_paid':
      if (!['payment_submitted', 'pending_verification'].includes(booking.status)
        || !paidEvidence.has(booking.paymentStatus)) {
        return { ok: false, failure: 'INVALID_STATE' };
      }
      if (!booking.paymentProofPresent) return { ok: false, failure: 'PAYMENT_EVIDENCE_REQUIRED' };
      if (booking.paymentCollectionMode === 'venue') {
        return { ok: false, failure: 'PAYMENT_METHOD_MISMATCH' };
      }
      return result('confirmed', 'payment_verified', true);

    case 'coach_confirm_venue':
      if (booking.status !== 'pending_coach_approval' || booking.paymentStatus !== 'pay_at_venue_pending') {
        return { ok: false, failure: 'INVALID_STATE' };
      }
      if (booking.paymentCollectionMode !== 'venue') {
        return { ok: false, failure: 'PAYMENT_METHOD_MISMATCH' };
      }
      return result('confirmed', 'due_at_venue', false);

    case 'record_venue_payment':
      if (!['confirmed', 'completed'].includes(booking.status) || booking.paymentStatus !== 'due_at_venue') {
        return { ok: false, failure: 'INVALID_STATE' };
      }
      if (booking.paymentCollectionMode !== 'venue') {
        return { ok: false, failure: 'PAYMENT_METHOD_MISMATCH' };
      }
      return result(booking.status, 'payment_verified', true);

    case 'coach_decline':
      if (!pendingCoachDecision.has(booking.status)) return { ok: false, failure: 'INVALID_STATE' };
      return result('declined', booking.paymentStatus, false, paidEvidence.has(booking.paymentStatus));
  }
}

