'use strict';
const fs=require('node:fs');const path=require('node:path');
function protect(node,label,markers){const current=node?.['.write'];if(current===false)return;if(typeof current!=='string'||!markers.every(marker=>current.includes(marker)))throw Error(`Review ${label} write rule before making it server-owned`);node['.write']=false}
function adminOnly(node,label,markers){const rule="auth != null && root.child('users').child(auth.uid).child('role').val() === 'admin'",current=node?.['.write'];if(current===rule)return;if(typeof current!=='string'||!markers.every(marker=>current.includes(marker)))throw Error(`Review ${label} write rule before restricting it to Admin`);node['.write']=rule}
function exact(parent,key,value){if(Object.hasOwn(parent,key)){if(JSON.stringify(parent[key])!==JSON.stringify(value))throw Error(`Existing ${key} rules need manual review`);return}parent[key]=structuredClone(value)}
function merge(current){
  const next=structuredClone(current),rules=next.rules;if(rules?.['.read']!==false||rules?.['.write']!==false)throw Error('Review root permissions before preparing server-owned chat rules');
  const messages=rules.bookingChats?.$bookingId?.messages?.$msgId;if(!messages)throw Error('Expected existing Booking Chat message rules');
  protect(messages,'bookingChats messages',["child('bookings')","child('athleteId')","child('coachId')","child('senderId').val() === auth.uid"]);
  const supportMessages=rules.supportChats?.$uid?.messages?.$id;if(!supportMessages)throw Error('Expected existing Support Chat message rules');
  protect(supportMessages,'supportChats messages',["auth.uid === $uid","child('senderId').val() === auth.uid","child('senderRole').val() === 'admin'"]);
  const supportNotices=rules.adminSupportNotifications?.$id;if(!supportNotices)throw Error('Expected existing Admin Support notification rules');
  adminOnly(supportNotices,'adminSupportNotifications',["child('userId').val() === auth.uid","child(auth.uid).child('role').val() === 'admin'"]);
  exact(rules,'chatCommandResults',{'$uid':{'.read':"auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",'.write':false}});
  exact(rules,'supportChatCommandResults',{'$uid':{'.read':"auth != null && (auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin')",'.write':false}});
  return next;
}
if(require.main===module){const[input,output]=process.argv.slice(2);if(!input||!output||path.resolve(input)===path.resolve(output))throw Error('Usage: node scripts/prepare-server-owned-chat-rules.cjs CURRENT_EXPORT.json REVIEW_OUTPUT.json');const current=JSON.parse(fs.readFileSync(input,'utf8'));fs.writeFileSync(output,JSON.stringify(merge(current),null,2)+'\n',{flag:'wx'});console.log('Prepared server-owned Booking Chat rules for review. No Firebase changes were made.')}
module.exports={adminOnly,merge,protect};
