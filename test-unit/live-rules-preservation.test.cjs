const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const refund=require('../scripts/prepare-refund-rules.cjs');
const mobile=require('../scripts/prepare-mobile-rules.cjs');
const payout=require('../scripts/prepare-payout-rules.cjs');
const group=require('../scripts/prepare-server-owned-group-class-rules.cjs');
test('reviewed Firebase rules retain deployed nodes with bounded refund, schedule, payout and Group Class security changes',()=>{
  const baseline=JSON.parse(readFileSync('test-rules/production-baseline.rules.json','utf8'));
  const proposal=JSON.parse(readFileSync('database.rules.json','utf8'));
  assert.deepEqual(group.merge(payout.merge(mobile.merge(refund.merge(baseline,proposal),proposal))),proposal);
  for(const key of Object.keys(baseline.rules)) {
    if(!['users','bookings','coachPaymentAccounts','coachProfiles','coachPaymentPublic','coachGroupClasses','coachGroupClassRequests'].includes(key)) assert.deepEqual(proposal.rules[key],baseline.rules[key],key);
  }
  assert.equal(proposal.rules.users.$uid['.write'],baseline.rules.users.$uid['.write']);
  assert.equal(proposal.rules.coachProfiles.$coachId['.write'],baseline.rules.coachProfiles.$coachId['.write']);
  for(const key of ['.read','accountNumber']) assert.deepEqual(proposal.rules.coachPaymentAccounts.$coachId[key],baseline.rules.coachPaymentAccounts.$coachId[key]);
  for(const key of ['.read','accountNumber']) assert.deepEqual(proposal.rules.coachPaymentPublic.$coachId[key],baseline.rules.coachPaymentPublic.$coachId[key]);
  assert.equal(proposal.rules.coachGroupClasses.$coachId.$classId['.write'],false);
  assert.equal(proposal.rules.coachGroupClassRequests.$coachId.$classId.$athleteId['.write'],false);
  assert.equal(proposal.rules.groupClassCommandResults.$uid['.write'],false);
});

