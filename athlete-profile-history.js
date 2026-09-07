(function(root){
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const text=value=>typeof value==='string'?value:'';
 let modalRevision=0;
 function assertOwner(uid){if(!uid||typeof state==='undefined'||state.role!=='athlete'||state.user?.uid!==uid||(typeof auth!=='undefined'&&auth.currentUser?.uid!==uid))throw Error('บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบนักกีฬาอีกครั้ง');}
 function capture(){const uid=state.user?.uid;assertOwner(uid);const next={displayName:document.getElementById('athleteDisplayName')?.value.trim()||'',nameEn:document.getElementById('athleteNameEn')?.value.trim()||'',phone:document.getElementById('athleteProfilePhone')?.value.trim()||''};validate(next);return{uid,next,file:document.getElementById('athletePhotoFile')?.files?.[0]||null};}
 function validate(next){if(!text(next?.displayName).trim())throw Error('กรุณาตั้งชื่อที่แสดงในแอป');if(!text(next?.nameEn).trim())throw Error('กรุณากรอกชื่อภาษาอังกฤษ');if(next.displayName.length>160||next.nameEn.length>160)throw Error('ชื่อยาวเกินไป กรุณาใช้ไม่เกิน 160 ตัวอักษร');}
 async function save(database,uid,next){
  assertOwner(uid);validate(next);
  const patch={displayName:next.displayName.trim(),nameEn:next.nameEn.trim()},stamp=firebase.database.ServerValue.TIMESTAMP;
  for(const field of ['phone','photoURL'])if(Object.prototype.hasOwnProperty.call(next,field))patch[field]=text(next[field]);
  if(Object.prototype.hasOwnProperty.call(next,'photoStorage'))patch.photoStorage=next.photoStorage;
  const ref=database.ref('users/'+uid),key=database.ref('users/'+uid+'/nameHistory').push().key;
  // Populate the local transaction cache, then compare against the current value
  // on every retry. A stale form never supplies the previous name.
  await ref.once('value');assertOwner(uid);
  const result=await ref.transaction(current=>{
   assertOwner(uid);if(!current||current.role!=='athlete')return;
   const oldName=text(current.displayName)||text(current.name),oldNameEn=text(current.nameEn);
   const renamed=(oldName.trim()&&oldName!==patch.displayName)||(oldNameEn.trim()&&oldNameEn!==patch.nameEn);
   const updated={...current,...patch,updatedAt:stamp};
   if(renamed){if(current.nameHistory!=null&&(typeof current.nameHistory!=='object'||Array.isArray(current.nameHistory)))throw Error('อ่านประวัติชื่อไม่สำเร็จ กรุณาติดต่อเจ้าหน้าที่');updated.nameHistory={...(current.nameHistory||{}),[key]:{oldName,newName:patch.displayName,oldNameEn,newNameEn:patch.nameEn,changedAt:stamp,changedBy:uid,source:'athlete_profile'}};}
   return updated;
  },undefined,false);
  if(!result.committed)throw Error('บันทึกโปรไฟล์ไม่สำเร็จ บัญชีนี้ไม่ใช่นักกีฬาหรือไม่มีอยู่แล้ว');
  assertOwner(uid);return result.snapshot.val();
 }
 function entries(user){return Object.entries(user?.nameHistory||{}).filter(([,row])=>row&&typeof row==='object'&&((text(row.oldName).trim()&&row.oldName!==row.newName)||(text(row.oldNameEn).trim()&&row.oldNameEn!==row.newNameEn))).map(([id,row])=>({...row,id})).sort((a,b)=>(Number(b.changedAt)||0)-(Number(a.changedAt)||0)||b.id.localeCompare(a.id));}
 function date(value){const time=Number(value);return Number.isFinite(time)&&time>0&&time<=8640000000000000?new Date(time).toLocaleString('th-TH',{timeZone:'Asia/Bangkok',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}):'ไม่ระบุวันเวลาที่เปลี่ยน';}
 function html(user){const rows=entries(user);return '<section class="cph-history"><h3>ประวัติการเปลี่ยนชื่อ</h3><p class="cph-note">แสดงการเปลี่ยนชื่อที่ระบบบันทึกไว้ตั้งแต่เปิดใช้ประวัตินี้</p>'+(rows.length?'<ol>'+rows.map(row=>'<li><time>'+esc(date(row.changedAt))+'</time>'+((text(row.oldName).trim()&&row.oldName!==row.newName)?'<p><span>ชื่อที่แสดง</span><b>'+esc(row.oldName)+'</b><i aria-label="เปลี่ยนเป็น">→</i><b>'+esc(row.newName)+'</b></p>':'')+((text(row.oldNameEn).trim()&&row.oldNameEn!==row.newNameEn)?'<p><span>ชื่อภาษาอังกฤษ</span><b>'+esc(row.oldNameEn)+'</b><i aria-label="เปลี่ยนเป็น">→</i><b>'+esc(row.newNameEn)+'</b></p>':'')+'</li>').join('')+'</ol>':'<p class="cph-empty">ยังไม่มีประวัติการเปลี่ยนชื่อที่บันทึกไว้ · ไม่มีข้อมูลการเปลี่ยนชื่อย้อนหลังจากก่อนเปิดใช้ระบบนี้</p>')+'</section>';}
 function canRead(uid){return !!state.user?.uid&&(state.role==='admin'||(state.role==='athlete'&&state.user.uid===uid));}
 function close(){modalRevision++;document.getElementById('cphModal')?.remove();}
 async function open(uid){
  if(!canRead(uid))return;close();const revision=modalRevision,viewer=state.user.uid,role=state.role;
  const modal=document.createElement('div');modal.id='cphModal';modal.className='cph-modal';modal.innerHTML='<section class="cph-dialog" role="dialog" aria-modal="true" aria-labelledby="cphTitle"><header><h2 id="cphTitle">ประวัติชื่อนักกีฬา</h2><button type="button" data-profile-history-close aria-label="ปิด">✕</button></header><div id="cphBody" role="status">กำลังโหลดประวัติชื่อ...</div></section>';document.body.appendChild(modal);modal.querySelector('button')?.focus();
  try{const snap=await db.ref('users/'+uid).once('value');if(revision!==modalRevision||state.user?.uid!==viewer||state.role!==role||!canRead(uid))return;const user=snap.val(),body=document.getElementById('cphBody');if(!body)return;if(!user||user.role!=='athlete')throw Error('ไม่พบโปรไฟล์นักกีฬานี้');body.innerHTML='<p class="cph-current">ชื่อปัจจุบัน: <b>'+esc(user.displayName||user.nameEn||'ยังไม่ตั้งชื่อ')+'</b></p>'+html(user);}catch(error){if(revision===modalRevision&&state.user?.uid===viewer&&state.role===role){const body=document.getElementById('cphBody');if(body)body.innerHTML='<p class="cph-error">โหลดประวัติชื่อไม่สำเร็จ: '+esc(error.message||error)+'</p>';}}
 }
 function mount(){if(typeof state==='undefined'||state.role!=='athlete')return;document.querySelectorAll('[data-profile-history-inline]').forEach(node=>{node.innerHTML=html(state.userProfile||{});});}
 root.CoachDiProfileHistory={save,capture,assertOwner,open,close,html,entries,mount};
 if(typeof document==='undefined')return;
 if(typeof athleteProfileView==='function'){const base=athleteProfileView;athleteProfileView=function(){return base()+'<div data-profile-history-inline>'+html(state.userProfile||{})+'</div>';};}
 if(typeof s40HistoryView==='function'){const base=s40HistoryView;s40HistoryView=function(){return base()+'<div data-profile-history-inline>'+html(state.userProfile||{})+'</div>';};}
 if(typeof s41OpenCustomer==='function'){const base=s41OpenCustomer;s41OpenCustomer=function(uid){const result=base(uid);if(state.role==='admin'&&s41CustomerRole==='athlete'){const hero=document.querySelector('#s41CustomerDetailHost .s41CustomerHero');if(hero&&!hero.querySelector('[data-profile-history]')){const button=document.createElement('button');button.type='button';button.className='cph-open';button.dataset.profileHistory=uid;button.textContent='ประวัติชื่อ';hero.appendChild(button);}}return result;};}
 document.addEventListener('click',event=>{const closeButton=event.target.closest?.('[data-profile-history-close]');if(closeButton||event.target.id==='cphModal'){close();return;}const button=event.target.closest?.('[data-profile-history]');if(button){event.preventDefault();open(button.dataset.profileHistory);}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
 if(typeof auth!=='undefined'&&auth.onAuthStateChanged)auth.onAuthStateChanged(()=>close());
 if(typeof logout==='function'){const base=logout;logout=function(){close();return base.apply(this,arguments);};}
})(typeof window!=='undefined'?window:globalThis);
