(function(root) {
  'use strict';
  const text = value => String(value ?? '').trim();
  const sport = value => text(value).toLowerCase().replace(/[^a-z]/g, '');
  const hour = value => typeof value === 'string' && value.includes(':')
    ? Number(value.split(':')[0]) + Number(value.split(':')[1]) / 60 : Number(value);
  const rows = value => Object.values(value || {});
  const overlaps = (a, b, c, d) => a < d && b > c;
  const terminal = b => ['refunded', 'completed'].includes(b?.status) ||
    ['refunded', 'pending_admin_coin_credit', 'completed'].includes(b?.refundStatus);
  function account(value = {}, required = true) {
    const bank = text(value.bank), accountName = text(value.accountName);
    const accountNumber = text(value.accountNumber).replace(/[๐-๙]/g, x => String(x.charCodeAt(0) - 3664)).replace(/[\s-]/g, '');
    if (!required && !bank && !accountName && !accountNumber) return null;
    if (bank.length < 2 || bank.length > 100) throw Error('กรุณาระบุธนาคาร 2–100 ตัวอักษร');
    if (accountName.length < 2 || accountName.length > 160) throw Error('กรุณาระบุชื่อเจ้าของบัญชี 2–160 ตัวอักษร');
    if (!/^[0-9]{6,20}$/.test(accountNumber)) throw Error('กรุณาระบุเลขบัญชีเป็นตัวเลข 6–20 หลัก');
    return { bank, accountName, accountNumber };
  }
  function coachCancelled(b) {
    return ['declined', 'rejected_by_coach', 'cancelled_by_coach'].includes(b?.status) ||
      (b?.status === 'cancelled' && b.cancelledBy === 'coach');
  }
  function paymentEvidence(b) {
    return !!(b?.paymentProofDataUrl || b?.paymentProofUrl || b?.paymentProofStorage ||
      ['paid', 'received', 'verified', 'payment_verified', 'payment_submitted', 'payment_uploaded'].includes(b?.paymentStatus));
  }
  function needsRefund(b) {
    return !!b && !terminal(b) && (paymentEvidence(b) ||
      (b.refundReviewRequired === true && !['pay_at_venue_pending', 'unpaid', 'pending_payment'].includes(b.paymentStatus)) || b.refundStatus === 'requested');
  }
  function refundPatch(b, uid, bank, reason, cancel, stamp, now = Date.now()) {
    if (!b || b.athleteId !== uid) throw Error('ไม่พบรายการจองของคุณ');
    if (terminal(b)) throw Error('รายการนี้ดำเนินการแล้ว กรุณารีเฟรช');
    if (b.refundRequestedAt || (cancel && b.cancelRequestedAt)) throw Error('ส่งคำขอรายการนี้แล้ว กรุณารอการตรวจสอบ');
    const cancelled = coachCancelled(b) || ['cancelled_by_athlete', 'cancelled', 'refund_pending_coach_decision'].includes(b.status);
    if (!cancel && !cancelled) throw Error('รายการนี้ยังไม่ถูกยกเลิก');
    if (cancel && (cancelled || !['confirmed', 'payment_verified', 'coach_approved', 'pending_payment', 'pending_coach_approval', 'pending', 'payment_submitted'].includes(b.status))) throw Error('ไม่สามารถยกเลิกสถานะนี้ได้');
    const paid = needsRefund(b);
    if (!cancel && !paid) throw Error('ยังไม่มีข้อมูลการชำระเงินสำหรับขอคืน');
    const patch = {};
    if (cancel) {
      const at = new Date(b.date + 'T00:00:00+07:00').getTime() + hour(b.start) * 36e5;
      if (!Number.isFinite(at) || at <= now) throw Error('เลยเวลาเริ่มเรียนแล้ว กรุณาติดต่อโค้ช');
      const within24 = at - now <= 24 * 36e5;
      Object.assign(patch, { cancelledBy: 'athlete', cancelRequestedAt: stamp,
        status: paid && within24 ? 'refund_pending_coach_decision' : 'cancelled_by_athlete',
        cancellationReason: text(reason).slice(0, 500) });
    }
    if (paid) {
      const value = account(bank);
      Object.assign(patch, { refundBank: value.bank, refundAccountName: value.accountName,
        refundAccountNumber: value.accountNumber, refundRequestedAt: stamp,
        refundRequestedBy: uid, refundStatus: 'requested', refundReviewRequired: true });
    }
    return patch;
  }
  // Public schedules are not a reservation ledger. Candidates always require coach confirmation.
  function candidate(booking, coach, data, now = Date.now()) {
    const aliases = coach.aliasUids || [coach.uid];
    if (aliases.includes(booking.coachId) || coach.uid === booking.coachId) return null;
    if (!['active', 'approved', ''].includes(text(coach.status).toLowerCase())) return null;
    if (!sport(booking.sport) || sport(coach.sport || coach.category || 'tennis') !== sport(booking.sport)) return null;
    const start = hour(booking.start), end = hour(booking.end), date = booking.date;
    const at = new Date(date + 'T00:00:00+07:00').getTime() + start * 36e5;
    if (![start, end, at].every(Number.isFinite) || end <= start || start < 0 || end > 24 || at <= now) return null;
    if (!data || data.failed) return null;
    const availability = data.availability || { start: 6, end: 24, advanceDays: 30, travelBufferMin: 45 };
    if (start < hour(availability.start ?? 6) || end > hour(availability.end ?? 24) ||
      at - now > Number(availability.advanceDays ?? 30) * 864e5) return null;
    if (rows(data.timeOff).some(x => date >= (x.startDate || x.date) && date <= (x.endDate || x.date) &&
      (x.fullDay !== false || overlaps(start, end, hour(x.startHour ?? 0), hour(x.endHour ?? 24))))) return null;
    const busy = [...rows(data.schedule), ...rows(data.groups).filter(x => !/cancel|reject|declin/i.test(x.status || '')),
      ...rows(data.ownBookings).filter(x => !/cancel|reject|declin|refund/i.test(x.status || ''))].filter(x => x.date === date);
    if (busy.some(x => !Number.isFinite(hour(x.start)) || !Number.isFinite(hour(x.end)) || overlaps(start, end, hour(x.start), hour(x.end)))) return null;
    if (busy.length >= Number(availability.maxClassesPerDay ?? 8)) return null;
    const normalize = x => text(x).toLocaleLowerCase().replace(/\s+/g, ' ');
    const sameVenue = x => (booking.venueId && booking.venueId !== 'other' && x.venueId === booking.venueId) ||
      (normalize(booking.venue || booking.venueName) && normalize(x.venueName || x.venue || x.name) === normalize(booking.venue || booking.venueName));
    const venue = Object.entries(data.venues || {}).map(([id, x]) => ({ ...x, venueId: id })).find(sameVenue);
    if (!venue || start < hour(venue.openStart ?? 6) || end > hour(venue.openEnd ?? 24)) return null;
    const buffer = Math.max(0, Number(availability.travelBufferMin ?? 45));
    for (const x of busy) {
      if (sameVenue(x)) continue;
      const gap = hour(x.end) <= start ? (start - hour(x.end)) * 60 : (hour(x.start) - end) * 60;
      // Use the existing conservative unknown-route allowance plus the coach's buffer.
      if (gap < 45 + buffer) return null;
    }
    return { uid: coach.uid, name: coach.displayName || coach.nameTh || coach.nameEn || 'Coach',
      coachDiId: coach.coachDiId || '', venueName: venue.name || booking.venue,
      start, end, date, needsConfirmation: true };
  }
  const api = { account, coachCancelled, paymentEvidence, needsRefund, refundPatch, candidate, terminal };
  root.CoachDiRefundCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window === 'undefined' ? globalThis : window);
