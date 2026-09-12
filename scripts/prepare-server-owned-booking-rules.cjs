'use strict';
const fs=require('node:fs');const path=require('node:path');
function protectedWrite(node,label,markers){const current=node&&node['.write'];if(current===false)return;if(typeof current!=='string'||!markers.every(marker=>current.includes(marker)))throw Error(`Review ${label} write rule before making it server-owned`);node['.write']=false}
function addExact(parent,key,value){if(Object.hasOwn(parent,key)){if(JSON.stringify(parent[key])!==JSON.stringify(value))throw Error(`Existing ${key} rules need manual review`);return}parent[key]=structuredClone(value)}
function merge(current){
  const next=structuredClone(current),rules=next.rules;if(rules?.['.read']!==false||rules?.['.write']!==false)throw Error('Review root permissions before preparing server-owned booking rules');
  const booking=rules.bookings?.$bookingId,payment=rules.paymentTransactions?.$id,refund=rules.refunds?.$id;if(!booking||!payment||!refund)throw Error('Expected existing booking, payment transaction and refund rules');
  protectedWrite(booking,'bookings',["role').val() === 'athlete'","role').val() === 'coach'","role').val() === 'admin'"]);
  protectedWrite(payment,'paymentTransactions',["role').val() === 'coach'","role').val() === 'admin'"]);
  protectedWrite(refund,'refunds',["role').val() === 'coach'","role').val() === 'admin'"]);
  addExact(rules,'bookingCommandResults',{'$uid':{'.read':"auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",'.write':false}});
  if(rules.coachSlotLocks)protectedWrite(rules.coachSlotLocks?.$coachId?.$date?.$slot,'coachSlotLocks',["role').val() === 'coach'","role').val() === 'admin'"]);
  else rules.coachSlotLocks={'$coachId':{'.read':"auth != null && (auth.uid === $coachId || root.child('users').child(auth.uid).child('role').val() === 'admin')",'$date':{'$slot':{'.write':false}}}};
  return next;
}
if(require.main===module){const[input,output]=process.argv.slice(2);if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('Usage: node scripts/prepare-server-owned-booking-rules.cjs CURRENT_EXPORT.json REVIEW_OUTPUT.json');const current=JSON.parse(fs.readFileSync(input,'utf8'));fs.writeFileSync(output,JSON.stringify(merge(current),null,2)+'\n',{flag:'wx'});console.log('Prepared server-owned booking rules for review. No Firebase changes were made.')}
module.exports={merge,protectedWrite};
