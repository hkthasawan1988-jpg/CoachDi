'use strict';
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { onValueWritten } = require('firebase-functions/v2/database');
const projection = require('./booking-projection.cjs');
const payout = require('./payout-verification.cjs');
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
