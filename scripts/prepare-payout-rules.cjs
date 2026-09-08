'use strict';
const fs = require('node:fs');
const path = require('node:path');
const admin = "root.child('users').child(auth.uid).child('role').val() === 'admin'";
const sameFields = ['bank','accountNumber','masked','coachLegalName','accountName','qrDataUrl','requestId','submittedAt'];
const unchanged = sameFields.map(key => `newData.child('${key}').val() === data.child('${key}').val()`).join(' && ');
const isText = (key, min, max) => `newData.child('${key}').isString() && newData.child('${key}').val().length >= ${min} && newData.child('${key}').val().length <= ${max}`;
const time = key => `newData.child('${key}').isNumber() && newData.child('${key}').val() >= now - 60000 && newData.child('${key}').val() <= now + 60000`;

function merge(current) {
  const next = structuredClone(current), r = next.rules;
  if (r?.['.read'] !== false || r?.['.write'] !== false) throw Error('Review root access first');
  const account = r.coachPaymentAccounts?.$coachId, profile = r.coachProfiles?.$coachId;
  if (!account || !profile || typeof account['.write'] !== 'string') throw Error('Expected existing payout/profile rules');
  const marker = "newData.child('verificationStatus').val() === 'pending'";
  if (account['.write'].includes(marker)) return next;
  const originalWrite = "auth != null && ((auth.uid === $coachId && root.child('users').child(auth.uid).child('role').val() === 'coach' && root.child('users').child(auth.uid).child('status').val() === 'active') || root.child('users').child(auth.uid).child('role').val() === 'admin')";
  if (account['.write'] !== originalWrite) throw Error('Payout authorization changed; review it before merging');
  const pending = [
    "newData.exists()", marker,
    "!newData.child('verifiedBy').exists()", "!newData.child('verifiedAt').exists()", "!newData.child('rejectionReason').exists()",
    isText('bank',1,100), isText('coachLegalName',1,160), isText('accountName',1,160),
    "newData.child('accountNumber').isString() && newData.child('accountNumber').val().matches(/^[0-9]{8,20}$/)",
    time('submittedAt'),
    "(!data.child('submittedAt').isNumber() || newData.child('submittedAt').val() > data.child('submittedAt').val())",
    "(!data.child('verifiedAt').isNumber() || newData.child('submittedAt').val() > data.child('verifiedAt').val())",
    "(!newData.child('requestId').exists() || (newData.child('requestId').isString() && newData.child('requestId').val().length >= 8 && newData.child('requestId').val().length <= 128))"
  ].join(' && ');
  account['.write'] = `auth != null && (${admin} || (auth.uid === $coachId && root.child('users').child(auth.uid).child('role').val() === 'coach' && root.child('users').child(auth.uid).child('status').val() === 'active' && ${pending}))`;
  const review = `newData.child('verificationStatus').val() === 'pending' || (${admin} && data.child('verificationStatus').val() === 'pending' && (newData.child('verificationStatus').val() === 'approved' || newData.child('verificationStatus').val() === 'rejected') && ${unchanged} && newData.child('verifiedBy').val() === auth.uid && ${time('verifiedAt')} && (!data.child('submittedAt').isNumber() || newData.child('verifiedAt').val() >= data.child('submittedAt').val()) && (newData.child('verificationStatus').val() !== 'rejected' || (${isText('rejectionReason',1,1000)})))`;
  account['.validate'] = account['.validate'] ? `(${account['.validate']}) && (${review})` : review;
  const publicFields = ['verificationStatus','bank','accountNumber','masked','accountName','qrDataUrl','updatedAt','revision'];
  const publicUnchanged = publicFields.map(key => `newData.child('paymentPublic/${key}').val() === data.child('paymentPublic/${key}').val()`).join(' && ');
  const protectPublic = `${admin} || (newData.child('paymentPublic').exists() === data.child('paymentPublic').exists() && ${publicUnchanged})`;
  profile['.validate'] = profile['.validate'] ? `(${profile['.validate']}) && (${protectPublic})` : protectPublic;
  return next;
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || path.resolve(input) === path.resolve(output)) throw Error('Usage: node scripts/prepare-payout-rules.cjs CURRENT_EXPORT.json REVIEW_OUTPUT.json');
  fs.writeFileSync(output, JSON.stringify(merge(JSON.parse(fs.readFileSync(input,'utf8'))), null, 2) + '\n', {flag:'wx'});
  console.log('Prepared a local payout rules proposal. No Firebase changes were made.');
}
module.exports = { merge };
