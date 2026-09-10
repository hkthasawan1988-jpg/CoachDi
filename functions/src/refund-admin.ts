import { getDatabase, ServerValue } from 'firebase-admin/database';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import crypto from 'node:crypto';

const db = getDatabase();
const REFUND_ACCOUNT_KEY = defineSecret('REFUND_ACCOUNT_KEY');

const requireAuth = (request: any) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  return request.auth.uid as string;
};

async function roleOf(uid: string) {
  return String((await db.ref(`users/${uid}/role`).get()).val() || '');
}

function cleanId(value: unknown) {
  const v = String(value ?? '').trim();
  if (!v || v.length > 120) throw new HttpsError('invalid-argument', 'ข้อมูลไม่ถูกต้อง');
  return v;
}

function key() {
  const raw = REFUND_ACCOUNT_KEY.value();
  if (!raw) throw new HttpsError('failed-precondition', 'Refund encryption key is not configured');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function decryptAccount(payload: { ciphertext: string; iv: string; tag: string }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

function safeRefund(refundId: string, value: any) {
  return {
    refundId,
    bookingId: value.bookingId || '',
    athleteId: value.athleteId || '',
    coachId: value.coachId || '',
    amountSatang: Number(value.amountSatang || 0),
    status: String(value.status || 'requested'),
    refundMethod: value.refundMethod || 'bank_transfer',
    bankName: value.bankName || '',
    accountName: value.accountName || '',
    maskedAccountNumber: value.maskedAccountNumber || '',
    requestedAt: Number(value.requestedAt || value.createdAt || 0),
    processingAt: Number(value.processingAt || 0),
    paidAt: Number(value.paidAt || 0),
    updatedAt: Number(value.updatedAt || 0),
  };
}

export const getRefundAccountSummary = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'athlete') throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ดำเนินการ');
  const summary = (await db.ref(`athleteRefundAccountSummary/${uid}`).get()).val();
  return { ok: true, account: summary || null };
});

export const listMyRefunds = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'athlete') throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ดำเนินการ');
  const snap = await db.ref('refunds').orderByChild('athleteId').equalTo(uid).get();
  const rows = Object.entries(snap.val() || {}).map(([refundId, value]) => safeRefund(refundId, value));
  rows.sort((a, b) => b.requestedAt - a.requestedAt);
  return { ok: true, refunds: rows.slice(0, 50) };
});

export const listRefundQueue = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const snap = await db.ref('refunds').get();
  const rows = Object.entries(snap.val() || {}).map(([refundId, value]) => safeRefund(refundId, value));
  const order: Record<string, number> = { requested: 0, processing: 1, paid: 2, rejected: 3 };
  rows.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9) || b.requestedAt - a.requestedAt);
  return { ok: true, refunds: rows.slice(0, 200) };
});

export const getRefundInstruction = onCall({ region: 'asia-southeast1', secrets: [REFUND_ACCOUNT_KEY] }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const refundId = cleanId(request.data?.refundId);
  const [refundSnap, instructionSnap] = await Promise.all([
    db.ref(`refunds/${refundId}`).get(),
    db.ref(`privateRefundInstructions/${refundId}`).get(),
  ]);
  const refund = refundSnap.val();
  const instruction = instructionSnap.val();
  if (!refund) throw new HttpsError('not-found', 'ไม่พบรายการคืนเงิน');
  if (!instruction?.accountNumberEncrypted) throw new HttpsError('not-found', 'ไม่พบข้อมูลบัญชีคืนเงิน');

  const accountNumber = decryptAccount(instruction.accountNumberEncrypted);
  await db.ref(`serverAuditLogs/${uid}`).push({
    type: 'refund_bank_details_viewed', refundId, athleteId: instruction.athleteId || '', createdAt: ServerValue.TIMESTAMP,
  });

  return {
    ok: true,
    refundId,
    status: refund.status || 'requested',
    amountSatang: Number(refund.amountSatang || 0),
    bankCode: instruction.bankCode,
    bankName: instruction.bankName,
    accountName: instruction.accountName,
    accountNumber,
    bookingId: instruction.bookingId,
  };
});

export const setRefundProcessing = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const refundId = cleanId(request.data?.refundId);
  const ref = db.ref(`refunds/${refundId}`);
  const refund = (await ref.get()).val();
  if (!refund) throw new HttpsError('not-found', 'ไม่พบรายการคืนเงิน');
  if (refund.status === 'paid') throw new HttpsError('failed-precondition', 'รายการนี้คืนเงินแล้ว');
  if (refund.status === 'processing') return { ok: true, status: 'processing', idempotent: true };
  if (refund.status !== 'requested') throw new HttpsError('failed-precondition', 'สถานะ Refund ไม่ถูกต้อง');

  const now = Date.now();
  await ref.update({ status: 'processing', processingAt: now, processingBy: uid, updatedAt: now });
  await db.ref(`serverAuditLogs/${uid}`).push({ type: 'refund_processing', refundId, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: 'processing' };
});

export const markRefundPaid = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const refundId = cleanId(request.data?.refundId);
  const ref = db.ref(`refunds/${refundId}`);
  const refund = (await ref.get()).val();
  if (!refund) throw new HttpsError('not-found', 'ไม่พบรายการคืนเงิน');
  if (refund.status === 'paid') return { ok: true, status: 'paid', idempotent: true };
  if (!['requested', 'processing'].includes(String(refund.status))) {
    throw new HttpsError('failed-precondition', 'สถานะ Refund ไม่พร้อมปิดรายการ');
  }

  const now = Date.now();
  const updates: Record<string, unknown> = {};
  updates[`refunds/${refundId}/status`] = 'paid';
  updates[`refunds/${refundId}/paidAt`] = now;
  updates[`refunds/${refundId}/paidBy`] = uid;
  updates[`refunds/${refundId}/updatedAt`] = now;
  if (refund.bookingId) {
    updates[`bookings/${refund.bookingId}/refundStatus`] = 'paid';
    updates[`bookings/${refund.bookingId}/refundedAt`] = now;
  }
  if (refund.athleteId) {
    const nid = db.ref(`notifications/${refund.athleteId}`).push().key;
    if (nid) updates[`notifications/${refund.athleteId}/${nid}`] = {
      type: 'refund_paid', bookingId: refund.bookingId || '', recipientId: refund.athleteId, senderId: uid,
      title: 'คืนเงินเรียบร้อยแล้ว', message: `คืนเงินเข้าบัญชี ${refund.bankName || ''} ${refund.maskedAccountNumber || ''} แล้ว`,
      read: false, createdAt: now,
    };
  }
  await db.ref().update(updates);
  await db.ref(`serverAuditLogs/${uid}`).push({ type: 'refund_marked_paid', refundId, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: 'paid' };
});
