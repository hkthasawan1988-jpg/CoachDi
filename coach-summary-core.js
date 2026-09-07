/* Coach-owned reporting projection. No database calls or financial writes. */
(function(root){
 'use strict';
 const common=typeof module==='object'&&module.exports;
 const T=common?require('./admin-transactions.js'):root.CoachDiTransactions;
 const C=common?require('./admin-backoffice-core.js'):root.CoachDiBackofficeCore;
 const entries=value=>Object.entries(value||{}).filter(([,v])=>v&&typeof v==='object'&&!Array.isArray(v));
 const number=value=>Number.isFinite(Number(value))?Number(value):0;
 const stamp=value=>{const n=Number(value);return Number.isFinite(n)&&n>0&&Number.isFinite(new Date(n).getTime())?n:0;};
 const lower=value=>String(value||'').trim().toLowerCase();
 const timeFields=['receivedAt','paidAt','paymentVerifiedAt','verifiedAt','processedAt','paymentSubmittedAt','createdAt','updatedAt','refundedAt','completedAt'];
 function safeRecord(value){const copy={...value};for(const key of timeFields)if(copy[key]&&!stamp(copy[key]))copy[key]='invalid';return copy;}
 function owned(map,uid){return Object.fromEntries(entries(map).filter(([,r])=>r.coachId===uid).map(([id,r])=>[id,safeRecord(r)]));}
 function groups(data,uid){const classes=Object.fromEntries(entries(data.coachGroupClasses?.[uid]).filter(([,r])=>!r.coachId||r.coachId===uid).map(([id,r])=>[id,safeRecord(r)]));const requests={};for(const [id,items] of entries(data.coachGroupClassRequests?.[uid])){const own=Object.fromEntries(entries(items).filter(([,r])=>!r.coachId||r.coachId===uid).map(([athleteId,r])=>[athleteId,safeRecord({...r,coachId:uid,classId:id,athleteId})]));if(Object.keys(own).length)requests[id]=own;}return {classes,requests};}
 function project(data={},uid,now=Date.now()){
  if(typeof uid!=='string'||!uid)return [];
  const g=groups(data,uid),receipts=owned(data.paymentTransactions,uid),unknown=new Set();
  for(const [id,r] of entries(receipts)){const type=lower(r.type);if(type==='subscription'||type.startsWith('subscription_')){delete receipts[id];continue;}if((!type&&!r.bookingId&&!r.groupClassId)||(type&&!['booking','group_class','open_play'].includes(type)))unknown.add('tx:'+id);else if(type==='open_play')receipts[id]={...r,type:'group_class'};}
  const source={bookings:owned(data.bookings,uid),paymentTransactions:receipts,refunds:owned(data.refunds,uid),coachGroupClasses:{[uid]:g.classes},coachGroupClassRequests:{[uid]:g.requests},users:data.users?.[uid]?{[uid]:data.users[uid]}:{},coachProfiles:data.coachProfiles?.[uid]?{[uid]:data.coachProfiles[uid]}:{}};
  return T.project(source).filter(r=>r.coachId===uid&&r.type!=='subscription').map(r=>{
   let row={...r};const validTime=stamp(row.timestamp)&&row.timestamp<=now;
   if(unknown.has(row.id))row={...row,type:'unknown',status:'reconcile',received:0,net:0,fee:0,refund:0,reason:'unknown_receipt_type'};
   if(row.type==='refund'&&(row.raw?.amountSatang==null||!Number.isFinite(Number(row.raw.amountSatang))||Number(row.raw.amountSatang)<=0))row={...row,status:'reconcile',refund:0,reason:'invalid_refund_amount'};
   if(row.raw?.livemode===false)row={...row,status:'test',received:0,net:0,fee:0,refund:0};
   else if(['paid','refunded'].includes(row.status)&&!validTime)row={...row,status:'reconcile',received:0,net:0,fee:0,refund:0,reason:'invalid_or_future_payment_time'};
   if((row.athleteName==='—'||row.athleteName===row.athleteId)&&row.raw?.athleteName)row.athleteName=String(row.raw.athleteName);
   return row;
  });
 }
 function calendarDay(value){const day=String(value||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';const n=Date.parse(day+'T12:00:00Z');return Number.isFinite(n)&&new Date(n).toISOString().slice(0,10)===day?day:'';}
 function minutes(value){if(value==null||value==='')return Infinity;const parts=String(value).split(':'),n=parts.length===2?Number(parts[0])*60+Number(parts[1]):Number(value)*60;return Number.isFinite(n)?n:Infinity;}
 function roster(data={},uid,now=Date.now()){
  if(typeof uid!=='string'||!uid)return [];
  const {classes,requests}=groups(data,uid),ledger=project(data,uid,now).filter(r=>r.type==='group'||(r.type==='unknown'&&r.raw?.groupClassId)).map(r=>({...r,reference:r.raw?.groupClassId||r.reference}));
  const ids=new Set([...Object.keys(classes),...Object.keys(requests),...ledger.map(r=>r.reference).filter(Boolean)]);
  return [...ids].map(id=>{
   const item=classes[id]||{},participantsById=requests[id]||{},payments=ledger.filter(r=>r.reference===id),athletes=new Set([...Object.keys(participantsById),...payments.map(r=>r.athleteId).filter(Boolean)]);
   const participants=[...athletes].map(athleteId=>{const request=participantsById[athleteId]||{},transactions=payments.filter(r=>r.athleteId===athleteId),paid=transactions.filter(r=>r.status==='paid'),booked=stamp(request.createdAt||request.paymentSubmittedAt),first=transactions[0];return {id:athleteId,name:String(request.athleteName||first?.athleteName||athleteId),bookedAt:booked&&booked<=now?booked:0,requestStatus:String(request.status||first?.bookingStatus||'unknown'),paymentStatus:String(request.paymentStatus||first?.paymentStatus||'unknown'),transactionStatus:first?.status||'unknown',received:paid.reduce((sum,r)=>sum+number(r.received),0),net:paid.reduce((sum,r)=>sum+number(r.net),0),transactionId:first?.id||'',refundRequired:request.paymentStatus==='refund_required'||transactions.some(r=>r.refundRequired)};}).sort((a,b)=>(a.bookedAt||Infinity)-(b.bookedAt||Infinity)||a.name.localeCompare(b.name,'th'));
   return {id,coachId:uid,title:String(item.title||'Open Play (ไม่พบข้อมูลคลาส)'),date:calendarDay(item.date),start:String(item.start??''),end:String(item.end??''),venue:String(item.venueName||item.venue||''),status:String(item.status||'unknown'),participants,received:participants.reduce((sum,p)=>sum+p.received,0),net:participants.reduce((sum,p)=>sum+p.net,0)};
  }).sort((a,b)=>(a.date||'9999-99-99').localeCompare(b.date||'9999-99-99')||minutes(a.start)-minutes(b.start)||a.id.localeCompare(b.id));
 }
 function summarize(rows=[]){const summary=T.summarize(rows);return {...summary,received:summary.serviceReceived,net:summary.coachNet,asOf:C.today()};}
 const api={project,roster,summarize};if(common)module.exports=api;else root.CoachDiCoachSummary=api;
})(typeof window==='undefined'?globalThis:window);
