function c78CoachNeedsActivation(row){return c77NeedsActivation({user:row?.u||{},profile:row?.prof||{}})}
function c78DecorateCustomerCoach(uid){
 if(state.role!=='admin'||s41CustomerRole!=='coach')return;
 const row=s41CustomerRows().find(item=>item.uid===uid),card=document.querySelector('#s41CustomerDetailHost .s41CustomerCard'),hero=card?.querySelector('.s41CustomerHero');
 if(!row||!card||!hero||card.querySelector('.c78ActivationPanel'))return;
 const userStatus=String(row.u?.status||'pending_approval'),profileStatus=String(row.prof?.status||'pending_approval'),panel=document.createElement('div');
 if(c78CoachNeedsActivation(row)){
  panel.className='c78ActivationPanel';
  panel.innerHTML=`<div class="c78ActivationTitle">บัญชีนี้ยังเข้า Coach Portal ไม่ได้</div><div class="c78ActivationMeta">สถานะบัญชี: ${esc(userStatus)} • สถานะโปรไฟล์: ${esc(profileStatus)}<br>กดปุ่มด้านล่างเพื่ออนุมัติสิทธิ์และเริ่มทดลองใช้ฟรี 60 วัน</div><button type="button" class="c78ActivationButton" onclick="c78ApproveCustomerCoach('${esc(uid)}',this)">✓ อนุมัติและเปิดใช้งาน Coach</button>`;
 }else{
  panel.className='c78ActivationPanel is-active';
  panel.innerHTML='<div class="c78ActivationTitle">✓ เปิดใช้งาน Coach แล้ว</div><div class="c78ActivationMeta">บัญชีและโปรไฟล์เป็น Active สามารถเข้าสู่ Coach Portal ได้</div>';
 }
 hero.insertAdjacentElement('afterend',panel);
}
async function c78ApproveCustomerCoach(uid,button){
 if(state.role!=='admin'||!state.user?.uid)return alert('เฉพาะ Admin เท่านั้นที่อนุมัติ Coach ได้');
 if(button?.disabled)return;
 const originalText=button?.textContent||'✓ อนุมัติและเปิดใช้งาน Coach';
 try{
  if(button){button.disabled=true;button.textContent='กำลังเปิดใช้งาน...'}
  const [userSnap,profileSnap]=await Promise.all([db.ref(`users/${uid}`).once('value'),db.ref(`coachProfiles/${uid}`).once('value')]),user=userSnap.val()||{},profile=profileSnap.val()||{};
  if(String(user.role||'').trim().toLowerCase()!=='coach')throw Error('บัญชีนี้ไม่มีสิทธิ์ Coach');
  const now=Date.now(),updates={};
  updates[`users/${uid}/status`]='active';updates[`users/${uid}/approvedBy`]=state.user.uid;updates[`users/${uid}/approvedAt`]=firebase.database.ServerValue.TIMESTAMP;
  updates[`coachProfiles/${uid}/status`]='active';updates[`coachProfiles/${uid}/reviewedBy`]=state.user.uid;updates[`coachProfiles/${uid}/reviewedAt`]=firebase.database.ServerValue.TIMESTAMP;updates[`coachProfiles/${uid}/updatedAt`]=firebase.database.ServerValue.TIMESTAMP;
  if(!user.subscription?.trialEndsAt&&!user.subscription?.currentPeriodEndsAt)updates[`users/${uid}/subscription`]={status:'trial',priceSatang:19900,trialStartedAt:now,trialEndsAt:now+60*24*60*60*1000};
  await db.ref().update(updates);
  const [verifiedUser,verifiedProfile]=await Promise.all([db.ref(`users/${uid}/status`).once('value'),db.ref(`coachProfiles/${uid}/status`).once('value')]);
  if(verifiedUser.val()!=='active'||verifiedProfile.val()!=='active')throw Error('สถานะยังไม่ตรงกัน กรุณาลองใหม่');
  try{await audit('admin_coach_activated',uid,{source:'manage_customer_mobile',previousUserStatus:user.status||'',previousProfileStatus:profile.status||''})}catch(_){}
  await s41LoadCustomers();s41OpenCustomer(uid);
  if(typeof s42Toast==='function')s42Toast('เปิดใช้งาน Coach สำเร็จ');else alert('เปิดใช้งาน Coach สำเร็จ');
 }catch(error){
  alert('เปิดใช้งาน Coach ไม่สำเร็จ: '+(error.message||error));
  if(button){button.disabled=false;button.textContent=originalText}
 }
}
const c78OpenCustomerBase=s41OpenCustomer;
s41OpenCustomer=function(uid){const result=c78OpenCustomerBase(uid);setTimeout(()=>c78DecorateCustomerCoach(uid),0);return result};
