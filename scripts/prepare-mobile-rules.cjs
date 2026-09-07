'use strict';
const fs = require('node:fs');
const path = require('node:path');
function merge(current, proposal) {
  const next = structuredClone(current);
  if (next.rules?.['.read'] !== false || next.rules?.['.write'] !== false) throw Error('Review root access first');
  if (next.rules.coachBookingSchedule && JSON.stringify(next.rules.coachBookingSchedule) !== JSON.stringify(proposal.rules.coachBookingSchedule)) throw Error('Existing public booking rules need manual review');
  next.rules.coachBookingSchedule = structuredClone(proposal.rules.coachBookingSchedule);
  // The deployed project already uses device tokens. Preserve those reviewed rules if present.
  if (!next.rules.fcmTokens) next.rules.fcmTokens = structuredClone(proposal.rules.fcmTokens);
  return next;
}
if (require.main === module) {
  const [input,output] = process.argv.slice(2);
  if (!input || !output || path.resolve(input) === path.resolve(output)) throw Error('Usage: node scripts/prepare-mobile-rules.cjs CURRENT_EXPORT.json REVIEW_OUTPUT.json');
  const proposal = JSON.parse(fs.readFileSync(path.join(__dirname,'../database.rules.json'),'utf8'));
  fs.writeFileSync(output,JSON.stringify(merge(JSON.parse(fs.readFileSync(input,'utf8')),proposal),null,2)+'\n',{flag:'wx'});
  console.log('Prepared a local rules proposal; nothing deployed. Review existing fcmTokens rules for Android platform support.');
}
module.exports = {merge};
