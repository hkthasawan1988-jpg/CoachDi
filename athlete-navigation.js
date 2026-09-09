(() => {
  'use strict';
  const E=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let currentPage='home',tour=null,navigating=false,queued=false,waitTimer;
  const seen=new Set(),key=uid=>'coachdi-athlete-tour:v1:'+uid;
  const read=uid=>{try{return seen.has(uid)||localStorage.getItem(key(uid))==='seen';}catch(_){return seen.has(uid);}};
  function setLabel(button,value){
    if(!button)return;
    const small=button.querySelector('small');
    if(small){if(small.textContent!==value)small.textContent=value;return;}
    const nodes=[...button.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.trim());
    if(nodes.length===1&&nodes[0].textContent===value)return;
    nodes.forEach(node=>node.remove());button.appendChild(document.createTextNode(value));
  }
  function settings(){c92CloseAllMenu();showAthleteMenu('profile');window.scrollTo({top:0,behavior:'instant'});}
  function refresh(){
    const athlete=state.role==='athlete';document.documentElement.classList.toggle('cd-athlete-nav',athlete);
    if(!athlete)return;
    document.querySelectorAll('[data-athlete-page="mybookings"],[data-athlete-mobile="mybookings"]').forEach(button=>setLabel(button,'การจองของฉัน'));
    document.querySelectorAll('#sidebar [data-athlete-page="profile"]').forEach(button=>setLabel(button,'ตั้งค่า'));
    const more=document.querySelector('#mobileNav .c92More');
    if(more){setLabel(more,'ตั้งค่า');if(more.getAttribute('aria-label')!=='ตั้งค่า')more.setAttribute('aria-label','ตั้งค่า');more.onclick=settings;more.classList.toggle('active',currentPage==='profile');c94SetAlert(more,0);}
    document.querySelectorAll('#athletePage>.athleteTabs [data-c60-group]').forEach(button=>{button.hidden=true;button.setAttribute('aria-hidden','true');button.tabIndex=-1;});
    document.querySelectorAll('#c47Home .c47Hero p').forEach(p=>{
      if(['เริ่มจากเลือกเวลาของ Coach แล้วระบบจะแนะนำสนาม','พร้อมค้นหาโค้ชและสนามที่เดินทางสะดวกสำหรับคุณ'].includes(p.textContent.trim()))p.remove();
    });
    const card=[...document.querySelectorAll('#athletePage>.cdr-saved')].findLast(node=>node.style.display!=='none');
    if(card){
      document.querySelectorAll('#cdRefundSettings').forEach(node=>{if(node!==card)node.removeAttribute('id');});
      const account=state.userProfile?.refundAccount||{},signature=JSON.stringify(account);
      if(card.dataset.cdAccount!==signature){
        card.dataset.cdAccount=signature;card.id='cdRefundSettings';
        card.innerHTML='<h2>บัญชีรับเงินคืน</h2><p>สำหรับรับเงินคืนเมื่อโค้ชยกเลิกการจอง กรอกภายหลังได้ แต่ต้องกรอกก่อนส่งคำขอคืนเงิน</p>'+
          (account.accountNumber?'<dl><dt>ธนาคาร</dt><dd>'+E(account.bank)+'</dd><dt>ชื่อเจ้าของบัญชี</dt><dd>'+E(account.accountName)+'</dd><dt>เลขบัญชี</dt><dd>ลงท้าย '+E(String(account.accountNumber).slice(-4))+'</dd></dl>':'<p class="cdAccountEmpty">ยังไม่ได้ระบุบัญชีรับเงินคืน</p>')+
          '<button type="button" class="pill" data-cdr="edit-account">'+(account.accountNumber?'แก้ไขบัญชีรับเงินคืน':'เพิ่มบัญชีรับเงินคืน')+'</button>';
      }
    }
  }
  const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;refresh();});};
  new MutationObserver(schedule).observe(document.getElementById('portal'),{childList:true,subtree:true});
  const navBase=c92SyncMobileNav;c92SyncMobileNav=function(){const result=navBase.apply(this,arguments);refresh();return result;};
  const menuBase=c92OpenAllMenu;c92OpenAllMenu=function(){if(state.role==='athlete')return settings();return menuBase.apply(this,arguments);};
  const paintBase=c94Paint;c94Paint=function(){const result=paintBase.apply(this,arguments);if(state.role==='athlete'){const more=document.querySelector('#mobileNav .c92More');if(more)c94SetAlert(more,0);}return result;};
  const profileBase=athleteProfileView;athleteProfileView=function(){return profileBase.apply(this,arguments).replace('<div id="athleteProfilePanel">','<div id="athleteProfilePanel"><h2 class="cdSettingsTitle">ตั้งค่า</h2>');};
  const routeBase=showAthleteMenu;showAthleteMenu=function(page){
    if(tour&&!navigating)closeTour(false);
    currentPage=page;const result=routeBase.apply(this,arguments);refresh();return result;
  };
  const steps=[
    {page:'home',target:'#sportCats',title:'เลือกกีฬาและโค้ช',text:'แตะประเภทกีฬา แล้วเลือกโค้ชเพื่อดูสนามและตาราง 7 วัน จากนั้นแตะเวลาว่างที่ต้องการจอง'},
    {page:'mybookings',target:'#s40AthleteDynamic h1,#s40AthleteDynamic h2',title:'การจองของฉัน',text:'ติดตามรายการจอง วันเวลา สนาม และสถานะอนุมัติได้ที่นี่ ตรวจรายละเอียดก่อนชำระเงินและส่งสลิปตามขั้นตอน'},
    {page:'groupplay',target:'#c59Host h1',title:'หาเพื่อนตี',text:'เมนูด้านล่างใช้ค้นหากลุ่มเพื่อนเล่นกีฬา ดูวันเวลาและสนาม หรือสร้างหัวข้อของคุณเอง'},
    {page:'home',target:'#mobileNav [data-athlete-mobile="notifications"],#mobileNav [data-c110-mobile-notifications]',title:'ติดตามการแจ้งเตือน',text:'เปิดเมนูแจ้งเตือนเพื่อดูความคืบหน้า ในแอป Android ใช้ปุ่มระฆังด้านบนเลือกเปิดหรือปิดการแจ้งเตือนถึงโทรศัพท์ได้'},
    {page:'profile',target:'.cdPlayerHero',title:'ตั้งค่ารูปและชื่อ',text:'เมนูตั้งค่าเปิดหน้านี้โดยตรง เลือกรูปและแก้ชื่อที่ต้องการแสดง แล้วกดบันทึกโปรไฟล์'},
    {page:'profile',target:'#cdRefundSettings h2',title:'เตรียมบัญชีรับเงินคืน',text:'เพิ่มธนาคาร ชื่อเจ้าของบัญชี และเลขบัญชีของคุณ เพื่อใช้ขอรับเงินคืนเมื่อโค้ชยกเลิก กรอกภายหลังได้ แต่จำเป็นก่อนส่งคำขอคืนเงิน'}
  ];
  function blocked(){return [...document.querySelectorAll('[aria-modal="true"],#c62Legal,#c76Modal,#sheetWrap')].some(node=>!node.closest('#c91Guide')&&node.getClientRects().length&&!node.classList.contains('hidden'));}
  function position(){
    if(!tour)return;
    const overlay=document.getElementById('c91Guide'),panel=overlay?.querySelector('.cdTourPanel'),spot=overlay?.querySelector('.cdTourSpot');
    if(!panel||!spot)return;
    const target=[...document.querySelectorAll(steps[tour.index].target)].find(node=>node.getClientRects().length);
    if(!target){spot.hidden=true;return;}
    const box=target.getBoundingClientRect(),height=window.visualViewport?.height||innerHeight,offset=window.visualViewport?.offsetTop||0;
    const top=Math.max(offset+6,box.top-5),bottom=Math.min(offset+height-6,box.bottom+5);
    spot.hidden=bottom<=top;
    spot.style.cssText=`left:${Math.max(6,box.left-5)}px;top:${top}px;width:${Math.min(innerWidth-12,box.width+10)}px;height:${Math.max(0,bottom-top)}px`;
    panel.classList.toggle('cdTourTop',box.top>offset+height*.5);
  }
  function renderStep(index){
    if(!tour)return;tour.index=index;
    const overlay=document.getElementById('c91Guide'),step=steps[index];
    overlay.querySelector('.cdTourCount').textContent=`${index+1} / ${steps.length}`;
    overlay.querySelector('h2').textContent=step.title;overlay.querySelector('.cdTourText').textContent=step.text;
    overlay.querySelector('[data-tour="back"]').disabled=index===0;
    overlay.querySelector('[data-tour="next"]').textContent=index===steps.length-1?'เริ่มใช้งาน':'ถัดไป';
    navigating=true;try{showAthleteMenu(step.page);}finally{navigating=false;}
    const revision=tour;
    requestAnimationFrame(()=>{if(tour!==revision)return;const target=[...document.querySelectorAll(step.target)].find(node=>node.getClientRects().length);target?.scrollIntoView({block:'center',behavior:'instant'});position();overlay.querySelector('[data-tour="next"]').focus({preventScroll:true});});
  }
  function closeTour(mark=true){
    clearTimeout(waitTimer);
    if(!tour)return;
    const old=tour;tour=null;
    if(mark&&state.user?.uid===old.uid&&state.role==='athlete'){seen.add(old.uid);try{localStorage.setItem(key(old.uid),'seen');}catch(_){}}
    document.getElementById('c91Guide')?.remove();old.inert.forEach(([node,value])=>node.inert=value);
    if(old.focus?.isConnected&&!old.focus.closest('[inert]'))old.focus.focus({preventScroll:true});
  }
  const guideBase=c91ShowGuide,closeBase=c91CloseGuide;
  c91CloseGuide=function(){if(tour)return closeTour();return closeBase.apply(this,arguments);};
  c91ShowGuide=function(force=false){
    if(state.role!=='athlete')return guideBase.apply(this,arguments);
    const uid=state.user?.uid;if(!uid||portal.classList.contains('hidden')||(!force&&read(uid)))return;
    if(tour){if(!force)return;closeTour(false);}
    if(blocked()){
      clearTimeout(waitTimer);waitTimer=setTimeout(()=>{if(state.user?.uid===uid&&state.role==='athlete')c91ShowGuide(force);},500);return;
    }
    if(!force&&currentPage!=='home')return;
    const overlay=document.createElement('div');overlay.id='c91Guide';overlay.className='c91Guide cdTour';
    overlay.innerHTML='<div class="cdTourSpot" aria-hidden="true"></div><section class="cdTourPanel" role="dialog" aria-modal="true" aria-labelledby="cdTourTitle" aria-describedby="cdTourText"><header><span class="cdTourCount"></span><button type="button" data-tour="skip">ข้ามคำแนะนำ</button></header><div class="cdTourBody"><h2 id="cdTourTitle"></h2><p class="cdTourText" id="cdTourText"></p></div><footer><button type="button" data-tour="back">ย้อนกลับ</button><button type="button" class="primary" data-tour="next">ถัดไป</button></footer></section>';
    tour={uid,index:0,focus:document.activeElement,inert:[portal,document.querySelector('.topbar')].filter(Boolean).map(node=>[node,node.inert])};
    tour.inert.forEach(([node])=>node.inert=true);document.body.appendChild(overlay);
    overlay.addEventListener('click',event=>{const action=event.target.closest('[data-tour]')?.dataset.tour;if(action==='skip')closeTour();else if(action==='back'&&tour?.index>0)renderStep(tour.index-1);else if(action==='next'){if(tour.index===steps.length-1)closeTour();else renderStep(tour.index+1);}});
    overlay.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();closeTour();}
      if(event.key==='Tab'){const buttons=[...overlay.querySelectorAll('button:not(:disabled)')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
    });
    renderStep(0);
  };
  const locationBase=c47Location;c47Location=function(){if(!tour)return locationBase.apply(this,arguments);};
  const logoutBase=logout;logout=function(){closeTour(false);return logoutBase.apply(this,arguments);};
  auth.onAuthStateChanged(user=>{if(tour&&(!user||user.uid!==tour.uid))closeTour(false);if(!user){clearTimeout(waitTimer);currentPage='home';}});
  window.addEventListener('resize',position);window.addEventListener('scroll',position,{passive:true});window.visualViewport?.addEventListener('resize',position);
  refresh();
})();
