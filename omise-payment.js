/* Coach Di manual monthly Subscription checkout through Omise.
   Card details are tokenized by Omise.js and never reach Coach Di servers. */
(function(){
  "use strict";

  const config = window.COACH_DI_PUBLIC_CONFIG || {};
  const PRICE_SATANG = 25900;
  const PRICE_LABEL = "฿259";
  const CREATE_URL = config.omiseCreateChargeUrl || "";
  const STATUS_URL = config.omiseStatusUrl || "";
  let omiseScriptPromise;
  let pollTimer;

  function paymentReady(){
    return /^pkey_(test|live)_/.test(String(config.omisePublicKey || "")) && /^https:\/\//.test(CREATE_URL) && /^https:\/\//.test(STATUS_URL);
  }

  function isTestMode(){
    return /^pkey_test_/.test(String(config.omisePublicKey || ""));
  }

  function htmlEscape(value){
    return String(value == null ? "" : value).replace(/[&<>'"]/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
  }

  function formatDate(value){
    const time = Number(value || 0);
    return time ? new Date(time).toLocaleDateString("th-TH", {timeZone:"Asia/Bangkok", day:"numeric", month:"short", year:"numeric"}) : "-";
  }

  function gatewayMessage(){
    if (isTestMode()) return "โหมดทดสอบ Omise — ทดลองขั้นตอนได้ แต่ไม่มีการตัดเงินจริง";
    if (paymentReady()) return "ชำระด้วย PromptPay หรือบัตร ระบบจะเปิดใช้งานอัตโนมัติเมื่อ Omise ยืนยันยอด";
    return "ระบบชำระเงิน Omise อยู่ระหว่างเชื่อมบัญชีร้านค้า กรุณาติดต่อ Admin ก่อนชำระเงิน";
  }

  function checkoutHtml(){
    const disabled = paymentReady() ? "" : " disabled";
    return `<div class="cd106Checkout">
      ${isTestMode() ? '<div class="cd106Security"><b>TEST MODE</b> • ไม่มีการตัดเงินจริง</div>' : ''}
      <div class="cd106Price"><span>Coach Di Subscription</span><strong>${PRICE_LABEL}</strong><small>ต่อ 30 วัน • กดชำระเองทุกเดือน</small></div>
      <div class="cd106Methods">
        <button class="cd106Method promptpay" onclick="cd106StartPromptPay(this)"${disabled}><span>QR</span><b>PromptPay</b><small>สแกนผ่านแอปธนาคาร</small></button>
        <button class="cd106Method card" onclick="cd106OpenCard()"${disabled}><span>▣</span><b>บัตรเครดิต/เดบิต</b><small>ข้อมูลบัตรส่งตรงไป Omise</small></button>
      </div>
      <div class="cd106Security">🔒 ${htmlEscape(gatewayMessage())}</div>
      <div id="cd106PaymentMessage" class="cd106Message" role="status" aria-live="polite"></div>
    </div>`;
  }

  function setMessage(message, kind){
    const element = document.getElementById("cd106PaymentMessage") || document.getElementById("cd106ModalMessage");
    if (!element) return;
    element.className = `cd106Message ${kind || ""}`;
    element.textContent = message || "";
  }

  function modal(content){
    closeModal();
    document.body.insertAdjacentHTML("beforeend", `<div id="cd106Modal" class="cd106Modal" role="dialog" aria-modal="true" onclick="if(event.target===this)cd106CloseModal()"><section class="cd106Dialog"><button class="cd106Close" onclick="cd106CloseModal()" aria-label="ปิด">×</button>${content}<div id="cd106ModalMessage" class="cd106Message" role="status" aria-live="polite"></div></section></div>`);
  }

  function closeModal(){
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    document.getElementById("cd106Modal")?.remove();
  }

  async function loadOmise(){
    if (!paymentReady()) throw new Error("ยังไม่ได้เชื่อม Omise API Key");
    if (window.Omise) {
      window.Omise.setPublicKey(config.omisePublicKey);
      return window.Omise;
    }
    if (!omiseScriptPromise) omiseScriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://cdn.omise.co/omise.js.gz";
      script.async = true;
      script.onload = () => resolve(window.Omise);
      script.onerror = () => reject(new Error("โหลดระบบชำระเงิน Omise ไม่สำเร็จ"));
      document.head.appendChild(script);
    });
    const omise = await omiseScriptPromise;
    if (!omise) throw new Error("Omise ไม่พร้อมใช้งาน");
    omise.setPublicKey(config.omisePublicKey);
    return omise;
  }

  function omiseCall(method, type, values){
    return new Promise((resolve, reject) => {
      method(type, values, (status, response) => {
        if (status >= 200 && status < 300 && response?.id) resolve(response);
        else reject(new Error(response?.message || "Omise ไม่สามารถสร้างช่องทางชำระเงินได้"));
      });
    });
  }

  async function api(url, body){
    if (!state?.user) throw new Error("กรุณาเข้าสู่ระบบใหม่");
    const token = await state.user.getIdToken(true);
    const response = await fetch(url, {
      method:"POST",
      headers:{"Content-Type":"application/json", Authorization:`Bearer ${token}`},
      body:JSON.stringify(body || {})
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok || value.ok === false) throw new Error(value.message || "ระบบชำระเงินไม่ตอบสนอง");
    return value;
  }

  function showPromptPay(value){
    if (!value.qrImageUrl) throw new Error("Omise ไม่ส่ง QR PromptPay กลับมา กรุณาลองใหม่");
    modal(`<div class="cd106Qr"><span class="cd106Tag">PROMPTPAY</span><h2>สแกนเพื่อชำระ ${PRICE_LABEL}</h2><img src="${htmlEscape(value.qrImageUrl)}" alt="QR PromptPay สำหรับชำระ Subscription"><p>เปิดแอปธนาคาร สแกน QR และตรวจสอบชื่อผู้รับก่อนยืนยัน</p><div class="cd106Waiting"><i></i> กำลังรอ Omise ยืนยันยอด...</div></div>`);
    poll(value.paymentId, 0);
  }

  async function startPromptPay(button){
    const original = button?.innerHTML;
    try {
      if (button) { button.disabled = true; button.textContent = "กำลังสร้าง QR..."; }
      const omise = await loadOmise();
      const source = await omiseCall(omise.createSource.bind(omise), "promptpay", {amount:PRICE_SATANG, currency:"THB"});
      const value = await api(CREATE_URL, {instrumentType:"source", instrumentId:source.id});
      if (value.paid) return paid(value);
      showPromptPay(value);
    } catch (error) {
      setMessage(error.message || "สร้าง PromptPay ไม่สำเร็จ", "error");
    } finally {
      if (button) { button.disabled = !paymentReady(); button.innerHTML = original; }
    }
  }

  function openCard(){
    if (!paymentReady()) return setMessage("ยังไม่ได้เชื่อม Omise API Key", "error");
    modal(`<div class="cd106CardForm"><span class="cd106Tag">SECURE CARD PAYMENT</span><h2>ชำระ Subscription ${PRICE_LABEL}</h2><label>ชื่อบนบัตร<input id="cd106CardName" autocomplete="cc-name" placeholder="NAME ON CARD"></label><label>หมายเลขบัตร<input id="cd106CardNumber" inputmode="numeric" autocomplete="cc-number" placeholder="0000 0000 0000 0000"></label><div class="cd106CardRow"><label>เดือนหมดอายุ<input id="cd106CardMonth" inputmode="numeric" autocomplete="cc-exp-month" placeholder="MM" maxlength="2"></label><label>ปีหมดอายุ<input id="cd106CardYear" inputmode="numeric" autocomplete="cc-exp-year" placeholder="YYYY" maxlength="4"></label><label>CVV<input id="cd106CardCvv" type="password" inputmode="numeric" autocomplete="cc-csc" placeholder="CVV" maxlength="4"></label></div><button id="cd106CardPay" class="pill primary" onclick="cd106PayCard(this)">ชำระ ${PRICE_LABEL}</button><p class="cd106FinePrint">Coach Di ไม่จัดเก็บหมายเลขบัตรหรือ CVV ข้อมูลถูกส่งตรงไป Omise</p></div>`);
  }

  async function payCard(button){
    try {
      button.disabled = true;
      button.textContent = "กำลังเชื่อมต่อ Omise...";
      const omise = await loadOmise();
      const card = {
        name:document.getElementById("cd106CardName")?.value.trim(),
        number:document.getElementById("cd106CardNumber")?.value.replace(/\D/g, ""),
        expiration_month:document.getElementById("cd106CardMonth")?.value.trim(),
        expiration_year:document.getElementById("cd106CardYear")?.value.trim(),
        security_code:document.getElementById("cd106CardCvv")?.value.trim()
      };
      if (!card.name || card.number.length < 13 || !card.expiration_month || !card.expiration_year || card.security_code.length < 3) throw new Error("กรุณากรอกข้อมูลบัตรให้ครบ");
      const token = await omiseCall(omise.createToken.bind(omise), "card", card);
      document.getElementById("cd106CardNumber").value = "";
      document.getElementById("cd106CardCvv").value = "";
      button.textContent = "กำลังสร้างรายการชำระเงิน...";
      const value = await api(CREATE_URL, {instrumentType:"token", instrumentId:token.id});
      if (value.paid) return paid(value);
      if (value.authorizeUri) {
        sessionStorage.setItem("coachDiSubscriptionPayment", value.paymentId);
        location.assign(value.authorizeUri);
        return;
      }
      poll(value.paymentId, 0);
    } catch (error) {
      setMessage(error.message || "ชำระด้วยบัตรไม่สำเร็จ", "error");
      button.disabled = false;
      button.textContent = `ชำระ ${PRICE_LABEL}`;
    }
  }

  async function poll(paymentId, attempt){
    try {
      const value = await api(STATUS_URL, {paymentId});
      if (value.paid || value.status === "successful") return paid(value);
      if (value.status === "failed") return failed(value.failureMessage || "การชำระเงินไม่สำเร็จ");
      if (attempt >= 100) return failed("ยังไม่พบยอดชำระ หากชำระแล้วกรุณาเปิดหน้านี้อีกครั้งเพื่อตรวจสอบสถานะ");
      pollTimer = setTimeout(() => poll(paymentId, attempt + 1), 3000);
    } catch (error) {
      if (attempt >= 3) return failed(error.message || "ตรวจสอบสถานะไม่สำเร็จ");
      pollTimer = setTimeout(() => poll(paymentId, attempt + 1), 4000);
    }
  }

  async function paid(value){
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    sessionStorage.removeItem("coachDiSubscriptionPayment");
    localStorage.removeItem(`coachDiSubPending-${state?.user?.uid || ""}`);
    try {
      const snapshot = await db.ref(`users/${state.user.uid}/subscription`).once("value");
      state.subscription = snapshot.val() || state.subscription;
    } catch (_) {}
    modal(`<div class="cd106Result success"><div>✓</div><h2>ชำระเงินสำเร็จ</h2><p>เปิดใช้งาน Subscription เพิ่ม 30 วันแล้ว<br>วันสิ้นสุดรอบใหม่: <b>${formatDate(value.currentPeriodEndsAt || state.subscription?.currentPeriodEndsAt)}</b></p><button class="pill primary" onclick="cd106FinishPayment()">กลับหน้าหลัก</button></div>`);
  }

  function failed(message){
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    setMessage(message || "การชำระเงินไม่สำเร็จ", "error");
  }

  function finishPayment(){
    closeModal();
    if (typeof showCoach === "function") showCoach("overview");
  }

  async function resumePayment(paymentId){
    if (!paymentId || !paymentReady()) return;
    modal(`<div class="cd106Result"><div class="cd106Spinner"></div><h2>กำลังตรวจสอบการชำระเงิน</h2><p>กรุณารอสักครู่ ระบบกำลังตรวจสอบยอดกับ Omise</p></div>`);
    await poll(paymentId, 0);
  }

  window.cd106StartPromptPay = startPromptPay;
  window.cd106OpenCard = openCard;
  window.cd106PayCard = payCard;
  window.cd106CloseModal = closeModal;
  window.cd106FinishPayment = finishPayment;

  cdLoadSubscriptionPayInfo = async function(){
    const element = document.getElementById("cdSubPayInfo");
    if (element) element.innerHTML = checkoutHtml();
  };
  cdSubmitSubscriptionSlip = async function(){ openCard(); };

  cdSubscriptionPayCard = function(){
    return `<div class="card cd106Summary"><div><h3>Coach Di Subscription</h3><p>ทดลองใช้ฟรี 60 วัน จากนั้น <b>${PRICE_LABEL} / 30 วัน</b></p></div><button class="pill primary" onclick="showCoach('settings')">ชำระผ่าน Omise</button></div>`;
  };

  cdCoachSubscriptionCard = function(){
    const subscription = state.subscription || {};
    const status = typeof cdSubStatus === "function" ? cdSubStatus(subscription) : {label:subscription.status || "Trial", cls:"pending", key:subscription.status};
    return `<div class="card"><div class="cd106Summary"><div><h3>Coach Di Subscription</h3><div class="muted">ทดลองใช้ฟรี 60 วัน จากนั้น ${PRICE_LABEL} / 30 วัน</div></div><span class="status ${htmlEscape(status.cls || "pending")}">${htmlEscape(status.label || "Trial")}</span></div><div class="grid g3" style="margin-top:14px"><div class="metric">ค่าบริการ<b>${PRICE_LABEL}</b><small>ต่อ 30 วัน</small></div><div class="metric">รอบปัจจุบันสิ้นสุด<b style="font-size:18px">${formatDate(window.CoachDiTrial ? window.CoachDiTrial.effectiveEnd(subscription) : Math.max(Number(subscription.currentPeriodEndsAt || 0), Number(subscription.trialEndsAt || 0)))}</b></div><div class="metric">การต่ออายุ<b style="font-size:18px">กดชำระเอง</b><small>PromptPay / บัตร</small></div></div></div>`;
  };

  const settingsBase = c43settings;
  c43settings = function(){
    return settingsBase().replace(/199\s*บาท/g, "259 บาท").replace(/฿199/g, PRICE_LABEL).replace(/รอ Admin อนุมัติ/g, "รอตรวจสอบการชำระ").replace(/กำลังโหลดบัญชีชำระเงิน/g, "กำลังโหลด Omise");
  };

  c62LockedPage = function(){
    const detail = typeof c62SubState === "function" ? c62SubState(state.subscription || {}) : {daysOverdue:0};
    return `<div class="c62LockPage"><section class="c62LockHero"><span class="c47Status bad">Subscription Locked</span><h1>กรุณาต่ออายุเพื่อใช้งาน Coach Portal</h1><p class="muted">Subscription เกินกำหนด ${Number(detail.daysOverdue || 0)} วัน ระบบจำกัดการเข้าถึงชั่วคราว</p><div class="c62LockNotice"><b>ต่ออายุ ${PRICE_LABEL} / 30 วัน</b><br>เลือก PromptPay หรือบัตร และระบบจะเปิดใช้งานอัตโนมัติเมื่อ Omise ยืนยันยอด</div><div id="cdSubPayInfo">กำลังโหลด Omise...</div><button class="c59Btn" onclick="logout()">ออกจากระบบ</button></section></div>`;
  };

  cdAdminSubPaymentConfig = function(){
    return `<div class="card"><h2>Omise Subscription</h2><p><b>${PRICE_LABEL} / 30 วัน</b> • Coach กดชำระเองด้วย PromptPay หรือบัตร • เปิดใช้งานอัตโนมัติหลังตรวจสอบกับ Omise</p><div id="cdSubRequests" class="muted">กำลังโหลดสถานะ Gateway...</div></div>`;
  };
  cdLoadSubRequests = async function(){
    const element = document.getElementById("cdSubRequests");
    if (!element) return;
    element.innerHTML = paymentReady() ? (isTestMode() ? "TEST MODE • พร้อมทดลองใช้งาน แต่ไม่มีการตัดเงินจริง" : "✓ Omise Checkout พร้อมใช้งาน • ไม่ต้องตรวจสลิปหรือกดอนุมัติ") : "ยังไม่ได้ใส่ Omise Public Key และ Secret ในระบบ";
  };

  c70SettingsPage = function(){
    return `<div class="c70Page">${c70AdminHeader("ตั้งค่า Subscription", "Omise PromptPay และบัตร")}
      <section class="c70Panel"><div class="c70Top"><div><h2>Omise Payment Gateway</h2><span class="muted">ระบบล็อกยอดและระยะเวลาไว้ฝั่ง Server</span></div><span class="status ${paymentReady() ? "confirmed" : "pending"}">${paymentReady() ? (isTestMode() ? "Test mode" : "พร้อมใช้งาน") : "รอ API Key"}</span></div>
      <div class="grid g3"><div class="metric">ค่าบริการ<b>${PRICE_LABEL}</b><small>30 วัน</small></div><div class="metric">ช่องทาง<b style="font-size:18px">PromptPay / บัตร</b></div><div class="metric">การเปิดใช้<b style="font-size:18px">อัตโนมัติ</b><small>หลัง Omise ยืนยันยอด</small></div></div>
      <div class="notice" style="margin-top:14px">Secret Key เก็บใน Firebase Secret Manager เท่านั้น และไม่แสดงบนหน้าเว็บ</div>
      <label class="label">Webhook URL</label><input class="field" readonly value="${htmlEscape(config.omiseWebhookUrl || "")}" onclick="this.select()">
      <div class="cd106Security">ไม่ต้องตั้งบัญชีธนาคารหรืออัปโหลด QR ใน Admin อีกต่อไป</div></section></div>`;
  };
  c70LoadSettings = async function(){};

  /* The legacy Coach screen can finish rendering while this external bundle is
     still downloading. Repaint the visible Subscription section after the
     Omise overrides are installed so old bank-transfer markup cannot remain. */
  function reconcileRenderedSubscription(){
    const paymentHost = document.getElementById("cdSubPayInfo");
    if (!paymentHost) return;
    try {
      if (typeof state !== "undefined" && state.role === "coach" && typeof showCoach === "function") {
        showCoach(state.c43p || state.s42Page || "settings");
        return;
      }
      paymentHost.innerHTML = checkoutHtml();
    } catch (error) {
      paymentHost.innerHTML = `<div class="cd106Message error">โหลด Omise ไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองอีกครั้ง</div>`;
    }
  }
  window.COACH_DI_OMISE_LOADED = true;
  setTimeout(reconcileRenderedSubscription, 0);

  const returnPayment = new URLSearchParams(location.search).get("subscriptionPayment") || sessionStorage.getItem("coachDiSubscriptionPayment");
  if (returnPayment) {
    try {
      auth.onAuthStateChanged(user => {
        if (!user) return;
        const url = new URL(location.href);
        url.searchParams.delete("subscriptionPayment");
        history.replaceState({}, "", url);
        setTimeout(() => resumePayment(returnPayment), 300);
      });
    } catch (_) {}
  }
})();
