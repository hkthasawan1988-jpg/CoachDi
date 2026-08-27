Coach Di UAT Sprint 3.9.5

แก้ต่อจาก Sprint 3.9.3 ที่ผู้ใช้อัปโหลด:
1) Coach ยืนยันรับเงินแล้ว paymentProofDataUrl ถูกลบทันที
2) Harden การบันทึก Coach Profile + ชื่อที่แสดง + กีฬา + จังหวัดที่สะดวกสอน
3) Schedule: Day ใช้ตารางแบบ Week, ตัด Month, เพิ่ม Range Date และปุ่ม 5 วันถัดไป
4) Dashboard default วันนี้ + Date Range + Revenue Trend + Teaching Hours + Venue distribution
5) Athlete กรอง Coach ตามจังหวัดที่สะดวกสอน
6) ผู้ใช้ตั้ง Display Name เพื่อใช้แทนอีเมล
7) ปุ่ม Chat กับเจ้าหน้าที่ทั้ง Athlete/Coach
8) ข้อความ Support สร้าง Admin notification และ Admin เปิดตอบแชทได้
9) database.rules.json เพิ่ม supportChats และ adminSupportNotifications

IMPORTANT: ต้อง Publish database.rules.json ชุดนี้ใน Firebase Realtime Database Rules
