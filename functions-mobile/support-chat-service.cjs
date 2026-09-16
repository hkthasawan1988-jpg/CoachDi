'use strict';
const {createHash}=require('node:crypto');

const REQUEST_ID=/^[A-Za-z0-9_.:-]{8,180}$/;
const UID=/^[^.#$\[\]\/]{1,128}$/;
const MAX_TEXT=4000;

class SupportChatError extends Error{
  constructor(code,message=code){super(message);this.name='SupportChatError';this.code=code}
}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
function text(input){return String(input||'').replace(/\r\n?/g,'\n').trim()}
function fingerprint(actorUid,threadUid,message){return createHash('sha256').update(`${actorUid}\n${threadUid}\n${message}`).digest('hex')}
function name(user){return text(user.displayName||user.nameTh||user.nameEn||user.email||'ผู้ใช้ Coach Di').replace(/\s+/g,' ').slice(0,80)}
function transaction(ref,updater){return ref.transaction(updater,undefined,false)}
async function writeOnce(ref,record){const result=await transaction(ref,current=>current||record);if(!result.committed)throw new SupportChatError('SUPPORT_WRITE_FAILED')}
function adminIds(users){return Object.entries(users||{}).filter(([,user])=>user?.role==='admin').map(([uid])=>uid).filter(uid=>UID.test(uid))}

async function execute(db,{actorUid,input,now=Date.now()}){
  const requestId=text(input?.requestId),message=text(input?.text),requestedUid=text(input?.threadUid);
  if(!UID.test(String(actorUid||'')))throw new SupportChatError('NOT_SUPPORT_PARTICIPANT');
  if(!REQUEST_ID.test(requestId)||!message||message.length>MAX_TEXT)throw new SupportChatError('INVALID_SUPPORT_MESSAGE');

  const actor=value(await db.ref(`users/${actorUid}`).get())||{},role=actor.role;
  if(!['admin','athlete','coach'].includes(role))throw new SupportChatError('NOT_SUPPORT_PARTICIPANT');
  const threadUid=role==='admin'?requestedUid:actorUid;
  if(!UID.test(threadUid)||threadUid===actorUid&&role==='admin')throw new SupportChatError('SUPPORT_RECIPIENT_UNAVAILABLE');
  if(role==='admin'){
    const target=value(await db.ref(`users/${threadUid}`).get())||{};
    if(!['athlete','coach'].includes(target.role))throw new SupportChatError('SUPPORT_USER_NOT_FOUND');
  }

  const digest=fingerprint(actorUid,threadUid,message),commandRef=db.ref(`supportChatCommandResults/${actorUid}/${requestId}`);
  let conflict=false,replay=false;
  const claim=await transaction(commandRef,current=>{
    if(current){if(current.threadUid!==threadUid||current.fingerprint!==digest){conflict=true;return}replay=true;return current}
    return{actorUid,requestId,threadUid,fingerprint:digest,status:'processing',createdAt:now,updatedAt:now};
  });
  if(!claim.committed)throw new SupportChatError(conflict?'REQUEST_CONFLICT':'COMMAND_CLAIM_FAILED');

  const safeActor=String(actorUid).replace(/[^A-Za-z0-9_-]/g,'_'),safeRequest=requestId.replace(/[^A-Za-z0-9_-]/g,'_');
  const key=`${safeActor}_${safeRequest}`,messageId=`message_${key}`;
  await writeOnce(db.ref(`supportChats/${threadUid}/messages/${messageId}`),{senderId:actorUid,senderRole:role,text:message,createdAt:now});

  let notificationId='',adminNotificationId='',adminPushCount=0;
  if(role==='admin'){
    notificationId=`support_${key}`;
    await writeOnce(db.ref(`notifications/${threadUid}/${notificationId}`),{type:'support_message',senderId:actorUid,recipientId:threadUid,message:'มีข้อความใหม่จาก Admin Coach Di',read:false,createdAt:now});
  }else{
    adminNotificationId=`support_${key}`;
    const displayName=name(actor);
    await writeOnce(db.ref(`adminSupportNotifications/${adminNotificationId}`),{userId:actorUid,userRole:role,displayName,message,read:false,createdAt:now});
    const users=value(await db.ref('users').get())||{};
    for(const adminUid of adminIds(users)){
      const pushId=`support_request_${key}`;
      await writeOnce(db.ref(`notifications/${adminUid}/${pushId}`),{type:'support_request',senderId:actorUid,recipientId:adminUid,supportUserId:actorUid,message:`มีข้อความ Support ใหม่จาก ${displayName}`,read:false,createdAt:now});
      adminPushCount++;
    }
  }

  await db.ref().update({[`supportChatCommandResults/${actorUid}/${requestId}`]:{actorUid,requestId,threadUid,fingerprint:digest,status:'completed',messageId,notificationId,adminNotificationId,adminPushCount,completedAt:now,updatedAt:now}});
  return{ok:true,replay,threadUid,messageId,notificationId,adminNotificationId,adminPushCount};
}

module.exports={MAX_TEXT,REQUEST_ID,SupportChatError,UID,adminIds,execute,fingerprint,name,text,writeOnce};
