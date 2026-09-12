(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoachDiBookingServerCore = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
  const ERROR_MESSAGES = Object.freeze({
    unauthenticated: 'กรุณาเข้าสู่ระบบอีกครั้ง',
    'permission-denied': 'บัญชีนี้ไม่มีสิทธิ์ดำเนินการรายการนี้',
    'not-found': 'ไม่พบรายการจอง กรุณารีเฟรชแล้วลองใหม่',
    INVALID_REQUEST_ID: 'ข้อมูลคำสั่งไม่ถูกต้อง กรุณาลองใหม่',
    INVALID_STATE: 'สถานะรายการเปลี่ยนแล้ว กรุณารีเฟรช',
    PAYMENT_EVIDENCE_REQUIRED: 'กรุณาแนบหลักฐานการชำระเงิน',
    REFUND_EVIDENCE_REQUIRED: 'กรุณาแนบหลักฐานการโอนคืน',
    REFUND_ACCOUNT_REQUIRED: 'กรุณาบันทึกและยืนยันบัญชีรับเงินคืนก่อน',
    BOOKING_IN_PAST: 'วันหรือเวลานี้ผ่านไปแล้ว กรุณาเลือกเวลาใหม่',
    COACH_TIME_OFF: 'โค้ชกำหนดวันหยุดในช่วงเวลานี้ กรุณาเลือกเวลาใหม่',
    TIME_CONFLICT: 'ช่วงเวลานี้ไม่ว่างแล้ว กรุณาเลือกเวลาใหม่',
    SLOT_ALREADY_LOCKED: 'ช่วงเวลานี้มีผู้จองแล้ว กรุณาเลือกเวลาใหม่',
    TRAVEL_BUFFER_INSUFFICIENT: 'เวลาเดินทางระหว่างสนามไม่เพียงพอ กรุณาเลือกเวลาใหม่',
    DAILY_LIMIT_REACHED: 'โค้ชมีคิวเต็มสำหรับวันนี้แล้ว',
    REQUEST_CONFLICT: 'คำขอนี้ถูกเปลี่ยนแปลง กรุณาปิดหน้าต่างแล้วเริ่มใหม่',
    PRICE_UNAVAILABLE: 'ยังไม่พบราคาของช่วงเวลานี้ กรุณาติดต่อโค้ช',
    PAYMENT_ACCOUNT_UNAVAILABLE: 'บัญชีรับเงินของโค้ชยังไม่ผ่านการอนุมัติ',
    INVALID_GROUP_COMMAND: 'ข้อมูลคำสั่ง Group Class ไม่ถูกต้อง กรุณาลองใหม่',
    INVALID_GROUP_CLASS: 'กรุณาตรวจสอบชื่อ ราคา จำนวนคน วัน เวลา และสนามของ Group Class',
    INVALID_GROUP_SCHEDULE: 'กรุณาตรวจสอบวัน เวลา และสนามใหม่',
    INVALID_GROUP_STATE: 'สถานะ Group Class เปลี่ยนแล้ว กรุณารีเฟรช',
    GROUP_CLASS_UNAVAILABLE: 'Group Class นี้เต็ม ปิดรับ หรือเลยเวลาแล้ว',
    GROUP_REQUEST_EXISTS: 'คุณส่งคำขอ Group Class นี้แล้ว',
    GROUP_CLASS_ID_CONFLICT: 'ไม่สามารถสร้าง Group Class ซ้ำได้ กรุณาปิดหน้าต่างแล้วเริ่มใหม่',
  });

  function requestId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
    return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`.slice(0, 80);
  }

  function intentKey(uid, scope) {
    const safeUid = String(uid || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
    const safeScope = String(scope || '').replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 180);
    return `coachdi.command.${safeUid}.${safeScope}`;
  }

  function tracker(storage) {
    const memory = new Map();
    const read = key => {
      try { return storage && storage.getItem(key); } catch (_) { return memory.get(key) || null; }
    };
    const write = (key, value) => {
      try { if (storage) storage.setItem(key, value); else memory.set(key, value); }
      catch (_) { memory.set(key, value); }
    };
    const remove = key => {
      try { if (storage) storage.removeItem(key); } catch (_) {}
      memory.delete(key);
    };
    return {
      get(uid, scope) {
        const key = intentKey(uid, scope), existing = read(key);
        if (existing) return existing;
        const next = requestId(); write(key, next); return next;
      },
      complete(uid, scope) { remove(intentKey(uid, scope)); },
    };
  }

  function proof(file, maxBytes) {
    if (!file) throw new Error('กรุณาเลือกไฟล์รูปภาพ');
    if (!IMAGE_TYPES.has(String(file.type || ''))) throw new Error('รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
    if (!Number.isSafeInteger(file.size) || file.size <= 0 || file.size > maxBytes) throw new Error(`ไฟล์ต้องมีขนาดไม่เกิน ${Math.floor(maxBytes / 1048576)} MB`);
    return { name: String(file.name || 'proof').replace(/[^A-Za-z0-9._-]/g, '_').slice(-100), size: file.size, contentType: file.type };
  }

  function errorCode(error) {
    return String(error?.details?.code || error?.code || '').replace(/^functions\//, '');
  }

  function errorText(error) {
    const code = errorCode(error);
    return ERROR_MESSAGES[code] || String(error?.message || 'ไม่สามารถดำเนินการได้ กรุณาลองใหม่');
  }

  return Object.freeze({ IMAGE_TYPES, ERROR_MESSAGES, errorCode, errorText, intentKey, proof, requestId, tracker });
});

