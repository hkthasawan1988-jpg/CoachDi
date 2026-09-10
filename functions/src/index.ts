import { initializeApp } from 'firebase-admin/app';
import { getDatabase, ServerValue } from 'firebase-admin/database';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import crypto from 'node:crypto';

initializeApp();
const db = getDatabase();
const REFUND_ACCOUNT_KEY = defineSecret('REFUND_ACCOUNT_KEY');

const requireAuth = (request: any) => {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  return request.auth.uid as string;
};

async function getUser(uid: string) {
  return (await db.ref(`users/${uid}`).get()).val() || null;
}

function cleanAccountNumber(value: unknown) {
  const v = String(value ?? '').replace(/\D/g, '');
  if (v.length < 8 || v.length > 20) throw new HttpsError('invalid-argument', 'เลขบัญชีไม่ถูกต้อง');
  return v;
}

function cleanText(value: unknown, label: string, max = 120) {
  const v = String(value ?? '').trim();
  if (!v || v.length > max) throw new HttpsError('invalid-argument', `${label}ไม่ถูกต้อง`);
  return v;
}

function encryptionKey() {
  const raw = REFUND_ACCOUNT_KEY.value();
  if (!raw) throw new HttpsError('failed-precondition', 'Refund encryption key is not configured');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encryptAccount(accountNumber: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(accountNumber, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

function maskedAccount(accountNumber: string) {
  return `••••${accountNumber.slice(-4)}`;
}

async function assertRole(uid: string, allowed: string[]) {
  const user = await getUser(uid);
  if (!user?.role || !allowed.includes(String(user.role))) throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์ดำเนินการ');
  return user;
}

export const saveRefundAccount = onCall({ region: 'asia-southeast1', secrets: [REFUND_ACCOUNT_KEY] }, async (request) => {
  const uid = requireAuth(request);
  await assertRole(uid, ['athlete']);

  const bankCode = cleanText(request.data?.bankCode, 'ธนาคาร', 30);
  const bankName = cleanText(request.data?.bankName, 'ธนาคาร', 80);
  const accountName = cleanText(request.data?.accountName, 'ชื่อบัญชี', 120);
  const accountNumber = cleanAccountNumber(request.data?.accountNumber);
  const encrypted = encryptAccount(accountNumber);
  const now = Date.now();

  await db.ref(`privateRefundAccounts/${uid}`).set({
    bankCode,
    bankName,
    accountName,
    accountLast4: accountNumber.slice(-4),
    accountNumberEncrypted: encrypted,
    updatedAt: now,
  });

  await db.ref(`athleteRefundAccountSummary/${uid}`).set({
    bankCode,
    bankName,
    accountName,
    maskedAccountNumber: maskedAccount(accountNumber),
    updatedAt: now,
  });

  await db.ref(`serverAuditLogs/${uid}`).push({
    type: 'refund_account_saved',
    createdAt: ServerValue.TIMESTAMP,
  });

  return { ok: true, bankCode, bankName, accountName, maskedAccountNumber: maskedAccount(accountNumber) };
});

export const requestRefund = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  await assertRole(uid, ['athlete']);
  const bookingId = cleanText(request.data?.bookingId, 'Booking ID', 120);

  const [bookingSnap, accountSnap] = await Promise.all([
    db.ref(`bookings/${bookingId}`).get(),
    db.ref(`privateRefundAccounts/${uid}`).get(),
  ]);
  const booking = bookingSnap.val();
  const account = accountSnap.val();

  if (!booking || booking.athleteId !== uid) throw new HttpsError('not-found', 'ไม่พบรายการจอง');
  if (!account?.accountNumberEncrypted || !account?.accountLast4) {
    throw new HttpsError('failed-precondition', 'กรุณากรอกบัญชีสำหรับรับเงินคืนก่อน');
  }
  if (!['confirmed', 'cancelled', 'declined', 'rejected_by_coach'].includes(String(booking.status))) {
    throw new HttpsError('failed-precondition', 'สถานะการจองนี้ยังไม่สามารถขอคืนเงินได้');
  }

  const refundId = `booking_${bookingId}`;
  const refundRef = db.ref(`refunds/${refundId}`);
  const existing = (await refundRef.get()).val();
  if (existing) return { ok: true, refundId, status: existing.status, idempotent: true };

  const amountSatang = Number(booking.amountSatang || booking.totalSatang || booking.priceSatang || 0);
  const now = Date.now();
  const refund = {
    bookingId,
    athleteId: uid,
    coachId: booking.coachId || '',
    amountSatang,
    status: 'requested',
    refundMethod: 'bank_transfer',
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountName: account.accountName,
    maskedAccountNumber: `••••${account.accountLast4}`,
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  const updates: Record<string, unknown> = {};
  updates[`refunds/${refundId}`] = refund;
  updates[`privateRefundInstructions/${refundId}`] = {
    athleteId: uid,
    bookingId,
    bankCode: account.bankCode,
    bankName: account.bankName,
    accountName: account.accountName,
    accountLast4: account.accountLast4,
    accountNumberEncrypted: account.accountNumberEncrypted,
    createdAt: now,
  };
  updates[`notifications/${uid}/refund_${bookingId}`] = {
    type: 'refund_requested',
    bookingId,
    recipientId: uid,
    senderId: 'system',
    title: 'รับคำขอคืนเงินแล้ว',
    message: `จะคืนเงินเข้าบัญชี ${account.bankName} ••••${account.accountLast4}`,
    read: false,
    createdAt: now,
  };
  await db.ref().update(updates);

  await db.ref(`serverAuditLogs/${uid}`).push({
    type: 'refund_requested',
    bookingId,
    refundId,
    amountSatang,
    createdAt: ServerValue.TIMESTAMP,
  });

  return { ok: true, refundId, status: 'requested', maskedAccountNumber: `••••${account.accountLast4}` };
});

export const approveBooking = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  await assertRole(uid, ['coach', 'admin']);
  const bookingId = cleanText(request.data?.bookingId, 'Booking ID', 120);
  const ref = db.ref(`bookings/${bookingId}`);
  const snap = await ref.get();
  const booking = snap.val();
  if (!booking) throw new HttpsError('not-found', 'ไม่พบรายการจอง');

  const actor = await getUser(uid);
  if (actor.role === 'coach' && booking.coachId !== uid) throw new HttpsError('permission-denied', 'ไม่ใช่รายการจองของ Coach นี้');
  if (booking.status === 'confirmed') return { ok: true, status: 'confirmed', idempotent: true };
  if (!['pending_coach_approval', 'pending_verification', 'payment_uploaded', 'payment_submitted'].includes(String(booking.status))) {
    throw new HttpsError('failed-precondition', 'สถานะรายการจองไม่พร้อมอนุมัติ');
  }

  const now = Date.now();
  await ref.update({ status: 'confirmed', confirmedAt: now, confirmedBy: uid, updatedAt: now });
  await db.ref(`notifications/${booking.athleteId}`).push({
    type: 'booking_confirmed', bookingId, recipientId: booking.athleteId, senderId: uid,
    title: 'Coach ยืนยันการจองแล้ว', message: 'การจองของคุณได้รับการยืนยันแล้ว', read: false, createdAt: now,
  });
  await db.ref(`serverAuditLogs/${uid}`).push({ type: 'booking_confirmed', bookingId, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: 'confirmed' };
});

export const declineBooking = onCall({ region: 'asia-southeast1' }, async (request) => {
  const uid = requireAuth(request);
  await assertRole(uid, ['coach', 'admin']);
  const bookingId = cleanText(request.data?.bookingId, 'Booking ID', 120);
  const reason = cleanText(request.data?.reason || 'Coach declined', 'เหตุผล', 240);
  const ref = db.ref(`bookings/${bookingId}`);
  const snap = await ref.get();
  const booking = snap.val();
  if (!booking) throw new HttpsError('not-found', 'ไม่พบรายการจอง');
  const actor = await getUser(uid);
  if (actor.role === 'coach' && booking.coachId !== uid) throw new HttpsError('permission-denied', 'ไม่ใช่รายการจองของ Coach นี้');
  if (['declined', 'rejected_by_coach'].includes(String(booking.status))) return { ok: true, status: 'declined', idempotent: true };

  const now = Date.now();
  await ref.update({ status: 'declined', declineReason: reason, declinedAt: now, declinedBy: uid, updatedAt: now });
  await db.ref(`notifications/${booking.athleteId}`).push({
    type: 'booking_declined', bookingId, recipientId: booking.athleteId, senderId: uid,
    title: 'Coach ไม่สามารถรับการจองนี้ได้', message: reason, read: false, createdAt: now,
  });
  await db.ref(`serverAuditLogs/${uid}`).push({ type: 'booking_declined', bookingId, reason, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: 'declined' };
});
