const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const refund=require('../scripts/prepare-refund-rules.cjs');
const mobile=require('../scripts/prepare-mobile-rules.cjs');
const payout=require('../scripts/prepare-payout-rules.cjs');
test('reviewed Firebase rules retain deployed nodes with bounded refund, schedule and payout security changes',()=>{
  const baseline=JSON.parse(readFileSync('test-rules/production-baseline.rules.json','utf8'));
  const proposal=JSON.parse(readFileSync('database.rules.json','utf8'));
  assert.deepEqual(payout.merge(mobile.merge(refund.merge(baseline,proposal),proposal)),proposal);
  for(const key of Object.keys(baseline.rules)) {
    if(!['users','bookings','coachPaymentAccounts','coachProfiles','coachPaymentPublic'].includes(key)) assert.deepEqual(proposal.rules[key],baseline.rules[key],key);
  }
  assert.equal(proposal.rules.users.$uid['.write'],baseline.rules.users.$uid['.write']);
  assert.equal(proposal.rules.coachProfiles.$coachId['.write'],baseline.rules.coachProfiles.$coachId['.write']);
  for(const key of ['.read','accountNumber']) assert.deepEqual(proposal.rules.coachPaymentAccounts.$coachId[key],baseline.rules.coachPaymentAccounts.$coachId[key]);
  for(const key of ['.read','accountNumber']) assert.deepEqual(proposal.rules.coachPaymentPublic.$coachId[key],baseline.rules.coachPaymentPublic.$coachId[key]);
});
