(() => {
  'use strict';
  const core = window.CoachDiSchedule;
  const drafts = new Map();
  let coachThread = '', coachEpoch = 0, selection = null, raf = 0, saving = false;
  let publicRef = null, publicCallback = null, publicCoach = '';
  const byId = id => document.getElementById(id);
  const time = value => value === 24 ? '00:00' : c71Time(value);
  const occupied = () => [...c43books().filter(core.active), ...c71AppointmentRows(), ...(state.c76GroupClasses || []).filter(core.active)];
  const observedChrome = new WeakSet();
  const chromeObserver = new ResizeObserver(resize);
  const setMetric = (name, value) => {
    const style = document.documentElement.style;
    if (style.getPropertyValue(name) !== value) style.setProperty(name, value);
  };

  function size() {
    raf = 0;
    const viewport = window.visualViewport;
    const height = viewport?.height || window.innerHeight, top = viewport?.offsetTop || 0;
    const root = document.documentElement;
    setMetric('--cd-app-height', `${height}px`);
    setMetric('--cd-app-top', `${top}px`);
    const nav = byId('mobileNav');
    const navHeight = nav?.getClientRects().length ? nav.getBoundingClientRect().height : 0;
    // Observe only app chrome, not the scrolling content whose height we adjust.
    document.querySelectorAll('.topbar,#mobileNav,.cdSupportFloat,.c79MobileOpenPlay').forEach(el => {
      if (!observedChrome.has(el)) { observedChrome.add(el); chromeObserver.observe(el); }
    });
    const header = document.querySelector('.topbar');
    setMetric('--cd-header-height', `${header?.getBoundingClientRect().height || 0}px`);
    setMetric('--cd-bottom-clearance', navHeight ? `${navHeight}px` : 'var(--cd-safe-bottom)');
    const floatSpace = selector => [...document.querySelectorAll(selector)].reduce((total, el) =>
      total + (el.getClientRects().length ? el.getBoundingClientRect().height + 12 : 0), 0);
    const supportSpace = floatSpace('.cdSupportFloat');
    setMetric('--cd-support-clearance', `${supportSpace}px`);
    setMetric('--cd-float-clearance', `${supportSpace + floatSpace('.c79MobileOpenPlay')}px`);
    const safeBottom = parseFloat(getComputedStyle(root).getPropertyValue('--safe-area-inset-bottom')) || 0;
    const contentBottom = navHeight ? Math.min(height + top, nav.getBoundingClientRect().top) : height + top - safeBottom;
    document.querySelectorAll('.c43chat,.s41LineShell,.c70ChatLayout').forEach(shell => {
      if (!shell.getClientRects().length) return;
      const available = Math.max(120, contentBottom - shell.getBoundingClientRect().top - 16);
      const next = `${Math.floor(available)}px`;
      if (shell.style.getPropertyValue('--cd-chat-height') !== next) shell.style.setProperty('--cd-chat-height', next);
    });
    document.querySelectorAll('.cdTimeGridScroll').forEach(grid => {
      if (!grid.getClientRects().length) return;
      const available = Math.max(120, contentBottom - grid.getBoundingClientRect().top - 20);
      grid.style.setProperty('--cd-grid-height', `${Math.floor(available)}px`);
    });
  }
  function resize() { if (!raf) raf = requestAnimationFrame(size); }
  window.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('resize', resize);
  window.visualViewport?.addEventListener('scroll', resize);
  new MutationObserver(resize).observe(document.body, { childList: true, subtree: true });
  // Capacitor updates these CSS variables when the Fold taskbar, cutout or IME changes.
  let previousInsets = '';
  new MutationObserver(() => {
    const next = ['top','right','bottom','left'].map(side => document.documentElement.style.getPropertyValue(`--safe-area-inset-${side}`)).join('|');
    if (next !== previousInsets) { previousInsets = next; resize(); }
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });

  function coachList() {
    const list = byId('c43list');
    if (!list) return;
    const query = (byId('c45ChatSearch')?.value || '').toLocaleLowerCase();
    list.innerHTML = c45Conversations().filter(row => `${row.name} ${row.phone} ${row.email}`.toLocaleLowerCase().includes(query))
      .map(row => `<button type="button" class="c43conv ${row.uid === state.c44chatUser ? 'active' : ''}" data-chat-user="${esc(row.uid)}" aria-pressed="${row.uid === state.c44chatUser}"><b>${esc(row.name)}</b><small>${row.bookings.length} การจอง</small></button>`).join('') || '<div class="c43empty">ไม่พบบทสนทนา</div>';
  }
  c43messages = function () {
    const rows = c45Conversations();
    if (!rows.some(row => row.uid === state.c44chatUser)) state.c44chatUser = rows[0]?.uid || '';
    return `${c43head('แชท', 'เลือกลูกค้าด้านซ้ายเพื่อเปิดข้อความด้านขวา')}<div class="c43chat"><aside class="c43inbox"><div class="cdChatSearchHead"><h3>ลูกค้า</h3><input id="c45ChatSearch" class="field" placeholder="ค้นหาชื่อ" aria-label="ค้นหาลูกค้า"></div><div id="c43list"></div></aside><section id="c43thread" class="c43thread"></section></div>`;
  };
  c43openchat = function () {
    const pane = byId('c43thread');
    if (!pane) return;
    if (coachThread && byId('c43input')) drafts.set(coachThread, byId('c43input').value);
    if (c43ref && c43cb) c43ref.off('value', c43cb);
    const epoch = ++coachEpoch, row = c45Conversations().find(row => row.uid === state.c44chatUser);
    coachList();
    coachThread = row ? `${state.user.uid}/${row.uid}` : '';
    if (!row) { pane.innerHTML = '<div class="c43empty">เลือกชื่อลูกค้าเพื่อเริ่มสนทนา</div>'; return; }
    state.c43chat = row.latest.id;
    pane.innerHTML = `<header class="c43chathead"><div><b>${esc(row.name)}</b><div class="small">รวมทุกการจอง</div></div></header><div id="c43msgs" class="c43msgs" role="log" aria-live="polite"></div><div class="c43composer"><input id="c43input" aria-label="ข้อความ" placeholder="พิมพ์ข้อความ..."><button class="send" type="button" aria-label="ส่งข้อความ">➤</button></div>`;
    const input = byId('c43input'); input.value = drafts.get(coachThread) || '';
    input.onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); c50CoachSend(); } };
    pane.querySelector('.send').onclick = () => c50CoachSend();
    c43ref = db.ref(`userChats/${state.user.uid}/${row.uid}/messages`).limitToLast(100);
    c43cb = snapshot => {
      const box = byId('c43msgs');
      if (!box || epoch !== coachEpoch) return;
      const nearEnd = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
      box.innerHTML = Object.entries(snapshot.val() || {}).sort((a,b) => (a[1].createdAt || 0) - (b[1].createdAt || 0))
        .map(([id, message]) => `<div class="c43row ${message.senderId === state.user.uid ? 'me' : ''}"><div class="c43bubble">${esc(message.text || '')}${message.senderId === state.user.uid ? `<button class="c50Delete" data-delete-message="${esc(id)}" data-chat-user="${esc(row.uid)}">ลบ</button>` : ''}</div></div>`).join('') || '<div class="c43empty">ยังไม่มีข้อความ</div>';
      if (nearEnd) box.scrollTop = box.scrollHeight;
    };
    c43ref.on('value', c43cb);
    resize();
  };
  document.addEventListener('input', event => { if (event.target.id === 'c45ChatSearch') coachList(); });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-chat-user]');
    if (!button) return;
    if (button.dataset.deleteMessage) c50DeleteMessage(state.user.uid, button.dataset.chatUser, button.dataset.deleteMessage);
    else c45OpenUserChat(button.dataset.chatUser);
  });
  for (const [name, inputId] of [['c50CoachSend','c43input'], ['s41SendLineMessage','s41LineInput']]) {
    const original = window[name]; let pending = false;
    window[name] = async function () {
      if (pending) return;
      const input = byId(inputId), button = input?.parentElement?.querySelector('button:last-child');
      if (!input?.value.trim()) return;
      pending = true; if (button) button.disabled = true;
      try { await original(); if (inputId === 'c43input') drafts.set(coachThread, input.value); }
      finally { pending = false; if (button?.isConnected) button.disabled = false; }
    };
  }

  function eventCard(row, isAppointment, isGroup) {
    const label = isAppointment ? 'นัดที่มีอยู่' : isGroup ? 'Open Play / คลาสกลุ่ม' : (row.athlete || row.athleteName || 'มีผู้จองแล้ว');
    return `<button type="button" class="cdGridEvent" ${isAppointment ? 'data-appointment' : isGroup ? 'data-group-class' : 'data-booking'}="${esc(row.id)}"><b>📍 ${esc(row.venueName || row.venue || 'สนามรอยืนยัน')}</b><small>${time(Number(row.start))}–${time(Number(row.end))} · ${esc(label)}</small></button>`;
  }
  function grid(days) {
    const bookings = c43books().filter(core.active), appointments = c71AppointmentRows();
    const blocks = [...bookings, ...appointments, ...(state.c76GroupClasses || []).filter(core.active)];
    return `<p class="cdScheduleHint">แตะช่องว่างเพื่อเพิ่มนัด หรือลากลงเพื่อเลือกหลายช่วงเวลา แล้วกดบันทึก • เลื่อนตารางด้วยแถบเวลา</p><div class="cdTimeGridScroll"><div class="cdTimeGrid" data-days="${days.length}" style="--cd-days:${days.length}"><div class="cdGridHead">เวลา</div>${days.map(date => `<div class="cdGridHead">${esc(shortThaiDate(date))}</div>`).join('')}${Array.from({length:36},(_,i) => i / 2 + 6).map(start => `<div class="cdGridTime">${time(start)}</div>${days.map(date => {
      const cell = { date, start, end: start + .5 };
      const present = blocks.filter(row => core.overlaps(row, cell));
      const free = !present.length && date >= TODAY;
      return `<div class="cdGridCell" data-date="${date}" data-start="${start}" data-free="${free}" ${free ? `tabindex="0" role="button" aria-label="เพิ่มนัด ${date} ${time(start)}"` : ''}>${present.map(row => eventCard(row, appointments.includes(row), (state.c76GroupClasses || []).includes(row))).join('')}</div>`;
    }).join('')}`).join('')}</div></div>`;
  }
  c58DayCalendar = date => grid([date || TODAY]);
  c71WeekCalendar = function () {
    const date = state.s42Date || TODAY, offset = (new Date(date + 'T12:00:00').getDay() + 6) % 7;
    return grid(Array.from({length:7},(_,i) => isoAdd(date, i - offset)));
  };
  const originalMonth = c71MonthCalendar;
  c71MonthCalendar = function () {
    const template = document.createElement('template'); template.innerHTML = originalMonth();
    const date = state.s42Date || TODAY;
    template.content.querySelectorAll('.c71MonthDay:not(.empty)').forEach(cell => {
      const day = Number(cell.querySelector('b')?.textContent);
      const fullDate = `${date.slice(0,7)}-${String(day).padStart(2,'0')}`;
      cell.dataset.addDate = fullDate;
      for (const button of cell.querySelectorAll('.c71MonthTag:not(.external)')) {
        const match = (button.getAttribute('onclick') || '').match(/state\.s42ChatId='([^']+)'/);
        const booking = c43books().find(row => row.id === match?.[1]);
        if (booking) { button.textContent += ` · ${booking.venue || 'สนามรอยืนยัน'}`; button.removeAttribute('onclick'); button.dataset.booking = booking.id; }
      }
      if (fullDate >= TODAY) {
        const add = document.createElement('button'); add.type = 'button'; add.className = 'c71MonthTag';
        add.dataset.addDate = fullDate; add.textContent = '＋ เพิ่มนัด'; cell.append(add);
      }
    });
    return template.innerHTML;
  };
  function openRange(range) {
    if (!range || state.role !== 'coach') return;
    c71OpenAppointment();
    byId('c71Date').value = range.date; byId('c71Start').value = time(range.start); byId('c71End').value = time(range.end);
    resize();
  }
  function clearSelection() { document.querySelectorAll('.cdSelected').forEach(el => el.classList.remove('cdSelected')); selection = null; }
  function paintSelection(last) {
    if (!selection) return;
    const range = core.range(selection.date, selection.anchor, last, occupied());
    if (!range) return;
    selection.range = range;
    selection.grid.querySelectorAll('.cdGridCell').forEach(el => el.classList.toggle('cdSelected', el.dataset.date === range.date && Number(el.dataset.start) >= range.start && Number(el.dataset.start) < range.end));
  }
  document.addEventListener('pointerdown', event => {
    const cell = event.target.closest('.cdGridCell[data-free="true"]');
    if (!cell || state.role !== 'coach' || event.button !== 0 || event.target.closest('button')) return;
    clearSelection();
    selection = { pointer: event.pointerId, date: cell.dataset.date, anchor: Number(cell.dataset.start), grid: cell.closest('.cdTimeGrid'), element: cell };
    cell.setPointerCapture(event.pointerId); paintSelection(selection.anchor);
  });
  document.addEventListener('pointermove', event => {
    if (!selection || selection.pointer !== event.pointerId) return;
    const scroll = selection.grid.parentElement, rect = scroll.getBoundingClientRect();
    if (event.clientY > rect.bottom - 32) scroll.scrollTop += 14;
    if (event.clientY < rect.top + 40) scroll.scrollTop -= 14;
    const cell = document.elementFromPoint(event.clientX, Math.max(rect.top + 42, Math.min(rect.bottom - 4, event.clientY)))?.closest('.cdGridCell');
    if (cell?.dataset.date === selection.date) paintSelection(Number(cell.dataset.start));
  });
  document.addEventListener('pointerup', event => {
    if (!selection || event.pointerId !== selection.pointer) return;
    const chosen = selection.range;
    clearSelection(); openRange(chosen);
  });
  document.addEventListener('pointercancel', clearSelection);
  window.addEventListener('blur', clearSelection);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') clearSelection();
    const cell = event.target.closest('.cdGridCell[data-free="true"]');
    if (cell && ['Enter',' '].includes(event.key)) { event.preventDefault(); openRange(core.range(cell.dataset.date, Number(cell.dataset.start), Number(cell.dataset.start), occupied())); }
  });
  document.addEventListener('click', event => {
    const appointment = event.target.closest('[data-appointment]'), booking = event.target.closest('[data-booking]'), day = event.target.closest('button[data-add-date]');
    if (appointment) c71OpenAppointment(appointment.dataset.appointment);
    else if (booking) s42Detail(booking.dataset.booking);
    else if (event.target.closest('[data-group-class]')) showCoach('groupclasses');
    else if (day) openRange({date:day.dataset.addDate,start:9,end:10});
  });
  c71SaveAppointment = async function (id = '', button) {
    if (saving || state.role !== 'coach' || !state.user?.uid) return;
    saving = true; const label = button?.textContent;
    if (button) { button.disabled = true; button.textContent = 'กำลังบันทึก...'; }
    try {
      const uid = state.user.uid, date = byId('c71Date').value, start = timeToHour(byId('c71Start').value);
      const endValue = byId('c71End').value, end = endValue === '00:00' && start > 0 ? 24 : timeToHour(endValue);
      const venueName = byId('c71Venue').value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < TODAY) throw Error('กรุณาเลือกวันที่ตั้งแต่วันนี้เป็นต้นไป');
      if (venueName.length < 2 || venueName.length > 120) throw Error('กรุณาระบุชื่อสนาม 2–120 ตัวอักษร');
      if (!core.range(date, start, end - .5, []) || end <= start) throw Error('กรุณาตรวจเวลาเริ่มและสิ้นสุด (ไม่เกิน 12 ชั่วโมง)');
      const dates = [date], recurring = byId('c71Recurring')?.checked, until = byId('c71Until')?.value;
      if (recurring) {
        if (!until || until < date) throw Error('กรุณาระบุวันสิ้นสุดตารางประจำ');
        for (let day = isoAdd(date,7); day <= until; day = isoAdd(day,7)) { if (dates.length >= 52) throw Error('ตารางประจำสร้างได้ไม่เกิน 52 สัปดาห์'); dates.push(day); }
      }
      const [liveBookings, liveAppointments, liveGroups] = await Promise.all([
        db.ref('bookings').orderByChild('coachId').equalTo(uid).once('value'),
        db.ref(`coachPublicSchedule/${uid}`).once('value'), db.ref(`coachGroupClasses/${uid}`).once('value')]);
      if (state.user?.uid !== uid || state.role !== 'coach') throw Error('บัญชีเปลี่ยนแล้ว กรุณาเปิดตารางใหม่');
      const appointments = Object.entries(liveAppointments.val() || {}).map(([key,row]) => ({...row,id:key}));
      if (id && !appointments.some(row => row.id === id)) throw Error('นัดนี้ถูกลบหรือเปลี่ยนแล้ว กรุณาโหลดตารางใหม่');
      const conflicts = [...Object.values(liveBookings.val() || {}), ...appointments.filter(row => row.id !== id), ...Object.values(liveGroups.val() || {})].filter(core.active);
      for (const day of dates) if (conflicts.some(row => core.overlaps(row,{date:day,start,end}))) throw Error(`เวลาชนกับตารางเดิม: ${day}`);
      const updates = {}, original = appointments.find(row => row.id === id);
      for (const day of dates) {
        const key = id && day === date ? id : db.ref(`coachPublicSchedule/${uid}`).push().key;
        updates[`coachPublicSchedule/${uid}/${key}`] = c71PublicRecord(uid, day, start, end, venueName, c71VenueId(venueName), original?.createdAt || firebase.database.ServerValue.TIMESTAMP, recurring ? date : '');
      }
      await db.ref().update(updates);
      csCloseModal(); showCoach('schedule');
      try { await audit(id ? 'coach_existing_appointment_updated' : 'coach_existing_appointment_created',id || 'selection',{date,start,end,count:dates.length}); } catch (_) {}
    } catch (error) { alert('บันทึกนัดไม่ได้: ' + error.message); }
    finally { saving = false; if (button?.isConnected) { button.disabled = false; button.textContent = label; } }
  };

  function unbindPublicBookings() {
    if (publicRef && publicCallback) publicRef.off('value', publicCallback);
    publicRef = null; publicCallback = null; publicCoach = ''; state.cdPublicBookings = [];
  }
  function bindPublicBookings(coachId) {
    if (state.role !== 'athlete' || !coachId || coachId === publicCoach) return;
    unbindPublicBookings(); publicCoach = coachId;
    publicRef = db.ref(`coachBookingSchedule/${coachId}`);
    publicCallback = snapshot => {
      if (state.role !== 'athlete' || state.coachId !== coachId) return;
      state.cdPublicBookings = Object.values(snapshot.val() || {}).filter(row => row.active !== false); renderSchedule();
    };
    publicRef.on('value', publicCallback, () => { state.cdPublicBookings = []; });
  }
  const originalScoped = loadCoachScopedData;
  loadCoachScopedData = function (coachId) { bindPublicBookings(coachId); return originalScoped.apply(this, arguments); };
  const originalLoad = loadFirebaseData;
  loadFirebaseData = async function () { const result = await originalLoad.apply(this, arguments); bindPublicBookings(state.coachId); return result; };
  const originalStatus = dayCellStatus;
  dayCellStatus = function (date, hour) {
    const booked = (state.cdPublicBookings || []).find(row => core.overlaps(row,{date,start:hour,end:hour+1}));
    if (booked) return {type:'booked',label:booked.venueName || 'สนามรอยืนยัน',meta:'มีผู้จองแล้ว',venueId:booked.venueId};
    const result = originalStatus(date, hour);
    if (result.type === 'booked') { const booking = getBooking(date,hour); return {...result,label:booking?.venue || result.meta || 'สนามรอยืนยัน',meta:'มีผู้จองแล้ว'}; }
    return result;
  };
  auth.onAuthStateChanged(user => { if (!user) { unbindPublicBookings(); drafts.clear(); coachThread = ''; ++coachEpoch; if (c43ref && c43cb) c43ref.off('value',c43cb); } });
  window.CoachDiExperience = Object.freeze({ bindPublicBookings, resize });
  resize();
})();
