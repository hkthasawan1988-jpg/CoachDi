const fs = require('node:fs');
const path = require('node:path');

// Operates only on an explicit local export. This script never contacts Firebase or deploys.
function merge(current, proposal) {
  const next = structuredClone(current), r = next.rules;
  if (r?.['.read'] !== false || r?.['.write'] !== false) throw Error('Review root permissions before preparing this migration');
  const users = r.users?.$uid, bookings = r.bookings?.$bookingId;
  const source = proposal.rules;
  if (!users || !bookings || typeof bookings['.write'] !== 'string') throw Error('Expected existing users and bookings rules');
  if (users.refundAccount) throw Error('A refundAccount rule already exists; review it before merging');
  users.refundAccount = structuredClone(source.users.$uid.refundAccount);
  const deletion = "!newData.exists() && (data.child('status').val() === 'rejected_by_coach' || data.child('status').val() === 'declined')";
  const targetWrite = source.bookings.$bookingId['.write'];
  const start = targetWrite.indexOf(deletion), end = targetWrite.indexOf(") || (newData.exists()", start);
  if (start < 0 || end < 0 || bookings['.write'].split(deletion).length !== 2) throw Error('Booking deletion rules changed; review the merge manually');
  bookings['.write'] = bookings['.write'].replace(deletion, targetWrite.slice(start, end));
  for (const field of ['refundBank', 'refundAccountName', 'refundAccountNumber']) {
    if (bookings[field]) throw Error('Existing rule for ' + field + ' requires manual review');
    bookings[field] = structuredClone(source.bookings.$bookingId[field]);
  }
  const validation = source.bookings.$bookingId['.validate'];
  // Preserve any currently deployed validation instead of weakening it.
  bookings['.validate'] = Object.hasOwn(bookings, '.validate') ? '(' + String(bookings['.validate']) + ') && (' + validation + ')' : validation;
  return next;
}

if (require.main === module) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output || path.resolve(input) === path.resolve(output)) throw Error('Usage: node scripts/prepare-refund-rules.cjs CURRENT_EXPORT.json REVIEW_OUTPUT.json');
  const current = JSON.parse(fs.readFileSync(input,'utf8'));
  const proposal = JSON.parse(fs.readFileSync(path.join(__dirname,'../database.rules.json'),'utf8'));
  fs.writeFileSync(output, JSON.stringify(merge(current, proposal), null, 2) + '\n', { flag:'wx' });
  console.log('Prepared a separate local file for review. No Firebase changes were made.');
}
module.exports = { merge };
