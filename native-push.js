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
  const buttonId = 'cdNativePushButton';
  function button() {
    let element = document.getElementById(buttonId);
    if (!element) {
      element = document.createElement('button'); element.id = buttonId; element.type = 'button'; element.className = 'pill';
      element.textContent = '🔔 เปิดแจ้งเตือนแอป'; element.onclick = () => enable(true);
      document.getElementById('logoutBtn')?.insertAdjacentElement('beforebegin', element);
    }
    element.hidden = !auth.currentUser;
    return element;
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
  }
  function failed(context) {
    if (!current(context)) return;
    clearTimeout(registrationTimer); bindingVersion++;
    context.busy = false;
    const control = button(); control.disabled = false; control.textContent = '🔔 เชื่อมต่อแจ้งเตือนอีกครั้ง';
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
      const control = button(); control.disabled = false; control.textContent = '🔔 แจ้งเตือนแอปเปิดอยู่';
    } catch (_) { if (valid()) failed(context); }
  }
  async function enable(interactive = false) {
    const user = auth.currentUser;
    if (!user || (attempt?.busy && current(attempt))) return;
    clearTimeout(retryTimer); clearTimeout(registrationTimer);
    if (interactive) retryCount = 0;
    const context = {uid:user.uid,generation,busy:true}; attempt = context;
    const control = button(); control.disabled = true;
    try {
      let permission = await push.checkPermissions();
      if (!current(context)) return;
      if (interactive && ['prompt','prompt-with-rationale'].includes(permission.receive)) permission = await push.requestPermissions();
      if (!current(context)) return;
      if (permission.receive !== 'granted') {
        await stop(); control.textContent = permission.receive === 'denied' ? '🔔 เปิดสิทธิ์แจ้งเตือนในตั้งค่า' : '🔔 เปิดแจ้งเตือนแอป';
        if (interactive && permission.receive === 'denied') await session.openSettings({channel:false});
        return;
      }
      await session.prepareChannel();
      const status = await session.getStatus();
      if (!current(context)) return;
      if (!status.appEnabled || !status.channelEnabled) {
        await stop(); control.textContent = '🔔 เปิดสิทธิ์แจ้งเตือนในตั้งค่า';
        if (interactive) await session.openSettings({channel:status.appEnabled && !status.channelEnabled});
        return;
      }
      await bounded(resetToken());
      if (!current(context)) return;
      control.textContent = '🔔 กำลังเชื่อมต่อแจ้งเตือน';
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
        if (state.role === 'coach') showCoach(verification ? 'payments' : notice.type === 'chat_message' ? 'messages' : 'bookings');
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
        retryCount = 0; await enable(false); openPending();
      }).catch(() => { button().textContent = '🔔 เชื่อมต่อแจ้งเตือนอีกครั้ง'; button().disabled = false; });
      return authWork;
    });
    window.addEventListener('online', refresh);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    button();
  }
  initialize().catch(() => { button().textContent = '🔔 เปิดแจ้งเตือนไม่สำเร็จ กรุณาเปิดแอปใหม่'; });
})();
