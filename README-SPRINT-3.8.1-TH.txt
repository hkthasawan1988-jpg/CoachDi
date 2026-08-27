Coach Di UAT Sprint 3.8.1

สิ่งที่แก้
1) Coach Revenue อ่าน paymentTransactions ด้วย query coachId แทนการอ่านทั้ง collection
2) Firebase Rules รองรับ query paymentTransactions/refunds และ Admin อ่าน coachPaymentAccounts เพื่อ Verify
3) เพิ่ม Coach Subscription หลังบ้าน Admin
   - Trial 30 วัน
   - ราคา 199 บาท/เดือน
   - ปุ่ม Start Trial
   - ปุ่ม Active Subscription 1 เดือน
   - ต่ออายุ 3 เดือน
   - บันทึก subscriptionTransactions และ Audit Log
4) Coach Dashboard แสดงสถานะ Subscription

การสร้าง Admin
- Firebase Authentication > Add user > สร้าง Email/Password
- Copy UID
- Realtime Database > users > UID
  role = admin
  status = active
- จากนั้น Login ที่ admin.html

สำคัญ
- Publish database.rules.json ที่ Firebase Realtime Database > Rules
- จากนั้น Replace ไฟล์เว็บใน GitHub เดิม แล้ว Commit ให้ Netlify Auto Deploy
- Firebase Configuration เดิมไม่ได้ถูกเปลี่ยน
