(function(root) {
  'use strict';
  const C = root.CoachDiRefundCore;
  const E = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const stamp = () => firebase.database.ServerValue.TIMESTAMP;
  const pending = new Set();
  let view = 0, registrationBusy = false;
  function owner(uid) {
    if (!uid || state.role !== 'athlete' || state.user?.uid !== uid || auth.currentUser?.uid !== uid) throw Error('บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบนักกีฬาอีกครั้ง');
  }
  const mine = () => state.allAthleteBookings || state.bookings || [];
  const booking = id => mine().find(b => b.id === id);
  const errorText = error => error?.code === 'PERMISSION_DENIED' ? 'ไม่มีสิทธิ์บันทึกรายการ กรุณาติดต่อผู้ดูแล' : error.message || 'ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง';
  function show(body, footer) {
    view++;
    if (typeof c59Close === 'function') c59Close();
    if (typeof csCloseModal === 'function') csCloseModal();
    sheetContent.innerHTML = '<div class="cdr-form" data-refund-view>' + body + '</div><div class="sheetActions">' + footer + '</div>';
    sheetWrap.classList.remove('hidden');
    return view;
  }
  const closeButton = '<button type="button" class="pill" data-cdr="close">ปิด</button>';
  function fields(value = {}, required = false) {
    return '<fieldset><legend>บัญชีรับเงินคืน' + (required ? ' (จำเป็น)' : ' (กรอกภายหลังได้)') + '</legend><div class="cdr-form">' +
      '<label>ธนาคาร<input id="cdrBank" maxlength="100" autocomplete="off" value="' + E(value.bank) + '"></label>' +
      '<label>ชื่อเจ้าของบัญชี<input id="cdrAccountName" maxlength="160" autocomplete="off" value="' + E(value.accountName) + '"></label>' +
      '<label>เลขบัญชี<input id="cdrAccountNumber" type="text" inputmode="numeric" maxlength="30" autocomplete="off" spellcheck="false" value="' + E(value.accountNumber) + '"></label>' +
      '</div></fieldset><p class="cdr-note">ใช้บัญชีของคุณเอง กรุณาตรวจสอบธนาคาร ชื่อ และเลขบัญชีก่อนส่ง ข้อมูลนี้ใช้เพื่อดำเนินการคืนเงิน</p>';
  }
  function inputAccount(required) {
    return C.account({ bank: document.getElementById('cdrBank')?.value,
      accountName: document.getElementById('cdrAccountName')?.value,
      accountNumber: document.getElementById('cdrAccountNumber')?.value }, required);
  }
  function error(message) { const node = document.getElementById('cdrError'); if (node) node.textContent = message; }
  const errorHost = '<p id="cdrError" class="cdr-error" role="status" aria-live="polite"></p>';
  function openRegistration() {
    if (registrationBusy || auth.currentUser) return;
    show('<h2>สร้างบัญชีนักกีฬา</h2><label>Email<input id="cdrEmail" type="email" autocomplete="email" value="' + E(loginId.value.trim()) + '"></label>' +
      '<label>Password (อย่างน้อย 6 ตัวอักษร)<input id="cdrPassword" type="password" autocomplete="new-password" minlength="6"></label>' + fields({}, false) + errorHost,
      '<button class="pill primary" type="button" data-cdr="register">สร้างบัญชี</button>' + closeButton);
    document.getElementById('cdrPassword').value = loginPass.value;
  }
  async function register(button) {
    if (registrationBusy || auth.currentUser) return;
    let regApp, credential, profileSaved = false;
    try {
      const email = document.getElementById('cdrEmail').value.trim(), password = document.getElementById('cdrPassword').value;
      const bank = inputAccount(false);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 6) throw Error('กรุณากรอก Email และ Password อย่างน้อย 6 ตัวอักษร');
      registrationBusy = true; button.disabled = true; error('กำลังสร้างบัญชี...');
      // The isolated Auth instance keeps the existing portal listener from racing the profile write.
      regApp = firebase.initializeApp(firebaseConfig, 'athleteRegistration-' + Date.now());
      const regAuth = regApp.auth();
      await regAuth.setPersistence(firebase.auth.Auth.Persistence.NONE);
      credential = await regAuth.createUserWithEmailAndPassword(email, password);
      const profile = { role: 'athlete', email, createdAt: stamp() };
      if (bank) profile.refundAccount = { ...bank, updatedAt: stamp() };
      await regApp.database().ref('users/' + credential.user.uid).set(profile);
      profileSaved = true;
      if (auth.currentUser) throw Error('สร้างบัญชีแล้ว กรุณาเข้าสู่ระบบด้วย Email ที่สมัคร');
      closeSheet(); authMessage.textContent = 'สร้างบัญชีนักกีฬาแล้ว กำลังเข้าสู่ระบบ...';
      await auth.setPersistence(document.getElementById('rememberLogin')?.checked === false ? firebase.auth.Auth.Persistence.SESSION : firebase.auth.Auth.Persistence.LOCAL);
      await auth.signInWithEmailAndPassword(email, password);
    } catch (failure) {
      if (credential && !profileSaved) {
        try { await credential.user.delete(); }
        catch (_) { failure = Error('สร้างบัญชีได้ แต่บันทึกโปรไฟล์ไม่สำเร็จ กรุณาติดต่อผู้ดูแลก่อนสมัครซ้ำ'); }
      }
      const message = profileSaved ? 'สร้างบัญชีแล้ว แต่เข้าสู่ระบบไม่สำเร็จ กรุณาใช้ Email และ Password เข้าสู่ระบบอีกครั้ง' : thaiAuthError(failure);
      error(message); authMessage.textContent = message;
    } finally {
      if (regApp) { try { await regApp.auth().signOut(); await regApp.delete(); } catch (_) {} }
      registrationBusy = false; button.disabled = false;
    }
  }
  async function editAccount() {
    const uid = state.user?.uid;
    try {
      owner(uid);
      const revision = show('<h2>บัญชีรับเงินคืน</h2><p>กำลังโหลดข้อมูล...</p>' + errorHost, closeButton);
      const snap = await db.ref('users/' + uid + '/refundAccount').once('value');
      owner(uid); if (revision !== view || sheetWrap.classList.contains('hidden')) return;
      show('<h2>บัญชีรับเงินคืน</h2>' + fields(snap.val() || {}, true) + '<p class="cdr-note">โปรไฟล์นี้เห็นได้เฉพาะคุณและผู้ดูแล เมื่อขอคืนเงินจะส่งสำเนาบัญชีให้โค้ชของรายการนั้น</p>' + errorHost,
        '<button class="pill primary" type="button" data-cdr="save-account">บันทึกบัญชี</button>' + closeButton);
    } catch (failure) { error(errorText(failure)); }
  }
  async function saveAccount(button) {
    const uid = state.user?.uid;
    if (pending.has('account')) return;
    try {
      owner(uid); const value = inputAccount(true);
      pending.add('account'); button.disabled = true;
      await db.ref('users/' + uid + '/refundAccount').set({ ...value, updatedAt: stamp() });
      owner(uid); state.userProfile = { ...state.userProfile, refundAccount: value };
      error('บันทึกบัญชีแล้ว');
    } catch (failure) { error(errorText(failure)); }
    finally { pending.delete('account'); button.disabled = false; }
  }
  function accountFromBooking(b) { return { bank: b.refundBank, accountName: b.refundAccountName, accountNumber: b.refundAccountNumber }; }
  async function openRecovery(id, cancel = false) {
    const uid = state.user?.uid;
    try {
      owner(uid);
      const revision = show('<h2>รายการจองและการคืนเงิน</h2><p>กำลังโหลดรายการล่าสุด...</p>' + errorHost, closeButton);
      const [bs, us] = await Promise.all([db.ref('bookings/' + id).once('value'), db.ref('users/' + uid + '/refundAccount').once('value')]);
      owner(uid); if (revision !== view || sheetWrap.classList.contains('hidden')) return;
      const b = bs.val(); if (!b || b.athleteId !== uid) throw Error('ไม่พบรายการจองของคุณ');
      const paid = C.needsRefund(b), sent = !!b.refundRequestedAt || (!!b.cancelRequestedAt && !paid);
      const allow = !C.terminal(b) && !sent && (cancel || paid);
      const title = cancel ? 'ขอยกเลิกการจอง' : 'โค้ชอื่นและการคืนเงิน';
      const form = allow ? (paid ? fields(us.val() || accountFromBooking(b), true) + '<label class="cdr-check"><input type="checkbox" id="cdrConfirmAccount">ฉันตรวจสอบแล้วว่าเป็นบัญชีของฉัน และยินยอมส่งข้อมูลบัญชีให้โค้ชของรายการนี้เพื่อคืนเงิน</label>' : '<p>รายการนี้ยังไม่มีหลักฐานการชำระเงิน ระบบจะส่งคำขอยกเลิกโดยไม่สร้างคำขอคืนเงิน</p>') +
        (cancel ? '<label>เหตุผลที่ยกเลิก<textarea id="cdrCancelReason" maxlength="500" rows="3"></textarea></label>' : '') :
        '<p class="cdr-banner">' + (C.terminal(b) ? 'รายการนี้ดำเนินการแล้ว ตรวจสอบสถานะการคืนเงินกับโค้ชได้ในแชท' : sent ? 'ส่งคำขอแล้ว กำลังรอโค้ชตรวจสอบ กรุณาติดต่อโค้ชหากต้องแก้ข้อมูลบัญชี' : 'รายการนี้ยังไม่มีข้อมูลชำระเงินที่ต้องคืน') + '</p>';
      const rec = C.coachCancelled(b) ? '<section><h3>โค้ชที่อาจสะดวกแทน</h3><p class="cdr-note">ค้นหากีฬา วัน เวลา และสนามเดิมจากตารางที่เปิดเผย โค้ชต้องยืนยันความว่างและราคาอีกครั้ง</p><div id="cdrRecommendations" role="status">กำลังตรวจตาราง...</div></section>' : '';
      const next = show('<h2>' + title + '</h2><p>#' + E(id) + ' · ' + E(b.date) + ' · ' + E(b.venue || '') + '</p>' +
        (paid ? '<p class="cdr-note">คำขอนี้ให้โค้ชตรวจสอบยอดและดำเนินการคืนเงิน การส่งคำขอยังไม่ใช่การโอนคืน</p>' : '') + form + errorHost + rec,
        (allow ? '<button class="pill primary" type="button" data-cdr="submit-refund" data-booking="' + E(id) + '" data-cancel="' + cancel + '">' + (cancel ? 'ส่งคำขอยกเลิก' : 'ยืนยันบัญชีและขอคืนเงิน') + '</button>' : '') + closeButton);
      if (C.coachCancelled(b)) void recommend({ ...b, id }, uid, next);
    } catch (failure) { error(errorText(failure)); }
  }
  async function submitRefund(id, cancel, button) {
    if (pending.has(id)) return;
    const uid = state.user?.uid;
    try {
      owner(uid);
      const value = document.getElementById('cdrBank') ? inputAccount(true) : null;
      if (value && !document.getElementById('cdrConfirmAccount')?.checked) throw Error('กรุณายืนยันข้อมูลบัญชีก่อนขอคืนเงิน');
      const reason = document.getElementById('cdrCancelReason')?.value || '';
      pending.add(id); button.disabled = true; error('กำลังส่งคำขอ...');
      const ref = db.ref('bookings/' + id);
      const result = await C.requestRefund(ref, { uid, bank: value, reason, cancel, stamp, assertOwner: () => owner(uid) });
      owner(uid);
      const saved = result.snapshot.val();
      for (const key of ['bookings', 'allAthleteBookings']) if (Array.isArray(state[key])) state[key] = state[key].map(b => b.id === id ? { ...saved, id } : b);
      // Notification failure must never cause a second financial request.
      let notified = true;
      try {
        await db.ref('notifications/' + saved.coachId + '/refund-request-' + id).set({ type: 'cancellation', bookingId: id,
          senderId: uid, recipientId: saved.coachId, message: value ? 'นักกีฬาส่งบัญชีและคำขอคืนเงิน กรุณาตรวจสอบรายการ ' + id : 'นักกีฬาขอยกเลิกการจอง ' + id,
          createdAt: stamp(), read: false });
      } catch (_) { notified = false; }
      error(notified ? 'ส่งคำขอแล้ว กรุณารอโค้ชตรวจสอบ' : 'บันทึกคำขอแล้ว แต่ส่งการแจ้งเตือนไม่สำเร็จ กรุณาติดต่อโค้ชทางแชท');
      button.textContent = 'ส่งคำขอแล้ว'; button.dataset.saved = 'true';
    } catch (failure) { error(errorText(failure)); }
    finally { pending.delete(id); if (!button.dataset.saved) button.disabled = false; }
  }
  async function candidateData(coach) {
    const ids = [...new Set([coach.uid, ...(coach.aliasUids || [])])];
    const records = await Promise.all(ids.map(async uid => {
      const names = ['coachAvailability','coachVenues','coachPublicSchedule','coachTimeOff','coachGroupClasses','coachBookingSchedule'];
      const snaps = await Promise.all(names.map(name => db.ref(name + '/' + uid).once('value')));
      return { uid, values: snaps.map(x => x.val()) };
    }));
    const primary = records.find(x => x.uid === coach.uid).values;
    const merged = i => Object.fromEntries(records.flatMap(r => Object.entries(r.values[i] || {}).map(([key, value]) => [r.uid + ':' + key, value])));
    const booked = Object.fromEntries(Object.entries(merged(5)).filter(([,row]) => row.active !== false));
    return { availability: primary[0], venues: primary[1], schedule: {...merged(2), ...booked}, timeOff: merged(3), groups: merged(4),
      ownBookings: mine().filter(b => ids.includes(b.coachId)) };
  }
  async function recommendations(b) {
    const snap = await db.ref('coachProfiles').once('value');
    const coaches = c104MergePublicCoachProfiles(snap.val() || {});
    const original = coaches.find(c => c.uid === b.coachId || c.aliasUids?.includes(b.coachId));
    const target = { ...b, sport: b.sport || original?.sport || original?.category || '' };
    if (!target.sport) return { candidates: [], failed: 0, unknownSport: true };
    let failed = 0; const candidates = [];
    // Bound concurrency without dropping later matching coaches.
    for (let offset = 0; offset < coaches.length; offset += 4) {
      const batch = await Promise.all(coaches.slice(offset, offset + 4).map(async coach => {
        if (coach.uid === b.coachId || coach.aliasUids?.includes(b.coachId) || coachSport(coach) !== coachSport({ sport: target.sport })) return null;
        try { return C.candidate(target, coach, await candidateData(coach)); }
        catch (_) { failed++; return null; }
      }));
      candidates.push(...batch.filter(Boolean));
    }
    return { candidates: candidates.sort((a,b) => a.name.localeCompare(b.name, 'th') || a.uid.localeCompare(b.uid)), failed };
  }
  async function recommend(b, uid, revision) {
    try {
      const result = await recommendations(b); owner(uid);
      if (revision !== view || sheetWrap.classList.contains('hidden')) return;
      const host = document.getElementById('cdrRecommendations'); if (!host) return;
      host.innerHTML = result.candidates.length ? result.candidates.slice(0, 5).map(c => '<article class="cdr-candidate"><h3>' + E(c.name) + '</h3><p>' + E(c.coachDiId) + ' · ' + E(c.venueName) + '</p><p class="cdr-note">ไม่พบนัดชนในตารางที่เปิดเผย · รอโค้ชยืนยัน</p><button type="button" class="pill" data-cdr="select-coach" data-booking="' + E(b.id) + '" data-coach="' + E(c.uid) + '">ดูตารางและเลือกโค้ชนี้</button></article>').join('') : '<p>ยังไม่พบโค้ชที่ตรงเวลาและสนามเดิม ลองเลือกวันหรือสนามอื่นจากหน้าจองโค้ช</p>';
      if (result.failed) host.insertAdjacentHTML('beforeend', '<p class="cdr-error">ตารางบางส่วนโหลดไม่สำเร็จ จึงยังไม่แนะนำโค้ชเหล่านั้น</p>');
      if (result.unknownSport) host.insertAdjacentHTML('beforeend', '<p class="cdr-error">ยังระบุประเภทกีฬาของรายการเดิมไม่ได้ กรุณาเลือกกีฬาจากหน้าจองโค้ช</p>');
    } catch (failure) {
      if (revision === view && state.user?.uid === uid) {
        const host = document.getElementById('cdrRecommendations'); if (host) host.textContent = 'ตรวจตารางไม่ได้ กรุณาลองใหม่ภายหลัง';
      }
    }
  }
  async function selectCoach(id, coachId, button) {
    const uid = state.user?.uid;
    if (button.disabled) return;
    try {
      owner(uid); button.disabled = true;
      const latest = (await db.ref('bookings/' + id).once('value')).val();
      if (!latest || latest.athleteId !== uid || !C.coachCancelled(latest)) throw Error('สถานะรายการเปลี่ยนแล้ว กรุณารีเฟรช');
      const result = await recommendations({ ...latest, id }); owner(uid);
      if (!result.candidates.some(c => c.uid === coachId)) throw Error('ตารางโค้ชเปลี่ยนแล้ว กรุณาเลือกใหม่');
      state.selectedDate = latest.date; state.selectedCell = null;
      const profile = (await db.ref('coachProfiles/' + coachId).once('value')).val(); owner(uid);
      state.selectedSport = coachSport(profile || { sport: latest.sport });
      closeSheet(); showAthleteMenu('home');
      await changeAthleteCoach(coachId); owner(uid); renderSchedule();
      if (typeof s42Toast === 'function') s42Toast('เปิดตารางโค้ชแล้ว กรุณาตรวจเวลา ระยะเวลา สนาม และราคา ก่อนส่งคำขอใหม่');
    } catch (failure) { error(errorText(failure)); button.disabled = false; }
  }
  function actions(b) {
    if (!b || b.athleteId !== state.user?.uid) return '';
    const recovery = C.coachCancelled(b) || ['cancelled_by_athlete','refund_pending_coach_decision'].includes(b.status);
    if (recovery) return '<div class="cdr-actions"><button class="pill" data-cdr="recover" data-booking="' + E(b.id) + '">โค้ชอื่น / การคืนเงิน</button></div>';
    if (['confirmed','payment_verified','coach_approved'].includes(b.status)) return '<div class="cdr-actions"><button class="pill" data-cdr="cancel" data-booking="' + E(b.id) + '">ขอยกเลิก / คืนเงิน</button></div>';
    return '';
  }
  registerAthlete = openRegistration;
  s38CancelBooking = id => openRecovery(id, true);
  s38SubmitCancel = id => openRecovery(id, true);
  const profileView = athleteProfileView;
  athleteProfileView = function() { return profileView() + '<section class="card cdr-saved"><h2>บัญชีรับเงินคืน</h2><p>กรอกภายหลังได้ และต้องยืนยันบัญชีก่อนส่งคำขอคืนเงิน</p><button class="pill" data-cdr="edit-account">จัดการบัญชีรับเงินคืน</button></section>'; };
  const ticket = c50BookingTicket;
  c50BookingTicket = b => ticket(b) + actions(b);
  const home = c47RenderHome;
  c47RenderHome = function() {
    const result = home.apply(this, arguments), host = document.getElementById('c47Home');
    if (state.role === 'athlete' && host && !host.querySelector('[data-cdr-home]')) {
      const cancelled = mine().filter(C.coachCancelled).slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).slice(0, 3);
      if (cancelled.length) host.insertAdjacentHTML('afterbegin', '<section data-cdr-home class="cdr-banner"><h3>รายการที่โค้ชไม่สะดวกรับ</h3>' + cancelled.map(b => '<p>' + E(b.date) + ' · ' + E(b.venue || '') + '</p>' + actions(b)).join('') + '</section>');
    }
    return result;
  };
  const coachTicket = c44ticket;
  c44ticket = function(b) {
    let result = coachTicket(b);
    if (b.coachId !== state.user?.uid) return result;
    if (b.refundStatus === 'requested') result += '<div class="cdr-actions"><button class="pill" data-cdr="coach-refund" data-booking="' + E(b.id) + '">ตรวจคำขอคืนเงินและบัญชี</button></div>';
    else if (b.status === 'confirmed') result += '<div class="cdr-actions"><button class="pill" data-cdr="coach-cancel" data-booking="' + E(b.id) + '">โค้ชไม่สะดวก / ขอยกเลิก</button></div>';
    return result;
  };
  const decline = s42Decline;
  s42Decline = async function(id, button) {
    if (pending.has('decline:' + id)) return;
    pending.add('decline:' + id);
    try { return await decline(id, button); }
    finally { pending.delete('decline:' + id); }
  };
  s38RefundDecision = function(id) {
    const b = (state.bookings || []).find(x => x.id === id);
    if (!b || b.coachId !== state.user?.uid || auth.currentUser?.uid !== b.coachId) return;
    if (!C.needsRefund(b) || !b.refundRequestedAt) return alert('ยังไม่มีคำขอคืนเงินที่ยืนยันบัญชีแล้ว');
    try { C.account(accountFromBooking(b)); } catch (_) { return alert('ข้อมูลบัญชีไม่ครบ กรุณาติดต่อนักกีฬา'); }
    show('<h2>ตรวจคำขอคืนเงิน</h2><p>#' + E(id) + '</p><p>ธนาคาร: ' + E(b.refundBank) + '<br>ชื่อบัญชี: ' + E(b.refundAccountName) + '<br>เลขบัญชี: ' + E(b.refundAccountNumber) + '</p><p class="cdr-note">ตรวจสอบยอดรับจริงและโอนคืนก่อนแนบหลักฐาน การบันทึกนี้ไม่ใช่คำสั่งโอนเงิน</p><label>แนบสลิปคืนเงิน<input id="s38RefundSlip" type="file" accept="image/png,image/jpeg,image/webp"></label>' + errorHost,
      '<button type="button" class="pill primary" data-cdr="refund-cash" data-booking="' + E(id) + '">บันทึกหลักฐานการโอนคืน</button><button type="button" class="pill" data-cdr="refund-coin" data-booking="' + E(id) + '">คืนเป็นเหรียญตามเงื่อนไขเดิม</button>' + closeButton);
  };
  const refundCash = s38RefundCash;
  async function completeCash(id, button, method = 'cash') {
    if (pending.has('cash:' + id)) return;
    pending.add('cash:' + id); button.disabled = true;
    try {
      const b = (await db.ref('bookings/' + id).once('value')).val();
      if (!b || b.coachId !== state.user?.uid || auth.currentUser?.uid !== b.coachId || !C.needsRefund(b) || !b.refundRequestedAt) throw Error('สถานะการคืนเงินเปลี่ยนแล้ว กรุณารีเฟรช');
      C.account(accountFromBooking(b));
      if (method === 'cash' && !document.getElementById('s38RefundSlip')?.files?.length) throw Error('กรุณาแนบสลิปคืนเงิน');
      state.bookings = (state.bookings || []).map(x => x.id === id ? { ...b, id } : x);
      if (method === 'coin') await s38RefundCoin(id); else await refundCash(id);
      const saved = (await db.ref('bookings/' + id).once('value')).val();
      if (C.terminal(saved)) closeSheet();
    } catch (failure) { error(errorText(failure)); }
    finally { pending.delete('cash:' + id); button.disabled = false; }
  }
  const removeRejected = c58DeleteRejected;
  c58DeleteRejected = function(id, button) {
    const b = c43books().find(x => x.id === id);
    if (b && (C.paymentEvidence(b) || b.refundRequestedAt || b.refundReviewRequired)) return alert('รายการนี้เกี่ยวข้องกับการชำระหรือคืนเงิน ต้องเก็บไว้ตรวจสอบ');
    return removeRejected(id, button);
  };
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-cdr]'); if (!button) return;
    event.preventDefault(); const id = button.dataset.booking;
    switch (button.dataset.cdr) {
      case 'close': view++; closeSheet(); break;
      case 'register': void register(button); break;
      case 'edit-account': void editAccount(); break;
      case 'save-account': void saveAccount(button); break;
      case 'recover': void openRecovery(id); break;
      case 'cancel': void openRecovery(id, true); break;
      case 'submit-refund': void submitRefund(id, button.dataset.cancel === 'true', button); break;
      case 'select-coach': void selectCoach(id, button.dataset.coach, button); break;
      case 'coach-refund': s38RefundDecision(id); break;
      case 'refund-cash': void completeCash(id, button); break;
      case 'refund-coin': void completeCash(id, button, 'coin'); break;
      case 'coach-cancel': s42DeclineModal(id); break;
    }
  });
  auth.onAuthStateChanged(() => { view++; if (sheetContent.querySelector('[data-refund-view]')) { closeSheet(); sheetContent.replaceChildren(); } });
  root.CoachDiRefunds = { openRecovery, recommendations, editAccount };
})(window);
