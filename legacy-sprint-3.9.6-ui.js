/* Coach Di Sprint 3.9.6 */

/* ---------- notification badge for athlete/coach ---------- */
let cd396NotifCount=0;
function cd396BindNotifications(){
 if(!state?.user?.uid)return;
 db.ref(`notifications/${state.user.uid}`).orderByChild('read').equalTo(false).on('value',s=>{
   cd396NotifCount=s.numChildren(); cd396RenderNotifBadges();
 });
}
function cd396RenderNotifBadges(){
 document.querySelectorAll('[data-nav="notifications"],.navNotifications,.notificationNav').forEach(el=>{
   let b=el.querySelector('.cdNotifBadge');
   if(cd396NotifCount>0){if(!b){b=document.createElement('span');b.className='cdNotifBadge';el.appendChild(b)}b.textContent=cd396NotifCount}
   else b?.remove();
 });
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd396BindNotifications,1200)});

/* coach confirm already creates athlete notification in 3.9.5.
   Add explicit notification for booking status changes when missing. */
async function cd396EnsureAthleteConfirmNotification(b){
 if(!b?.athleteId||!b?.id)return;
 try{
   const q=await db.ref(`notifications/${b.athleteId}`).orderByChild('bookingId').equalTo(b.id).once('value');
   const exists=Object.values(q.val()||{}).some(n=>n.type==='booking_confirmed');
   if(!exists) await db.ref(`notifications/${b.athleteId}`).push().set({
      type:'booking_confirmed',bookingId:b.id,senderId:state.user.uid,
      message:`การจองกับ ${b.coachName||state.coachProfile?.displayName||'Coach'} ได้รับการยืนยันแล้ว`,
      read:false,createdAt:firebase.database.ServerValue.TIMESTAMP
   });
 }catch(e){console.warn('confirm notification',e)}
}

/* ---------- unified athlete/coach chat tab, line-like realtime ---------- */
let cd396ChatBookingId=null;
function cd396AllMyChatBookings(){
 const uid=state.user?.uid;
 return (state.bookings||[]).filter(b=>b.athleteId===uid||b.coachId===uid)
   .sort((a,b)=>(b.createdAt||0)-(a.createdAt||0));
}
function cd396ChatLabel(b){
 const other=state.role==='athlete'?(b.coachName||b.coachDisplayName||'Coach'):(b.athlete||b.athleteName||'Athlete');
 return `${other} • ${b.date||''} ${fmt?.(b.start)||''}`;
}
function cd396ChatPage(){
 const rows=cd396AllMyChatBookings();
 if(!cd396ChatBookingId&&rows[0])cd396ChatBookingId=rows[0].id;
 setTimeout(()=>cd396BindChatThread(),30);
 return `<h1 class="pageTitle">แชท</h1><p class="muted">รวมการสนทนาระหว่างนักกีฬาและ Coach ไว้ที่เดียว ข้อความอัปเดตทันทีแบบ realtime</p>
 <div class="cdChatLayout">
  <div class="cdChatList">${rows.length?rows.map(b=>`<div class="cdChatRow ${b.id===cd396ChatBookingId?'active':''}" onclick="cd396OpenChat('${esc(b.id)}')"><b>${esc(cd396ChatLabel(b))}</b><div class="small">${esc(b.venue||'')}</div></div>`).join(''):'<div class="cdChatRow muted">ยังไม่มี Booking สำหรับแชท</div>'}</div>
  <div class="cdChatThread"><div id="cd396ChatHead" style="padding:14px 16px;border-bottom:1px solid var(--color-border);font-weight:900"></div><div id="cd396ChatMsgs" class="cdChatMsgs"></div>
  <div class="cdChatComposer"><input id="cd396ChatInput" class="field" placeholder="พิมพ์ข้อความ..."><button class="pill primary" onclick="cd396SendChat()">ส่ง</button></div></div>
 </div>`;
}
function cd396OpenChat(id){cd396ChatBookingId=id;showChat396()}
function showChat396(){
 const main=document.querySelector('main,.main,.content,#appContent,#mainContent')||document.body;
 if(main)main.innerHTML=cd396ChatPage();
}
function cd396BindChatThread(){
 const id=cd396ChatBookingId,b=(state.bookings||[]).find(x=>x.id===id),head=document.getElementById('cd396ChatHead');
 if(head)head.textContent=b?cd396ChatLabel(b):'เลือกบทสนทนา';
 if(!id)return;
 db.ref(`bookingChats/${id}/messages`).limitToLast(200).off();
 db.ref(`bookingChats/${id}/messages`).limitToLast(200).on('value',snap=>{
   const el=document.getElementById('cd396ChatMsgs');if(!el)return;
   const rows=Object.values(snap.val()||{}).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0));
   el.innerHTML=rows.map(m=>`<div class="cdBubble ${m.senderId===state.user.uid?'me':'them'}">${esc(m.text||'')}<div style="font-size:10px;opacity:.7;margin-top:4px">${m.createdAt?new Date(m.createdAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'}):''}</div></div>`).join('')||'<div class="muted">ยังไม่มีข้อความ</div>';
   el.scrollTop=el.scrollHeight;
   cd396MarkChatRead(id);
 });
}
async function cd396SendChat(){
 const i=document.getElementById('cd396ChatInput'),text=(i?.value||'').trim(),b=(state.bookings||[]).find(x=>x.id===cd396ChatBookingId);
 if(!text||!b)return;
 const receiver=state.user.uid===b.coachId?b.athleteId:b.coachId;
 try{
   const mid=db.ref(`bookingChats/${b.id}/messages`).push().key,nid=db.ref(`notifications/${receiver}`).push().key;
   const updates={};
   updates[`bookingChats/${b.id}/messages/${mid}`]={senderId:state.user.uid,senderRole:state.role,text,createdAt:firebase.database.ServerValue.TIMESTAMP};
   updates[`notifications/${receiver}/${nid}`]={type:'chat_message',bookingId:b.id,senderId:state.user.uid,message:`มีข้อความใหม่ในการจอง ${b.id}`,read:false,createdAt:firebase.database.ServerValue.TIMESTAMP};
   await db.ref().update(updates); i.value='';
 }catch(e){alert('ส่งข้อความไม่สำเร็จ: '+(e?.message||e))}
}
async function cd396MarkChatRead(id){
 try{
  const snap=await db.ref(`notifications/${state.user.uid}`).orderByChild('bookingId').equalTo(id).once('value'),up={};
  snap.forEach(c=>{const n=c.val();if(n.type==='chat_message'&&!n.read)up[`notifications/${state.user.uid}/${c.key}/read`]=true});
  if(Object.keys(up).length)await db.ref().update(up);
 }catch(e){}
}
function cd396InjectChatNav(){
 const candidates=document.querySelectorAll('.sidebar nav,.sideNav,.navList,.sidebar');
 const host=[...candidates].find(x=>x.querySelector('button,a'))||document.querySelector('.sidebar');
 if(!host||document.getElementById('cd396ChatNav'))return;
 const btn=document.createElement('button');btn.id='cd396ChatNav';btn.className='navItem';btn.innerHTML='💬 แชท';btn.onclick=showChat396;
 host.appendChild(btn);
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd396InjectChatNav,1800)});

/* ---------- booking history: dropdown by month + tickets + coach name ---------- */
function cd396CoachNameForBooking(b){
 const c=(state.coaches||[]).find(x=>x.uid===b.coachId);
 return b.coachName||b.coachDisplayName||c?.displayName||c?.nameTh||'Coach';
}
function cd396HistoryPage(){
 const uid=state.user.uid, now=new Date(), rows=(state.bookings||[]).filter(b=>b.athleteId===uid && b.date<TODAY);
 const groups={};
 rows.forEach(b=>{const k=(b.date||'').slice(0,7)||'ไม่ระบุ';(groups[k]||(groups[k]=[])).push(b)});
 const keys=Object.keys(groups).sort().reverse();
 return `<h1 class="pageTitle">ประวัติการจอง</h1><div class="notice">ประวัติการจองที่ผ่านมาจะแสดงเป็นสีเทาจาง และระบบเก็บไว้ 30 วันก่อนลบอัตโนมัติ</div>
 ${keys.length?keys.map(k=>{const d=new Date(k+'-01T12:00:00'),label=d.toLocaleDateString('th-TH',{month:'long',year:'numeric'});return `<details class="cdHistoryMonth"><summary>${label} • ${groups[k].length} รายการ</summary><div style="padding:0 14px 14px">${groups[k].map(b=>`<div class="card cdTicketMuted" style="margin:9px 0"><b>${esc(cd396CoachNameForBooking(b))}</b><div>${esc(b.date||'')} • ${fmt?.(b.start)||''}-${fmt?.(b.end)||''}</div><div>${esc(b.venue||'ไม่ระบุสนาม')}</div><div class="small">Booking ID: ${esc(b.id||'')}</div></div>`).join('')}</div></details>`}).join(''):'<div class="card muted">ยังไม่มีประวัติการจอง</div>'}`;
}
/* try to override known history renderer */
if(typeof athleteHistory!=='undefined') athleteHistory=cd396HistoryPage;

/* ensure athlete booking calendar/tickets display coach name */
const _athleteBookings396=typeof athleteBookings==='function'?athleteBookings:null;
if(_athleteBookings396){
 athleteBookings=function(){
   const out=_athleteBookings396();
   setTimeout(()=>document.querySelectorAll('[data-booking-id]').forEach(el=>{
     const id=el.getAttribute('data-booking-id'),b=(state.bookings||[]).find(x=>x.id===id);
     if(b&&!el.textContent.includes(cd396CoachNameForBooking(b))){
       const n=document.createElement('div');n.style.fontWeight='900';n.textContent=cd396CoachNameForBooking(b);el.prepend(n);
     }
   }),20);
   return out;
 }
}

/* ---------- admin subscription dashboard MTD default + 3 day warning + 7 day lock ---------- */
function cd396MonthStartIso(){
 const d=new Date(),y=d.getFullYear(),m=String(d.getMonth()+1).padStart(2,'0');return `${y}-${m}-01`;
}
function cd396SubStatus(s){
 const end=s?.endDate||s?.subscriptionEnd||'',today=TODAY;
 if(!end)return {days:null,expired:false,locked:false};
 const diff=Math.ceil((new Date(end+'T12:00:00')-new Date(today+'T12:00:00'))/86400000);
 return {days:diff,expired:diff<0,locked:diff<-7};
}
async function cd396LoadAdminSubDashboard(){
 if(state.role!=='admin')return;
 const host=document.getElementById('cd396AdminSubDash');if(!host)return;
 try{
  const [subsSnap,txnSnap]=await Promise.all([db.ref('coachSubscriptions').once('value'),db.ref('subscriptionTransactions').once('value')]);
  const subs=subsSnap.val()||{}, txns=Object.entries(txnSnap.val()||{}).map(([id,v])=>({id,...v}));
  const s=document.getElementById('cd396SubStart')?.value||cd396MonthStartIso(),e=document.getElementById('cd396SubEnd')?.value||TODAY;
  const f=txns.filter(t=>{const d=(t.paidDate||t.date||t.verifiedDate||'').slice(0,10);return d>=s&&d<=e&&['verified','paid','active'].includes(t.status||t.paymentStatus||'')});
  const rev=f.reduce((a,t)=>a+Number(t.amount||t.amountSatang?Number(t.amountSatang)/100:0),0);
  let warnings=Object.entries(subs).map(([uid,v])=>({uid,...v,ss:cd396SubStatus(v)})).filter(x=>x.ss.days!==null&&x.ss.days<=3).sort((a,b)=>a.ss.days-b.ss.days);
  host.innerHTML=`<div class="grid g3"><div class="metric">รายได้ Subscription<b>฿${rev.toLocaleString()}</b></div><div class="metric">รายการชำระ<b>${f.length}</b></div><div class="metric">Coach ใกล้/เกินกำหนด<b>${warnings.length}</b></div></div>
  <div style="margin-top:14px">${warnings.map(x=>`<div class="cdAdminWarn"><b>${esc(x.displayName||x.uid)}</b> • ${x.ss.days>=0?`ครบกำหนดใน ${x.ss.days} วัน`:`เกินกำหนด ${Math.abs(x.ss.days)} วัน`}${x.ss.locked?' • ถูกจำกัดสิทธิ์แล้ว':''}</div>`).join('')||'<div class="muted">ไม่มีรายการใกล้ครบกำหนด</div>'}</div>`;
 }catch(e){host.textContent='โหลดข้อมูล Subscription ไม่สำเร็จ: '+e.message}
}
function cd396AdminSubscriptionBlock(){
 setTimeout(cd396LoadAdminSubDashboard,30);
 return `<div class="card"><h3>Subscription Revenue</h3><div class="cdDashboardFilter"><label>จากวันที่<input id="cd396SubStart" type="date" value="${cd396MonthStartIso()}"></label><label>ถึงวันที่<input id="cd396SubEnd" type="date" value="${TODAY}"></label><button class="pill primary" onclick="cd396LoadAdminSubDashboard()">ดูช่วงวันที่</button></div><div id="cd396AdminSubDash"></div></div>`;
}
const _adminDashboard396=typeof adminDashboard==='function'?adminDashboard:null;
if(_adminDashboard396){
 adminDashboard=function(){return _adminDashboard396()+cd396AdminSubscriptionBlock()}
}

/* coach lock: >7 days overdue => only subscription menu available */
function cd396ApplyCoachSubscriptionLock(){
 if(state.role!=='coach'||!state.user?.uid)return;
 db.ref(`coachSubscriptions/${state.user.uid}`).once('value').then(s=>{
   const sub=s.val()||{},ss=cd396SubStatus(sub);
   if(!ss.locked)return;
   state.subscriptionLocked=true;
   document.querySelectorAll('.sidebar button,.sidebar a,.navItem').forEach(el=>{
     const t=(el.textContent||'').toLowerCase();
     if(!t.includes('subscription')&&!t.includes('ชำระ')){el.style.opacity='.4';el.style.pointerEvents='none'}
   });
   const main=document.querySelector('main,.main,.content,#appContent,#mainContent');
   if(main&&!document.getElementById('cd396LockBanner')){
     const b=document.createElement('div');b.id='cd396LockBanner';b.className='cdLocked';b.innerHTML=`<b>บัญชีถูกจำกัดสิทธิ์ชั่วคราว</b><br>Subscription เกินกำหนดมากกว่า 7 วัน กรุณาชำระ Subscription และรอ Admin ยืนยันเพื่อเปิดใช้งานตามปกติ`;
     main.prepend(b);
   }
 }).catch(()=>{});
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd396ApplyCoachSubscriptionLock,1600)});

/* admin 3-day warning notifications generated in admin UI, idempotent */
async function cd396GenerateSubWarnings(){
 if(state.role!=='admin')return;
 try{
  const s=await db.ref('coachSubscriptions').once('value');
  for(const [uid,v] of Object.entries(s.val()||{})){
    const ss=cd396SubStatus(v); if(ss.days===null||ss.days>3)continue;
    const key=`sub_${uid}_${(v.endDate||v.subscriptionEnd||'').replaceAll('-','')}`;
    const ref=db.ref(`adminSubscriptionAlerts/${key}`),ex=await ref.once('value');
    if(!ex.exists())await ref.set({coachId:uid,endDate:v.endDate||v.subscriptionEnd||'',daysRemaining:ss.days,locked:ss.locked,createdAt:firebase.database.ServerValue.TIMESTAMP,read:false});
  }
 }catch(e){}
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd396GenerateSubWarnings,2000)});

/* ---------- Admin exports: coach history + athlete history ---------- */
function cd396CsvDownload(filename,rows){
 if(!rows.length)return alert('ไม่มีข้อมูลสำหรับ Export');
 const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];
 const escCsv=v=>`"${String(v??'').replaceAll('"','""')}"`;
 const csv=[headers.map(escCsv).join(','),...rows.map(r=>headers.map(h=>escCsv(r[h])).join(','))].join('\n');
 const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.click();URL.revokeObjectURL(url);
}
function cd396ExportCoachHistory(){
 const rows=(state.coaches||[]).map(c=>({coachId:c.coachDiId||'',uid:c.uid||'',displayName:c.displayName||c.nameTh||'',sport:c.sport||'',provinces:(c.teachingProvinces||[]).join('|'),status:c.status||''}));
 cd396CsvDownload(`coach-history-${TODAY}.csv`,rows);
}
function cd396ExportAthleteHistory(){
 const users=state.users||{};
 const athleteRows=Object.entries(users).filter(([uid,u])=>u.role==='athlete').map(([uid,u])=>({uid,displayName:u.displayName||'',status:u.status||'',email:u.email||''}));
 cd396CsvDownload(`athlete-history-${TODAY}.csv`,athleteRows);
}
function cd396InjectAdminExportButtons(){
 if(state.role!=='admin')return;
 document.querySelectorAll('h1,h2,h3').forEach(h=>{
  const t=(h.textContent||'').toLowerCase();
  if(t.includes('coach')&&!h.parentElement.querySelector('.cdExportCoach')){
    const d=document.createElement('div');d.className='cdExportBar cdExportCoach';d.innerHTML='<button class="pill" onclick="cd396ExportCoachHistory()">Export Coach CSV</button>';h.after(d)
  }
  if((t.includes('athlete')||t.includes('นักกีฬา'))&&!h.parentElement.querySelector('.cdExportAthlete')){
    const d=document.createElement('div');d.className='cdExportBar cdExportAthlete';d.innerHTML='<button class="pill" onclick="cd396ExportAthleteHistory()">Export Athlete CSV</button>';h.after(d)
  }
 })
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd396InjectAdminExportButtons,2200)});
