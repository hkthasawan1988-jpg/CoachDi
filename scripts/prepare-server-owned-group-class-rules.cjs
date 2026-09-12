'use strict';
const fs=require('node:fs');

function protect(node,label,markers){const current=node?.['.write'];if(current===false)return;if(typeof current!=='string'||!markers.every(marker=>current.includes(marker)))throw Error(`Review ${label} write rule before making it server-owned`);node['.write']=false}
function merge(current){
  const next=structuredClone(current),rules=next.rules;if(rules?.['.read']!==false||rules?.['.write']!==false)throw Error('Review root permissions before preparing server-owned Group Class rules');
  const groupClass=rules.coachGroupClasses?.$coachId?.$classId,request=rules.coachGroupClassRequests?.$coachId?.$classId?.$athleteId;if(!groupClass||!request)throw Error('Expected existing Group Class rules');
  protect(groupClass,'coachGroupClasses',["role').val() === 'coach'","role').val() === 'admin'"]);protect(request,'coachGroupClassRequests',["role').val() === 'athlete'","role').val() === 'coach'","role').val() === 'admin'"]);
  const expected={'$uid':{'.read':"auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",'.write':false}};
  if(rules.groupClassCommandResults&&JSON.stringify(rules.groupClassCommandResults)!==JSON.stringify(expected))throw Error('Existing Group Class command result rules need review');rules.groupClassCommandResults=expected;return next;
}
if(require.main===module){const file=process.argv[2];if(!file)throw Error('Usage: node scripts/prepare-server-owned-group-class-rules.cjs DATABASE_RULES.json');const current=JSON.parse(fs.readFileSync(file,'utf8'));fs.writeFileSync(file,JSON.stringify(merge(current),null,2)+'\n');console.log('Prepared server-owned Group Class rules locally. No Firebase changes were made.')}
module.exports={merge,protect};

