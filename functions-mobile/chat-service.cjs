'use strict';
const {createHash}=require('node:crypto');

const BOOKING_ID=/^[A-Za-z0-9_-]{4,100}$/;
const REQUEST_ID=/^[A-Za-z0-9_.:-]{8,180}$/;
const UID=/^[^.#$\[\]\/]{1,128}$/;
const MAX_TEXT=2000;

class ChatCommandError extends Error{
  constructor(code,message=code){super(message);this.name='ChatCommandError';this.code=code}
}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
function text(value){return String(value||'').replace(/\r\n?/g,'\n').trim()}
function fingerprint(actorUid,bookingId,message){return createHash('sha256').update(`${actorUid}\n${bookingId}\n${message}`).digest('hex')}
function displayName(user,booking,role){
  const fallback=role==='coach'?(booking.coachName||booking.coachDisplayName||'Coach'):(booking.athlete||booking.athleteName||'นักกีฬา');
  return text(user.displayName||user.nameTh||fallback).replace(/\s+/g,' ').slice(0,80)||'Coach Di';
}
function transaction(ref,updater){return ref.transaction(updater,undefined,false)}
async function writeOnce(ref,record){const result=await transaction(ref,current=>current||record);if(!result.committed)throw new ChatCommandError('CHAT_WRITE_FAILED')}

async function execute(db,{actorUid,input,now=Date.now()}){
  const bookingId=text(input?.bookingId),requestId=text(input?.requestId),message=text(input?.text);
  if(!UID.test(String(actorUid||'')))throw new ChatCommandError('NOT_BOOKING_PARTICIPANT');
  if(!BOOKING_ID.test(bookingId)||!REQUEST_ID.test(requestId)||!message||message.length>MAX_TEXT)throw new ChatCommandError('INVALID_CHAT_MESSAGE');
  const digest=fingerprint(actorUid,bookingId,message),commandRef=db.ref(`chatCommandResults/${actorUid}/${requestId}`);
  let conflict=false,replay=false;
  const claim=await transaction(commandRef,current=>{
    if(current){if(current.bookingId!==bookingId||current.fingerprint!==digest){conflict=true;return}replay=true;return current}
    return{actorUid,requestId,bookingId,fingerprint:digest,status:'processing',createdAt:now,updatedAt:now};
  });
  if(!claim.committed)throw new ChatCommandError(conflict?'REQUEST_CONFLICT':'COMMAND_CLAIM_FAILED');

  const [userSnapshot,bookingSnapshot]=await Promise.all([db.ref(`users/${actorUid}`).get(),db.ref(`bookings/${bookingId}`).get()]);
  const user=value(userSnapshot)||{},booking={id:bookingId,...(value(bookingSnapshot)||{})};
  if(!booking.coachId||!booking.athleteId)throw new ChatCommandError('BOOKING_NOT_FOUND');
  const role=booking.coachId===actorUid?'coach':booking.athleteId===actorUid?'athlete':'';
  if(!role||user.role!==role)throw new ChatCommandError('NOT_BOOKING_PARTICIPANT');
  if(role==='coach'&&user.status!=='active')throw new ChatCommandError('COACH_INACTIVE');
  const recipientId=role==='coach'?booking.athleteId:booking.coachId;
  if(!UID.test(String(recipientId||''))||recipientId===actorUid)throw new ChatCommandError('CHAT_RECIPIENT_UNAVAILABLE');

  const key=`${String(actorUid).replace(/[^A-Za-z0-9_-]/g,'_')}_${requestId.replace(/[^A-Za-z0-9_-]/g,'_')}`;
  const messageId=`message_${key}`,notificationId=`chat_${key}`,senderName=displayName(user,booking,role);
  await writeOnce(db.ref(`bookingChats/${bookingId}/messages/${messageId}`),{senderId:actorUid,senderRole:role,text:message,createdAt:now});
  await writeOnce(db.ref(`notifications/${recipientId}/${notificationId}`),{type:'chat_message',bookingId,senderId:actorUid,recipientId,message:`มีข้อความใหม่จาก ${senderName}`,read:false,createdAt:now});
  await db.ref().update({[`chatCommandResults/${actorUid}/${requestId}`]:{actorUid,requestId,bookingId,fingerprint:digest,status:'completed',messageId,notificationId,recipientId,completedAt:now,updatedAt:now}});
  return{ok:true,replay,bookingId,messageId,notificationId,recipientId};
}

module.exports={BOOKING_ID,ChatCommandError,MAX_TEXT,REQUEST_ID,displayName,execute,fingerprint,text,writeOnce};
