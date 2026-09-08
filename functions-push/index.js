'use strict';
// Recovered sender only. Deploy with the exact function filter in docs/PAYOUT-PUSH-ROLLOUT-TH.md.
// The other deployed chat, reminder and payment functions stay managed by their existing source.
const { setGlobalOptions } = require('firebase-functions/v2');
const { onValueCreated } = require('firebase-functions/v2/database');
const { logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getMessaging } = require('firebase-admin/messaging');
const { deliver } = require('./sender.cjs');
initializeApp({databaseURL:'https://coach-di-default-rtdb.asia-southeast1.firebasedatabase.app'});
setGlobalOptions({region:'asia-southeast1',memory:'256MiB',timeoutSeconds:60,maxInstances:10,preserveExternalChanges:true});
exports.sendPushOnNotificationCreated = onValueCreated({
  ref:'/notifications/{userId}/{notificationId}',instance:'coach-di-default-rtdb'
}, event => deliver(getDatabase(),getMessaging(),event,logger));
