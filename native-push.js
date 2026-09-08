(() => {
  'use strict';
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform()) return;
  const plugin = name => cap.Plugins?.[name] || cap.registerPlugin?.(name);
  const push = plugin('PushNotifications'), session = plugin('CoachDiNotifications');
  if (!push || !session) return;
  let owner = '', deviceId = '', pending = null, opening = false;
  let generation = 0, attempt = null, bindingVersion = 0, authWork = Promise.resolve();
  let resetNeeded = false, resetting = null, retryTimer, registrationTimer, retryCount = 0;
  let viewStatus = 'off';
  const preferences = new Map();
  const bell = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 2V1"/></svg>';
  function wantsPush(uid) {
    if (preferences.has(uid)) return preferences.get(uid);
    try { return localStorage.getItem('coachdi-push-preference:v1:'+uid) !== 'off'; } catch (_) { return true; }
  }
  function savePreference(uid, enabled) {
    preferences.set(uid,enabled);
    try { localStorage.setItem('coachdi-push-preference:v1:'+uid,enabled?'on':'off'); } catch (_) { /* Session choice remains effective if storage is unavailable. */ }
  }
  const buttonId = 'cdNativePushButton';
  function button() {
    let element = document.getElementById(buttonId);
    if (!element) {
      element = document.createElement('button'); element.id = buttonId; element.type = 'button'; element.className = 'pill';
      element.innerHTML = bell+'<span>ปิด</span>'; element.onclick = toggle;
      element.setAttribute('role','switch'); element.setAttribute('aria-label','การแจ้งเตือนแอป'); element.setAttribute('aria-checked','false');
      document.getElementById('logoutBtn')?.insertAdjacentElement('beforebegin', element);
    }
    element.hidden = !auth.currentUser;
    return element;
  }
  function paint(status, detail = '') {
    viewStatus=status;
    const control=button();
    control.innerHTML=bell+'<span>'+(status==='on'?'เปิด':status==='busy'?'กำลังเปิด…':'ปิด')+'</span>';
    control.setAttribute('aria-checked',String(status==='on')); control.setAttribute('aria-busy',String(status==='busy'));
    control.title=detail||(status==='on'?'แตะเพื่อปิดการแจ้งเตือน':'แตะเพื่อเปิดการแจ้งเตือน');
    control.disabled=status==='busy';
  }
  async function toggle() {
    const uid=auth.currentUser?.uid;if(!uid)return;
    if(viewStatus==='on'||viewStatus==='busy') {
      savePreference(uid,false);
      try { await stop(); paint('off'); }
      catch (_) { savePreference(uid,true); paint('on','ปิดแจ้งเตือนไม่สำเร็จ กรุณาลองอีกครั้ง'); }
    } else { savePreference(uid,true); await enable(true); }
  }
  function current(context) { return attempt === context && context.generation === generation && auth.currentUser?.uid === context.uid; }
  function cancelAttempt() {
    generation++; bindingVersion++; attempt = null;
    clearTimeout(retryTimer); clearTimeout(registrationTimer);
    button().disabled = false;
  }
  function bounded(promise, ms = 8000) {
    let timer;
    return Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('notification-timeout')), ms); })])
      .finally(() => clearTimeout(timer));
  }
  async function hash(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].slice(0,16).map(byte => byte.toString(16).padStart(2,'0')).join('');
  }
  function disableRecord(uid, id) {
    if (!uid || !id || auth.currentUser?.uid !== uid) return Promise.resolve();
    return db.ref(`fcmTokens/${uid}/${id}`).update({enabled:false,signedOutAt:firebase.database.ServerValue.TIMESTAMP});
  }
  function resetToken() {
    if (!resetNeeded) return Promise.resolve();
    if (!resetting) {
      resetting = session.unregister().then(() => { resetNeeded = false; }).finally(() => { resetting = null; });
    }
    return resetting;
  }
  async function stop() {
    cancelAttempt();
    const oldOwner = owner, oldId = deviceId;
    owner = ''; deviceId = '';
    // An offline database transaction must not keep the user signed in or
    // re-enable this native session when it eventually ends.
    await session.configureSession({uid:'',enabled:false});
    resetNeeded = true;
    resetToken().catch(() => {});
    await bounded(disableRecord(oldOwner, oldId), 750).catch(() => {});
    paint('off');
  }
  function failed(context) {
    if (!current(context)) return;
    clearTimeout(registrationTimer); bindingVersion++;
    context.busy = false;
    paint('off','เชื่อมต่อไม่สำเร็จ แตะเพื่อลองอีกครั้ง');
    clearTimeout(retryTimer);
    if (retryCount < 3) retryTimer = setTimeout(() => enable(false), [2000,5000,15000][retryCount++]);
  }
  async function bindToken(value, context) {
    const version = ++bindingVersion;
    const valid = () => current(context) && version === bindingVersion;
    if (!valid() || typeof value !== 'string' || !value) return;
    clearTimeout(registrationTimer);
    try {
      const uid = context.uid, id = await hash(value);
      if (!valid()) return;
      const result = await bounded(db.ref(`fcmTokens/${uid}/${id}`).transaction(existing => {
        if (!valid()) return;
        return {...(existing || {}),token:value,deviceId:id,
          role:state.role || state.userProfile?.role || 'user',platform:'android',enabled:true,
          createdAt:existing?.createdAt || firebase.database.ServerValue.TIMESTAMP,lastSeenAt:firebase.database.ServerValue.TIMESTAMP};
      }, undefined, false));
      if (!valid()) return;
      if (!result.committed) throw new Error('notification-registration-not-saved');
      const oldOwner = owner, oldId = deviceId;
      owner = uid; deviceId = id;
      await session.configureSession({uid,deviceId:id,enabled:true});
      if (!valid()) return;
      if (oldId && oldId !== id) disableRecord(oldOwner,oldId).catch(() => {});
      retryCount = 0; context.busy = false;
      paint('on');
    } catch (_) { if (valid()) failed(context); }
  }
  async function enable(interactive = false) {
    const user = auth.currentUser;
    if (!user || (attempt?.busy && current(attempt))) return;
    if (!wantsPush(user.uid)) { paint('off'); return; }
    clearTimeout(retryTimer); clearTimeout(registrationTimer);
    if (interactive) retryCount = 0;
    const context = {uid:user.uid,generation,busy:true}; attempt = context;
    const control = button(); paint('busy');
    try {
      let permission = await push.checkPermissions();
      if (!current(context)) return;
      if (interactive && ['prompt','prompt-with-rationale'].includes(permission.receive)) permission = await push.requestPermissions();
      if (!current(context)) return;
      if (permission.receive !== 'granted') {
        await stop(); paint('off',permission.receive === 'denied' ? 'เปิดสิทธิ์แจ้งเตือนในตั้งค่า' : 'แตะเพื่อเปิดการแจ้งเตือน');
        if (interactive && permission.receive === 'denied') await session.openSettings({channel:false});
        return;
      }
      await session.prepareChannel();
      const status = await session.getStatus();
      if (!current(context)) return;
      if (!status.appEnabled || !status.channelEnabled) {
        await stop(); paint('off','เปิดสิทธิ์แจ้งเตือนในตั้งค่า');
        if (interactive) await session.openSettings({channel:status.appEnabled && !status.channelEnabled});
        return;
      }
      await bounded(resetToken());
      if (!current(context)) return;
      paint('busy');
      registrationTimer = setTimeout(() => failed(context), 12000);
      await push.register();
    } catch (_) { failed(context); }
    finally { if (current(context) && !context.busy) control.disabled = false; }
  }
  async function openPending() {
    if (opening || !pending || !auth.currentUser || !state.role || document.getElementById('portal')?.classList.contains('hidden')) return;
    const data = pending, uid = auth.currentUser.uid, epoch = generation;
    const id = String(data.notificationId || '');
    if (!id || /[.#$\[\]/]/.test(id) || (data.userId && data.userId !== uid)) {
      pending = null; await session.clearPending(); return;
    }
    opening = true;
    try {
      const notice = (await db.ref(`notifications/${uid}/${id}`).once('value')).val();
      if (auth.currentUser?.uid !== uid || epoch !== generation) return;
      if (notice) {
        const verification = notice.type?.startsWith('payout_verification_');
        if (state.role === 'coach') showCoach(verification ? 'settings' : notice.type === 'chat_message' ? 'messages' : 'bookings');
        else if (state.role === 'admin') s41ShowAdmin(verification ? 'verify' : notice.type?.includes('support') ? 'support' : 'overview');
        else showAthleteMenu(notice.type === 'chat_message' ? 'chat' : 'notifications');
      }
      if (pending === data) { pending = null; await session.clearPending(); }
    } catch (_) { /* Retry after returning online or reopening the app. */ }
    finally { opening = false; }
  }
  function refresh() {
    if (!auth.currentUser || document.hidden) return;
    enable(false); openPending();
  }
  async function initialize() {
    await push.addListener('registration', event => { if (attempt && current(attempt)) bindToken(event.value,attempt); });
    await push.addListener('registrationError', () => { if (attempt) failed(attempt); });
    await push.addListener('pushNotificationActionPerformed', event => { pending = event.notification?.data || {}; openPending(); });
    const launch = await session.getPending();
    if (launch.notificationId) pending = launch;
    const originalEnter = enterPortal;
    enterPortal = function () { const result = originalEnter.apply(this,arguments); button(); setTimeout(openPending,250); return result; };
    const originalLogout = logout;
    logout = async function () {
      pending = null; await session.clearPending(); await stop();
      return originalLogout.apply(this,arguments);
    };
    auth.onAuthStateChanged(user => {
      cancelAttempt();
      if (!user) session.configureSession({uid:'',enabled:false}).catch(() => {});
      const epoch = generation;
      authWork = authWork.catch(() => {}).then(async () => {
        if (epoch !== generation) return;
        const nativeSession = await session.getSession();
        if (epoch !== generation) return;
        owner = nativeSession.uid || ''; deviceId = nativeSession.deviceId || '';
        if (!user) {
          pending = null; await session.clearPending();
          if (epoch === generation) await stop();
          return;
        }
        if (owner && owner !== user.uid) await stop();
        if (auth.currentUser?.uid !== user.uid) return;
        if (!wantsPush(user.uid)) await stop();
        else { retryCount = 0; await enable(false); }
        openPending();
      }).catch(() => paint('off','เชื่อมต่อไม่สำเร็จ แตะเพื่อลองอีกครั้ง'));
      return authWork;
    });
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    button();
  }
  initialize().catch(() => paint('off','เปิดแจ้งเตือนไม่สำเร็จ กรุณาเปิดแอปใหม่'));
})();
