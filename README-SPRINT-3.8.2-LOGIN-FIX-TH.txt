Coach Di UAT Sprint 3.8.2 — Portal Login Fix

สิ่งที่แก้
- หน้า Login มีตัวเลือก นักกีฬา / Coach / Admin ชัดเจน
- athlete.html เปิด Athlete Portal โดยตรง
- coach.html เปิด Coach Portal โดยตรง
- admin.html เปิด Admin Portal โดยตรง
- ตรวจ role ให้ตรงกับ Portal ก่อนเข้าระบบ
- บัญชี Athlete ที่ Authentication มีอยู่แล้วแต่ยังไม่มี users/{uid} จะสร้าง role=athlete ให้ตัวเองได้เมื่อเข้า Athlete Portal
- Coach/Admin จะไม่ถูก assign role อัตโนมัติเพื่อความปลอดภัย ต้องกำหนด role ใน Realtime Database โดย Admin
- ปุ่ม “สร้างบัญชีนักกีฬา” แสดงเฉพาะ Athlete Portal

โครงสร้างที่ต้องมีใน Realtime Database
users/{UID นักกีฬา}/role = athlete
users/{UID นักกีฬา}/status = active
users/{UID Coach}/role = coach
users/{UID Coach}/status = active
users/{UID Admin}/role = admin
users/{UID Admin}/status = active

UID ต้องตรงกับ Firebase Authentication > Users > User UID ของ email นั้น 100%

ไฟล์หลักที่แก้: index.html
Rules: ใช้ database.rules.json ที่รวมอยู่ใน ZIP
