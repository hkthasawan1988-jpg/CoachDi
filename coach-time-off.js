(() => {
  'use strict';
  const C=CoachDiTimeOffCore,$=id=>document.getElementById(id),E=esc;
  let owner='',offRows=[],offRef=null,offCallback=null,epoch=0,draft=null,drag=null,busy=false,painting=false;
  const uid=()=>state.role==='coach'?state.user?.uid:state.role==='athlete'?state.coachId:'';
  const rows=()=>owner===uid()?offRows:(state.timeOff||[]).map((row,i)=>({...row,id:row.id||String(i)}));
  const authOwner=id=>{if(state.role!=='coach'||state.user?.uid!==id||auth.currentUser?.uid!==id)throw Error('บัญชีเปลี่ยนแล้ว กรุณาเปิดตารางใหม่');};
  const message=text=>{const el=$('cdOffMessage');if(el)el.textContent=text;};
  const refresh=()=>{
    if(state.role==='athlete')renderSchedule();
    if(state.role==='coach'&&state.c43p==='schedule'&&!painting&&!busy&&!drag){painting=true;try{showCoach('schedule');}finally{painting=false;}}
  };
  function stop(){epoch++;if(offRef&&offCallback)offRef.off('value',offCallback);offRef=null;offCallback=null;owner='';offRows=[];draft=null;drag=null;}
  function bind(id){
    if(!id||owner===id)return;stop();owner=id;const revision=epoch;state.timeOff=[];
    offRef=db.ref('coachTimeOff/'+id);
    const apply=snapshot=>{if(revision!==epoch||uid()!==id)return;offRows=Object.entries(snapshot.val()||{}).map(([key,row])=>({...row,id:key}));state.timeOff=offRows;refresh();};
    offCallback=apply;offRef.on('value',apply,()=>{if(revision===epoch)message('โหลดวันหยุดไม่สำเร็จ กรุณาเปิดหน้านี้ใหม่');});
    offRef.once('value').then(apply).catch(()=>{if(revision===epoch)message('โหลดวันหยุดไม่สำเร็จ กรุณาเปิดหน้านี้ใหม่');});
  }
  function newDraft(){draft={uid:state.user?.uid,id:'',key:'',startDate:'',endDate:'',month:(state.s42Date||TODAY).slice(0,7),expected:null};}
  function current(){if(!draft||draft.uid!==state.user?.uid)newDraft();return draft;}
  function calendar(){
    const d=current(),first=d.month+'-01',date=new Date(first+'T12:00:00Z'),offset=(date.getUTCDay()+6)%7,last=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    const days=Array.from({length:last},(_,i)=>d.month+'-'+String(i+1).padStart(2,'0'));
    return `<div class="cdOffMonthNav"><button type="button" data-off-month="-1" aria-label="เดือนก่อนหน้า">‹</button><h3>${E(date.toLocaleDateString('th-TH',{month:'long',year:'numeric',timeZone:'UTC'}))}</h3><button type="button" data-off-month="1" aria-label="เดือนถัดไป">›</button></div><div class="cdOffDays" aria-label="เลือกช่วงวันหยุด">${['จ.','อ.','พ.','พฤ.','ศ.','ส.','อา.'].map(day=>'<span class="cdOffWeekday">'+day+'</span>').join('')}${'<span></span>'.repeat(offset)}${days.map(day=>{const saved=rows().some(row=>C.matches(row,day)),occupied=C.conflicts({startDate:day,endDate:day},commitments()).length;return `<button type="button" data-off-day="${day}" ${day<TODAY?'disabled':''} aria-label="${E(shortThaiDate(day))}${saved?' มีวันหยุดแล้ว':''}${occupied?' มีนัดแล้ว':''}"><span>${Number(day.slice(-2))}</span><small>${saved?'หยุด':occupied?'มีนัด':''}</small></button>`;}).join('')}</div>`;
  }
  const commitments=()=>[...c43books(),...c71AppointmentRows(),...(state.c76GroupClasses||[])];
  function view(){
    const d=current(),list=rows().map(row=>C.normalize(row)).filter(row=>row&&row.endDate>=TODAY).sort((a,b)=>a.startDate.localeCompare(b.startDate));
    return `<section class="cdOffEditor"><h2>วันหยุดของฉัน</h2><p>แตะแล้วลากบนปฏิทินเพื่อเลือกหลายวัน หรือกรอกวันเริ่ม–สิ้นสุดสำหรับช่วงข้ามเดือน จากนั้นกดบันทึก</p><form id="cdOffForm"><div class="cdOffDates"><label>วันที่เริ่ม<input id="cdOffStart" type="date" min="${TODAY}" value="${E(d.startDate)}" required></label><label>วันที่สิ้นสุด<input id="cdOffEnd" type="date" min="${TODAY}" value="${E(d.endDate)}" required></label></div><div id="cdOffCalendar">${calendar()}</div><p id="cdOffSelection" aria-live="polite"></p><p id="cdOffMessage" role="alert"></p><div class="cdOffActions"><button type="button" data-off-new>เริ่มเลือกใหม่</button><button type="submit" id="cdOffSave" class="primary">${d.id?'บันทึกการแก้ไข':'บันทึกวันหยุด'}</button></div></form><h3>วันหยุดที่บันทึกไว้</h3><div class="cdOffList">${list.length?list.map(row=>`<article><div><b>${E(shortThaiDate(row.startDate))} – ${E(shortThaiDate(row.endDate))}</b><p>${row.fullDay?'หยุดเต็มวัน':`ปิดเวลา ${E(c71Time(row.startHour??0))}–${E(c71Time(row.endHour??24))}`}</p></div><div>${row.fullDay?`<button type="button" data-off-edit="${E(row.id)}">แก้ไข</button>`:''}<button type="button" data-off-remove="${E(row.id)}">ยกเลิกวันหยุด</button></div></article>`).join(''):'<p>ยังไม่มีวันหยุดที่กำลังมาถึง</p>'}</div></section>`;
  }
  function paint(){
    if(!draft||!$('cdOffForm'))return;const off=C.range(draft.startDate,draft.endDate);
    $('cdOffStart').value=draft.startDate;$('cdOffEnd').value=draft.endDate;
    document.querySelectorAll('[data-off-day]').forEach(button=>{const chosen=off&&button.dataset.offDay>=off.startDate&&button.dataset.offDay<=off.endDate;button.classList.toggle('cdOffSelected',!!chosen);button.setAttribute('aria-pressed',String(!!chosen));});
    $('cdOffSelection').textContent=off?`เลือก ${C.count(off)} วัน · ${shortThaiDate(off.startDate)} – ${shortThaiDate(off.endDate)}`:'ยังไม่ได้เลือกวันหยุด';
    const clashes=off?C.conflicts(off,commitments()):[];message(clashes.length?`มีนัดหรือคำขอจอง ${clashes.length} รายการในช่วงนี้ กรุณาจัดการรายการเดิมก่อนเพิ่มวันหยุด`:'');
  }
  function setRange(a,b){const off=C.range(a,b);if(!off)return;Object.assign(current(),off);paint();}
  function renderMonth(){if($('cdOffCalendar'))$('cdOffCalendar').innerHTML=calendar();paint();}
  function changeMonth(direction){const d=current(),date=new Date(d.month+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+direction);d.month=date.toISOString().slice(0,7);renderMonth();}
  function timeOffSummary(days){return days.map(row=>C.normalize(row)).filter(Boolean);}
  async function save(event){
    event?.preventDefault();if(busy||state.role!=='coach')return;
    const d={...current()},off=C.range($('cdOffStart')?.value,$('cdOffEnd')?.value),id=state.user?.uid;
    if(!off||off.startDate<TODAY)return message('กรุณาเลือกวันที่ตั้งแต่วันนี้ และระบุวันที่ให้ครบ');
    busy=true;const button=$('cdOffSave');if(button)button.disabled=true;
    try{
      authOwner(id);
      const snapshots=await Promise.all([db.ref('bookings').orderByChild('coachId').equalTo(id).once('value'),db.ref('coachPublicSchedule/'+id).once('value'),db.ref('coachGroupClasses/'+id).once('value'),db.ref('coachTimeOff/'+id).once('value')]);
      authOwner(id);
      const live=snapshots.slice(0,3).flatMap(s=>Object.values(s.val()||{})),clashes=C.conflicts(off,live);
      if(clashes.length)throw Error(`พบ ${clashes.length} รายการจอง/นัด/คลาสกลุ่มที่ยังใช้งานในช่วงนี้ กรุณาจัดการรายการเดิมก่อน`);
      const key=d.id||d.key||db.ref('coachTimeOff/'+id).push().key;current().key=key;
      let reason='ข้อมูลวันหยุดเปลี่ยนแล้ว กรุณาเลือกใหม่';
      const result=await db.ref('coachTimeOff/'+id).transaction(value=>{
        authOwner(id);const old=value||{};
        if(d.id&&JSON.stringify(old[key]||null)!==d.expected)return;
        if(Object.entries(old).some(([other,row])=>other!==key&&C.intersects(off,row))){reason='ช่วงวันที่เลือกทับวันหยุดเดิม กรุณาแก้ไขรายการเดิม';return;}
        const previous=old[key]||{};
        if(!d.id&&old[key]){reason='รายการนี้บันทึกแล้ว กรุณาเปิดตารางใหม่';return;}
        return {...old,[key]:{...previous,coachId:id,...off,type:'วันหยุด',createdAt:previous.createdAt||firebase.database.ServerValue.TIMESTAMP}};
      },undefined,false);
      if(!result.committed)throw Error(reason);
      authOwner(id);offRows=Object.entries(result.snapshot.val()||{}).map(([key,row])=>({...row,id:key}));state.timeOff=offRows;newDraft();
      busy=false;showCoach('schedule');message('บันทึกวันหยุดแล้ว ลูกค้าจะไม่สามารถเลือกเวลาในวันหยุดนี้');
    }catch(error){message('บันทึกไม่ได้: '+error.message);}finally{busy=false;if(button?.isConnected)button.disabled=false;}
  }
  async function remove(id){
    if(busy||state.role!=='coach')return;const item=rows().find(row=>row.id===id);if(!item||!confirm('ยกเลิกวันหยุดช่วงนี้และเปิดรับการจองตามเวลาว่างเดิม?'))return;
    const coach=state.user.uid;busy=true;
    try{
      authOwner(coach);const ref=db.ref('coachTimeOff/'+coach+'/'+id);const original=(await ref.once('value')).val();authOwner(coach);
      const {id:ignore,...expected}=item;if(JSON.stringify(original)!==JSON.stringify(expected))throw Error('วันหยุดนี้เปลี่ยนแล้ว กรุณาโหลดตารางใหม่');
      const result=await ref.transaction(value=>{authOwner(coach);return JSON.stringify(value)===JSON.stringify(original)?null:undefined;},undefined,false);
      if(!result.committed)throw Error('วันหยุดนี้เปลี่ยนแล้ว กรุณาโหลดตารางใหม่');
      authOwner(coach);offRows=rows().filter(row=>row.id!==id);state.timeOff=offRows;if(draft?.id===id)newDraft();busy=false;showCoach('schedule');message('ยกเลิกวันหยุดแล้ว');
    }catch(error){message('ยกเลิกไม่ได้: '+error.message);}finally{busy=false;}
  }
  const scheduleBase=c43schedule;c43schedule=function(){
    const html=scheduleBase.apply(this,arguments),template=document.createElement('template');template.innerHTML=html;
    const actions=template.content.querySelector('.c71Actions');if(actions)actions.insertAdjacentHTML('beforeend','<button type="button" class="c43btn" data-off-open>กำหนดวันหยุด</button>');
    const tabs=template.content.querySelector('.c43tabs');if(tabs)tabs.insertAdjacentHTML('beforeend',`<button type="button" class="c43tab ${state.s42View==='timeoff'?'active':''}" data-off-open>วันหยุด</button>`);
    if(state.s42View==='timeoff'){template.content.querySelectorAll('.c43tab:not([data-off-open])').forEach(button=>button.classList.remove('active'));template.content.querySelector('.c43view').innerHTML=view();}
    return template.innerHTML;
  };
  const showBase=showCoach;showCoach=function(page){if(state.role==='coach'){bind(state.user?.uid);if(page==='timeoff'){state.s42View='timeoff';page='schedule';}}const result=showBase.apply(this,[page]);paint();return result;};
  coachTimeOff=view;saveTimeOff=save;
  const scopedBase=loadCoachScopedData;loadCoachScopedData=function(id){if(state.role==='athlete')bind(id);return scopedBase.apply(this,arguments);};
  const loadBase=loadFirebaseData;loadFirebaseData=async function(){const result=await loadBase.apply(this,arguments);bind(uid());return result;};
  isTimeOff=(date,hour)=>rows().some(row=>C.matches(row,date,Number(hour),Number(hour)+1));
  const statusBase=dayCellStatus;dayCellStatus=function(date,hour){const info=statusBase.apply(this,arguments);if(info.type==='booked')return info;const off=timeOffSummary(rows()).find(row=>C.matches(row,date,Number(hour),Number(hour)+1));return off?{type:'timeoff',label:'วันหยุดโค้ช',meta:`หยุด ${shortThaiDate(off.startDate)} – ${shortThaiDate(off.endDate)}`} :info;};
  const selectBase=selectDateSlot;selectDateSlot=function(date,hour){if(isTimeOff(date,hour))return alert('โค้ชหยุดในวันนี้ กรุณาเลือกวันอื่น');return selectBase.apply(this,arguments);};
  const writeBase=c70WriteBooking,pendingBookings=new Set();c70WriteBooking=async function(id,booking){
    const key=[booking.athleteId,booking.coachId,booking.date,booking.start,booking.end].join('/');if(pendingBookings.has(key))throw Error('กำลังส่งคำขอจองนี้ กรุณารอสักครู่');pendingBookings.add(key);
    try{const off=(await db.ref('coachTimeOff/'+booking.coachId).once('value')).val()||{};
      if(state.role!=='athlete'||state.user?.uid!==booking.athleteId||auth.currentUser?.uid!==booking.athleteId||state.coachId!==booking.coachId)throw Error('บัญชีหรือโค้ชที่เลือกเปลี่ยนแล้ว กรุณาเลือกเวลาใหม่');
      if(Object.values(off).some(row=>C.matches(row,booking.date,Number(booking.start),Number(booking.end))))throw Error('โค้ชกำหนดวันหยุดในช่วงนี้แล้ว กรุณาเลือกวันอื่น');
      return await writeBase.apply(this,arguments);
    }finally{pendingBookings.delete(key);}
  };
  async function guardClass(date,start,end){
    const id=state.user?.uid;authOwner(id);const data=(await db.ref('coachTimeOff/'+id).once('value')).val()||{};authOwner(id);
    const hours=value=>typeof value==='string'&&value.includes(':')?timeToHour(value):Number(value);
    if(Object.values(data).some(row=>C.matches(row,date,hours(start),hours(end))))throw Error('ช่วงนี้เป็นวันหยุด กรุณาแก้ไขวันหยุดก่อนตั้ง Group Class');
  }
  for(const [name,prefix] of [['c76CreateClass','c76'],['c111SaveGroupClassEdit','c111']]){
    const base=window[name];let pending=false;window[name]=async function(event){event?.preventDefault();if(pending)return;pending=true;
      try{await guardClass($(prefix+'Date')?.value,$(prefix+'Start')?.value,$(prefix+'End')?.value);return await base.apply(this,arguments);}catch(error){alert(error.message);}finally{pending=false;}
    };
  }
  const classStatusBase=c76SetClassStatus;c76SetClassStatus=async function(id,status){
    try{if(status==='open'){const row=state.c76GroupClasses?.find(item=>item.id===id);if(row)await guardClass(row.date,row.start,row.end);}return await classStatusBase.apply(this,arguments);}catch(error){alert(error.message);}
  };
  document.addEventListener('submit',event=>{if(event.target.id==='cdOffForm')save(event);});
  document.addEventListener('change',event=>{if(['cdOffStart','cdOffEnd'].includes(event.target.id)){Object.assign(current(),{startDate:$('cdOffStart').value,endDate:$('cdOffEnd').value});paint();}});
  document.addEventListener('click',event=>{
    const open=event.target.closest('[data-off-open]');if(open){state.s42View='timeoff';showCoach('schedule');}
    const month=event.target.closest('[data-off-month]');if(month)changeMonth(Number(month.dataset.offMonth));
    const edit=event.target.closest('[data-off-edit]');if(edit){const item=rows().find(row=>row.id===edit.dataset.offEdit),off=C.normalize(item);if(off){const {id,...record}=item;draft={uid:state.user.uid,id,key:id,startDate:off.startDate,endDate:off.endDate,month:off.startDate.slice(0,7),expected:JSON.stringify(record)};showCoach('schedule');$('cdOffStart').focus();}}
    const removeButton=event.target.closest('[data-off-remove]');if(removeButton)remove(removeButton.dataset.offRemove);
    if(event.target.closest('[data-off-new]')){newDraft();showCoach('schedule');}
    const day=event.target.closest('[data-off-day]');if(day&&!day.disabled&&event.detail===0)setRange(day.dataset.offDay,day.dataset.offDay);
  });
  document.addEventListener('pointerdown',event=>{const day=event.target.closest('[data-off-day]');if(!day||day.disabled||event.button!==0||busy)return;event.preventDefault();drag={pointer:event.pointerId,start:day.dataset.offDay,before:{...current()}};day.setPointerCapture(event.pointerId);setRange(drag.start,drag.start);});
  document.addEventListener('pointermove',event=>{if(drag?.pointer!==event.pointerId)return;const day=document.elementFromPoint(event.clientX,event.clientY)?.closest('[data-off-day]');if(day&&!day.disabled)setRange(drag.start,day.dataset.offDay);});
  document.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)drag=null;});
  const cancelDrag=()=>{if(drag){draft=drag.before;drag=null;paint();}};
  document.addEventListener('pointercancel',cancelDrag);window.addEventListener('blur',cancelDrag);
  document.addEventListener('keydown',event=>{if(event.key==='Escape')cancelDrag();const day=event.target.closest('[data-off-day]');if(day&&event.shiftKey&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const next=isoAdd(day.dataset.offDay,event.key==='ArrowRight'?1:-1);if(next<TODAY)return;setRange(current().startDate||day.dataset.offDay,next);current().month=next.slice(0,7);renderMonth();document.querySelector('[data-off-day="'+next+'"]')?.focus();}});
  auth.onAuthStateChanged(user=>{if(!user||owner&&state.role==='coach'&&user.uid!==owner)stop();});
  window.CoachDiTimeOff=Object.freeze({matches:(date,start,end)=>rows().some(row=>C.matches(row,date,start,end)),bind});
})();
