import { describe, expect, it } from 'vitest';
import {
  decideSubscriptionCharge,
  subscriptionPaymentIdentity,
  type ExistingSubscriptionPayment,
  type SubscriptionChargeCommand,
} from './idempotency';

const command: SubscriptionChargeCommand = {
  actorUid: 'coach_12345678',
  requestId: 'request_12345678',
  amountSatang: 25_900,
  instrumentType: 'promptpay',
};

const existing: ExistingSubscriptionPayment = {
  coachId: command.actorUid,
  requestId: command.requestId,
  amountSatang: command.amountSatang,
  instrumentType: command.instrumentType,
  status: 'pending',
};

describe('subscription payment idempotency contract', () => {
  it('derives one stable payment identity from coach and client request', () => {
    expect(subscriptionPaymentIdentity(command.actorUid, command.requestId))
      .toBe('coach_12345678_request_12345678');
  });

  it('creates the first valid request', () => {
    expect(decideSubscriptionCharge(command)).toEqual({
      ok: true,
      action: 'create',
      identity: 'coach_12345678_request_12345678',
    });
  });

  it('replays an in-flight duplicate instead of creating another charge', () => {
    expect(decideSubscriptionCharge(command, existing)).toEqual({
      ok: true,
      action: 'replay',
      identity: 'coach_12345678_request_12345678',
      status: 'processing',
    });
  });

  it('replays the recorded terminal result', () => {
    expect(decideSubscriptionCharge(command, { ...existing, status: 'paid' })).toMatchObject({
      ok: true,
      action: 'replay',
      status: 'paid',
    });
  });

  it('rejects reuse of a request id with different payment details', () => {
    expect(decideSubscriptionCharge(
      { ...command, amountSatang: command.amountSatang + 100 },
      existing,
    )).toEqual({ ok: false, failure: 'REQUEST_CONFLICT' });
    expect(decideSubscriptionCharge(
      { ...command, instrumentType: 'credit_card' },
      existing,
    )).toEqual({ ok: false, failure: 'REQUEST_CONFLICT' });
  });

  it('rejects malformed identifiers and amounts before any payment call', () => {
    expect(decideSubscriptionCharge({ ...command, requestId: 'short' }))
      .toEqual({ ok: false, failure: 'INVALID_REQUEST_ID' });
    expect(decideSubscriptionCharge({ ...command, amountSatang: 0 }))
      .toEqual({ ok: false, failure: 'INVALID_AMOUNT' });
  });
});

