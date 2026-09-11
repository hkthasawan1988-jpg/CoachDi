'use strict';
const { createHash } = require('node:crypto');

const accountFields = ['requestId','submittedAt','bank','accountNumber','masked','coachLegalName','accountName','qrDataUrl'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Hashes are used only as opaque identifiers; notification text never contains account data.
function submission(account) {
  return digest(accountFields.map(key => account?.[key] ?? null));
}
function currentEvent(current, after) {
  return current?.verificationStatus === after?.verificationStatus && submission(current) === submission(after);
}
function transition(before, after) {
  const status = after?.verificationStatus;
  if (!['pending','approved','rejected'].includes(status)) return null;
  if (before?.verificationStatus === status && submission(before) === submission(after)) return null;
  if (status !== 'pending' && before?.verificationStatus !== 'pending') return null;
  return status;
}
function notification(coachId, recipientId, account, status, time) {
  const pending = status === 'pending';
  const id = 'payout_' + digest([coachId, submission(account), status]);
  return { id, value: {
    type: 'payout_verification_' + status,
    title: pending ? 'บัญชีรับเงินรอตรวจสอบ' : 'ผลการตรวจสอบบัญชีรับเงิน',
    message: pending ? 'มีคำขอตรวจสอบบัญชีรับเงินของโค้ช กรุณาเปิดรายการรออนุมัติ' : status === 'approved' ? 'บัญชีรับเงินของคุณได้รับอนุมัติแล้ว' : 'กรุณาแก้ไขข้อมูลบัญชีรับเงินและส่งให้ตรวจสอบอีกครั้ง',
    senderId: 'system', recipientId, coachId, target: pending ? 'verify' : 'settings',
    createdAt: Date.parse(time), read: false
  }};
}
function publicAccount(account, time, profile = false) {
  const status = account?.verificationStatus === 'approved' ? 'approved' : account?.verificationStatus === 'pending' ? 'pending' : 'rejected';
  const stamp = Math.max(Number(account?.submittedAt) || 0, Number(account?.verifiedAt) || 0, account == null ? Date.parse(time) : 0);
  const base = { verificationStatus: status, revision: String(Math.floor(stamp)).padStart(16,'0') + ':' + (status === 'pending' ? '0' : '1'), updatedAt: stamp };
  // Keep a non-sensitive revision tombstone so an older approved event cannot restore removed details.
  if (account?.verificationStatus !== 'approved') return base;
  const number = String(account.accountNumber || '').trim().replace(/[\s-]/g,'');
  const qr = String(account.qrDataUrl || '').trim();
  const safeImage = qr.length <= 4200000 && (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=\r\n]+$/.test(qr) || /^https:\/\/firebasestorage\.googleapis\.com\//.test(qr));
  const result = { ...base, bank: String(account.bank || '').trim(), masked: account.masked || '•••• ' + number.slice(-4), accountName: String(account.accountName || '').trim(), qrDataUrl: safeImage ? qr : '' };
  if (!profile) result.accountNumber = /^\d{8,20}$/.test(number) ? number : '';
  return result;
}
function applyPublic(current, next) { return current?.revision >= next.revision ? undefined : next; }
function createOnce(current, notice) { return current == null ? notice : undefined; }

async function handle(db, event) {
  const coachId = event.params.coachId, before = event.data.before.val(), after = event.data.after.val();
  const current = (await db.ref('coachPaymentAccounts/' + coachId).once('value')).val();
  if (!currentEvent(current, after)) return;
  await Promise.all([
    db.ref('coachPaymentPublic/' + coachId).transaction(value => applyPublic(value, publicAccount(after, event.time))),
    db.ref('coachProfiles/' + coachId + '/paymentPublic').transaction(value => applyPublic(value, publicAccount(after, event.time, true)))
  ]);
  const status = transition(before, after);
  if (!status) return;
  // Re-check after projection I/O. A superseded pending request must not generate a new alert.
  if (!currentEvent((await db.ref('coachPaymentAccounts/' + coachId).once('value')).val(), after)) return;
  let recipients = [coachId];
  if (status === 'pending') {
    const admins = (await db.ref('users').orderByChild('role').equalTo('admin').once('value')).val() || {};
    recipients = Object.keys(admins).filter(uid => admins[uid]?.role === 'admin');
  }
  await Promise.all(recipients.map(uid => {
    const notice = notification(coachId, uid, after, status, event.time);
    // A transaction at a stable key makes function retries and concurrent deliveries create once.
    return db.ref('notifications/' + uid + '/' + notice.id).transaction(value => createOnce(value, notice.value));
  }));
}

module.exports = { submission, currentEvent, transition, notification, publicAccount, applyPublic, createOnce, handle };
