(function (root) {
  'use strict';
  const Core = root.CoachDiBookingServerCore;
  const app = typeof coachDiFirebaseApp === 'object' ? coachDiFirebaseApp : root.coachDiFirebaseApp;
  if (!Core || !app) return;

  const functions = app.functions('asia-southeast1');
  const tracker = Core.tracker(root.sessionStorage);
  const busy = new Set();
  const maxBytes = Math.min(Number(root.COACH_DI_PUBLIC_CONFIG?.maxUploadBytes || 5 * 1048576), 10 * 1048576);
  const appState = () => typeof state === 'object' ? state : root.state;

  function user() {
    const current = app.auth().currentUser;
    if (!current) throw new Error('กรุณาเข้าสู่ระบบอีกครั้ง');
    return current;
  }
  function scope(action, id) { return `${action}:${id}`; }
  async function call(name, data) { return (await functions.httpsCallable(name)(data)).data; }
  async function command(name, action, id, extra) {
    const current = user(), key = scope(action, id), requestId = tracker.get(current.uid, key);
    const result = await call(name, { requestId, bookingId: id, action, ...(extra || {}) });
    tracker.complete(current.uid, key);
    return result;
  }
  async function upload(kind, file, requestId) {
    const current = user(), metadata = Core.proof(file, maxBytes);
    const folder = kind === 'refund' ? 'refund-slip' : 'booking-slip';
    const path = `private/${folder}/${current.uid}/${requestId}/${metadata.name}`;
    await app.storage().ref(path).put(file, { contentType: metadata.contentType, cacheControl: 'private,max-age=0,no-store', customMetadata: { ownerUid: current.uid } });
    return { path, ...metadata, uploadedAt: Date.now() };
  }
  async function latest(id) {
    const snapshot = await app.database().ref(`bookings/${id}`).once('value');
    const value = snapshot.val();
    if (!value) throw new Error('ไม่พบรายการจอง กรุณารีเฟรชแล้วลองใหม่');
    return { id, ...value };
  }
  async function refresh(id) {
    const booking = await latest(id);
    const currentState = appState();
    for (const key of ['bookings', 'allAthleteBookings']) {
      if (Array.isArray(currentState?.[key])) currentState[key] = currentState[key].map(row => row.id === id ? booking : row);
    }
    return booking;
  }
  function showSuccess(id, booking, mode) {
    const el = document.getElementById('inlineBookingTicket');
    if (!el) return;
    const escape = value => typeof root.esc === 'function' ? root.esc(String(value ?? '')) : String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
    const title = mode === 'paid_transfer' ? '✓ ส่งคำขอพร้อมหลักฐานให้ Coach แล้ว' : mode === 'venue' ? '✓ ส่งคำขอชำระที่สนามให้ Coach แล้ว' : '✓ ส่งคำขอจองให้ Coach แล้ว';
    const status = mode === 'paid_transfer' ? 'รอ Coach ตรวจหลักฐาน' : 'รอ Coach อนุมัติ';
    const dateText = typeof root.thaiDate === 'function' ? root.thaiDate(booking.date) : booking.date;
    const startText = typeof root.fmt === 'function' ? root.fmt(booking.start) : booking.start;
    const endText = typeof root.fmt === 'function' ? root.fmt(booking.end) : booking.end;
    el.innerHTML = `<div class="ticketTop"><div><div class="ticketTitle">${title}</div><div class="ticketMeta"><b>${escape(dateText)}</b> • ${escape(startText)}–${escape(endText)}<br>${escape(booking.venue)}<br>Booking ID: ${escape(id)}</div></div><span class="status pending">${status}</span></div><div class="ticketActions"><button class="pill primary" onclick="showAthleteMenu('mybookings')">ดูการจองของฉัน</button><button class="pill" onclick="cancelInlineTicket()">ปิด Ticket</button></div>`;
    el.classList.remove('hidden');
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function bookingInput(venueId, hour, paymentMode, participants, paymentProof) {
    const currentState = appState();
    const coachId = String(currentState?.coachId || '').trim();
    const date = String(currentState?.selectedCell?.date || currentState?.selectedDate || '').trim();
    const start = Number(hour);
    const other = typeof chosenOther === 'object' ? chosenOther : root.chosenOther;
    const venueName = venueId === 'other' ? (other?.name || 'สนามอื่น') : (root.venueName(venueId) || 'สนามที่เลือก');
    if (!coachId || !date || !Number.isFinite(start)) throw new Error('ข้อมูลการจองไม่ครบ กรุณาเลือกโค้ช วัน และเวลาใหม่');
    return { coachId, date, start, durationMinutes: 60, venueId: String(venueId || 'other'), venueName, participants: Math.max(1, Number(participants || 1)), paymentMode, ...(paymentProof ? { paymentProof } : {}) };
  }
  async function create(venueId, hour, mode, button) {
    const currentState = appState();
    const intent = `create:${currentState?.coachId}:${currentState?.selectedCell?.date || currentState?.selectedDate}:${hour}:${venueId}:${mode}`;
    if (busy.has(intent)) return;
    busy.add(intent); if (button) button.disabled = true;
    const current = user(), requestId = tracker.get(current.uid, intent);
    try {
      let proof;
      if (mode === 'paid_transfer') proof = await upload('booking', document.getElementById('cdPreSlip')?.files?.[0], requestId);
      const participants = Number(document.getElementById('cdParticipants')?.value || 1);
      const input = bookingInput(venueId, hour, mode, participants, proof);
      const result = await call('createBookingCommand', { requestId, ...input });
      tracker.complete(current.uid, intent);
      const booking = { ...input, venue: input.venueName, end: input.start + 1, status: result.status, paymentStatus: result.paymentStatus };
      root.closeSheet(); showSuccess(result.bookingId, booking, mode);
      if (mode === 'paid_transfer') root.alert('ส่งคำขอพร้อมหลักฐานแล้ว รอ Coach ตรวจสอบและยืนยัน');
      return result;
    } catch (error) { root.alert(Core.errorText(error)); return null; }
    finally { busy.delete(intent); if (button && document.body.contains(button)) button.disabled = false; }
  }
  async function coachAction(id, preferredAction, button, extra) {
    const key = `coach:${preferredAction}:${id}`;
    if (busy.has(key)) return;
    busy.add(key); if (button) button.disabled = true;
    try {
      const booking = await latest(id);
      let action = preferredAction;
      if (preferredAction === 'approve') {
        action = booking.paymentCollectionMode === 'venue' ? 'coach_confirm_venue' :
          (booking.paymentProofStorage || booking.paymentProofDataUrl || booking.paymentStatus === 'payment_submitted') ? 'coach_confirm_paid' : 'coach_approve_request';
      }
      const result = await command('executeBookingCommand', action, id, extra);
      await refresh(id);
      if (typeof root.csCloseModal === 'function') root.csCloseModal();
      if (typeof root.s42Toast === 'function') root.s42Toast(action === 'coach_decline' ? 'ปฏิเสธ Booking แล้ว' : 'อัปเดต Booking แล้ว');
      return result;
    } catch (error) { root.alert(Core.errorText(error)); return null; }
    finally { busy.delete(key); if (button) button.disabled = false; }
  }
  async function decline(id, button) {
    const booking = await latest(id);
    const reason = document.getElementById('s42Reason')?.value || 'Coach ไม่สะดวก';
    const note = document.getElementById('s42ReasonNote')?.value?.trim() || '';
    if (['confirmed', 'coach_approved', 'payment_submitted'].includes(String(booking.status))) {
      try { return await refundAction(id, 'coach_cancel', button, { reason: [reason, note].filter(Boolean).join(': ') }); }
      catch (error) { root.alert(Core.errorText(error)); return null; }
    }
    return coachAction(id, 'coach_decline', button, { reason, note });
  }
  async function athleteAction(id, action, extra) {
    try { const result = await command('executeAthleteBookingCommand', action, id, extra); await refresh(id); return result; }
    catch (error) { throw new Error(Core.errorText(error)); }
  }
  async function submitPayment(id, button) {
    if (button) button.disabled = true;
    const current = user(), intent = scope('athlete_submit_payment', id), requestId = tracker.get(current.uid, intent);
    try {
      const file = document.getElementById(`s38Slip_${id}`)?.files?.[0];
      const paymentProof = await upload('booking', file, requestId);
      const result = await call('executeAthleteBookingCommand', { requestId, bookingId: id, action: 'athlete_submit_payment', paymentProof });
      tracker.complete(current.uid, intent); await refresh(id);
      root.alert('ส่งหลักฐานแล้ว รอ Coach ตรวจสอบและยืนยันการจอง');
      if (typeof root.renderAthleteBookings === 'function') root.renderAthleteBookings();
      return result;
    } catch (error) { root.alert(Core.errorText(error)); return null; }
    finally { if (button) button.disabled = false; }
  }
  async function refundAction(id, action, button, extra) {
    const key = `refund:${action}:${id}`;
    if (busy.has(key)) return;
    busy.add(key); if (button) button.disabled = true;
    try { const result = await command('executeBookingRefundCommand', action, id, extra); await refresh(id); return result; }
    catch (error) { throw new Error(Core.errorText(error)); }
    finally { busy.delete(key); if (button) button.disabled = false; }
  }
  async function cashRefund(id, button) {
    const current = user(), action = 'coach_complete_cash_refund', intent = scope(action, id), requestId = tracker.get(current.uid, intent);
    try {
      if (button) button.disabled = true;
      const refundProof = await upload('refund', document.getElementById('s38RefundSlip')?.files?.[0], requestId);
      const result = await call('executeBookingRefundCommand', { requestId, bookingId: id, action, refundProof });
      tracker.complete(current.uid, intent); await refresh(id); root.csCloseModal?.(); root.alert('บันทึกหลักฐานการโอนคืนแล้ว'); return result;
    } catch (error) { root.alert(Core.errorText(error)); return null; }
    finally { if (button) button.disabled = false; }
  }
  async function viewProof(id) {
    try {
      const booking = await latest(id);
      if (!booking.paymentProofStorage?.path) return root.alert('ไม่พบหลักฐานการชำระเงิน');
      const { url } = await call('getBookingProofUrl', { bookingId: id, kind: 'payment' });
      root.csModal(`<button class="csSheetClose" onclick="csCloseModal()">✕</button><h2>ตรวจหลักฐาน Booking ${root.esc(id)}</h2><img src="${root.esc(url)}" alt="หลักฐานการชำระเงิน" style="width:100%;max-height:420px;object-fit:contain;border-radius:16px"><p>ยอดที่ต้องได้รับ <b>${root.baht(Number(booking.priceSatang || 0) + Number(booking.travelFeeSatang || 0))}</b></p><button class="pill primary" onclick="verifyPayment('${root.esc(id)}')">ยืนยันว่าได้รับเงินแล้ว</button>`);
    } catch (error) { root.alert(Core.errorText(error)); }
  }

  root.CoachDiBookingServer = { athleteAction, call, cashRefund, coachAction, create, errorText: Core.errorText, refundAction, submitPayment, upload, viewProof };
  root.createBooking = (venueId, hour) => create(venueId, hour, 'request');
  root.cdCreatePaidBooking = (venueId, hour, button) => create(venueId, hour, 'paid_transfer', button);
  root.c65CreateVenuePayBooking = (venueId, hour, button) => create(venueId, hour, 'venue', button);
  root.s42Approve = (id, button) => coachAction(id, 'approve', button);
  root.s42Decline = (id, button) => decline(id, button);
  root.s40ConfirmBooking = id => coachAction(id, 'coach_confirm_paid');
  root.verifyPayment = id => coachAction(id, 'coach_confirm_paid');
  root.c65MarkVenuePaid = (id, button) => coachAction(id, 'record_venue_payment', button);
  root.s38SubmitSlip = (id, button) => submitPayment(id, button);
  root.s38RefundCash = (id, button) => cashRefund(id, button);
  root.s38RefundCoin = async (id, button) => { try { await refundAction(id, 'coach_select_coin_refund', button); root.csCloseModal?.(); root.alert('ส่งรายการคืนเครดิตให้ Admin แล้ว'); } catch (error) { root.alert(Core.errorText(error)); } };
  root.s38ViewSlip = id => viewProof(id);
})(window);
