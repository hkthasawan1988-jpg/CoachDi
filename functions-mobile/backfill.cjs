'use strict';
// Use only after the live trigger is deployed. Default: dry run, no writes.
const {initializeApp} = require('firebase-admin/app');
const {getDatabase} = require('firebase-admin/database');
const P = require('./booking-projection.cjs');
initializeApp({projectId:'coach-di',databaseURL:'https://coach-di-default-rtdb.asia-southeast1.firebasedatabase.app'});
(async()=>{
  const apply = process.argv.includes('--apply'), db = getDatabase();
  const records = (await db.ref('bookings').get()).val() || {};
  let count = 0;
  for (const [id,booking] of Object.entries(records)) {
    const updates = P.changes(id,null,booking,'1970-01-01T00:00:00Z');
    for(const [path,next] of Object.entries(updates)) {
      if (!next.active) continue;
      count++;
      // Never overwrite an event-trigger result, including deletion tombstones.
      if (apply) await db.ref(path).transaction(current => current === null ? next : undefined);
    }
  }
  console.log(JSON.stringify({mode:apply?'apply':'dry-run',eligible:count}));
  process.exitCode=0;
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>process.exit());
