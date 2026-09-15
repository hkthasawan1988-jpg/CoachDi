'use strict';
const fs=require('node:fs');const path=require('node:path');
function protect(node,label){const current=node?.['.write'];if(current===false)return;if(typeof current!=='string'||!current.includes('auth.uid === $coachId')||!current.includes("role').val() === 'coach'")||!current.includes("role').val() === 'admin'"))throw Error(`Review ${label} authorization before making it server-owned`);node['.write']=false}
function exact(parent,key,value){if(Object.hasOwn(parent,key)){if(JSON.stringify(parent[key])!==JSON.stringify(value))throw Error(`Existing ${key} rules need manual review`);return}parent[key]=structuredClone(value)}
function merge(current){
  const next=structuredClone(current),rules=next.rules;if(rules?.['.read']!==false||rules?.['.write']!==false)throw Error('Review root permissions before preparing server-owned schedule rules');
  const appointments=rules.coachPublicSchedule?.$coachId,timeOff=rules.coachTimeOff?.$coachId;if(!appointments||!timeOff)throw Error('Expected existing Coach schedule rules');
  protect(appointments,'coachPublicSchedule');protect(timeOff,'coachTimeOff');
  exact(rules,'coachScheduleCommandResults',{'$uid':{'.read':"auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",'.write':false}});
  return next;
}
if(require.main===module){const[input,output]=process.argv.slice(2);if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('Usage: node scripts/prepare-server-owned-schedule-rules.cjs CURRENT_EXPORT.json REVIEW_OUTPUT.json');const current=JSON.parse(fs.readFileSync(input,'utf8'));fs.writeFileSync(output,JSON.stringify(merge(current),null,2)+'\n',{flag:'wx'});console.log('Prepared server-owned Coach schedule rules for review. No Firebase changes were made.')}
module.exports={exact,merge,protect};
