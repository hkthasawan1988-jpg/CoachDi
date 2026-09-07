const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const refund=require('../scripts/prepare-refund-rules.cjs');
const mobile=require('../scripts/prepare-mobile-rules.cjs');
test('reviewed Firebase rules retain every deployed node and only add the intended refund/schedule changes',()=>{
  const baseline=JSON.parse(readFileSync('test-rules/production-baseline.rules.json','utf8'));
  const proposal=JSON.parse(readFileSync('database.rules.json','utf8'));
  assert.deepEqual(mobile.merge(refund.merge(baseline,proposal),proposal),proposal);
  for(const key of Object.keys(baseline.rules)) {
    if(!['users','bookings'].includes(key)) assert.deepEqual(proposal.rules[key],baseline.rules[key],key);
  }
  assert.equal(proposal.rules.users.$uid['.write'],baseline.rules.users.$uid['.write']);
});
