(() => {
  'use strict';
  const cap = window.Capacitor;
  if (!cap?.isNativePlatform()) return;
  const plugin = name => cap.Plugins?.[name] || cap.registerPlugin?.(name);
  const push = plugin('PushNotifications'), session = plugin('CoachDiNotifications');
  if (!push || !session) return;
  let token = '', owner = '', deviceId = '', busy = false, pending = null, binding = Promise.resolve();
  const buttonId = 'cdNativePushButton';
  function button() {
    let element = document.getElementById(buttonId);
    if (!element) {
      element = document.createElement('button'); element.id = buttonId; element.type = 'button'; element.className = 'pill';
      element.textContent = '🔔 เปิดแจ้งเตือนแอป'; element.onclick = enable;
      document.getElementById('logoutBtn')?.insertAdjacentElement('beforebegin', element);
    }
    element.hidden = !auth.currentUser;
    return element;
  }
  async function hash(value) {
    const digest = await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].slice(0,16).map(byte => byte.toString(16).padStart(2,'0')).join('');
  }
  async function bindToken(value) {
    const user = auth.currentUser;
    if (!user) return;
    const uid = user.uid, id = await hash(value);
    await db.ref(`fcmTokens/${uid}/${id}`).transaction(current => ({...(current || {}),token:value,deviceId:id,
      role:state.role || state.userProfile?.role || 'user',platform:'android',enabled:true,
      createdAt:current?.createdAt || firebase.database.ServerValue.TIMESTAMP,lastSeenAt:firebase.database.ServerValue.TIMESTAMP}));
    if (auth.currentUser?.uid !== uid) return;
    token = value; owner = uid; deviceId = id;
    await session.configureSession({uid,enabled:true});
    button().textContent = '🔔 แจ้งเตือนแอปเปิดอยู่';
  }
  async function stop() {
    // Disable native delivery first, including when a network failure prevents token cleanup.
    await session.configureSession({uid:'',enabled:false});
    await binding.catch(() => {});
    await session.configureSession({uid:'',enabled:false});
    if (owner && deviceId && auth.currentUser?.uid === owner) {
      await db.ref(`fcmTokens/${owner}/${deviceId}`).update({enabled:false,signedOutAt:firebase.database.ServerValue.TIMESTAMP}).catch(() => {});
    }
    await push.unregister().catch(() => {});
    token = ''; owner = ''; deviceId = '';
  }
  async function enable() {
    if (busy || !auth.currentUser) return;
    busy = true; const control = button(); control.disabled = true;
    try {
      let permission = await push.checkPermissions();
      if (permission.receive === 'prompt' || permission.receive === 'prompt-with-rationale') permission = await push.requestPermissions();
      if (permission.receive !== 'granted') { await stop(); alert('กรุณาเปิดสิทธิ์แจ้งเตือนของ Coach Di ในการตั้งค่าแอป'); return; }
      await push.createChannel({id:'coach_di_updates',name:'การจองและข้อความ Coach Di',description:'สถานะการจอง การชำระเงิน และข้อความ',importance:4,visibility:0,sound:'default'});
      await push.register();
    } catch (_) { control.textContent = '🔔 ลองเปิดแจ้งเตือนอีกครั้ง'; alert('เปิดแจ้งเตือนไม่สำเร็จ กรุณาตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง'); }
    finally { busy = false; control.disabled = false; }
  }
  async function openPending() {
    if (!pending || !auth.currentUser || !state.role || document.getElementById('portal')?.classList.contains('hidden')) return;
    const data = pending, uid = auth.currentUser.uid; pending = null;
    const id = String(data.notificationId || '');
    if (!id || /[.#$\[\]/]/.test(id)) return;
    try {
      // Do not navigate to a supplied URL or trust data from a different signed-in account.
      const notice = (await db.ref(`notifications/${uid}/${id}`).once('value')).val();
      if (!notice || auth.currentUser?.uid !== uid) return;
      if (state.role === 'coach') showCoach(notice.type === 'chat_message' ? 'messages' : 'bookings');
      else if (state.role === 'admin') s41ShowAdmin(notice.type?.includes('support') ? 'support' : 'overview');
      else showAthleteMenu(notice.type === 'chat_message' ? 'chat' : notice.type?.includes('support') ? 'notifications' : 'notifications');
      await session.clearPending();
    } catch (_) { pending = data; }
  }
  async function initialize() {
    await push.addListener('registration', event => {
      binding = binding.catch(() => {}).then(() => bindToken(event.value)).catch(() => { button().textContent = '🔔 ลองเปิดแจ้งเตือนอีกครั้ง'; });
    });
    await push.addListener('registrationError', () => { button().textContent = '🔔 ลองเปิดแจ้งเตือนอีกครั้ง'; });
    await push.addListener('pushNotificationActionPerformed', event => { pending = event.notification?.data || {}; openPending(); });
    const launch = await session.getPending();
    if (launch.notificationId) pending = launch;
    const originalEnter = enterPortal;
    enterPortal = function () { const result = originalEnter.apply(this,arguments); button(); setTimeout(openPending,250); return result; };
    const originalLogout = logout;
    logout = async function () { pending = null; await stop(); return originalLogout.apply(this,arguments); };
    auth.onAuthStateChanged(async user => {
      button();
      if (!user) { await stop(); return; }
      const nativeSession = await session.getSession();
      if (nativeSession.uid && nativeSession.uid !== user.uid) await stop();
      const permission = await push.checkPermissions();
      if (permission.receive === 'granted') await enable();
      else { await session.configureSession({uid:'',enabled:false}); button().textContent = '🔔 เปิดแจ้งเตือนแอป'; }
      openPending();
    });
    button();
  }
  initialize().catch(() => {});
})();
