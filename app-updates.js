(function(root){
  'use strict';
  const C=root.CoachDiUpdatesCore,E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  let owner='',refs=[],users={},loaded=false,failed=false,offset=0,queued=false,submitBusy=false;
  const memory=new Map();
  const now=()=>Date.now()+offset;
  const session=()=>state.user?.uid?`${state.role}:${state.user.uid}`:'';
  function clear(){for(const [ref,cb] of refs)ref.off('value',cb);refs=[];owner='';users={};loaded=false;failed=false;offset=0;document.getElementById('cdCustomerSummary')?.remove();closeLaunch(false);}
  function ensure(){
    const current=session();if(current===owner)return;clear();if(!current)return;owner=current;
    const listen=(path,success,failure)=>{const ref=db.ref(path),cb=snapshot=>{if(owner===current&&session()===current)success(snapshot.val());};refs.push([ref,cb]);ref.on('value',cb,()=>{if(owner===current&&session()===current)failure?.();});};
    listen('.info/serverTimeOffset',value=>{offset=Number.isFinite(value)?value:0;});
    if(state.role==='admin')listen('users',value=>{users=value||{};loaded=true;failed=false;summary();},()=>{users={};loaded=true;failed=true;summary();});
  }
  function summary(){
    const host=document.getElementById('coachContent');
    if(!host||state.role!=='admin'||state.c47AdminPage!=='overview'){document.getElementById('cdCustomerSummary')?.remove();return;}
    let panel=document.getElementById('cdCustomerSummary');if(!panel){panel=document.createElement('section');panel.id='cdCustomerSummary';panel.setAttribute('aria-label','สรุปจำนวนลูกค้า');host.prepend(panel);}
    const value=failed?'โหลดข้อมูลไม่สำเร็จ':loaded?`${C.customers(users).toLocaleString('th-TH')} คน`:'กำลังโหลด…';
    const html=`<div><b>ลูกค้าทั้งหมด</b><strong aria-live="polite">${value}</strong><p>บัญชีนักกีฬาที่สมัครแล้ว · ไม่รวม Coach และ Admin</p></div><button type="button" class="pill" data-cd-customers>${failed?'ลองโหลดอีกครั้ง':'ดูรายชื่อลูกค้า'}</button>`;
    if(panel.innerHTML!==html)panel.innerHTML=html;
  }
  // c97 counted every open class again immediately after c94MarkSeen cleared the count.
  // Preserve the original per-account read watermark for both menu categories.
  c94Refresh=function(){
    if(!state.user?.uid)return;ensure();const groupSeen=c94Seen('group'),coachSeen=c94Seen('coach');
    state.c94Counts=state.c94Counts||{};
    state.c94Counts.group=state.role==='coach'?Object.values(state.c76GroupRequests||{}).flatMap(group=>Object.values(group||{})).filter(row=>row?.status==='pending'&&Number(row.createdAt||0)>groupSeen).length:C.available(state.c94GroupRows,now()).filter(row=>Number(row.createdAt||0)>groupSeen).length;
    state.c94Counts.coach=state.role==='coach'?0:(state.c94CoachRows||[]).filter(row=>row.status==='active'&&Number(row.createdAt||0)>coachSeen).length;
    c94Paint();offerLaunch();
  };
  const seenKey=()=>`coachdi-class-announcements:v1:${state.user?.uid||'guest'}`;
  function seen(){const key=seenKey();try{const value=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(value))return new Set([...value,...(memory.get(key)||[])]);}catch(_){}return new Set(memory.get(key)||[]);}
  function markAnnouncements(rows){const key=seenKey(),value=seen();rows.forEach(row=>value.add(C.classKey(row)));memory.set(key,value);try{localStorage.setItem(key,JSON.stringify([...value]));}catch(_){} }
  let launchRows=[],launchOwner='',returnFocus=null;
  function closeLaunch(read=true){
    const modal=document.getElementById('cdClassLaunch');if(!modal)return;
    if(read&&launchOwner===session()){markAnnouncements(launchRows);c94MarkSeen('group');}
    modal.remove();launchRows=[];launchOwner='';if(returnFocus?.isConnected)returnFocus.focus();returnFocus=null;
  }
  function offerLaunch(){
    if(state.role!=='athlete'||!state.user?.uid||document.getElementById('portal')?.classList.contains('hidden')||document.visibilityState==='hidden')return;
    if(document.getElementById('cdClassLaunch'))return;
    const read=seen(),rows=C.available(state.c94GroupRows,now()).filter(row=>!read.has(C.classKey(row)));
    if(!rows.length)return;
    // Do not cover a booking, payment, or another open dialog. Retry on the next UI change.
    if([...document.querySelectorAll('[aria-modal="true"],#c76Modal,#c92MenuOverlay,.c91Guide,#sheetWrap')].some(node=>node.getClientRects().length&&!node.classList.contains('hidden')))return;
    launchRows=rows;launchOwner=session();returnFocus=document.activeElement;
    const modal=document.createElement('div');modal.id='cdClassLaunch';modal.className='cdClassLaunch';
    modal.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="cdClassLaunchTitle"><header><h2 id="cdClassLaunchTitle">Group Class ใหม่ รอคุณอยู่!</h2><p>มี ${rows.length} คลาสที่ยังไม่ได้ดู เลือกเวลาและสนามที่สะดวกได้เลย</p></header><div class="cdClassLaunchBody">${rows.map(row=>`<article><h3>${E(row.title||'Group Class')}</h3><p>Coach ${E(row.coachName||'Coach')}</p><p>${E(row.date)} · ${E(row.start)}–${E(row.end)} น. (เวลาไทย)<br>สนาม ${E(row.venueName||'รอยืนยัน')}</p><p>เหลือ ${Math.max(0,Number(row.capacity)-Number(row.approvedCount||0))} ที่ · ${E(baht(Number(row.priceSatang||0)))} / คน</p></article>`).join('')}</div><footer><button type="button" data-cd-launch="dismiss">รับทราบ</button><button type="button" class="primary" data-cd-launch="view">ดูคลาสทั้งหมด</button></footer></section>`;
    document.body.appendChild(modal);modal.querySelector('button').focus();
    modal.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeLaunch();}if(event.key==='Tab'){const buttons=[...modal.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
  }
  function prepareDate(prefix){const date=document.getElementById(prefix+'Date');if(date)date.min=new Date(now()+7*3600000).toISOString().slice(0,10);}
  function validateDate(prefix){
    const el=id=>document.getElementById(prefix+id),message=C.dateError(el('Date')?.value,el('Start')?.value,el('End')?.value,now());
    let error=document.getElementById('cdClassDateError');if(!message){error?.remove();return true;}
    if(!error){error=document.createElement('p');error.id='cdClassDateError';error.className='cdClassDateError';error.setAttribute('role','alert');const form=el('Date')?.closest('form');form?.prepend(error);}
    error.textContent=message;error.scrollIntoView?.({block:'nearest'});el('Date')?.focus();return false;
  }
  const createBase=c76CreateClass;
  c76CreateClass=async function(event){event?.preventDefault();if(submitBusy)return;ensure();if(!validateDate('c76'))return;submitBusy=true;try{return await createBase.apply(this,arguments);}finally{submitBusy=false;}};
  const editBase=c111SaveGroupClassEdit;
  c111SaveGroupClassEdit=async function(event){event?.preventDefault();ensure();if(!validateDate('c111'))return;return editBase.apply(this,arguments);};
  const statusBase=c76SetClassStatus;
  c76SetClassStatus=function(id,status){ensure();const row=state.c76GroupClasses?.find(item=>item.id===id);if(status==='open'&&row&&C.startTime(row.date,row.start)<=now())return alert('เลยเวลามาแล้ว ไม่สามารถเปิดรับคลาสนี้อีกครั้งได้');return statusBase.apply(this,arguments);};
  for(const [key,prefix] of [['c76OpenCreate','c76'],['c111OpenGroupClassEdit','c111']]){const base=root[key];root[key]=function(){ensure();const result=base.apply(this,arguments);prepareDate(prefix);return result;};}
  const routeBase=s41ShowAdmin;s41ShowAdmin=async function(page){ensure();if(state.role==='admin'&&page==='coaches')c94MarkSeen('coach');const result=await routeBase.apply(this,arguments);summary();return result;};
  const enterBase=enterPortal;enterPortal=function(){const result=enterBase.apply(this,arguments);ensure();summary();offerLaunch();return result;};
  const logoutBase=logout;logout=function(){clear();return logoutBase.apply(this,arguments);};
  auth.onAuthStateChanged(user=>{if(!user)clear();});
  document.addEventListener('click',event=>{
    if(event.target.closest('[data-cd-customers]')){if(failed){clear();ensure();summary();}else s41ShowAdmin('customers');}
    const action=event.target.closest('[data-cd-launch]')?.dataset.cdLaunch;if(action){closeLaunch();if(action==='view')showAthleteMenu('groupclasses');}
  });
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){ensure();offerLaunch();}});
  const refresh=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;if(!state.user?.uid)return;ensure();summary();offerLaunch();});};
  new MutationObserver(refresh).observe(document.getElementById('portal'),{childList:true,subtree:true});
  new MutationObserver(refresh).observe(document.body,{childList:true});
})(window);
