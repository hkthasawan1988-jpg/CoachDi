async function c100MergeExistingCoach(regDb,credential,name,sport){
 const uid=credential.user.uid,userRef=regDb.ref(`users/${uid}`),profileRef=regDb.ref(`coachProfiles/${uid}`),stamp=firebase.database.ServerValue.TIMESTAMP;
 let [userSnap,profileSnap]=await Promise.all([userRef.once('value'),profileRef.once('value')]),user=userSnap.val()||{},existingProfile=profileSnap.val()||{},role=String(user.role||'').trim().toLowerCase();
 if(role&&role!=='coach')throw Error(role==='athlete'?'Email นี้เป็นบัญชีนักกีฬา กรุณาใช้ Email อื่นสำหรับ Coach':'Email นี้เป็นบัญชีสิทธิ์อื่น กรุณาติดต่อ Admin');
 const blockedStatus=[String(user.status||'').toLowerCase(),String(existingProfile.status||'').toLowerCase()].find(value=>['suspended','rejected','reviewing'].includes(value));
 if(blockedStatus)throw Error(blockedStatus==='suspended'?'บัญชี Coach นี้ถูกระงับ กรุณาติดต่อ Admin':blockedStatus==='rejected'?'บัญชี Coach นี้ถูกปฏิเสธ กรุณาติดต่อ Admin':'บัญชี Coach นี้กำลังถูกตรวจสอบ กรุณาลองใหม่ภายหลัง');
 if(!role){await userRef.set({role:'coach',status:'pending_approval',email:String(credential.user.email||'').toLowerCase(),displayName:name,registrationComplete:false,createdAt:stamp});user=(await userRef.once('value')).val()||{}}
 await c91ActivateCoachAccount(regDb,uid);
 user=(await userRef.once('value')).val()||user;
 const status=String(user.status||'pending_approval').toLowerCase();
 if(status!=='active')throw Error(status==='suspended'?'บัญชี Coach นี้ถูกระงับ กรุณาติดต่อ Admin':status==='rejected'?'บัญชี Coach นี้ถูกปฏิเสธ กรุณาติดต่อ Admin':'บัญชี Coach เดิมยังไม่พร้อมใช้งาน กรุณาติดต่อ Admin');
 const profile=(await profileRef.once('value')).val()||{},patch={updatedAt:stamp,lastMergedAt:stamp};
 if(!String(profile.displayName||'').trim())patch.displayName=name;
 if(!String(profile.nameEn||'').trim())patch.nameEn=name;
 if(!String(profile.sport||'').trim())patch.sport=sport;
 if(profile.registrationComplete!==true)patch.registrationComplete=true;
 if(String(profile.status||'').toLowerCase()!=='active')patch.status='active';
 await profileRef.update(patch);
 if(!String(user.displayName||'').trim())await userRef.update({displayName:name});
 return uid
}
const c100OpenCoachRegistrationBase=c68OpenCoachRegistration;
c68OpenCoachRegistration=function(){const result=c100OpenCoachRegistrationBase(),notice=document.getElementById('c68Message'),button=document.getElementById('c68Submit');if(notice&&!document.getElementById('c100MergeNotice'))notice.insertAdjacentHTML('afterend','<div id="c100MergeNotice" class="c100MergeNotice"><b>มีบัญชี Coach เดิมแล้ว?</b> ใช้ Email และ Password เดิม ระบบจะเชื่อมกับโปรไฟล์เดิมโดยไม่สร้างข้อมูลซ้ำ</div>');if(button)button.textContent='สร้าง / เชื่อมบัญชี Coach';return result};
c68RegisterCoach=async function(){
 const btn=document.getElementById('c68Submit'),msg=document.getElementById('c68Message'),name=document.getElementById('c68Name')?.value.trim()||'',sport=document.getElementById('c68Sport')?.value||'tennis',email=document.getElementById('c68Email')?.value.trim().toLowerCase()||'',pass=document.getElementById('c68Pass')?.value||'';
 if(!btn||btn.disabled)return;
 const serviceKind=document.getElementById('boRegisterKind')?.value||'coach',providerLabel=serviceKind==='knocker'?'Knocker':'Coach';
 let regApp,regAuth,regDb,credential,uid='',created=false,registrationComplete=false,existingAccount=false,failure=null;
 try{
  if(name.length<2)throw Error('กรุณากรอกชื่อภาษาอังกฤษ');
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))throw Error('รูปแบบ Email ไม่ถูกต้อง');
  if(pass.length<8)throw Error('Password ต้องมีอย่างน้อย 8 ตัวอักษร');
  if(pass!==(document.getElementById('c68Pass2')?.value||''))throw Error('Password ทั้งสองช่องไม่ตรงกัน');
  if(!document.getElementById('c68Accept')?.checked)throw Error('กรุณายอมรับข้อกำหนดก่อนสร้างบัญชี');
  btn.disabled=true;msg.textContent='กำลังตรวจสอบและเชื่อมบัญชีอย่างปลอดภัย...';
  regApp=firebase.apps.find(app=>app.name==='coachRegistration')||firebase.initializeApp(firebaseConfig,'coachRegistration');regAuth=regApp.auth();regDb=regApp.database();
  try{credential=await regAuth.createUserWithEmailAndPassword(email,pass);created=true}catch(error){if(error?.code!=='auth/email-already-in-use')throw error;credential=await regAuth.signInWithEmailAndPassword(email,pass);existingAccount=true}
  uid=credential.user.uid;
  if(existingAccount){const existingProfile=(await regDb.ref(`coachProfiles/${uid}`).once('value')).val()||{};if(existingProfile.providerKind==='knocker'&&serviceKind!=='knocker')throw Error('บัญชีนี้เป็น Knocker กรุณาเลือก Knocker เพื่อเชื่อมบัญชีเดิม');await c100MergeExistingCoach(regDb,credential,name,sport)}else{
   const stamp=firebase.database.ServerValue.TIMESTAMP;
   await regDb.ref(`users/${uid}`).set({role:'coach',status:'pending_approval',email,displayName:name,registrationComplete:false,createdAt:stamp});
   await regDb.ref(`coachProfiles/${uid}`).set({displayName:name,nameEn:name,sport,providerKind:serviceKind==='knocker'?'knocker':'coach',status:'pending_approval',registrationComplete:false,createdAt:stamp,updatedAt:stamp});
   const complete={};complete[`users/${uid}/registrationComplete`]=true;complete[`users/${uid}/registrationCompletedAt`]=stamp;complete[`coachProfiles/${uid}/registrationComplete`]=true;complete[`coachProfiles/${uid}/updatedAt`]=stamp;await regDb.ref().update(complete);registrationComplete=true;await c91ActivateCoachAccount(regDb,uid)
  }
 if(window.CoachDiBackoffice)await window.CoachDiBackoffice.saveInterest(regDb,uid,{kind:serviceKind,name,sport});
 }catch(error){failure=error;if(created&&uid&&regDb&&!registrationComplete){try{await regDb.ref(`coachProfiles/${uid}`).remove();await regDb.ref(`users/${uid}`).remove();await credential?.user?.delete()}catch(_){failure=Error('สร้างบัญชีไม่สมบูรณ์ กรุณาติดต่อ Admin โดยใช้อีเมลนี้เพื่อตรวจสอบ')}}}finally{try{await regAuth?.signOut()}catch(_){}try{await regApp?.delete()}catch(_){}}
 if(failure){msg.textContent=thaiAuthError(failure);btn.disabled=false;return}
 loginId.value=email;try{localStorage.setItem(C99_LOGIN_EMAIL_KEY,email)}catch(_){}authMessage.textContent=existingAccount?'เชื่อมกับโปรไฟล์ Coach เดิมแล้ว • เข้าสู่ระบบได้ทันที':'สร้างบัญชี '+providerLabel+' แล้ว • เข้าสู่ระบบได้ทันที';
 if(serviceKind!=='coach')authMessage.textContent+=' • คำขอ Knocker รอ Admin ตรวจสอบ';
 const dialog=document.querySelector('#c68Modal .c68Dialog');if(dialog)dialog.innerHTML=`<div class="c80RegisterSuccess" role="status" aria-live="polite"><div class="c80RegisterSuccessIcon">✓</div><h2>${existingAccount?'เชื่อมบัญชีเดิมแล้ว':'บัญชี '+providerLabel+' พร้อมใช้งานแล้ว'}</h2><p>${serviceKind!=='coach'?'ส่งคำขอ Knocker ให้ Admin ตรวจสอบแล้ว<br>':''}${existingAccount?'ระบบใช้บัญชีและโปรไฟล์เดิม ข้อมูลตาราง การจอง และ Subscription ยังคงอยู่':'เปิดใช้งานเรียบร้อยและเริ่มทดลองใช้ฟรี 60 วัน'}<br>เข้าสู่ระบบด้วย Email และ Password นี้ได้ทันที</p><div class="c80RegisterStatus c91AutoActive">สถานะ: เปิดใช้งานแล้ว</div><button class="pill primary" style="width:100%;min-height:48px" onclick="c68CloseCoachRegistration()">เข้าสู่หน้า Login</button></div>`
};
