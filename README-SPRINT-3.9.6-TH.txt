Coach Di UAT Sprint 3.9.6

เพิ่ม:
1. Athlete notification badge สำหรับการยืนยัน Booking และข้อความใหม่
2. Tab Chat รวมทุก Booking และ realtime messaging แบบ instant
3. ส่งข้อความแล้วสร้าง notification ให้คู่สนทนา
4. Booking History เป็น dropdown รายเดือน + Ticket สีเทา + ชื่อ Coach
5. ชื่อ Coach แสดงใน Booking/History เพื่อไม่ให้สับสน
6. Admin Subscription Dashboard default MTD + Date Range
7. เตือนก่อนครบกำหนด 3 วัน
8. เกินกำหนดมากกว่า 7 วัน Coach ถูกจำกัดสิทธิ์ เหลือเมนู Subscription
9. เมื่อ Admin activate subscription ใหม่ สิทธิ์กลับมาตามข้อมูล subscription
10. Export Coach history / Athlete history เป็น CSV
11. เพิ่ม/แก้ Firebase Rules สำหรับ bookingChats, notifications, adminSubscriptionAlerts

หมายเหตุ:
- การล็อก >7 วันใน Sprint นี้บังคับที่ UI และสิทธิ์ใช้งานในแอปตาม subscription state
- หากต้องการ security enforcement ระดับ database สำหรับทุก action ของ coach ควรเพิ่ม condition ลงทุก write rule ใน sprint ถัดไปด้วย
- ต้อง Publish database.rules.json ใหม่
