Coach Di UAT Sprint 4.1

ฐาน: Sprint 4.0 Full QA + UI Hardening

เพิ่ม/ปรับ:
1) Coach Dashboard: New Booking เป็น Ticket สไตล์ VISDA Admin UI
   - Booking ID / NEW badge / ชื่อนักกีฬา / วันเวลา / สนาม / ยอดชำระ
   - แสดงสถานะสลิป
   - ปุ่ม ดูสลิป / ยืนยันรับเงิน / ปฏิเสธ / รายละเอียด / แชท
2) Admin: เพิ่มเมนู Manage Customer
   - แยก Athlete / Coach
   - ค้นหา / กรอง status / Export CSV
   - ดูจำนวน booking, ยอดใช้จ่ายหรือรายได้, booking ล่าสุด
   - คลิกผู้ใช้เพื่อดู customer profile + booking history
3) Athlete Chat: redesign เป็น LINE-inspired realtime chat
   - Inbox conversation list + search
   - Header coach/booking
   - bubble ฝั่งเรา/Coach คนละด้าน
   - เวลา / อ่านแล้ว / realtime update / Enter to send
4) ใช้ Firebase nodes เดิม ไม่เพิ่ม node ใหม่

Firebase Rules:
- ใช้ database.rules.json ของ Sprint 4.0 ได้ เพราะฟีเจอร์นี้อ่าน/เขียนเฉพาะ users, bookings, coachProfiles, bookingChats, notifications ที่มี rules อยู่แล้ว

UAT แนะนำ:
- Coach: รับ booking ใหม่ > ดูสลิป > confirm > ตรวจว่าสลิปหายและ Athlete notification เข้า
- Admin: Manage Customer > Athlete/Coach > click detail > Export CSV
- Athlete: Chat > ส่งข้อความ > login Coach อีก browser > ตอบกลับ > ตรวจ realtime
