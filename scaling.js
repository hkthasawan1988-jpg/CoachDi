(function coachDiScalingLayer(){
  "use strict";

  const publicConfig = window.COACH_DI_PUBLIC_CONFIG || {};
  const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
  const baseSaveCoachProfile = saveCoachProfile;
  const baseSaveAthleteProfile = saveAthleteProfile;
  const baseSubmitSlip = s38SubmitSlip;
  const baseRefundCash = s38RefundCash;
  const baseSubmitSubscriptionSlip = cdSubmitSubscriptionSlip;
  const baseCreatePaidBooking = cdCreatePaidBooking;
  const baseSubmitGroupBooking = c90SubmitGroupBooking;
  const baseSafeSlip = c90SafeSlip;
  const baseLogout = logout;
  let runtimeConfigPromise;
  let foregroundListenerInstalled = false;
  let activeToken = "";
  let activeTokenUid = "";

  function runtimeConfig(){
    if (!runtimeConfigPromise) {
      runtimeConfigPromise = db.ref("appConfig/platform").once("value").then(snapshot => ({
        ...publicConfig,
        ...(snapshot.val() || {})
      })).catch(() => ({...publicConfig}));
    }
    return runtimeConfigPromise;
  }

  function toast(title, body){
    let host = document.getElementById("c105ToastHost");
    if (!host) {
      host = document.createElement("div");
      host.id = "c105ToastHost";
      host.className = "c105ToastHost";
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    const item = document.createElement("div");
    item.className = "c105Toast";
    const heading = document.createElement("b");
    const detail = document.createElement("p");
    heading.textContent = title || "Coach Di";
    detail.textContent = body || "คุณมีการแจ้งเตือนใหม่";
    item.append(heading, detail);
    host.prepend(item);
    setTimeout(() => item.remove(), 7000);
  }

  function isIos(){
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isStandalone(){
    return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  }

  function showIosInstallGuide(){
    document.getElementById("c105PushGuide")?.remove();
    const guide = document.createElement("div");
    guide.id = "c105PushGuide";
    guide.className = "c105PushGuide";
    guide.innerHTML = '<section class="c105PushGuideCard"><h2>เพิ่ม Coach Di ไปที่หน้าจอโฮมก่อน</h2><p>บน iPhone/iPad ให้กดปุ่ม Share ใน Safari → “เพิ่มไปยังหน้าจอโฮม” → เปิด Coach Di จากไอคอนใหม่ แล้วกด “เปิดการแจ้งเตือน” อีกครั้ง</p><button class="pill primary" type="button">เข้าใจแล้ว</button></section>';
    guide.querySelector("button").onclick = () => guide.remove();
    guide.addEventListener("click", event => { if (event.target === guide) guide.remove(); });
    document.body.appendChild(guide);
  }

  async function registerServiceWorker(){
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return null;
    return navigator.serviceWorker.register("/firebase-messaging-sw.js", {scope:"/"});
  }

  function pushButton(){
    let button = document.getElementById("c105PushButton");
    if (button) return button;
    button = document.createElement("button");
    button.id = "c105PushButton";
    button.type = "button";
    button.className = "pill hidden";
    button.textContent = "🔔 เปิดการแจ้งเตือน";
    button.onclick = () => enablePush(button);
    const logoutButton = document.getElementById("logoutBtn");
    logoutButton?.parentElement?.insertBefore(button, logoutButton);
    return button;
  }

  async function paintPushButton(){
    const button = pushButton();
    if (!auth.currentUser) {
      button.classList.add("hidden");
      return;
    }
    button.classList.remove("hidden");
    const config = await runtimeConfig();
    if (!String(config.vapidPublicKey || "").trim()) {
      button.dataset.state = "ready";
      button.textContent = "🔔 Push กำลังตั้งค่า";
      button.disabled = true;
    } else if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      button.dataset.state = "blocked";
      button.textContent = "แจ้งเตือนไม่รองรับ";
      button.disabled = true;
    } else if (Notification.permission === "granted") {
      button.dataset.state = "enabled";
      button.textContent = "🔔 แจ้งเตือนเปิดอยู่";
      button.disabled = false;
    } else if (Notification.permission === "denied") {
      button.dataset.state = "blocked";
      button.textContent = "🔕 การแจ้งเตือนถูกปิด";
      button.disabled = false;
    } else {
      button.dataset.state = "ready";
      button.textContent = "🔔 เปิดการแจ้งเตือน";
      button.disabled = false;
    }
  }

  async function tokenDeviceId(token){
    const bytes = new TextEncoder().encode(token);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).slice(0, 16).map(value => value.toString(16).padStart(2, "0")).join("");
  }

  async function saveToken(token){
    const user = auth.currentUser;
    if (!user) throw new Error("กรุณาเข้าสู่ระบบก่อนเปิดการแจ้งเตือน");
    const deviceId = await tokenDeviceId(token);
    const ref = db.ref(`fcmTokens/${user.uid}/${deviceId}`);
    await ref.transaction(current => ({
      ...(current || {}),
      token,
      deviceId,
      role: state.role || state.userProfile?.role || "user",
      platform: isIos() ? "ios-web" : "web",
      userAgent: navigator.userAgent.slice(0, 240),
      enabled: true,
      createdAt: current?.createdAt || firebase.database.ServerValue.TIMESTAMP,
      lastSeenAt: firebase.database.ServerValue.TIMESTAMP
    }));
    activeToken = token;
    activeTokenUid = user.uid;
  }

  function installForegroundListener(messaging){
    if (foregroundListenerInstalled) return;
    foregroundListenerInstalled = true;
    messaging.onMessage(payload => {
      const data = payload.data || {};
      toast(data.title || payload.notification?.title || "Coach Di", data.body || payload.notification?.body || "คุณมีการแจ้งเตือนใหม่");
    });
  }

  async function syncPushToken(silent){
    const config = await runtimeConfig();
    const vapidKey = String(config.vapidPublicKey || "").trim();
    if (!vapidKey) {
      if (!silent) throw new Error("Web Push ยังรอ Admin ใส่ VAPID Public Key ใน Firebase");
      return false;
    }
    const registration = await registerServiceWorker();
    if (!registration) throw new Error("อุปกรณ์นี้ไม่รองรับ Service Worker");
    const messaging = coachDiFirebaseApp.messaging();
    installForegroundListener(messaging);
    const token = await messaging.getToken({vapidKey, serviceWorkerRegistration:registration});
    if (!token) throw new Error("ยังไม่สามารถสร้างรหัสอุปกรณ์สำหรับการแจ้งเตือนได้");
    await saveToken(token);
    return true;
  }

  async function enablePush(button){
    if (isIos() && !isStandalone()) {
      showIosInstallGuide();
      return;
    }
    if (Notification.permission === "denied") {
      alert("การแจ้งเตือนถูกปิดใน Browser กรุณาเปิดสิทธิ์ Notifications ของ coach-di.netlify.app ในการตั้งค่า แล้วลองอีกครั้ง");
      return;
    }
    const oldText = button.textContent;
    try {
      button.disabled = true;
      button.textContent = "กำลังเปิดการแจ้งเตือน...";
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("ยังไม่ได้อนุญาตให้ Coach Di ส่งการแจ้งเตือน");
      await syncPushToken(false);
      toast("เปิดการแจ้งเตือนแล้ว", "Coach Di จะแจ้งสถานะการจอง ข้อความ และคลาสสำคัญบนอุปกรณ์นี้");
    } catch (error) {
      alert(error.message || "เปิดการแจ้งเตือนไม่สำเร็จ");
      button.textContent = oldText;
    } finally {
      button.disabled = false;
      paintPushButton();
    }
  }

  async function disableCurrentToken(){
    if (!activeToken || !activeTokenUid) return;
    try {
      const deviceId = await tokenDeviceId(activeToken);
      await db.ref(`fcmTokens/${activeTokenUid}/${deviceId}`).update({enabled:false, signedOutAt:firebase.database.ServerValue.TIMESTAMP});
    } catch (_) {}
    activeToken = "";
    activeTokenUid = "";
  }

  logout = async function(){
    await disableCurrentToken();
    return baseLogout();
  };

  async function validateImage(input){
    const file = input?.files?.[0];
    if (!file) throw new Error("กรุณาแนบรูป");
    const config = await runtimeConfig();
    const maxBytes = Math.min(10 * 1024 * 1024, Math.max(300 * 1024, Number(config.maxUploadBytes || publicConfig.maxUploadBytes || 5 * 1024 * 1024)));
    if (!allowedImageTypes.has(String(file.type || "").toLowerCase())) throw new Error("รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP");
    if (file.size > maxBytes) throw new Error(`ไฟล์ต้องไม่เกิน ${Math.round(maxBytes / 1024 / 1024)} MB`);
    return file;
  }

  function safeSegment(value){
    return String(value || "item").replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80) || "item";
  }

  async function storageReady(){
    const config = await runtimeConfig();
    return config.storageUploadsEnabled === true;
  }

  async function uploadImage(input, purpose, recordId, recipientUid, isPublic, expectedUid){
    const file = await validateImage(input);
    const ownerUid = auth.currentUser?.uid;
    if (!ownerUid) throw new Error("กรุณาเข้าสู่ระบบก่อนอัปโหลดไฟล์");
    if (expectedUid && ownerUid !== expectedUid) throw new Error("บัญชีเปลี่ยนแล้ว กรุณาเข้าสู่ระบบนักกีฬาอีกครั้ง");
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const unique = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const root = isPublic ? "public/profiles" : `private/${safeSegment(purpose)}`;
    const path = `${root}/${safeSegment(ownerUid)}/${safeSegment(recordId)}/${safeSegment(unique)}.${ext}`;
    const ref = coachDiFirebaseApp.storage().ref(path);
    const metadata = {
      contentType: file.type,
      cacheControl: isPublic ? "public,max-age=86400" : "private,max-age=3600",
      customMetadata: {
        ownerUid,
        recipientUid: String(recipientUid || ownerUid),
        purpose: safeSegment(purpose),
        originalName: file.name.slice(0, 120)
      }
    };
    const snapshot = await ref.put(file, metadata);
    const url = await snapshot.ref.getDownloadURL();
    return {
      url,
      meta: {
        path,
        name: file.name.slice(0, 120),
        size: file.size,
        contentType: file.type,
        ownerUid,
        recipientUid: String(recipientUid || ownerUid),
        uploadedAt: firebase.database.ServerValue.TIMESTAMP
      }
    };
  }

  function storageUrl(value){
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" && (url.hostname === "firebasestorage.googleapis.com" || url.hostname.endsWith(".firebasestorage.app")) ? url.href : "";
    } catch (_) { return ""; }
  }

  c90SafeSlip = function(value){
    return storageUrl(value) || baseSafeSlip(value);
  };

  saveCoachProfile = async function(){
    if (!(await storageReady())) return baseSaveCoachProfile();
    try {
      const name = document.getElementById("coachDisplayName")?.value.trim() || "";
      if (!name) throw new Error("กรุณาตั้งชื่อที่แสดงในแอป");
      const uid = state.user.uid;
      const coachDiId = await ensureCoachDiId(uid);
      const fileInput = document.getElementById("coachPhotoFile");
      const file = fileInput?.files?.[0];
      let photoURL = state.coachProfile?.photoURL || "";
      let photoStorage = state.coachProfile?.photoStorage || null;
      if (file) {
        const uploaded = await uploadImage(fileInput, "profile", "coach", uid, true);
        photoURL = uploaded.url;
        photoStorage = uploaded.meta;
      }
      const next = cleanFirebaseObject({
        coachDiId,
        canonicalCoachId: uid,
        displayName: name,
        nameTh: document.getElementById("coachNameTh")?.value.trim() || "",
        nameEn: document.getElementById("coachNameEn")?.value.trim() || "",
        bio: document.getElementById("coachBio")?.value.trim() || "",
        photoURL,
        photoStorage,
        status: state.coachProfile?.status || "active",
        updatedAt: firebase.database.ServerValue.TIMESTAMP
      });
      await db.ref(`coachProfiles/${uid}`).update(next);
      await db.ref(`users/${uid}`).update(cleanFirebaseObject({displayName:name, photoURL, photoStorage}));
      state.coachProfile = {...state.coachProfile, ...next, updatedAt:Date.now()};
      try { await audit("profile_changed", uid, {displayName:name, photoChanged:!!file, storage:true}); } catch (_) {}
      alert("บันทึกโปรไฟล์ Coach แล้ว");
      showCoach("profile");
    } catch (error) { alert(error.message || "บันทึกโปรไฟล์ไม่สำเร็จ"); }
  };

  saveAthleteProfile = async function(){
    try {
      const history = window.CoachDiProfileHistory;
      if (!history) throw new Error("โหลดระบบโปรไฟล์ไม่สำเร็จ กรุณารีเฟรชหน้า");
      const input = history.capture(), uid = input.uid, next = {...input.next};
      const useStorage = await storageReady();
      history.assertOwner(uid);
      if (!useStorage) return baseSaveAthleteProfile(input);
      if (input.file) {
        const uploaded = await uploadImage({files:[input.file]}, "profile", "athlete", uid, true, uid);
        next.photoURL = uploaded.url;
        next.photoStorage = uploaded.meta;
      }
      history.assertOwner(uid);
      const saved = await history.save(db, uid, next);
      history.assertOwner(uid);
      state.userProfile = saved;
      state.userDisplayName = saved.displayName || "";
      alert("บันทึกโปรไฟล์นักกีฬาแล้ว");
      showAthleteMenu("profile");
      return saved;
    } catch (error) { alert(error.message || "บันทึกโปรไฟล์ไม่สำเร็จ"); return null; }
  };

  s38SubmitSlip = async function(id, button){
    if (!(await storageReady())) return baseSubmitSlip(id, button);
    if (button) button.disabled = true;
    let booking;
    try {
      booking = state.bookings.find(item => item.id === id);
      if (!booking || booking.athleteId !== state.user.uid) throw new Error("ไม่พบ Booking");
      const uploaded = await uploadImage(document.getElementById(`s38Slip_${id}`), "booking-slip", id, booking.coachId, false);
      const select = document.getElementById(`s38Venue_${id}`);
      const venue = state.venues.find(item => item.id === select?.value);
      const notificationId = db.ref(`notifications/${booking.coachId}`).push().key;
      const now = firebase.database.ServerValue.TIMESTAMP;
      const updates = {};
      updates[`bookings/${id}/venueId`] = select?.value || booking.venueId;
      updates[`bookings/${id}/venue`] = venue?.name || booking.venue;
      updates[`bookings/${id}/paymentStatus`] = "payment_submitted";
      updates[`bookings/${id}/status`] = "payment_submitted";
      updates[`bookings/${id}/paymentProofDataUrl`] = uploaded.url;
      updates[`bookings/${id}/paymentProofStorage`] = uploaded.meta;
      updates[`bookings/${id}/paymentSubmittedAt`] = now;
      updates[`notifications/${booking.coachId}/${notificationId}`] = {type:"payment_submitted", bookingId:id, senderId:state.user.uid, recipientId:booking.coachId, coachId:booking.coachId, athleteId:state.user.uid, message:`นักกีฬาส่งสลิป Booking ${id} แล้ว กรุณาตรวจสอบ`, createdAt:now, read:false};
      await db.ref().update(updates);
      alert("ส่งสลิปแล้ว รอ Coach ตรวจสอบและยืนยันการจอง");
      renderAthleteBookings();
    } catch (error) {
      console.error("Storage payment slip submission failed", {bookingId:id}, error);
      alert(error.message || "ส่งสลิปไม่สำเร็จ");
      if (button) button.disabled = false;
    }
  };

  s38RefundCash = async function(id){
    if (!(await storageReady())) return baseRefundCash(id);
    try {
      const booking = state.bookings.find(item => item.id === id);
      if (!booking) throw new Error("ไม่พบ Booking");
      const uploaded = await uploadImage(document.getElementById("s38RefundSlip"), "refund-slip", id, booking.athleteId, false);
      const amountSatang = Number(booking.priceSatang || 0) + Number(booking.travelFeeSatang || 0);
      const refundId = `RF-${id}`;
      const now = firebase.database.ServerValue.TIMESTAMP;
      await db.ref(`refunds/${refundId}`).set({bookingId:id, coachId:booking.coachId, athleteId:booking.athleteId, amountSatang, method:"cash_transfer", status:"refunded", refundProofDataUrl:uploaded.url, refundProofStorage:uploaded.meta, createdAt:now, createdBy:state.user.uid});
      await db.ref(`bookings/${id}`).update({status:"refunded", refundMethod:"cash_transfer", refundStatus:"refunded", refundProofDataUrl:uploaded.url, refundProofStorage:uploaded.meta, refundedAt:now});
      await db.ref(`notifications/${booking.athleteId}`).push().set({type:"refund_completed", bookingId:id, senderId:state.user.uid, recipientId:booking.athleteId, message:`Coach โอนเงินคืน Booking ${id} แล้ว`, createdAt:now, read:false});
      try { await audit("refund_cash_completed", id, {amountSatang, storage:true}); } catch (_) {}
      csCloseModal();
      alert("บันทึกสลิปคืนเงินแล้ว");
    } catch (error) { alert(error.message || "บันทึกคืนเงินไม่สำเร็จ"); }
  };

  cdSubmitSubscriptionSlip = async function(button){
    if (!(await storageReady())) return baseSubmitSubscriptionSlip(button);
    if (button?.disabled) return;
    try {
      if (button) button.disabled = true;
      const config = state.c70SubConfig || await c70GetSubConfig();
      const id = db.ref("subscriptionPaymentRequests").push().key;
      const uploaded = await uploadImage(document.getElementById("cdSubSlip"), "subscription-slip", id, "admin", false);
      await db.ref(`subscriptionPaymentRequests/${id}`).set({type:"subscription_payment", coachId:state.user.uid, coachEmail:state.user.email || "", amountSatang:Number(config.amountSatang || 19900), bank:config.bank, accountNumberLast4:String(config.accountNumber || "").slice(-4), accountName:config.accountName, slipDataUrl:uploaded.url, slipStorage:uploaded.meta, status:"pending", notificationTarget:config.notificationPhone || "", notificationStatus:"pending_admin_review", createdAt:firebase.database.ServerValue.TIMESTAMP});
      localStorage.setItem(`coachDiSubPending-${state.user.uid}`, "1");
      alert("ส่งสลิปแล้ว กรุณารอ Admin ตรวจสอบและ Activate Account");
      if (button) button.textContent = "ส่งแล้ว • รอ Admin อนุมัติ";
    } catch (error) {
      alert(error.message || "ส่งสลิปไม่สำเร็จ");
      if (button) button.disabled = false;
    }
  };

  cdCreatePaidBooking = async function(venueId, hour, button){
    if (!(await storageReady())) return baseCreatePaidBooking(venueId, hour, button);
    if (button) button.disabled = true;
    try {
      const coachId = String(state.coachId || "");
      const athleteId = state.user.uid;
      const date = String(state.selectedCell?.date || state.selectedDate);
      const id = `${date.slice(-2)}${String(Math.floor(Number(hour))).padStart(2,"0")}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const uploaded = await uploadImage(document.getElementById("cdPreSlip"), "booking-slip", id, coachId, false);
      const participants = Math.max(1, Number(document.getElementById("cdParticipants")?.value || 1));
      const court = venueId === "other" ? (chosenOther?.name || "สนามอื่น") : (venueName(venueId) || "สนามที่เลือก");
      const athlete = (await db.ref(`users/${athleteId}`).once("value")).val() || {};
      let phone = athlete.phone || "";
      if (!phone) {
        phone = (prompt("กรุณาระบุเบอร์โทรศัพท์") || "").trim();
        if (!phone) throw new Error("กรุณาระบุเบอร์โทรศัพท์");
        await db.ref(`users/${athleteId}`).update({phone});
      }
      const booking = cleanFirebaseObject({coachId, athleteId, athlete:athlete.displayName || state.user.email || "Athlete", athleteEmail:state.user.email || "", phone, date, start:Number(hour), end:Number(hour)+1, venueId, venue:court, status:"payment_submitted", approvalStatus:"pending", paymentStatus:"payment_submitted", courtConfirmed:true, courtConfirmedByAthleteAt:firebase.database.ServerValue.TIMESTAMP, paymentProofDataUrl:uploaded.url, paymentProofStorage:uploaded.meta, paymentSubmittedAt:firebase.database.ServerValue.TIMESTAMP, participants, pricePerPersonSatang:Number(state.pricing?.p60 || 0), priceSatang:Number(state.pricing?.p60 || 0), travelFeeSatang:0, platformFeeSatang:0, createdAt:firebase.database.ServerValue.TIMESTAMP});
      await c70WriteBooking(id, booking, "new_paid_booking", `มีคำขอจองใหม่ ${id} พร้อมสลิป กรุณาตรวจสอบ`);
      try { await audit("paid_booking_submitted", id, {coachId, date, start:hour, participants, storage:true}); } catch (_) {}
      closeSheet();
      state.selectedCell = null;
      if (typeof c98ClearDraft === "function") await c98ClearDraft();
      setTimeout(() => showAthleteMenu("mybookings"), 50);
    } catch (error) {
      alert(error.message || "ส่งคำขอไม่สำเร็จ");
      if (button) button.disabled = false;
    }
  };

  c90SubmitGroupBooking = async function(coachId, classId, button){
    if (!(await storageReady())) return baseSubmitGroupBooking(coachId, classId, button);
    if (button?.disabled) return;
    try {
      if (!document.getElementById("c90GroupConsent")?.checked) throw new Error("กรุณากดยืนยันว่าตรวจสอบรายละเอียดและโอนเงินแล้ว");
      button.disabled = true;
      button.textContent = "กำลังอัปโหลดและส่งคำขอ...";
      const classRef = db.ref(`coachGroupClasses/${coachId}/${classId}`);
      const live = (await classRef.once("value")).val();
      if (!live || live.status !== "open" || Number(live.approvedCount || 0) >= Number(live.capacity || 0)) throw new Error("Group Class นี้เต็มหรือปิดรับแล้ว");
      if (Number(live.priceSatang || 0) <= 0) throw new Error("ราคา Group Class ไม่ถูกต้อง กรุณาติดต่อ Coach");
      const requestRef = db.ref(`coachGroupClassRequests/${coachId}/${classId}/${state.user.uid}`);
      if ((await requestRef.once("value")).exists()) throw new Error("คุณส่งคำขอ Group Class นี้แล้ว");
      const uploaded = await uploadImage(document.getElementById("c90GroupSlip"), "group-class-slip", classId, coachId, false);
      const now = firebase.database.ServerValue.TIMESTAMP;
      const notificationId = db.ref(`notifications/${coachId}`).push().key;
      const athleteName = c76AthleteName();
      const updates = {};
      updates[`coachGroupClassRequests/${coachId}/${classId}/${state.user.uid}`] = {classId, coachId, athleteId:state.user.uid, athleteName, status:"pending", priceSatang:Number(live.priceSatang), paymentStatus:"payment_submitted", paymentProofDataUrl:uploaded.url, paymentProofStorage:uploaded.meta, paymentSubmittedAt:now, createdAt:now, updatedAt:now};
      updates[`notifications/${coachId}/${notificationId}`] = {type:"group_class_paid_booking", groupClassId:classId, senderId:state.user.uid, recipientId:coachId, coachId, athleteId:state.user.uid, message:`${athleteName} จอง Group Class ${live.title || ""} พร้อมส่งสลิป ${baht(Number(live.priceSatang || 0))} กรุณาตรวจสอบ`, read:false, createdAt:now};
      await db.ref().update(updates);
      try { await audit("group_class_paid_booking_submitted", classId, {coachId, priceSatang:Number(live.priceSatang), storage:true}); } catch (_) {}
      c76CloseModal();
      alert("ส่งคำขอจองและสลิปแล้ว รอ Coach ตรวจสอบและอนุมัติที่นั่ง");
      c76RenderAthletePage();
    } catch (error) {
      alert(error.message || "ส่งคำขอจองไม่สำเร็จ");
      if (button) {
        button.disabled = false;
        button.textContent = "ส่งคำขอจองพร้อมสลิป";
      }
    }
  };

  window.CoachDiScale = Object.freeze({
    runtimeConfig,
    registerServiceWorker,
    enablePush: () => enablePush(pushButton()),
    syncPushToken: () => syncPushToken(false),
    storageReady,
    uploadImage
  });

  registerServiceWorker().catch(error => console.warn("PWA service worker registration failed", error));
  document.addEventListener("DOMContentLoaded", () => paintPushButton().catch(() => undefined));
  auth.onAuthStateChanged(user => {
    paintPushButton().catch(() => undefined);
    if (user && "Notification" in window && Notification.permission === "granted") {
      setTimeout(() => syncPushToken(true).catch(error => console.warn("Push token refresh skipped", error)), 900);
    }
  });
})();
