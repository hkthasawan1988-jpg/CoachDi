(function(){
  'use strict';
  const C=CoachDiAccountSession,E=value=>esc(String(value??''));
  const ownRows=role=>C.owned([...(state.bookings||[]),...(role==='coach'?state.s42CoachBookings||[]:state.allAthleteBookings||[])],state.user?.uid,role);
  c50Mine=function(){return state.role==='athlete'?ownRows('athlete'):[];};
  c88StatusRows=function(){const rows=state.role==='coach'?ownRows('coach'):state.role==='athlete'?c60VisibleMine():[];return rows.sort((a,b)=>c88UpdatedAt(b)-c88UpdatedAt(a)||c88DateKey(b.date).localeCompare(c88DateKey(a.date))||Number(b.start)-Number(a.start));};
  const openAthleteStatus=c88OpenStatus;
  c88OpenStatus=function(id){if(!c88StatusRows().some(row=>row.id===id))return;if(state.role==='athlete')return openAthleteStatus(id);if(state.role==='coach'){showCoach('bookings');if(typeof s42Detail==='function')s42Detail(id);}};
  c88StatusCenter=function(rows=c88StatusRows(),limit=5){
    const items=C.owned(rows,state.user?.uid,state.role).slice(0,limit);
    return `<section class="c88StatusCenter" aria-label="สถานะการจองล่าสุด"><div class="c88StatusHead"><h2>Notification • สถานะการจอง</h2><span>รายการของบัญชีนี้ตามบทบาทที่ใช้งาน</span></div><div class="c88StatusGrid">${items.map(b=>`<button type="button" class="c88StatusRow ${c88StatusTone(b.status)}" onclick="c88OpenStatus('${E(b.id)}')"><span class="c88StatusIcon">${c88StatusIcon(b.status)}</span><span class="c88StatusMain"><b>${E(state.role==='coach'?b.athleteName||b.athlete||'นักกีฬา':s40CoachName(b))} • ${E(c88DateKey(b.date))} ${fmt(b.start)}</b><small>${E(b.venue||b.venueName||'ไม่ระบุสนาม')} • Booking ${E(b.id)}</small></span><span class="c88StatusBadge">${E(c88StatusLabel(b.status))}</span></button>`).join('')||'<div class="muted">ยังไม่มีรายการจองของบัญชีนี้</div>'}</div></section>`;
  };
  // Read markers are only written from the active Firebase account's own list.
  const mark=s40MarkNotificationsRead;
  s40MarkNotificationsRead=function(){if(!state.user?.uid||auth.currentUser?.uid!==state.user.uid)return;return mark();};

  function providerUrl(){
    const uid=state.user?.uid;if(state.role!=='coach'||!uid)return '';
    const url=new URL(window.COACH_DI_PUBLIC_CONFIG?.appUrl||'https://coach-di.netlify.app/');
    url.search='';url.hash='';url.searchParams.set('portal','athlete');
    url.searchParams.set(state.coachProfile?.providerKind==='knocker'?'knocker':'coach',uid);
    return url.toString();
  }
  function shareCard(){
    const url=providerUrl();if(!url)return '';const profile=state.coachProfile||{},name=profile.displayName||profile.nameEn||state.userProfile?.displayName||'โปรไฟล์ของฉัน',knocker=profile.providerKind==='knocker';
    return `<section id="cdProviderShare" class="cdProviderShare"><div><small>${knocker?'KNOCKER':'COACH'} PROFILE</small><h2>${E(name)}</h2><p>ลิงก์โปรไฟล์ของคุณ${knocker?' · ลูกค้าจะเห็นโปรไฟล์เมื่อผ่านการอนุมัติ':''}</p></div><div class="cdProviderShareRow"><input aria-label="ลิงก์โปรไฟล์ของฉัน" readonly value="${E(url)}"><button type="button" data-provider-copy>คัดลอกลิงก์โปรไฟล์</button></div><span data-provider-copy-status role="status" aria-live="polite"></span></section>`;
  }
  function paintShare(){
    const page=state.c43p||state.s42Page;
    if(state.role!=='coach'||!['overview','settings'].includes(page)){document.getElementById('cdProviderShare')?.remove();return;}
    const existing=document.getElementById('cdProviderShare');
    if(existing){const temp=document.createElement('template');temp.innerHTML=shareCard();existing.replaceWith(temp.content);return;}
    const header=coachContent.querySelector('#csRoot>.cdtx-head,.c43w>.c43head');
    if(header)header.insertAdjacentHTML('afterend',shareCard());else coachContent.insertAdjacentHTML('afterbegin',shareCard());
  }
  const show=showCoach;showCoach=function(){const result=show.apply(this,arguments);paintShare();return result;};
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-provider-copy]');if(!button||button.disabled)return;
    const uid=state.user?.uid,url=providerUrl(),status=document.querySelector('[data-provider-copy-status]');
    if(!url||auth.currentUser?.uid!==uid){if(status)status.textContent='บัญชีเปลี่ยนแล้ว กรุณาเปิดโปรไฟล์อีกครั้ง';return;}
    button.disabled=true;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(url);
      else{const input=document.querySelector('#cdProviderShare input');input.select();if(!document.execCommand('copy'))throw Error('copy unavailable');}
      if(state.user?.uid===uid&&status?.isConnected)status.textContent='คัดลอกแล้ว นำไปวางในแชทลูกค้าได้เลย';
    }catch(_){if(state.user?.uid===uid&&status?.isConnected){status.textContent='แตะช่องลิงก์ค้างเพื่อคัดลอก';document.querySelector('#cdProviderShare input')?.select();}}
    finally{if(button.isConnected)button.disabled=false;}
  });

  const target=new URLSearchParams(location.search).get('knocker');let directOwner='',directRevision=0;
  const guide=c91ShowGuide;c91ShowGuide=function(force=false){if(!force&&target&&state.role==='athlete')return;return guide.apply(this,arguments);};
  async function showKnocker(){
    const uid=state.user?.uid,revision=++directRevision;if(state.role!=='athlete'||!uid)return;
    for(const child of athletePage.children)child.style.display='none';
    document.getElementById('cdDirectProvider')?.remove();const host=document.createElement('section');host.id='cdDirectProvider';host.className='cdProviderShare';host.style.display='block';host.innerHTML='<h1>โปรไฟล์ Knocker</h1><p role="status">กำลังโหลดโปรไฟล์…</p>';athletePage.append(host);
    const current=()=>revision===directRevision&&state.role==='athlete'&&state.user?.uid===uid&&auth.currentUser?.uid===uid&&host.isConnected;
    try{
      const snapshot=await db.ref('hittingPartnerProfiles/'+target).once('value');if(!current())return;const profile=snapshot.val();
      if(!profile||profile.status!=='active'||profile.userId!==target){host.innerHTML='<h1>โปรไฟล์ Knocker ยังไม่เปิดให้จอง</h1><p>โปรไฟล์นี้ยังไม่พร้อมให้บริการ หรืออยู่ระหว่างการตรวจสอบ</p>';return;}
      const request=(await db.ref(`hittingPartnerRequests/${target}/${uid}`).once('value')).val();if(!current())return;
      state.c69PartnerProfiles=[...(state.c69PartnerProfiles||[]).filter(p=>p.id!==target),{...profile,id:target}];
      host.innerHTML=`<small>KNOCKER PROFILE</small><h1>${E(profile.displayName)}</h1><p>${E(c67SportLabel(profile.sport))} · ${E(profile.area)}</p><p>${E(profile.bio||'พร้อมรับคำขอซ้อมตามเวลาที่ตกลงกัน')}</p><p>${baht(Number(profile.hourlyRateSatang||0))} / ชั่วโมง</p>${uid===target?'<p>โปรไฟล์ของคุณ</p>':request?`<p>สถานะคำขอ: ${E(c69PartnerLabel(request.status))}</p>`:'<button type="button" data-direct-knocker-request>ส่งคำขอซ้อม</button>'}`;
      host.querySelector('[data-direct-knocker-request]')?.addEventListener('click',()=>{if(current())c69OpenRequest(target);});
    }catch(error){if(current())host.innerHTML='<h1>โหลดโปรไฟล์ไม่สำเร็จ</h1><p>กรุณาตรวจสอบอินเทอร์เน็ต แล้วเปิดลิงก์อีกครั้ง</p>';}
  }
  const athleteMenu=showAthleteMenu;showAthleteMenu=function(page){
    if(page!=='provider-profile')document.getElementById('cdDirectProvider')?.remove();
    const result=athleteMenu.apply(this,arguments);
    if(target&&state.role==='athlete'&&state.user?.uid&&(page==='provider-profile'||page==='home'&&directOwner!==state.user.uid)){
      directOwner=state.user.uid;showKnocker();
    }
    return result;
  };
  document.addEventListener('coachdi:account-reset',()=>{directOwner='';directRevision++;});
  window.CoachDiProviderShare={url:providerUrl,paint:paintShare};
})();
