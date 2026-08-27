Coach Di UAT Sprint 3.9.2 — Athlete Progressive Booking Flow

Flow ใหม่:
1) Athlete Login -> เห็นเฉพาะ Category กีฬา
2) เลือก Category -> เห็น Coach ในกีฬานั้น
3) เลือก Coach -> เห็น Profile + ตารางว่าง Coach
4) กด Slot -> แจ้งเตือนว่าต้องจองและ Confirm สนามก่อน
5) กดรับทราบ -> เลือกสนาม + ยืนยันว่าจองสนามแล้ว
6) ระบบตรวจเวลาเดินทาง Coach
7) แสดงราคา/คน + QR Coach -> แนบ Slip -> ส่งคำขอ
8) ส่ง Notification ไป Coach
9) Redirect ไป “การจองของฉัน” แบบ Calendar: เวลาอยู่ซ้าย, วันที่เป็นคอลัมน์, แสดง Coach + สนาม

Firebase Rules: ใช้ database.rules.json จาก Sprint 3.9.1 เดิม ไม่มี Rule ใหม่ใน Sprint นี้
