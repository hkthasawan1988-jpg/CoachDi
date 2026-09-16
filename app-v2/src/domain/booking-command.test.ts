import { describe, expect, it } from 'vitest';
import {
  evaluateBookingCommand,
  type BookingCommandContext,
  type CommandBooking,
} from './booking-command';

const booking: CommandBooking = {
  id: 'BOOKING_123',
  coachId: 'coach_12345678',
  athleteId: 'athlete_12345678',
  status: 'payment_submitted',
  paymentStatus: 'payment_submitted',
  paymentProofPresent: true,
  priceSatang: 100_000,
  travelFeeSatang: 20_000,
  platformFeeSatang: 12_000,
};

const context = (overrides: Partial<BookingCommandContext> = {}): BookingCommandContext => ({
  actorUid: booking.coachId,
  actorRole: 'coach',
  requestId: 'request_12345678',
  action: 'coach_confirm_paid',
  booking,
  ...overrides,
});

describe('booking command transition contract', () => {
  it('confirms submitted payment and derives server ledger amounts', () => {
    expect(evaluateBookingCommand(context())).toMatchObject({
      ok: true,
      replay: false,
      nextStatus: 'confirmed',
      nextPaymentStatus: 'payment_verified',
      writePaymentLedger: true,
      grossSatang: 120_000,
      platformFeeSatang: 12_000,
      netSatang: 108_000,
    });
  });

  it('requires the assigned active command actor', () => {
    expect(evaluateBookingCommand(context({ actorUid: 'coach_87654321' })))
      .toEqual({ ok: false, failure: 'NOT_ASSIGNED_COACH' });
    expect(evaluateBookingCommand(context({ actorRole: 'athlete' })))
      .toEqual({ ok: false, failure: 'NOT_ASSIGNED_COACH' });
  });

  it('rejects missing payment evidence and client supplied invalid money', () => {
    expect(evaluateBookingCommand(context({ booking: { ...booking, paymentProofPresent: false } })))
      .toEqual({ ok: false, failure: 'PAYMENT_EVIDENCE_REQUIRED' });
    expect(evaluateBookingCommand(context({ booking: { ...booking, platformFeeSatang: 999_999 } })))
      .toEqual({ ok: false, failure: 'INVALID_BOOKING_AMOUNT' });
  });

  it('confirms venue payment without writing a paid ledger early', () => {
    expect(evaluateBookingCommand(context({
      action: 'coach_confirm_venue',
      booking: {
        ...booking,
        status: 'pending_coach_approval',
        paymentStatus: 'pay_at_venue_pending',
        paymentCollectionMode: 'venue',
        paymentProofPresent: false,
      },
    }))).toMatchObject({
      ok: true,
      nextStatus: 'confirmed',
      nextPaymentStatus: 'due_at_venue',
      writePaymentLedger: false,
      paymentLedgerRequired: false,
    });
  });

  it('records venue revenue only after a confirmed booking', () => {
    expect(evaluateBookingCommand(context({
      action: 'record_venue_payment',
      booking: {
        ...booking,
        status: 'confirmed',
        paymentStatus: 'due_at_venue',
        paymentCollectionMode: 'venue',
        paymentProofPresent: false,
      },
    }))).toMatchObject({ ok: true, writePaymentLedger: true, nextPaymentStatus: 'payment_verified' });
  });

  it('requires the matching payment method and current state', () => {
    expect(evaluateBookingCommand(context({ booking: { ...booking, paymentCollectionMode: 'venue' } })))
      .toEqual({ ok: false, failure: 'PAYMENT_METHOD_MISMATCH' });
    expect(evaluateBookingCommand(context({ booking: { ...booking, status: 'completed' } })))
      .toEqual({ ok: false, failure: 'INVALID_STATE' });
  });

  it('flags paid declines for refund review', () => {
    expect(evaluateBookingCommand(context({ action: 'coach_decline' }))).toMatchObject({
      ok: true,
      nextStatus: 'declined',
      refundReviewRequired: true,
      writePaymentLedger: false,
    });
  });

  it('replays a completed command without another ledger write', () => {
    expect(evaluateBookingCommand(context({
      booking: {
        ...booking,
        status: 'confirmed',
        paymentStatus: 'payment_verified',
        lastCommandKey: 'coach_12345678_request_12345678',
        lastCommandAction: 'coach_confirm_paid',
      },
    }))).toMatchObject({
      ok: true,
      replay: true,
      nextStatus: 'confirmed',
      writePaymentLedger: false,
      paymentLedgerRequired: true,
    });
  });

  it('rejects reuse of a request id for a different action', () => {
    expect(evaluateBookingCommand(context({
      action: 'coach_decline',
      booking: {
        ...booking,
        status: 'confirmed',
        paymentStatus: 'payment_verified',
        lastCommandKey: 'coach_12345678_request_12345678',
        lastCommandAction: 'coach_confirm_paid',
      },
    }))).toEqual({ ok: false, failure: 'REQUEST_CONFLICT' });
  });
});

