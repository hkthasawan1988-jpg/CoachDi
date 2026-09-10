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

export const getRefundAccountSummary = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'athlete') throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ดำเนินการ');
  const summary = (await db.ref(`athleteRefundAccountSummary/${uid}`).get()).val();
  return { ok: true, account: summary || null };
});

export const getRefundInstruction = onCall({ region: 'asia-southeast1', secrets: [REFUND_ACCOUNT_KEY] }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const refundId = cleanId(request.data?.refundId);
  const instruction = (await db.ref(`privateRefundInstructions/${refundId}`).get()).val();
  if (!instruction?.accountNumberEncrypted) throw new HttpsError('not-found', 'ไม่พบข้อมูลบัญชีคืนเงิน');

  const accountNumber = decryptAccount(instruction.accountNumberEncrypted);
  await db.ref(`serverAuditLogs/${uid}`).push({
    type: 'refund_bank_details_viewed', refundId, athleteId: instruction.athleteId || '', createdAt: ServerValue.TIMESTAMP,
  });

  return {
    ok: true,
    refundId,
    bankCode: instruction.bankCode,
    bankName: instruction.bankName,
    accountName: instruction.accountName,
    accountNumber,
    bookingId: instruction.bookingId,
  };
});

export const markRefundPaid = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const refundId = cleanId(request.data?.refundId);
  const ref = db.ref(`refunds/${refundId}`);
  const refund = (await ref.get()).val();
  if (!refund) throw new HttpsError('not-found', 'ไม่พบรายการคืนเงิน');
  if (refund.status === 'paid') return { ok: true, status: 'paid', idempotent: true };

  const now = Date.now();
  await ref.update({ status: 'paid', paidAt: now, paidBy: uid, updatedAt: now });
  if (refund.athleteId) {
    await db.ref(`notifications/${refund.athleteId}`).push({
      type: 'refund_paid', bookingId: refund.bookingId || '', recipientId: refund.athleteId, senderId: uid,
      title: 'คืนเงินเรียบร้อยแล้ว', message: `คืนเงินเข้าบัญชี ${refund.bankName || ''} ${refund.maskedAccountNumber || ''} แล้ว`,
      read: false, createdAt: now,
    });
  }
  await db.ref(`serverAuditLogs/${uid}`).push({ type: 'refund_marked_paid', refundId, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: 'paid' };
});
