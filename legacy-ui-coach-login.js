async function c93ActivateCoachAccount(database,uid){
 const userRef=database.ref(`users/${uid}`),profileRef=database.ref(`coachProfiles/${uid}`),stamp=firebase.database.ServerValue.TIMESTAMP;
 let [userSnap,profileSnap]=await Promise.all([userRef.once('value'),profileRef.once('value')]),user=userSnap.val()||{},profile=profileSnap.val()||{};
 const role=String(user.role||'').trim().toLowerCase(),status=String(user.status||'pending_approval').trim().toLowerCase(),profileStatus=String(profile.status||'pending_approval').trim().toLowerCase();
 if(role!=='coach')throw Error('บัญชีนี้ไม่ใช่ Coach');
 if(['rejected','suspended','reviewing'].includes(status)||['rejected','suspended','reviewing'].includes(profileStatus))return user;
 if(status==='active'){
  if(!profileSnap.exists()){try{const fallback=String(user.displayName||user.email||'Coach').split('@')[0].slice(0,80)||'Coach';await profileRef.set({displayName:fallback,nameEn:fallback,sport:'tennis',status:'active',registrationComplete:true,createdAt:stamp,updatedAt:stamp});profile=(await profileRef.once('value')).val()||{}}catch(error){console.warn('legacy Coach profile bootstrap deferred',error)}}
  if(user.registrationComplete!==true){try{await userRef.update({registrationComplete:true,registrationCompletedAt:stamp})}catch(error){console.warn('legacy Coach user migration deferred',error)}}
  if(profile.registrationComplete!==true&&profileSnap.exists()){try{await profileRef.update({registrationComplete:true,updatedAt:stamp});profile=(await profileRef.once('value')).val()||profile}catch(error){console.warn('legacy Coach profile migration deferred',error)}}
  if(!user.subscription){try{const now=Date.now();await userRef.child('subscription').set({status:'trial',priceSatang:19900,trialStartedAt:now,trialEndsAt:now+60*24*60*60*1000})}catch(error){console.warn('legacy Coach trial bootstrap deferred',error)}}
  if(String(profile.status||'pending_approval').toLowerCase()==='pending_approval'&&profile.registrationComplete===true){try{await profileRef.child('status').set('active')}catch(error){console.warn('legacy Coach profile activation deferred',error)}}
  return (await userRef.once('value')).val()||user
 }
 if(!profileSnap.exists()){
  const fallback=String(user.displayName||user.email||'Coach').split('@')[0].slice(0,80)||'Coach';
  await profileRef.set({displayName:fallback,nameEn:fallback,sport:'tennis',status:status==='active'?'active':'pending_approval',registrationComplete:status==='active',createdAt:stamp,updatedAt:stamp});
  profile=(await profileRef.once('value')).val()||{};
 }
 if(user.registrationComplete!==true){await userRef.update({registrationComplete:true,registrationCompletedAt:stamp});user=(await userRef.once('value')).val()||user}
 if(profile.registrationComplete!==true){await profileRef.update({registrationComplete:true,updatedAt:stamp});profile=(await profileRef.once('value')).val()||profile}
 if(String(user.status||'pending_approval').toLowerCase()==='pending_approval'){await userRef.child('status').set('active');user=(await userRef.once('value')).val()||user}
 if(!user.subscription){const now=Date.now();await userRef.child('subscription').set({status:'trial',priceSatang:19900,trialStartedAt:now,trialEndsAt:now+60*24*60*60*1000});user=(await userRef.once('value')).val()||user}
 if(String(profile.status||'pending_approval').toLowerCase()==='pending_approval'){await profileRef.child('status').set('active')}
 if(String(user.status||'').toLowerCase()!=='active')throw Error('บัญชี Coach ยังไม่พร้อมใช้งาน กรุณาติดต่อ Admin');
 return user
}
c91ActivateCoachAccount=c93ActivateCoachAccount;
ensureCoachApprovalRequest=async function(user,userRef,record){
 if(selectedLoginPortal!=='coach')return record;
 let current=record||{},role=String(current.role||'').trim().toLowerCase();
 if(role&&role!=='coach')return current;
 if(!role){const email=String(user?.email||'').trim().toLowerCase();if(!email)return current;const fallback=email.split('@')[0]||'Coach',stamp=firebase.database.ServerValue.TIMESTAMP;await userRef.set({role:'coach',status:'pending_approval',email,displayName:fallback,registrationComplete:false,createdAt:stamp});current=(await userRef.once('value')).val()||{}}
 return c93ActivateCoachAccount(db,user.uid)
};
