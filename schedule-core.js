(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoachDiSchedule = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const inactive = new Set(['cancelled', 'refunded', 'rejected_by_coach', 'declined', 'expired', 'cancelled_by_coach', 'cancelled_by_athlete']);
  const active = row => !!row && !inactive.has(String(row.status || ''));
  const overlaps = (a, b) => a.date === b.date && Number(a.start) < Number(b.end) && Number(a.end) > Number(b.start);
  function range(date, anchor, last, occupied) {
    const start = Math.min(anchor, last), end = Math.max(anchor, last) + 0.5;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || end - start > 12) return null;
    const selection = { date, start, end };
    return occupied.some(row => active(row) && overlaps(row, selection)) ? null : selection;
  }
  function publicBooking(booking) {
    if (!active(booking) || !booking.coachId || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date || '')) return null;
    const start = Number(booking.start), end = Number(booking.end);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end > 24 || end <= start) return null;
    // An allowlist deliberately excludes athlete identity, payment and refund details.
    return { date: booking.date, start, end, venueName: String(booking.venue || booking.venueName || 'สนามรอยืนยัน').slice(0, 120),
      venueId: String(booking.venueId || 'other').slice(0, 120), source: 'athlete_booking' };
  }
  return Object.freeze({ active, overlaps, range, publicBooking });
});
