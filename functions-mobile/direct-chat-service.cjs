'use strict';
const {createHash}=require('node:crypto');

const REQUEST_ID=/^[A-Za-z0-9_.:-]{8,180}$/;
const UID=/^[^.#$\[\]\/]{1,128}$/;
const MESSAGE_ID=/^[^.#$\[\]\/]{1,240}$/;
const MAX_TEXT=4000;

class DirectChatError extends Error{
  constructor(code,message=code){super(message);this.name='DirectChatError';this.code=code}
}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
function text(input){return String(input||'').replace(/\r\n?/g,'\n').trim()}
function fingerprint(actorUid,input){return createHash('sha256').update(JSON.stringify({actorUid,action:input.action,coachId:input.coachId,athleteId:input.athleteId,bookingId:input.bookingId||'',messageId:input.messageId||'',text:input.text||''})).digest('hex')}
function transaction(ref,updater){return ref.transaction(updater,undefined,false)}
async function writeOnce(ref,record){const result=await transaction(ref,current=>current||record);if(!result.committed)throw new DirectChatError('DIRECT_CHAT_WRITE_FAILED')}
function participant(role,actorUid,coachId,athleteId,user){
  if(role==='coach')return actorUid===coachId&&user.status==='active';
  if(role==='athlete')return actorUid===athleteId;
  return role==='admin';
}
function bookingMatches(booking,coachId,athleteId){return booking&&booking.coachId===coachId&&booking.athleteId===athleteId}

async function execute(db,{actorUid,input,now=Date.now()}){
  const action=text(input?.action||'send'),requestId=text(input?.requestId),coachId=text(input?.coachId),athleteId=text(input?.athleteId),bookingId=text(input?.bookingId),messageId=text(input?.messageId),message=text(input?.text);
  if(!UID.test(String(actorUid||''))||!UID.test(coachId)||!UID.test(athleteId)||coachId===athleteId)throw new DirectChatError('NOT_DIRECT_CHAT_PARTICIPANT');
  if(!REQUEST_ID.test(requestId)||!['send','delete'].includes(action))throw new DirectChatError('INVALID_DIRECT_CHAT_COMMAND');
  if(action==='send'&&(!message||message.length>MAX_TEXT))throw new DirectChatError('INVALID_DIRECT_CHAT_MESSAGE');
  if(action==='delete'&&!MESSAGE_ID.test(messageId))throw new DirectChatError('INVALID_DIRECT_CHAT_MESSAGE');

  const [userSnapshot,bookingSnapshot]=await Promise.all([db.ref(`users/${actorUid}`).get(),bookingId?db.ref(`bookings/${bookingId}`).get():db.ref('bookings').get()]);
  const user=value(userSnapshot)||{},role=user.role;
  if(role==='coach'&&actorUid===coachId&&user.status!=='active')throw new DirectChatError('COACH_INACTIVE');
  if(!participant(role,actorUid,coachId,athleteId,user))throw new DirectChatError('NOT_DIRECT_CHAT_PARTICIPANT');
  const bookingValue=value(bookingSnapshot);
  const linked=bookingId?bookingMatches(bookingValue,coachId,athleteId):Object.values(bookingValue||{}).some(booking=>bookingMatches(booking,coachId,athleteId));
  if(!linked)throw new DirectChatError('DIRECT_CHAT_RELATIONSHIP_NOT_FOUND');

  const normalized={action,coachId,athleteId,bookingId,messageId,text:message},digest=fingerprint(actorUid,normalized),commandRef=db.ref(`directChatCommandResults/${actorUid}/${requestId}`);
  let conflict=false,replay=false;
  const claim=await transaction(commandRef,current=>{
    if(current){if(current.fingerprint!==digest){conflict=true;return}replay=true;return current}
    return{actorUid,requestId,action,coachId,athleteId,fingerprint:digest,status:'processing',createdAt:now,updatedAt:now};
  });
  if(!claim.committed)throw new DirectChatError(conflict?'REQUEST_CONFLICT':'COMMAND_CLAIM_FAILED');
  const claimed=value(claim.snapshot)||{};
  if(replay&&claimed.status==='completed')return{ok:true,replay:true,action,coachId,athleteId,messageId:claimed.messageId};

  const safeActor=String(actorUid).replace(/[^A-Za-z0-9_-]/g,'_'),safeRequest=requestId.replace(/[^A-Za-z0-9_-]/g,'_');
  let resultMessageId=messageId;
  if(action==='send'){
    resultMessageId=`message_${safeActor}_${safeRequest}`;
    await writeOnce(db.ref(`userChats/${coachId}/${athleteId}/messages/${resultMessageId}`),{senderId:actorUid,senderRole:role,bookingId:bookingId||null,text:message,createdAt:now});
  }else{
    const messageRef=db.ref(`userChats/${coachId}/${athleteId}/messages/${messageId}`),existing=value(await messageRef.get());
    if(!existing)throw new DirectChatError('DIRECT_CHAT_MESSAGE_NOT_FOUND');
    if(role!=='admin'&&existing.senderId!==actorUid)throw new DirectChatError('NOT_DIRECT_CHAT_MESSAGE_OWNER');
  }
  const completed={actorUid,requestId,action,coachId,athleteId,fingerprint:digest,status:'completed',messageId:resultMessageId,completedAt:now,updatedAt:now};
  const updates={[`directChatCommandResults/${actorUid}/${requestId}`]:completed};
  if(action==='delete')updates[`userChats/${coachId}/${athleteId}/messages/${messageId}`]=null;
  await db.ref().update(updates);
  return{ok:true,replay,action,coachId,athleteId,messageId:resultMessageId};
}

module.exports={DirectChatError,MAX_TEXT,MESSAGE_ID,REQUEST_ID,UID,bookingMatches,execute,fingerprint,participant,text,writeOnce};
