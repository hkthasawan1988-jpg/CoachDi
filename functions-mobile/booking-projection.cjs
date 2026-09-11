'use strict';
const { createHash } = require('node:crypto');
const inactive = new Set(['cancelled','refunded','rejected_by_coach','declined','expired','cancelled_by_coach','cancelled_by_athlete']);
function version(time) {
  const match = String(time).match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/);
  if (!match) throw Error('Expected UTC CloudEvent time');
  return `${match[1]}.${(match[2] || '').padEnd(9,'0')}Z`;
}
function row(booking, revision) {
  const result = {active:false,revision};
  if (!booking || inactive.has(booking.status)) return result;
  const start = Number(booking.start), end = Number(booking.end);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(booking.date || '') || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || end <= start) return result;
  return {active:true,revision,date:booking.date,start,end,venueName:String(booking.venue || booking.venueName || 'สนามรอยืนยัน').slice(0,120),venueId:String(booking.venueId || 'other').slice(0,120),source:'athlete_booking'};
}
function changes(id, before, after, time) {
  const revision = version(time), key = createHash('sha256').update(id).digest('hex'), updates = {};
  if (before?.coachId && before.coachId !== after?.coachId) updates[`coachBookingSchedule/${before.coachId}/${key}`] = row(null,revision);
  if (after?.coachId) updates[`coachBookingSchedule/${after.coachId}/${key}`] = row(after,revision);
  return updates;
}
function apply(current, next) { return current?.revision >= next.revision ? undefined : next; }
module.exports = {row,version,changes,apply};
