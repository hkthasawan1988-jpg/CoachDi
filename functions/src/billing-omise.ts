import { getDatabase, ServerValue } from 'firebase-admin/database';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

const db = getDatabase();
const OMISE_SECRET_KEY = defineSecret('OMISE_SECRET_KEY');
const MONTHLY_PRICE_SATANG = 25900;
const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;

function uidOf(request: any) {
  const uid = request.auth?.uid as string | undefined;
  if (!uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  return uid;
}

async function roleOf(uid: string) {
  return String((await db.ref(`users/${uid}/role`).get()).val() || '');
}

function secret() {
  const key = OMISE_SECRET_KEY.value();
  if (!key) throw new HttpsError('failed-precondition', 'Omise secret is not configured');
  return key;
}

async function omise(path: string, body: Record<string, string | number | boolean>) {
  const auth = Buffer.from(`${secret()}:`).toString('base64');
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(body)) form.set(k, String(v));
  const response = await fetch(`https://api.omise.co${path}`, {
    method: 'POST',
    headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const payload: any = await response.json().catch(() => ({}));
  if (!response.ok || payload?.failure_code || payload?.object === 'error') {
    const message = payload?.message || payload?.failure_message || 'Omise request failed';
    throw new Error(message);
  }
  return payload;
}

async function chargeCustomer(coachId: string, customerId: string, periodKey: string) {
  const ledgerRef = db.ref(`subscriptionTransactions/${coachId}_${periodKey}`);
  const existing = (await ledgerRef.get()).val();
  if (existing?.status === 'paid') return { ok: true, idempotent: true, chargeId: existing.omiseChargeId || '' };

  const charge = await omise('/charges', {
    amount: MONTHLY_PRICE_SATANG,
    currency: 'thb',
    customer: customerId,
    description: `Coach Di monthly subscription ${coachId} ${periodKey}`,
  });

  const now = Date.now();
  const paid = charge?.status === 'successful' || charge?.paid === true;
  await ledgerRef.set({
    coachId,
    provider: 'omise',
    amountSatang: MONTHLY_PRICE_SATANG,
    currency: 'THB',
    periodKey,
    status: paid ? 'paid' : String(charge?.status || 'pending'),
    omiseChargeId: charge?.id || '',
    createdAt: now,
    updatedAt: now,
  });

  if (!paid) throw new Error(`Omise charge status: ${String(charge?.status || 'unknown')}`);

  const nextDueAt = now + PERIOD_MS;
  await db.ref(`users/${coachId}/subscription`).update({
    status: 'active',
    provider: 'omise',
    priceSatang: MONTHLY_PRICE_SATANG,
    currentPeriodStartedAt: now,
    currentPeriodEndsAt: nextDueAt,
    nextChargeAt: nextDueAt,
    lastChargeId: charge?.id || '',
    updatedAt: now,
  });
  await db.ref(`serverAuditLogs/${coachId}`).push({ type: 'subscription_omise_charge_paid', chargeId: charge?.id || '', amountSatang: MONTHLY_PRICE_SATANG, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, chargeId: charge?.id || '', nextDueAt };
}

export const attachOmiseCardAndActivateSubscription = onCall({ region: 'asia-southeast1', secrets: [OMISE_SECRET_KEY] }, async request => {
  const coachId = uidOf(request);
  if (await roleOf(coachId) !== 'coach') throw new HttpsError('permission-denied', 'Coach only');
  const cardToken = String(request.data?.cardToken || '').trim();
  if (!/^tokn_/.test(cardToken)) throw new HttpsError('invalid-argument', 'Card token ไม่ถูกต้อง');
  const profile = (await db.ref(`users/${coachId}`).get()).val() || {};

  let billing = (await db.ref(`privateCoachBilling/${coachId}`).get()).val() || {};
  let customerId = String(billing.omiseCustomerId || '');
  if (!customerId) {
    const customer = await omise('/customers', {
      email: profile.email || '',
      description: `Coach Di coach ${coachId}`,
      card: cardToken,
    });
    customerId = String(customer.id || '');
    if (!customerId) throw new HttpsError('internal', 'ไม่สามารถสร้าง Omise customer ได้');
  } else {
    await omise(`/customers/${encodeURIComponent(customerId)}`, { card: cardToken });
  }

  const now = Date.now();
  await db.ref(`privateCoachBilling/${coachId}`).set({
    omiseCustomerId: customerId,
    provider: 'omise',
    updatedAt: now,
  });

  const periodKey = new Date(now).toISOString().slice(0, 10);
  const result = await chargeCustomer(coachId, customerId, periodKey);
  return { ok: true, provider: 'omise', priceSatang: MONTHLY_PRICE_SATANG, nextDueAt: result.nextDueAt };
});

export const getCoachSubscriptionStatus = onCall({ region: 'asia-southeast1' }, async request => {
  const uid = uidOf(request);
  const role = await roleOf(uid);
  const coachId = role === 'admin' ? String(request.data?.coachId || '').trim() : uid;
  if (role !== 'coach' && role !== 'admin') throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์');
  if (!coachId) throw new HttpsError('invalid-argument', 'Coach ID ไม่ถูกต้อง');
  const sub = (await db.ref(`users/${coachId}/subscription`).get()).val() || null;
  return { ok: true, priceSatang: MONTHLY_PRICE_SATANG, subscription: sub };
});

export const chargeDueCoachSubscriptions = onSchedule({ region: 'asia-southeast1', schedule: 'every day 02:15', timeZone: 'Asia/Bangkok', secrets: [OMISE_SECRET_KEY] }, async () => {
  const users = (await db.ref('users').get()).val() || {};
  const now = Date.now();
  for (const [coachId, raw] of Object.entries(users) as any) {
    const user: any = raw || {};
    if (user.role !== 'coach' || String(user.status || 'active') !== 'active') continue;
    const sub = user.subscription || {};
    if (String(sub.provider || '') !== 'omise') continue;
    const due = Number(sub.nextChargeAt || sub.currentPeriodEndsAt || 0);
    if (!due || due > now) continue;
    const billing = (await db.ref(`privateCoachBilling/${coachId}`).get()).val() || {};
    if (!billing.omiseCustomerId) continue;
    const periodKey = new Date(due).toISOString().slice(0, 10);
    try {
      await chargeCustomer(coachId, String(billing.omiseCustomerId), periodKey);
    } catch (error: any) {
      const failedAt = Date.now();
      await db.ref(`users/${coachId}/subscription`).update({ status: 'past_due', lastChargeFailedAt: failedAt, updatedAt: failedAt });
      await db.ref(`notifications/${coachId}`).push({
        type: 'subscription_payment_failed', recipientId: coachId, senderId: 'system',
        title: 'ชำระค่ารายเดือน Coach Di ไม่สำเร็จ',
        message: 'กรุณาตรวจสอบบัตรหรืออัปเดตวิธีชำระเงิน ค่าบริการ 259 บาท/30 วัน',
        read: false, createdAt: failedAt,
      });
      await db.ref(`serverAuditLogs/${coachId}`).push({ type: 'subscription_omise_charge_failed', message: String(error?.message || error).slice(0, 240), createdAt: ServerValue.TIMESTAMP });
    }
  }
});
