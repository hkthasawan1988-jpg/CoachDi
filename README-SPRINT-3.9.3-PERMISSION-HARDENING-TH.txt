Coach Di UAT Sprint 3.9.3 — Booking Permission Hardening

แก้ไข:
1) การสร้าง Booking + Notification ใช้ Firebase multi-location update ในคำสั่งเดียว ลดกรณี Booking ถูกสร้างแต่ Notification ล้มเหลว
2) Notification จาก Athlete ส่งได้เฉพาะไปยัง UID ที่ role=coach และ senderId ต้องเป็น Athlete ที่ login
3) Notification จาก Coach ใส่ senderId ให้ตรง Security Rules
4) Audit log ไม่ทำให้ Booking หลักล้มเหลวหาก audit เขียนไม่ได้
5) User profile update (เช่นเบอร์โทร) อนุญาตเฉพาะเจ้าของ โดยห้ามเปลี่ยน role/status/subscription

ต้อง Publish database.rules.json ของ Sprint 3.9.3 ใน Firebase Realtime Database > Rules ก่อนทดสอบ
