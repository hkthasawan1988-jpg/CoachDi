Coach Di UAT Sprint 4.0 — Full QA + UI Hardening

ฐาน: Sprint 3.9.8 ที่ผู้ใช้อัปโหลด

Highlights:
- Coach New Booking Ticket บน Dashboard
- Coach confirm -> บันทึกชื่อ Coach + notification นักกีฬา + transaction + ลบสลิป
- Athlete My Bookings: dropdown Booking Ticket + calendar
- Athlete History: dropdown รายเดือน + รายละเอียด + ชื่อ Coach
- Modern realtime Chat + unread notification badge
- Coach Profile Photo ทำงานต่อ + photoDataUrl แสดงใน Coach discovery
- Admin Subscription Dashboard default MTD + Date Range + เตือน 3 วัน + lock เกิน 7 วัน
- Admin Export Coach/Athlete CSV
- แก้ payment account permission path สำหรับ Athlete
- เพิ่ม Firebase booking indexes

IMPORTANT:
1. Deploy ไฟล์ชุดนี้ขึ้น GitHub/Netlify
2. Publish database.rules.json ชุด Sprint 4.0 ใน Firebase Realtime Database
3. ทดสอบด้วยบัญชีจริง 3 Role ตาม SPRINT-4.0-QA-REPORT.md
