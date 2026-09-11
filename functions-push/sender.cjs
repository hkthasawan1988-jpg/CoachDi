'use strict';
const APP_URL='https://coach-di.netlify.app/';
const INVALID_TOKEN_CODES=new Set(['messaging/registration-token-not-registered','messaging/invalid-registration-token']);
const text=(value,max=180)=>String(value||'').replace(/[\r\n\t]+/g,' ').trim().slice(0,max);
function pushTitle(type){
  return ({new_booking:'มีคำขอจองใหม่',new_paid_booking:'มีคำขอจองพร้อมสลิป',new_booking_pay_at_venue:'มีคำขอจองใหม่',
    payment_submitted:'นักกีฬาส่งสลิปแล้ว',booking_confirmed:'ยืนยันการจองแล้ว',booking_rejected:'สถานะการจองเปลี่ยนแปลง',
    refund_completed:'ดำเนินการคืนเงินแล้ว',group_class_paid_booking:'มีคำขอ Group Class ใหม่',group_class_booking_approved:'ยืนยันที่นั่ง Group Class แล้ว',
    group_class_booking_rejected:'สถานะ Group Class เปลี่ยนแปลง',chat_message:'มีข้อความใหม่',support_message:'มีข้อความจากเจ้าหน้าที่',
    class_reminder_24h:'เตือนคลาสล่วงหน้า 24 ชั่วโมง',class_reminder_2h:'เตือนคลาสล่วงหน้า 2 ชั่วโมง',subscription_expiring:'Subscription ใกล้หมดอายุ',
    subscription_expired:'Subscription หมดอายุแล้ว',subscription_payment_submitted:'มีสลิป Subscription ใหม่',subscription_payment_success:'ชำระ Subscription สำเร็จ',
    payout_verification_pending:'บัญชีรับเงินรอตรวจสอบ',payout_verification_approved:'บัญชีรับเงินได้รับอนุมัติ',payout_verification_rejected:'กรุณาตรวจสอบบัญชีรับเงิน'})[type]||'Coach Di';
}
function payload(notification,userId,notificationId,role,tokens){
  const portal=['athlete','coach','admin'].includes(role)?role:'athlete';
  const url=`${APP_URL}?portal=${encodeURIComponent(portal)}&notification=${encodeURIComponent(notificationId)}`;
  return {tokens,data:{title:pushTitle(notification.type),body:text(notification.message||'คุณมีการแจ้งเตือนใหม่',220),
    type:text(notification.type||'notification',60),notificationId:text(notificationId,100),userId:String(userId),url},
    // Data-only delivery lets the native service enforce logout/recipient checks before display.
    android:{priority:'high',ttl:86400000},
    webpush:{headers:{Urgency:'high',TTL:'86400'},fcmOptions:{link:url}}};
}
async function deliver(database,messaging,event,logger={info(){}}){
  const notification=event.data.val()||{}, {userId,notificationId}=event.params;
  const records=(await database.ref(`fcmTokens/${userId}`).get()).val()||{};
  const rows=Object.entries(records).map(([deviceId,value])=>({...value,deviceId})).filter(row=>row.enabled===true&&typeof row.token==='string'&&row.token.length);
  const deliveryRef=event.data.ref.child('pushDelivery');
  if(!rows.length){await deliveryRef.set({status:'no_enabled_devices',attempted:0,delivered:0,failed:0,checkedAt:Date.now()});return;}
  const role=(await database.ref(`users/${userId}/role`).get()).val();
  let delivered=0,failed=0,cleanupFailed=0;
  for(let start=0;start<rows.length;start+=500){
    const batch=rows.slice(start,start+500);
    const response=await messaging.sendEachForMulticast(payload(notification,userId,notificationId,role,batch.map(row=>row.token)));
    delivered+=response.successCount;failed+=response.failureCount;
    await Promise.all(response.responses.map(async(result,index)=>{
      if(result.success||!INVALID_TOKEN_CODES.has(result.error?.code))return;
      const sent=batch[index];
      // Token may rotate while sending. Do not delete a newer registration at the same path.
      try {
        await database.ref(`fcmTokens/${userId}/${sent.deviceId}`).transaction(current=>current?.token===sent.token?null:undefined);
      } catch(error) {
        // Cleanup is maintenance: it must not prevent sending to the next batch.
        // Keep the token for a later cleanup attempt and omit token/error-message data.
        cleanupFailed++;
        logger.warn?.('Coach Di push token cleanup failed',{userId,notificationId,code:error?.code||'unknown'});
      }
    }));
  }
  await deliveryRef.set({status:failed?(delivered?'partial':'failed'):'delivered',attempted:rows.length,delivered,failed,cleanupFailed,checkedAt:Date.now()});
  logger.info('Coach Di push delivery',{userId,notificationId,delivered,failed,cleanupFailed});
}
module.exports={payload,deliver,pushTitle};
