'use strict';
const group=require('./group-class.cjs');
const availability=require('./booking-availability.cjs');

class GroupClassError extends Error{constructor(code,message=code){super(message);this.name='GroupClassError';this.code=code}}
function transaction(ref,updater){return ref.transaction(updater,undefined,false)}
function rows(value){return Object.entries(value||{}).map(([id,row])=>({id,...row}))}
function userName(user,fallback){return String(user?.displayName||user?.name||user?.email||fallback).trim().slice(0,80)}
function nested(root,path){let value=root;for(const part of path.split('/').filter(Boolean)){if(value==null)return null;value=value[part]}return value??null}
function put(root,path,value){const parts=path.split('/').filter(Boolean);let node=root;for(const part of parts.slice(0,-1))node=node[part]||(node[part]={});node[parts.at(-1)]=value}
function availabilityDecision(root,coachId,target,now,classId=''){
  const policy=nested(root,`coachAvailability/${coachId}`)||{};
  return availability.evaluate({...target,id:classId},{
    bookings:rows(root.bookings).filter(row=>row.coachId===coachId),appointments:rows(nested(root,`coachPublicSchedule/${coachId}`)),
    groupClasses:rows(nested(root,`coachGroupClasses/${coachId}`)).filter(row=>row.id!==classId),timeOff:rows(nested(root,`coachTimeOff/${coachId}`)),
  },{now,mandatoryBufferMinutes:Number(policy.travelBufferMin??45),unknownTravelMinutes:45,maxClassesPerDay:Number(policy.maxClassesPerDay??8)});
}
function notice(root,uid,id,record){put(root,`notifications/${uid}/${id}`,record)}
function audit(root,uid,id,record){put(root,`auditLogs/${uid}/${id}`,record)}
function commandResult(root,actorUid,requestId,record){put(root,`groupClassCommandResults/${actorUid}/${requestId}`,record)}
function resultFor(action,classId,status,replay=false,extra={}){return{ok:true,replay,action,classId,status,...extra}}

async function execute(db,{actorUid,input,now=Date.now()}){
  const requestId=group.validRequestId(input?.requestId),action=group.action(input),fingerprint=group.fingerprint(actorUid,input);
  if(!group.validId(actorUid)||!requestId||!action)throw new GroupClassError('INVALID_GROUP_COMMAND');
  let response,errorCode;
  const result=await transaction(db.ref(),current=>{
    const root=current||{},command=nested(root,`groupClassCommandResults/${actorUid}/${requestId}`);
    if(command){if(command.fingerprint!==fingerprint||command.action!==action){errorCode='REQUEST_CONFLICT';return}response={...command.result,replay:true};return root}
    const actor=nested(root,`users/${actorUid}`)||{},base={actorUid,requestId,action,fingerprint,status:'completed',createdAt:now,updatedAt:now};
    let classId=group.validId(input?.classId),item=classId?nested(root,`coachGroupClasses/${action==='submit_paid'?String(input?.coachId||''):actorUid}/${classId}`):null;
    if(action==='create'){
      if(!group.subscribed(actor,now)){errorCode='COACH_INACTIVE';return}
      const fields=group.createInput(input,now);if(!fields){errorCode='INVALID_GROUP_CLASS';return}
      const check=availabilityDecision(root,actorUid,fields,now);if(!check.ok){errorCode=check.code;return}
      classId=group.classId(actorUid,requestId);const existing=nested(root,`coachGroupClasses/${actorUid}/${classId}`);
      if(existing){errorCode='GROUP_CLASS_ID_CONFLICT';return}
      item={coachId:actorUid,coachName:userName(actor,'Coach'),...fields,approvedCount:0,status:'open',createdAt:now,updatedAt:now};
      put(root,`coachGroupClasses/${actorUid}/${classId}`,item);
      response=resultFor(action,classId,'open');
      audit(root,actorUid,`group_${requestId}`,{userId:actorUid,actor:'coach',action:'coach_group_class_created',target:classId,requestId,at:now});
    }else if(action==='update_schedule'){
      if(!group.subscribed(actor,now)){errorCode='COACH_INACTIVE';return}item=nested(root,`coachGroupClasses/${actorUid}/${classId}`);
      if(!item){errorCode='GROUP_CLASS_NOT_FOUND';return}if(item.coachId!==actorUid||item.status==='cancelled'){errorCode='INVALID_GROUP_STATE';return}
      const fields=group.scheduleInput(input,now);if(!fields){errorCode='INVALID_GROUP_SCHEDULE';return}
      const check=availabilityDecision(root,actorUid,fields,now,classId);if(!check.ok){errorCode=check.code;return}
      const previousSchedule={date:item.date,start:item.start,end:item.end,venueName:item.venueName};Object.assign(item,fields,{previousSchedule,scheduleChangedAt:now,updatedAt:now});
      const requests=nested(root,`coachGroupClassRequests/${actorUid}/${classId}`)||{};let notified=0;
      for(const[athleteId,request]of Object.entries(requests)){if(!['pending','approved'].includes(request?.status))continue;notified++;notice(root,athleteId,`group_schedule_${requestId}_${athleteId}`,{type:'group_class_schedule_changed',groupClassId:classId,senderId:actorUid,recipientId:athleteId,coachId:actorUid,athleteId,message:`Coach เปลี่ยนตาราง ${item.title||'Group Class'} เป็น ${fields.date} เวลา ${fields.start}–${fields.end} ที่ ${fields.venueName}`,read:false,createdAt:now})}
      response=resultFor(action,classId,item.status,false,{notified});audit(root,actorUid,`group_${requestId}`,{userId:actorUid,actor:'coach',action:'coach_group_class_schedule_updated',target:classId,requestId,at:now});
    }else if(action==='set_status'){
      if(!group.subscribed(actor,now)){errorCode='COACH_INACTIVE';return}item=nested(root,`coachGroupClasses/${actorUid}/${classId}`);const next=String(input?.status||'');
      if(!item){errorCode='GROUP_CLASS_NOT_FOUND';return}if(item.coachId!==actorUid||!['open','closed','cancelled'].includes(next)||item.status==='cancelled'){errorCode='INVALID_GROUP_STATE';return}
      if(next==='open'&&(!group.future(item.date,item.start,now)||Number(item.approvedCount||0)>=Number(item.capacity||0))){errorCode='INVALID_GROUP_STATE';return}
      item.status=next;item.updatedAt=now;let notified=0;
      if(next==='cancelled')for(const[athleteId,request]of Object.entries(nested(root,`coachGroupClassRequests/${actorUid}/${classId}`)||{})){if(!['pending','approved'].includes(request?.status))continue;request.status='rejected';request.reason='class_cancelled';request.updatedAt=now;if(request.paymentStatus==='payment_submitted'||request.paymentStatus==='payment_verified')request.paymentStatus='refund_required';notified++;notice(root,athleteId,`group_cancel_${requestId}_${athleteId}`,{type:'group_class_cancelled',groupClassId:classId,senderId:actorUid,recipientId:athleteId,coachId:actorUid,athleteId,message:`Coach ยกเลิก Group Class: ${item.title||'Group Class'}${request.paymentStatus==='refund_required'?' กรุณาติดต่อ Coach เรื่องการคืนเงิน':''}`,read:false,createdAt:now})}
      response=resultFor(action,classId,next,false,{notified});audit(root,actorUid,`group_${requestId}`,{userId:actorUid,actor:'coach',action:'coach_group_class_status_updated',target:classId,requestId,at:now});
    }else if(action==='submit_paid'){
      const coachId=group.validId(input?.coachId);classId=group.validId(input?.classId);item=nested(root,`coachGroupClasses/${coachId}/${classId}`);const payment=nested(root,`coachPaymentPublic/${coachId}`)||{},proof=group.proof(input?.paymentProof,actorUid);
      if(actor.role!=='athlete'){errorCode='ATHLETE_INACTIVE';return}if(!item){errorCode='GROUP_CLASS_NOT_FOUND';return}if(item.status!=='open'||Number(item.approvedCount||0)>=Number(item.capacity||0)||!group.future(item.date,item.start,now)){errorCode='GROUP_CLASS_UNAVAILABLE';return}if(!Number.isSafeInteger(Number(item.priceSatang))||Number(item.priceSatang)<=0){errorCode='PRICE_UNAVAILABLE';return}if(payment.verificationStatus!=='approved'){errorCode='PAYMENT_ACCOUNT_UNAVAILABLE';return}if(!proof){errorCode='PAYMENT_EVIDENCE_REQUIRED';return}
      const path=`coachGroupClassRequests/${coachId}/${classId}/${actorUid}`;if(nested(root,path)){errorCode='GROUP_REQUEST_EXISTS';return}
      const request={classId,coachId,athleteId:actorUid,athleteName:userName(actor,'Athlete'),status:'pending',priceSatang:Number(item.priceSatang),paymentStatus:'payment_submitted',paymentProofStorage:proof,paymentSubmittedAt:now,createdAt:now,updatedAt:now};put(root,path,request);
      notice(root,coachId,`group_submit_${requestId}`,{type:'group_class_paid_booking',groupClassId:classId,senderId:actorUid,recipientId:coachId,coachId,athleteId:actorUid,message:`${request.athleteName} จอง Group Class ${item.title||''} พร้อมส่งหลักฐานการชำระเงิน กรุณาตรวจสอบ`,read:false,createdAt:now});
      response=resultFor(action,classId,'pending');audit(root,actorUid,`group_${requestId}`,{userId:actorUid,actor:'athlete',action:'group_class_paid_booking_submitted',target:classId,requestId,at:now});
    }else if(action==='decide'){
      if(!group.subscribed(actor,now)){errorCode='COACH_INACTIVE';return}classId=group.validId(input?.classId);const athleteId=group.validId(input?.athleteId),decision=String(input?.decision||'');item=nested(root,`coachGroupClasses/${actorUid}/${classId}`);const request=nested(root,`coachGroupClassRequests/${actorUid}/${classId}/${athleteId}`);
      if(!item||!request){errorCode='GROUP_REQUEST_NOT_FOUND';return}if(item.coachId!==actorUid||request.status!=='pending'||!['approved','rejected'].includes(decision)){errorCode='INVALID_GROUP_STATE';return}
      if(decision==='approved'){const amount=Number(request.priceSatang),validEvidence=!!group.proof(request.paymentProofStorage,athleteId)||group.legacyProof(request.paymentProofDataUrl);if(request.paymentStatus!=='payment_submitted'||!validEvidence){errorCode='PAYMENT_EVIDENCE_REQUIRED';return}if(!Number.isSafeInteger(amount)||amount<=0||amount!==Number(item.priceSatang)){errorCode='INVALID_GROUP_STATE';return}}
      let finalStatus=decision,reason='';if(decision==='approved'&&(item.status!=='open'||Number(item.approvedCount||0)>=Number(item.capacity||0)||!group.future(item.date,item.start,now))){finalStatus='rejected';reason='class_full'}
      request.status=finalStatus;request.updatedAt=now;if(finalStatus==='approved'){request.paymentStatus='payment_verified';request.paymentVerifiedAt=now;request.paymentVerifiedBy=actorUid;item.approvedCount=Number(item.approvedCount||0)+1;if(item.approvedCount>=Number(item.capacity||0))item.status='full';item.updatedAt=now;put(root,`paymentTransactions/GC-${classId}-${athleteId}`,{type:'group_class',groupClassId:classId,reference:classId,coachId:actorUid,athleteId,grossSatang:Number(request.priceSatang),platformFeeSatang:0,netSatang:Number(request.priceSatang),status:'received',method:'bank_transfer',receivedAt:now,source:'group_class_server_command'})}else{request.reason=reason||'coach_rejected';if(request.paymentStatus==='payment_submitted'||request.paymentStatus==='payment_verified')request.paymentStatus='refund_required'}
      notice(root,athleteId,`group_decide_${requestId}`,{type:finalStatus==='approved'?'group_class_booking_approved':'group_class_booking_rejected',groupClassId:classId,senderId:actorUid,recipientId:athleteId,coachId:actorUid,athleteId,message:finalStatus==='approved'?`Coach ตรวจหลักฐานและยืนยันที่นั่ง Group Class: ${item.title||'Group Class'} แล้ว`:`คำขอ Group Class: ${item.title||'Group Class'} ไม่ได้รับอนุมัติ กรุณาติดต่อ Coach เรื่องการคืนเงิน`,read:false,createdAt:now});
      response=resultFor(action,classId,finalStatus,false,{paymentStatus:request.paymentStatus,reason:request.reason||null});audit(root,actorUid,`group_${requestId}`,{userId:actorUid,actor:'coach',action:'coach_group_class_booking_decided',target:classId,requestId,athleteId,status:finalStatus,at:now});
    }
    commandResult(root,actorUid,requestId,{...base,result:response});return root;
  });
  if(!result.committed)throw new GroupClassError(errorCode||'GROUP_COMMAND_FAILED');
  if(errorCode)throw new GroupClassError(errorCode);return response;
}

module.exports={GroupClassError,availabilityDecision,execute,nested,put,rows,userName};

