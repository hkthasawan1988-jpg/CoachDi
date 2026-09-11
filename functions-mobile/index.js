'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { onValueWritten } = require('firebase-functions/v2/database');
const { HttpsError, onCall } = require('firebase-functions/v2/https');
const { logger } = require('firebase-functions');
const projection = require('./booking-projection.cjs');
const payout = require('./payout-verification.cjs');
const bookingCommands = require('./booking-command-service.cjs');
const bookingCreate = require('./booking-create-service.cjs');
initializeApp();
// Separate codebase: deploying this function must not replace existing payment or push functions.
exports.syncCoachBookingSchedule = onValueWritten({
  ref:'/bookings/{bookingId}', instance:'coach-di-default-rtdb', region:'asia-southeast1', retry:true, maxInstances:3
}, async event => {
  const updates = projection.changes(event.params.bookingId,event.data.before.val(),event.data.after.val(),event.time);
  await Promise.all(Object.entries(updates).map(([path,next]) => getDatabase().ref(path).transaction(current => projection.apply(current,next))));
});

exports.syncCoachPayoutVerification = onValueWritten({
  ref:'/coachPaymentAccounts/{coachId}', instance:'coach-di-default-rtdb', region:'asia-southeast1', retry:true, maxInstances:3
}, event => payout.handle(getDatabase(), event));

const invalidArgument = new Set(['INVALID_REQUEST_ID','INVALID_BOOKING_WINDOW','INVALID_BOOKING_AMOUNT','INVALID_TRAVEL_POLICY','INVALID_DAILY_LIMIT','INVALID_PAYMENT_MODE','INVALID_DURATION','INVALID_VENUE','INVALID_PARTICIPANTS','UNKNOWN_ACTION']);
const denied = new Set(['ATHLETE_INACTIVE','COACH_INACTIVE','NOT_ASSIGNED_COACH']);
const conflict = new Set(['REQUEST_CONFLICT','INVALID_STATE','PAYMENT_EVIDENCE_REQUIRED','PAYMENT_METHOD_MISMATCH','PAYMENT_ACCOUNT_UNAVAILABLE','PRICE_UNAVAILABLE','BOOKING_IN_PAST','COACH_TIME_OFF','TIME_CONFLICT','TRAVEL_BUFFER_INSUFFICIENT','DAILY_LIMIT_REACHED','SLOT_ALREADY_LOCKED','BOOKING_CHANGED','BOOKING_ID_CONFLICT']);
function callableError(error){
  const code=String(error?.code||'INTERNAL');
  if(code==='BOOKING_NOT_FOUND')return new HttpsError('not-found','ไม่พบ Booking');
  if(invalidArgument.has(code))return new HttpsError('invalid-argument','ข้อมูลคำสั่งไม่ถูกต้อง',{code});
  if(denied.has(code))return new HttpsError('permission-denied','ไม่มีสิทธิ์ดำเนินการ',{code});
  if(conflict.has(code))return new HttpsError('failed-precondition','Booking ถูกเปลี่ยนแปลงหรือเวลาไม่พร้อม',{code});
  logger.error('Booking command failed',{code});
  return new HttpsError('internal','ไม่สามารถดำเนินการ Booking ได้');
}

// New clients will move critical booking transitions here after App Check registration and UAT.
exports.executeBookingCommand = onCall({
  region:'asia-southeast1', enforceAppCheck:true, timeoutSeconds:30, maxInstances:10
}, async request => {
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','กรุณาเข้าสู่ระบบ');
  try{return await bookingCommands.execute(getDatabase(),{actorUid:request.auth.uid,input:request.data||{}})}
  catch(error){throw callableError(error)}
});

exports.createBookingCommand = onCall({
  region:'asia-southeast1', enforceAppCheck:true, timeoutSeconds:30, maxInstances:10
}, async request => {
  if(!request.auth?.uid)throw new HttpsError('unauthenticated','กรุณาเข้าสู่ระบบ');
  try{return await bookingCreate.execute(getDatabase(),{actorUid:request.auth.uid,input:request.data||{}})}
  catch(error){throw callableError(error)}
});
