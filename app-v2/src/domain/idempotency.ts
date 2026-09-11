export type PaymentInstrument = 'credit_card' | 'promptpay';

export interface SubscriptionChargeCommand {
  actorUid: string;
  requestId: string;
  amountSatang: number;
  instrumentType: PaymentInstrument;
}

export interface ExistingSubscriptionPayment {
  coachId: string;
  requestId: string;
  amountSatang: number;
  instrumentType: PaymentInstrument;
  status: string;
}

export type SubscriptionChargeDecision =
  | { ok: true; action: 'create'; identity: string }
  | { ok: true; action: 'replay'; identity: string; status: string }
  | {
      ok: false;
      failure:
        | 'INVALID_ACTOR'
        | 'INVALID_REQUEST_ID'
        | 'INVALID_AMOUNT'
        | 'INVALID_INSTRUMENT'
        | 'REQUEST_CONFLICT';
    };

const identifier = /^[A-Za-z0-9_-]{8,80}$/;
const terminal = new Set(['paid', 'successful', 'failed', 'cancelled', 'expired']);

export function commandIdentity(actorUid: string, requestId: string): string | null {
  const coachId = actorUid.trim();
  const commandId = requestId.trim();
  if (!identifier.test(coachId) || !identifier.test(commandId)) return null;
  return `${coachId}_${commandId}`;
}

export const subscriptionPaymentIdentity = commandIdentity;

export function decideSubscriptionCharge(
  command: SubscriptionChargeCommand,
  existing?: ExistingSubscriptionPayment | null,
): SubscriptionChargeDecision {
  const actorUid = command.actorUid.trim();
  const requestId = command.requestId.trim();
  if (!identifier.test(actorUid)) return { ok: false, failure: 'INVALID_ACTOR' };
  if (!identifier.test(requestId)) return { ok: false, failure: 'INVALID_REQUEST_ID' };
  if (!Number.isSafeInteger(command.amountSatang) || command.amountSatang <= 0) {
    return { ok: false, failure: 'INVALID_AMOUNT' };
  }
  if (command.instrumentType !== 'credit_card' && command.instrumentType !== 'promptpay') {
    return { ok: false, failure: 'INVALID_INSTRUMENT' };
  }

  const identity = commandIdentity(actorUid, requestId)!;
  if (!existing) return { ok: true, action: 'create', identity };

  const sameCommand = existing.coachId === actorUid
    && existing.requestId === requestId
    && existing.amountSatang === command.amountSatang
    && existing.instrumentType === command.instrumentType;
  if (!sameCommand) return { ok: false, failure: 'REQUEST_CONFLICT' };

  return {
    ok: true,
    action: 'replay',
    identity,
    status: terminal.has(existing.status) ? existing.status : 'processing',
  };
}

