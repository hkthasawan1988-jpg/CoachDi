Coach Di — UAT Sprint 2.2 Firebase Core

พัฒนาต่อจาก Sprint 2.1 เดิม ไม่ได้สร้าง Mockup ใหม่

เชื่อมจริงแล้ว:
- Firebase Authentication: Email/Password, session persistence, logout, reset password
- Realtime Database: bookings, coach availability, time off, pricing, payment-account display, audit logs
- Role document: athlete / coach / admin
- Athlete self-register ได้เฉพาะ role athlete
- Coach account ต้อง provision โดย Admin/Firebase Console เพื่อป้องกัน self-escalation
- Booking ใช้ Firebase UID จริง และเขียนข้อมูลลง Realtime Database
- Coach ยืนยัน payment แล้ว update booking จริง
- Pricing / Availability / Time Off บันทึกลง Firebase จริง
- Audit Log append-only ตาม Rules baseline

ยังไม่เปิด:
- Firebase Storage / Slip upload จริง เพราะ Spark plan ขอ Upgrade
- Custom Claims / trusted server backend สำหรับ privileged financial/admin mutations
- LINE / Push / Email integration

สำคัญ: ต้อง Publish database.rules.json และทำ FIREBASE-SETUP-TH.txt ก่อนทดสอบ Coach Login
