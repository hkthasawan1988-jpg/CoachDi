Coach Di UAT Sprint 3.9.4

อัปเดต:
1) Athlete sidebar เหลือ หน้าหลัก / การจองของฉัน / ประวัติการจอง / โปรไฟล์
2) จองโค้ชและจองสนามอยู่ในหน้าหลักเท่านั้น
3) การจองของฉัน: ตั๋ว Booking แบบ expandable อยู่ด้านบน + ตารางเวลา/วันที่ด้านล่าง
4) ประวัติการจอง: แยกตามเดือนแบบ dropdown, รายการเก่าเป็นสีเทา, แจ้ง retention 30 วัน
5) Booking ใหม่มี historyDeleteAfter และ Athlete สามารถลบประวัติตัวเองอัตโนมัติได้หลังครบกำหนดเท่านั้น
6) Coach profile save: บันทึก coachProfiles เป็นธุรกรรมหลัก; user mirror/audit ถ้าถูก Rules ปฏิเสธจะไม่ทำให้การบันทึกโปรไฟล์ล้มเหลว
7) Modern wellness UI / Oura-inspired hierarchy + Inter/Noto Sans Thai

IMPORTANT: ต้อง Publish database.rules.json ของ Sprint 3.9.4 ใน Firebase Realtime Database Rules
