'use strict';
class GroupClassProofError extends Error{constructor(code,message=code){super(message);this.name='GroupClassProofError';this.code=code}}
function value(snapshot){return snapshot&&typeof snapshot.val==='function'?snapshot.val():null}
async function execute(db,storage,{actorUid,input,now=Date.now()}){
  const coachId=String(input?.coachId||'').trim(),classId=String(input?.classId||'').trim(),athleteId=String(input?.athleteId||'').trim();
  if(!coachId||!classId||!athleteId)throw new GroupClassProofError('INVALID_PROOF_REQUEST');
  const[requestSnapshot,userSnapshot]=await Promise.all([db.ref(`coachGroupClassRequests/${coachId}/${classId}/${athleteId}`).get(),db.ref(`users/${actorUid}`).get()]),request=value(requestSnapshot)||{},user=value(userSnapshot)||{};
  if(!request.coachId)throw new GroupClassProofError('GROUP_REQUEST_NOT_FOUND');if(user.role!=='admin'&&actorUid!==coachId&&actorUid!==athleteId)throw new GroupClassProofError('NOT_GROUP_PARTICIPANT');
  const path=String(request.paymentProofStorage?.path||'');if(!path.startsWith(`private/group-class-slip/${athleteId}/`))throw new GroupClassProofError('PROOF_NOT_FOUND');
  const file=storage.bucket().file(path),[metadata]=await file.getMetadata();if(!/^image\/(jpeg|png|webp)$/.test(String(metadata?.contentType||'')))throw new GroupClassProofError('PROOF_NOT_FOUND');
  const expiresAt=now+5*60*1000,[url]=await file.getSignedUrl({action:'read',expires:expiresAt});return{ok:true,coachId,classId,athleteId,url,expiresAt};
}
module.exports={GroupClassProofError,execute,value};

