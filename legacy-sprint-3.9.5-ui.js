/* Coach Di Sprint 3.9.5 */

/* ---------- user display name: do not expose long email as primary identity ---------- */
async function cd395EnsureDisplayName(){
  if(!state?.user?.uid || !state?.role) return;
  try{
    const ref=db.ref(`users/${state.user.uid}`), snap=await ref.once('value'), u=snap.val()||{};
    if(u.displayName){ state.userDisplayName=u.displayName; return; }
    const fallback=state.role==='coach'?(state.coachProfile?.displayName||''):'';
    const name=(fallback || prompt('ตั้งชื่อที่ต้องการแสดงใน Coach Di\\nชื่อนี้จะแสดงแทนอีเมลของคุณ') || '').trim();
    if(!name)return;
    await ref.update({displayName:name,updatedAt:firebase.database.ServerValue.TIMESTAMP});
    state.userDisplayName=name;
    if(state.role==='coach' && !state.coachProfile?.displayName){
      await db.ref(`coachProfiles/${state.user.uid}`).update({displayName:name,updatedAt:firebase.database.ServerValue.TIMESTAMP});
    }
  }catch(e){ console.warn('displayName setup',e); }
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd395EnsureDisplayName,1200)});

/* ---------- coach profile + province; hardened save so optional audit cannot break save ---------- */
const CD_TH_PROVINCES=["กรุงเทพมหานคร","กระบี่","กาญจนบุรี","กาฬสินธุ์","กำแพงเพชร","ขอนแก่น","จันทบุรี","ฉะเชิงเทรา","ชลบุรี","ชัยนาท","ชัยภูมิ","ชุมพร","เชียงราย","เชียงใหม่","ตรัง","ตราด","ตาก","นครนายก","นครปฐม","นครพนม","นครราชสีมา","นครศรีธรรมราช","นครสวรรค์","นนทบุรี","นราธิวาส","น่าน","บึงกาฬ","บุรีรัมย์","ปทุมธานี","ประจวบคีรีขันธ์","ปราจีนบุรี","ปัตตานี","พระนครศรีอยุธยา","พะเยา","พังงา","พัทลุง","พิจิตร","พิษณุโลก","เพชรบุรี","เพชรบูรณ์","แพร่","ภูเก็ต","มหาสารคาม","มุกดาหาร","แม่ฮ่องสอน","ยโสธร","ยะลา","ร้อยเอ็ด","ระนอง","ระยอง","ราชบุรี","ลพบุรี","ลำปาง","ลำพูน","เลย","ศรีสะเกษ","สกลนคร","สงขลา","สตูล","สมุทรปราการ","สมุทรสงคราม","สมุทรสาคร","สระแก้ว","สระบุรี","สิงห์บุรี","สุโขทัย","สุพรรณบุรี","สุราษฎร์ธานี","สุรินทร์","หนองคาย","หนองบัวลำภู","อ่างทอง","อำนาจเจริญ","อุดรธานี","อุตรดิตถ์","อุทัยธานี","อุบลราชธานี"];
coachProfile=function(){
 const p=state.coachProfile||{}, selected=Array.isArray(p.teachingProvinces)?p.teachingProvinces:[p.province].filter(Boolean);
 return `<h1 class="pageTitle">โปรไฟล์ Coach</h1>
 <div class="card"><div class="notice"><b>Coach Di ID</b><div style="font-size:22px;font-weight:900;margin-top:4px">${esc(p.coachDiId||'กำลังสร้าง...')}</div><div class="small">นักกีฬาใช้ ID นี้ค้นหาและเปิด Personal Booking Link ของคุณ</div></div>
 <div class="formgrid">
 <label><span class="label">ชื่อที่แสดง</span><input id="coachDisplayName" class="field" value="${esc(p.displayName||state.userDisplayName||'')}" placeholder="เช่น Coach ตั้ม"></label>
 <label><span class="label">ชื่อภาษาไทย</span><input id="coachNameTh" class="field" value="${esc(p.nameTh||'')}"></label>
 <label><span class="label">ชื่อภาษาอังกฤษ</span><input id="coachNameEn" class="field" value="${esc(p.nameEn||'')}"></label>
 <label><span class="label">กีฬาหลัก</span><select id="coachSport395" class="field">${SPORTS.map(s=>`<option value="${s.id}" ${coachSport(p)===s.id?'selected':''}>${s.label}</option>`).join('')}</select></label>
 </div>
 <label><span class="label">จังหวัดที่สะดวกสอน (เลือกได้หลายจังหวัด)</span>
 <select id="coachProvinces395" class="field" multiple size="7">${CD_TH_PROVINCES.map(x=>`<option ${selected.includes(x)?'selected':''}>${x}</option>`).join('')}</select></label>
 <div class="small" style="margin:6px 0 14px">บน Windows กด Ctrl ค้างเพื่อเลือกหลายจังหวัด • นักกีฬาจะใช้ข้อมูลนี้กรอง Coach ตามพื้นที่</div>
 <label><span class="label">แนะนำตัว</span><textarea id="coachBio" class="field" rows="4">${esc(p.bio||'')}</textarea></label>
 <div style="margin-top:14px"><button class="pill primary" onclick="saveCoachProfile()">บันทึกโปรไฟล์</button></div></div>`;
};
saveCoachProfile=async function(){
 try{
   const uid=state.user.uid;
   let id=state.coachProfile?.coachDiId;
   if(!id) id=await ensureCoachDiId(uid);
   const provinces=[...document.getElementById('coachProvinces395').selectedOptions].map(o=>o.value);
   const next={
     coachDiId:id,
     displayName:document.getElementById('coachDisplayName').value.trim(),
     nameTh:document.getElementById('coachNameTh').value.trim(),
     nameEn:document.getElementById('coachNameEn').value.trim(),
     sport:document.getElementById('coachSport395').value,
     teachingProvinces:provinces,
     bio:document.getElementById('coachBio').value.trim(),
     status:state.coachProfile?.status||'draft',
     updatedAt:firebase.database.ServerValue.TIMESTAMP
   };
   await db.ref(`coachProfiles/${uid}`).update(next);
   await db.ref(`users/${uid}`).update({displayName:next.displayName,updatedAt:firebase.database.ServerValue.TIMESTAMP});
   state.coachProfile={...(state.coachProfile||{}),...next,updatedAt:Date.now()};
   state.userDisplayName=next.displayName;
   try{await audit('profile_changed',uid,{teachingProvinces:provinces,sport:next.sport})}catch(ae){console.warn('audit skipped',ae)}
   alert('บันทึกโปรไฟล์เรียบร้อย');
 }catch(e){
   console.error('coach profile save',e);
   alert('บันทึกโปรไฟล์ไม่สำเร็จ: '+(e?.message||'Unknown error'));
 }
};

/* ---------- athlete location filter ---------- */
const _renderCoachDiscovery395=renderCoachDiscovery;
renderCoachDiscovery=function(){
 _renderCoachDiscovery395();
 const host=document.querySelector('#coachCards')?.parentElement;
 if(!host || document.getElementById('cdProvinceFilter395'))return;
 const available=[...new Set(state.coaches.flatMap(c=>Array.isArray(c.teachingProvinces)?c.teachingProvinces:[c.province].filter(Boolean)))].sort((a,b)=>a.localeCompare(b,'th'));
 const wrap=document.createElement('div');wrap.id='cdProvinceFilter395';wrap.className='cdProvinceFilter';
 wrap.innerHTML=`<b>พื้นที่ที่ต้องการเรียน</b><select id="cdProvinceSelect395" class="field" onchange="cd395ApplyProvince()"><option value="">ทุกจังหวัด</option>${available.map(p=>`<option>${esc(p)}</option>`).join('')}</select>`;
 const search=host.querySelector('.coachSearch'); search?search.after(wrap):host.prepend(wrap);
 cd395ApplyProvince();
};
function cd395ApplyProvince(){
 const p=document.getElementById('cdProvinceSelect395')?.value||'';
 document.querySelectorAll('#coachCards .coachCard').forEach(card=>{
   const onclick=card.getAttribute('onclick')||'',m=onclick.match(/'([^']+)'/),c=m&&state.coaches.find(x=>x.uid===m[1]);
   const ps=c?(Array.isArray(c.teachingProvinces)?c.teachingProvinces:[c.province].filter(Boolean)):[];
   card.style.display=(!p||ps.includes(p))?'':'none';
 });
}

/* ---------- payment confirmation: delete slip immediately after coach confirms receipt ---------- */
verifyPayment=async function(id){
 const b=state.bookings.find(x=>x.id===id);
 if(!b || b.coachId!==state.user.uid)return alert('ไม่พบ Booking ของ Coach');
 try{
   const gross=Number(b.priceSatang||0)+Number(b.travelFeeSatang||0);
   await db.ref(`bookings/${id}`).update({
     paymentStatus:'payment_verified',status:'confirmed',
     verifiedAt:firebase.database.ServerValue.TIMESTAMP,
     verifiedBy:state.user.uid,
     paymentProofDataUrl:null,
     paymentProofDeletedAt:firebase.database.ServerValue.TIMESTAMP
   });
   await db.ref(`notifications/${b.athleteId}`).push().set({
     type:'booking_confirmed',bookingId:id,senderId:state.user.uid,
     message:`Coach ยืนยันรับเงินแล้ว Booking ${id} ยืนยันเรียบร้อย`,
     createdAt:firebase.database.ServerValue.TIMESTAMP,read:false
   });
   try{await audit('payment_verified',id,{grossSatang:gross,slipDeleted:true})}catch(e){}
   csCloseModal?.(); alert('ยืนยันรับเงินแล้ว • สลิปถูกลบออกจากระบบเรียบร้อย');
   showCoach('bookings');
 }catch(e){alert('ยืนยันรับเงินไม่สำเร็จ: '+(e?.message||e))}
};

/* ---------- schedule: Day uses timetable grid; Month removed; Range Date added ---------- */
let cdRangeStart395=TODAY, cdRangeEnd395=isoAdd(TODAY,4);
csDays=function(){
 if(coachScheduleView==='day')return [coachScheduleDate];
 if(coachScheduleView==='week'){let s=csWeekStart(coachScheduleDate);return Array.from({length:7},(_,i)=>isoAdd(s,i))}
 if(coachScheduleView==='range'){
   let s=cdRangeStart395,e=cdRangeEnd395;
   if(e<s)[s,e]=[e,s];
   const days=[], max=31; let d=s;
   while(d<=e && days.length<max){days.push(d);d=isoAdd(d,1)}
   return days;
 }
 return [coachScheduleDate];
};
csWeekGrid=function(){
 let days=csDays(),hours=Array.from({length:17},(_,i)=>i+6),bs=csFiltered(),locs=state.coachLocations.filter(x=>x.coachId===state.user?.uid||!x.coachId);
 let cols=`72px repeat(${days.length},minmax(150px,1fr))`, min=72+days.length*150;
 let head=`<div class="csWeekHead csTimeHead">เวลา</div>`+days.map(d=>`<div class="csWeekHead">${new Intl.DateTimeFormat('th-TH',{weekday:'short',day:'numeric',month:'short'}).format(new Date(d+'T12:00:00'))}</div>`).join('');
 let cells=hours.map(h=>`<div class="csTime">${fmt(h)}</div>${days.map(d=>{
   let b=bs.find(x=>x.date===d&&Number(x.start)<=h&&Number(x.end)>h&&!['cancelled','rejected_by_coach'].includes(x.status)),
       loc=locs.find(x=>x.date===d&&Number(x.start)<=h&&Number(x.end)>h);
   if(b)return `<div class="csDayCell ${d===TODAY?'today':''}"><div class="csEvent ${esc(b.status)}" onclick="csDetail('${esc(b.id)}')"><strong>${fmt(b.start)}–${fmt(b.end)} • ${esc(b.athlete||'Athlete')}</strong>${esc(b.venue||'')}</div></div>`;
   if(loc)return `<div class="csDayCell ${d===TODAY?'today':''}"><div class="csBlocked">${esc(loc.venue||loc.venueName||'มีตารางสอน')}</div></div>`;
   return `<div class="csDayCell ${d===TODAY?'today':''}"></div>`;
 }).join('')}`).join('');
 return `<div class="csWeekWrap"><div class="csWeekScroll"><div class="csWeek" style="grid-template-columns:${cols};min-width:${min}px">${head}${cells}</div></div></div>`;
};
csToolbar=function(){
 const range=coachScheduleView==='range'?`<div class="cdRangeBox">
 <button class="csBtn" onclick="cd395Next5()">5 วันถัดไป</button>
 <label>จากวันที่<input id="cdRangeStartInput" type="date" value="${cdRangeStart395}" onchange="cd395RangeChange()"></label>
 <label>ถึงวันที่<input id="cdRangeEndInput" type="date" value="${cdRangeEnd395}" onchange="cd395RangeChange()"></label>
 </div>`:'';
 return `<div class="csToolbar"><div class="csViewTabs">${['day','week','range','list'].map(v=>`<button class="${coachScheduleView===v?'active':''}" onclick="csSetView('${v}')">${({day:'Day',week:'Week',range:'Range Date',list:'List'})[v]}</button>`).join('')}</div>
 <div class="csFilters"><button class="csBtn" onclick="csToday()">วันนี้</button><input id="csSearch" placeholder="ค้นหานักกีฬา / Booking ID" oninput="csRenderBody()"><select id="csStatusFilter" onchange="csRenderBody()"><option value="">ทุกสถานะ</option><option value="pending_coach_approval">รออนุมัติ</option><option value="confirmed">ยืนยันแล้ว</option><option value="completed">สอนเสร็จแล้ว</option></select></div>${range}</div>`;
};
function cd395Next5(){cdRangeStart395=isoAdd(cdRangeEnd395,1);cdRangeEnd395=isoAdd(cdRangeStart395,4);showCoach('schedule')}
function cd395RangeChange(){cdRangeStart395=document.getElementById('cdRangeStartInput').value||TODAY;cdRangeEnd395=document.getElementById('cdRangeEndInput').value||cdRangeStart395;csRenderBody()}
csRenderBody=function(){let el=document.getElementById('csScheduleBody');if(!el)return;el.innerHTML=(['day','week','range'].includes(coachScheduleView)?csWeekGrid():csList())};

/* ---------- dashboard: defaults to today, optional date range + daily trends ---------- */
function cd395PaidBookings(start,end){
 return csCoachBookings().filter(b=>b.date>=start&&b.date<=end&&b.paymentStatus==='payment_verified'&&['confirmed','completed'].includes(b.status));
}
function cd395Hours(rows){return rows.reduce((a,b)=>a+Math.max(0,Number(b.end||0)-Number(b.start||0)),0)}
coachDashboard=function(){
 setTimeout(()=>cd395RefreshDashboard(false),30);
 return `<h1 class="pageTitle">Dashboard</h1><p class="muted">รายได้และชั่วโมงสอนจากรายการที่ชำระและ Coach ยืนยันรับเงินผ่าน Coach Di</p>
 <div class="cdDashboardFilter card"><label>จากวันที่<input id="cdDashStart" type="date" value="${TODAY}"></label><label>ถึงวันที่<input id="cdDashEnd" type="date" value="${TODAY}"></label><button class="pill primary" onclick="cd395RefreshDashboard(true)">ดูช่วงวันที่</button></div>
 <div id="cdDashMetrics" class="grid g4"></div>
 <div class="grid g3">
   <div class="card cdChartCard" style="grid-column:span 2"><h3>Trend รายได้รายวัน</h3><canvas id="cdRevenueChart" class="cdChart"></canvas><div class="cdBarLegend">นับเฉพาะยอดที่ Coach กดยืนยันรับเงินจริง</div></div>
   <div class="card cdChartCard"><h3>ชั่วโมงสอนรายวัน</h3><canvas id="cdHoursChart" class="cdChart"></canvas></div>
 </div>
 <div class="card cdChartCard"><h3>สนามที่ Coach สอนมากที่สุด</h3><canvas id="cdVenueChart" class="cdChart"></canvas></div>`;
};
function cd395RefreshDashboard(scroll){
 let s=document.getElementById('cdDashStart')?.value||TODAY,e=document.getElementById('cdDashEnd')?.value||TODAY;if(e<s)[s,e]=[e,s];
 let rows=cd395PaidBookings(s,e),rev=rows.reduce((a,b)=>a+Number(b.priceSatang||0)+Number(b.travelFeeSatang||0),0),hrs=cd395Hours(rows);
 let metric=document.getElementById('cdDashMetrics'); if(!metric)return;
 metric.innerHTML=`<div class="metric">รายได้ช่วงที่เลือก<b>${baht(rev)}</b></div><div class="metric">ชั่วโมงสอน<b>${hrs.toFixed(1)} ชม.</b></div><div class="metric">คลาสที่รับเงินจริง<b>${rows.length}</b></div><div class="metric">เฉลี่ย/คลาส<b>${rows.length?baht(Math.round(rev/rows.length)):baht(0)}</b></div>`;
 let days=[],d=s;while(d<=e&&days.length<62){days.push(d);d=isoAdd(d,1)}
 let dailyRev=days.map(day=>rows.filter(b=>b.date===day).reduce((a,b)=>a+Number(b.priceSatang||0)+Number(b.travelFeeSatang||0),0)/100);
 let dailyH=days.map(day=>cd395Hours(rows.filter(b=>b.date===day)));
 cd395DrawBars('cdRevenueChart',days.map(x=>x.slice(5)),dailyRev,'฿');
 cd395DrawBars('cdHoursChart',days.map(x=>x.slice(5)),dailyH,'ชม.');
 let by={};rows.forEach(b=>{let k=b.venue||'ไม่ระบุ';by[k]=(by[k]||0)+1});let venues=Object.entries(by).sort((a,b)=>b[1]-a[1]).slice(0,8);
 cd395DrawBars('cdVenueChart',venues.map(x=>x[0]),venues.map(x=>x[1]),'คลาส');
 if(scroll)metric.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function cd395DrawBars(id,labels,values,suffix){
 const c=document.getElementById(id);if(!c)return;const r=c.getBoundingClientRect(),ratio=devicePixelRatio||1;c.width=Math.max(300,r.width)*ratio;c.height=Math.max(180,r.height)*ratio;
 const x=c.getContext('2d');x.scale(ratio,ratio);let w=r.width,h=r.height,p=34,max=Math.max(1,...values),n=Math.max(1,values.length),bw=Math.max(3,(w-p*2)/n*.62);
 x.clearRect(0,0,w,h);x.font='11px Inter, sans-serif';x.fillStyle='#667085';x.strokeStyle='rgba(16,24,40,.10)';x.beginPath();x.moveTo(p,h-p);x.lineTo(w-p,h-p);x.stroke();
 values.forEach((v,i)=>{let xx=p+(i+.5)*(w-p*2)/n-bw/2,bh=(h-p*2)*(v/max);x.fillStyle='#14294D';x.fillRect(xx,h-p-bh,bw,bh);if(n<=12){x.fillStyle='#667085';x.textAlign='center';x.fillText(String(labels[i]).slice(0,12),xx+bw/2,h-10);x.fillStyle='#101828';x.fillText(`${Math.round(v*10)/10}${suffix==='฿'?'':' '+suffix}`,xx+bw/2,Math.max(12,h-p-bh-5))}});
 if(!values.length){x.fillStyle='#667085';x.textAlign='center';x.fillText('ยังไม่มีข้อมูลในช่วงวันที่เลือก',w/2,h/2)}
}

/* ---------- chat with support; each new user message creates an admin inbox notification ---------- */
function cd395SupportButton(){
 if(document.getElementById('cdSupportFloat395')||!['athlete','coach'].includes(state.role))return;
 const b=document.createElement('button');b.id='cdSupportFloat395';b.className='cdSupportFloat';b.innerHTML='💬 แชทกับเจ้าหน้าที่';b.onclick=cd395OpenSupport;document.body.appendChild(b);
}
auth.onAuthStateChanged(u=>{if(u)setTimeout(cd395SupportButton,1500);else document.getElementById('cdSupportFloat395')?.remove()});
function cd395OpenSupport(){
 csModal(`<button class="csSheetClose" onclick="csCloseModal()">✕</button><h2>แชทกับเจ้าหน้าที่ Coach Di</h2><p class="muted">ใช้สำหรับสอบถามการจอง การชำระเงิน หรือการใช้งานระบบ</p><div id="cdSupportMsgs395" style="height:320px;overflow:auto;border:1px solid var(--color-border);border-radius:16px;padding:10px"></div><div style="display:flex;gap:8px;margin-top:10px"><input id="cdSupportInput395" class="field" placeholder="พิมพ์ข้อความ..."><button class="pill primary" onclick="cd395SendSupport()">ส่ง</button></div>`);
 db.ref(`supportChats/${state.user.uid}/messages`).limitToLast(100).on('value',snap=>{let el=document.getElementById('cdSupportMsgs395');if(!el)return;let ms=Object.values(snap.val()||{});el.innerHTML=ms.map(m=>`<div style="margin:7px 0;padding:9px 11px;border-radius:13px;background:${m.senderRole==='admin'?'#F5EED7':'#F1F4F8'}"><b>${m.senderRole==='admin'?'เจ้าหน้าที่':esc(state.userDisplayName||'คุณ')}</b><br>${esc(m.text||'')}</div>`).join('')||'<div class="muted">เริ่มต้นแชทกับเจ้าหน้าที่ได้เลย</div>';el.scrollTop=el.scrollHeight});
}
async function cd395SendSupport(){
 let i=document.getElementById('cdSupportInput395'),text=(i?.value||'').trim();if(!text)return;
 try{
  let key=db.ref(`supportChats/${state.user.uid}/messages`).push().key;
  let nk=db.ref('adminSupportNotifications').push().key;
  let updates={};
  updates[`supportChats/${state.user.uid}/messages/${key}`]={senderId:state.user.uid,senderRole:state.role,text,createdAt:firebase.database.ServerValue.TIMESTAMP};
  updates[`adminSupportNotifications/${nk}`]={userId:state.user.uid,userRole:state.role,displayName:state.userDisplayName||'',message:text,read:false,createdAt:firebase.database.ServerValue.TIMESTAMP};
  await db.ref().update(updates);i.value='';
 }catch(e){alert('ส่งข้อความไม่สำเร็จ: '+(e?.message||e))}
}

/* ---------- Admin support inbox ---------- */
const _adminDashboard395=typeof adminDashboard==='function'?adminDashboard:null;
if(_adminDashboard395){
 adminDashboard=function(){setTimeout(cd395LoadAdminSupport,50);return _adminDashboard395()+`<div class="card"><h3>💬 ข้อความถึงเจ้าหน้าที่</h3><div id="cdAdminSupport395" class="muted">กำลังโหลด...</div></div>`};
}
async function cd395LoadAdminSupport(){
 let el=document.getElementById('cdAdminSupport395');if(!el||state.role!=='admin')return;
 try{
   let s=await db.ref('adminSupportNotifications').orderByChild('createdAt').limitToLast(30).once('value'),rows=Object.entries(s.val()||{}).reverse();
   el.innerHTML=rows.length?rows.map(([id,n])=>`<div class="card" style="margin:8px 0;background:${n.read?'#fafafa':'#FFF9EE'}"><b>${esc(n.displayName||n.userRole||'User')}</b> <span class="small">${esc(n.userRole||'')}</span><br>${esc(n.message||'')}<div style="margin-top:7px"><button class="pill" onclick="cd395AdminOpenSupport('${esc(n.userId)}','${esc(id)}')">เปิดแชท</button></div></div>`).join(''):'ไม่มีข้อความใหม่';
 }catch(e){el.textContent='โหลดข้อความไม่ได้: '+e.message}
}
async function cd395AdminOpenSupport(uid,nid){
 await db.ref(`adminSupportNotifications/${nid}`).update({read:true,readAt:firebase.database.ServerValue.TIMESTAMP});
 csModal(`<button class="csSheetClose" onclick="csCloseModal()">✕</button><h2>Support Chat</h2><div id="cdAdminSupportMsgs395" style="height:320px;overflow:auto;border:1px solid var(--color-border);border-radius:16px;padding:10px"></div><div style="display:flex;gap:8px;margin-top:10px"><input id="cdAdminSupportInput395" class="field" placeholder="ตอบกลับ..."><button class="pill primary" onclick="cd395AdminReply('${esc(uid)}')">ส่ง</button></div>`);
 db.ref(`supportChats/${uid}/messages`).limitToLast(100).on('value',snap=>{let el=document.getElementById('cdAdminSupportMsgs395');if(!el)return;el.innerHTML=Object.values(snap.val()||{}).map(m=>`<div style="margin:7px 0;padding:9px 11px;border-radius:13px;background:${m.senderRole==='admin'?'#F5EED7':'#F1F4F8'}"><b>${m.senderRole==='admin'?'Admin':'User'}</b><br>${esc(m.text||'')}</div>`).join('');el.scrollTop=el.scrollHeight});
}
async function cd395AdminReply(uid){
 let i=document.getElementById('cdAdminSupportInput395'),text=(i?.value||'').trim();if(!text)return;
 await db.ref(`supportChats/${uid}/messages`).push().set({senderId:state.user.uid,senderRole:'admin',text,createdAt:firebase.database.ServerValue.TIMESTAMP});i.value='';
}
