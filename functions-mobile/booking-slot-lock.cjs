'use strict';

const INACTIVE = new Set(['cancelled','refunded','rejected_by_coach','declined','expired','cancelled_by_coach','cancelled_by_athlete']);

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
}

function interval(row) {
  if (!row || INACTIVE.has(String(row.status || ''))) return null;
  const start = Number(row.start), end = Number(row.end);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || end <= start || end-start > 12) return null;
  return { start, end };
}

function overlaps(left, right) {
  const a=interval(left), b=interval(right);
  return !!a && !!b && a.start < b.end && b.start < a.end;
}

function lockId(bookingId) {
  const id=String(bookingId || '').trim();
  return /^[A-Za-z0-9_-]{4,100}$/.test(id) ? `booking_${id}` : null;
}

function claim(current, booking, now, commandKey = '') {
  const id=lockId(booking && booking.id), date=booking && booking.date, target=interval(booking);
  if (!id || !validDate(date) || !target) return { ok:false, code:'INVALID_BOOKING_WINDOW' };
  const locks={ ...(current || {}) }, own=locks[id];
  if (own && own.bookingId === booking.id && Number(own.start) === target.start && Number(own.end) === target.end) {
    return { ok:true, replay:true, value:locks, lockId:id };
  }
  for (const [key,row] of Object.entries(locks)) {
    if (key !== id && row && row.bookingId !== booking.id && overlaps(row,booking)) {
      return { ok:false, code:'SLOT_ALREADY_LOCKED', conflictingBookingId:String(row.bookingId || '') };
    }
  }
  locks[id]={ bookingId:booking.id, date, start:target.start, end:target.end, status:'active', commandKey:String(commandKey||''), updatedAt:now };
  return { ok:true, replay:false, value:locks, lockId:id };
}

function release(current, bookingId, commandKey = '') {
  const id=lockId(bookingId), locks={ ...(current || {}) };
  if (!id || !Object.hasOwn(locks,id)) return { changed:false, value:locks };
  if(commandKey&&locks[id]?.commandKey!==commandKey)return { changed:false, value:locks };
  delete locks[id]; return { changed:true, value:locks };
}

module.exports={ claim, interval, lockId, overlaps, release, validDate };
