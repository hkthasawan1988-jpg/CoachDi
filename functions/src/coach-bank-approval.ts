import { getDatabase, ServerValue } from 'firebase-admin/database';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import crypto from 'node:crypto';

const db = getDatabase();
const COACH_BANK_KEY = defineSecret('COACH_BANK_KEY');

function uidOf(request: any) {
  const uid = request.auth?.uid as string | undefined;
  if (!uid) throw new HttpsError('unauthenticated', 'กรุณาเข้าสู่ระบบ');
  return uid;
}

async function roleOf(uid: string) {
  return String((await db.ref(`users/${uid}/role`).get()).val() || '');
}

function cleanText(v: unknown, label: string, max = 120) {
  const s = String(v ?? '').trim();
  if (!s || s.length > max) throw new HttpsError('invalid-argument', `${label}ไม่ถูกต้อง`);
  return s;
}

function cleanAccount(v: unknown) {
  const s = String(v ?? '').replace(/\D/g, '');
  if (s.length < 8 || s.length > 20) throw new HttpsError('invalid-argument', 'เลขบัญชีไม่ถูกต้อง');
  return s;
}

function key() {
  const raw = COACH_BANK_KEY.value();
  if (!raw) throw new HttpsError('failed-precondition', 'Coach bank encryption key is not configured');
  return crypto.createHash('sha256').update(raw, 'utf8').digest();
}

function encrypt(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
}

function decrypt(payload: { ciphertext: string; iv: string; tag: string }) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(payload.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8');
}

export const submitCoachPayoutAccount = onCall({ region: 'asia-southeast1', secrets: [COACH_BANK_KEY] }, async request => {
  const uid = uidOf(request);
  if (await roleOf(uid) !== 'coach') throw new HttpsError('permission-denied', 'Coach only');

  const bankCode = cleanText(request.data?.bankCode, 'ธนาคาร', 30);
  const bankName = cleanText(request.data?.bankName, 'ธนาคาร', 80);
  const accountName = cleanText(request.data?.accountName, 'ชื่อบัญชี', 120);
  const accountNumber = cleanAccount(request.data?.accountNumber);
  const now = Date.now();

  await db.ref(`privateCoachPayoutAccounts/${uid}`).set({
    coachId: uid,
    bankCode,
    bankName,
    accountName,
    accountLast4: accountNumber.slice(-4),
    accountNumberEncrypted: encrypt(accountNumber),
    status: 'pending_approval',
    submittedAt: now,
    updatedAt: now,
    approvedAt: null,
    approvedBy: null,
  });

  await db.ref(`coachPayoutAccountSummary/${uid}`).set({
    bankCode,
    bankName,
    accountName,
    maskedAccountNumber: `••••${accountNumber.slice(-4)}`,
    status: 'pending_approval',
    submittedAt: now,
    updatedAt: now,
  });

  await db.ref(`adminPayoutApprovals/${uid}`).set({
    coachId: uid,
    bankCode,
    bankName,
    accountName,
    maskedAccountNumber: `••••${accountNumber.slice(-4)}`,
    status: 'pending_approval',
    submittedAt: now,
    updatedAt: now,
  });

  await db.ref(`serverAuditLogs/${uid}`).push({ type: 'coach_payout_account_submitted', createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: 'pending_approval', maskedAccountNumber: `••••${accountNumber.slice(-4)}` };
});

export const getCoachPayoutAccountSummary = onCall({ region: 'asia-southeast1' }, async request => {
  const uid = uidOf(request);
  const role = await roleOf(uid);
  const coachId = role === 'admin' ? cleanText(request.data?.coachId, 'Coach ID', 128) : uid;
  if (role !== 'coach' && role !== 'admin') throw new HttpsError('permission-denied', 'ไม่มีสิทธิ์');
  const summary = (await db.ref(`coachPayoutAccountSummary/${coachId}`).get()).val();
  return { ok: true, account: summary || null };
});

export const listCoachPayoutApprovals = onCall({ region: 'asia-southeast1' }, async request => {
  const uid = uidOf(request);
  if (await roleOf(uid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const snap = await db.ref('adminPayoutApprovals').get();
  const rows = Object.entries(snap.val() || {}).map(([id, v]: any) => ({ id, ...(v || {}) }));
  rows.sort((a: any, b: any) => Number(b.submittedAt || 0) - Number(a.submittedAt || 0));
  return { ok: true, approvals: rows };
});

export const reviewCoachPayoutAccount = onCall({ region: 'asia-southeast1', secrets: [COACH_BANK_KEY] }, async request => {
  const adminUid = uidOf(request);
  if (await roleOf(adminUid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const coachId = cleanText(request.data?.coachId, 'Coach ID', 128);
  const decision = String(request.data?.decision || '');
  if (!['approved', 'rejected'].includes(decision)) throw new HttpsError('invalid-argument', 'ผลการอนุมัติไม่ถูกต้อง');
  const reason = String(request.data?.reason || '').trim().slice(0, 240);

  const privateRef = db.ref(`privateCoachPayoutAccounts/${coachId}`);
  const account = (await privateRef.get()).val();
  if (!account) throw new HttpsError('not-found', 'ไม่พบบัญชีรับเงินของ Coach');
  if (account.status === decision) return { ok: true, status: decision, idempotent: true };

  const now = Date.now();
  const updates: Record<string, unknown> = {
    [`privateCoachPayoutAccounts/${coachId}/status`]: decision,
    [`privateCoachPayoutAccounts/${coachId}/updatedAt`]: now,
    [`coachPayoutAccountSummary/${coachId}/status`]: decision,
    [`coachPayoutAccountSummary/${coachId}/updatedAt`]: now,
    [`adminPayoutApprovals/${coachId}/status`]: decision,
    [`adminPayoutApprovals/${coachId}/updatedAt`]: now,
    [`adminPayoutApprovals/${coachId}/reviewedBy`]: adminUid,
    [`adminPayoutApprovals/${coachId}/reviewedAt`]: now,
    [`adminPayoutApprovals/${coachId}/reason`]: reason,
  };
  if (decision === 'approved') {
    updates[`privateCoachPayoutAccounts/${coachId}/approvedAt`] = now;
    updates[`privateCoachPayoutAccounts/${coachId}/approvedBy`] = adminUid;
  }
  await db.ref().update(updates);
  await db.ref(`notifications/${coachId}`).push({
    type: 'coach_payout_account_reviewed',
    recipientId: coachId,
    senderId: adminUid,
    title: decision === 'approved' ? 'บัญชีรับเงินได้รับการอนุมัติแล้ว' : 'บัญชีรับเงินยังไม่ผ่านการอนุมัติ',
    message: decision === 'approved' ? 'คุณสามารถใช้บัญชีนี้สำหรับรับเงินจากระบบได้แล้ว' : (reason || 'กรุณาตรวจสอบและส่งข้อมูลบัญชีใหม่'),
    read: false,
    createdAt: now,
  });
  await db.ref(`serverAuditLogs/${adminUid}`).push({ type: 'coach_payout_account_reviewed', coachId, decision, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, status: decision };
});

export const revealCoachPayoutAccount = onCall({ region: 'asia-southeast1', secrets: [COACH_BANK_KEY] }, async request => {
  const adminUid = uidOf(request);
  if (await roleOf(adminUid) !== 'admin') throw new HttpsError('permission-denied', 'Admin only');
  const coachId = cleanText(request.data?.coachId, 'Coach ID', 128);
  const account = (await db.ref(`privateCoachPayoutAccounts/${coachId}`).get()).val();
  if (!account?.accountNumberEncrypted) throw new HttpsError('not-found', 'ไม่พบบัญชีรับเงิน');
  await db.ref(`serverAuditLogs/${adminUid}`).push({ type: 'coach_payout_account_revealed', coachId, createdAt: ServerValue.TIMESTAMP });
  return { ok: true, coachId, bankCode: account.bankCode, bankName: account.bankName, accountName: account.accountName, accountNumber: decrypt(account.accountNumberEncrypted), status: account.status };
});
