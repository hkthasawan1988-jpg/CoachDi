Coach Di UAT Sprint 3.9 — Marketplace Booking Flow

เพิ่ม:
1. Athlete: Category > Coach Card > Coach Profile > ตารางว่าง > สนาม > QR > แนบสลิป > ส่งคำขอ
2. Payment ก่อนสร้าง Booking Request และแจ้งว่าราคาเป็นต่อ 1 คน / ค่าเพิ่มเก็บที่สนาม
3. Coach Personal Link เดิมใช้งานต่อ athlete.html?coach=<UID>
4. Coach ได้ notification เมื่อมี Booking พร้อมสลิป และตรวจสลิปเพื่อ Confirm
5. Booking Chat ระหว่าง Coach/Athlete ตาม Booking ID
6. coachPaymentPublic สำหรับเปิดเฉพาะ QR/ชื่อบัญชีที่ผ่าน Admin Verify ให้นักกีฬาอ่านได้
7. Subscription: Admin ตั้ง QR รับเงิน Coach Di, Coach แนบสลิป ฿199, Admin ตรวจและ Active 1 เดือน

สำคัญ:
- Publish database.rules.json เวอร์ชันนี้ใน Firebase Realtime Database Rules ก่อนทดสอบ feature ใหม่
- Coach Payment Account เดิมที่เคย Approve ก่อน Sprint นี้: ให้ Admin กด Reject/Approve ใหม่ 1 ครั้ง หรือ Verify ใหม่ เพื่อ sync ไป coachPaymentPublic
- Subscription UAT ใช้ Manual QR + Slip ไม่ใช่ Auto Debit
