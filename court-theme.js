(() => {
  'use strict';
  const root=document.documentElement,core=window.CoachDiCourtCore;
  root.classList.add('cd-court-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content','#123e31');
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function textNav(){
    document.querySelectorAll('#mobileNav>button').forEach(button=>{
      let label=button.querySelector('small');
      if(!label){const raw=button.textContent.replace(/^[^\p{L}\p{N}]+/u,'').trim();if(!raw)return;label=document.createElement('small');label.textContent=raw;button.appendChild(label);}
      for(const node of [...button.childNodes]){
        if(node===label||node.nodeType===Node.ELEMENT_NODE&&node.matches('.c94Badge,.c80MobileBadge,.c110MobileCount'))continue;
        if(node.nodeType===Node.TEXT_NODE||node.nodeType===Node.ELEMENT_NODE&&node.matches('span,br,svg,img'))node.remove();
      }
    });
  }
  let queued=false;
  const navChanged=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;textNav();});};
  new MutationObserver(navChanged).observe(document.getElementById('mobileNav'),{childList:true,subtree:true});textNav();

  const photo=value=>/^(https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(String(value||''))?value:'';
  const profileBase=athleteProfileView;
  athleteProfileView=function(){
    const user=state.userProfile||{},name=user.displayName||user.name||user.nameEn||state.user?.displayName||'นักกีฬา Coach Di',src=photo(user.photoURL);
    const hero=`<header class="cdPlayerHero"><div class="cdPlayerAvatar"><span>${escape([...name.trim()][0]||'C')}</span>${src?`<img src="${escape(src)}" alt="รูปโปรไฟล์ ${escape(name)}" onerror="this.remove()">`:''}</div><div><p>โปรไฟล์นักกีฬา</p><h1>${escape(name)}</h1><span class="cdMemberLabel">COACH DI CLUB</span></div></header>`;
    return profileBase.apply(this,arguments).replace('<div id="athleteProfilePanel">','<div id="athleteProfilePanel">'+hero);
  };

  function slot(date,hour){
    const info=dayCellStatus(date,hour),past=date<TODAY,beyond=date>MAX_DATE;
    return {...info,readOnly:past||beyond||info.type!=='available',past,beyond};
  }
  function showSlot(date,hour){
    const info=slot(date,hour);
    if(!info.readOnly){selectDateSlot(date,hour);return;}
    const venue=['coach_location','booked'].includes(info.type)?info.label:'',status=info.past?'ผ่านวันจองแล้ว':info.beyond?'ยังไม่เปิดให้จองวันนี้':info.type==='coach_location'?'โค้ชอยู่สนามนี้':info.meta||info.label;
    sheetContent.innerHTML=`<h2>ตารางของโค้ช</h2><p>${escape(shortThaiDate(date))} · ${escape(fmt(hour))}–${escape(fmt(hour+1))}</p>${venue?`<p class="cdSlotVenue">${escape(venue)}</p>`:''}<p>${escape(status)}</p><div class="sheetActions"><button type="button" class="pill primary" onclick="closeSheet()">ปิด</button></div>`;
    sheetWrap.classList.remove('hidden');
  }
  const oldRender=renderSchedule;
  renderSchedule=function(){
    if(state.role!=='athlete')return oldRender.apply(this,arguments);
    const table=document.getElementById('scheduleTable');if(!table)return;
    const days=core.days(state.weekStart||TODAY),hours=Array.from({length:Math.max(0,state.availability.end-state.availability.start)},(_,i)=>i+state.availability.start);
    state.weekStart=days[0];
    const venues=new Map(),records=hours.map(hour=>days.map(date=>{const info=slot(date,hour);if(['coach_location','booked'].includes(info.type)&&!venues.has(info.label))venues.set(info.label,'ส'+(venues.size+1));return info;}));
    weekRange.textContent=`${shortThaiDate(days[0])} – ${shortThaiDate(days[6])}`;
    const controls=document.querySelectorAll('.weekNav>button');
    if(controls[0]){controls[0].onclick=()=>changeWeek(-7);controls[0].setAttribute('aria-label','สัปดาห์ก่อนหน้า');controls[0].disabled=days[0]<=core.monday(TODAY);}
    if(controls[1]){controls[1].onclick=()=>changeWeek(7);controls[1].setAttribute('aria-label','สัปดาห์ถัดไป');controls[1].disabled=isoAdd(days[0],7)>MAX_DATE;}
    const shortDays=['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'];
    table.innerHTML=`<thead><tr><th class="timeHead" scope="col">เวลา</th>${days.map((date,i)=>`<th class="dayHead ${date===TODAY?'today':''}" scope="col" title="${escape(shortThaiDate(date))}"><div class="dow">${shortDays[i]}</div><div class="dom">${Number(date.slice(-2))}</div><div class="monthLabel">${escape(new Date(date+'T12:00:00').toLocaleDateString('th-TH',{month:'short'}))}</div></th>`).join('')}</tr></thead><tbody>${hours.map((hour,row)=>`<tr><th class="timeCell" scope="row">${fmt(hour)}</th>${days.map((date,col)=>{const info=records[row][col],code=venues.get(info.label),selected=state.selectedCell?.date===date&&state.selectedCell?.h===hour,label=code||(['available'].includes(info.type)?(info.past||info.beyond?'—':'ว่าง'):'—');return `<td><button type="button" class="daySlot ${info.type} ${selected?'selected':''} ${info.past||info.beyond?'cdPastSlot':''}" data-cd-slot="${date}" data-cd-hour="${hour}" aria-label="${escape(shortThaiDate(date)+' '+fmt(hour)+' '+info.label+(info.readOnly?' ดูรายละเอียด':' เลือกเวลา'))}" title="${escape(info.label)}"><span class="venue">${escape(label)}</span>${code?`<span class="cdSlotStatus">${info.type==='booked'?'จองแล้ว':'โค้ช'}</span>`:''}</button></td>`;}).join('')}</tr>`).join('')}</tbody>`;
    let legend=document.getElementById('cdWeekVenues');if(!legend){legend=document.createElement('section');legend.id='cdWeekVenues';table.closest('.tableScroller').insertAdjacentElement('afterend',legend);}
    legend.innerHTML=`<div class="cdWeekKey"><span><i class="cdKeyCoach"></i>โค้ชอยู่สนาม</span><span><i class="cdKeyBooked"></i>มีผู้จองแล้ว</span><span><i class="cdKeyFree"></i>ว่าง</span></div><p>จันทร์–อาทิตย์ · แตะช่องเพื่อดูสนามหรือเลือกเวลา</p>${venues.size?`<ul>${[...venues].map(([name,code])=>`<li><b>${code}</b><span>${escape(name)}</span></li>`).join('')}</ul>`:'<p>เมื่อโค้ชระบุสนาม ชื่อสนามจะแสดงที่นี่</p>'}`;
  };
  const changeBase=changeWeek;
  changeWeek=function(direction){
    if(state.role!=='athlete')return changeBase.apply(this,arguments);
    const next=isoAdd(core.monday(state.weekStart||TODAY),Math.sign(direction)*7);
    if(next<core.monday(TODAY)||next>MAX_DATE)return;
    state.weekStart=next;state.selectedCell=null;renderSchedule();
  };
  document.addEventListener('click',event=>{const button=event.target.closest('[data-cd-slot]');if(button){event.preventDefault();showSlot(button.dataset.cdSlot,Number(button.dataset.cdHour));}});
})();
