# Fold7: แชท ตาราง และ Android Push

สถานะผู้ใช้: ผู้ใช้รายงานว่ารายการอื่นทดสอบผ่านบนแอป Fold7 ยกเว้นข้อแก้ไขในเอกสารนี้ รายงานดังกล่าวไม่ได้ระบุหลักฐานการจอง/ชำระ/คืนเงินจริง จึงยังไม่เปลี่ยนสถานะการทดสอบเงินจริงเป็นผ่าน

## การแก้ไข
- แชทโค้ช: รายชื่อลูกค้าด้านซ้าย ข้อความด้านขวา ทั้งจอพับและกาง ชื่อไทยยาวตัดบรรทัดได้ ช่องพิมพ์อยู่ในกรอบและเก็บข้อความร่างระหว่างสลับลูกค้า ไม่สร้างห้องแชทต่อการจองใหม่
- ยกเลิก listener เดิมเมื่อสลับลูกค้า และไม่ให้ callback ของห้องเก่าเขียนทับห้องใหม่ ค้นหารายชื่อโดยไม่ทำลายช่องค้นหาหรือช่องพิมพ์
- ตารางวันนี้/สัปดาห์: แตะช่องว่าง หรือแตะแล้วลากขึ้น/ลงเพื่อเลือกทีละ 30 นาที เปิดฟอร์มพร้อมวันเวลา ต้องกดบันทึกจึงเขียน coachPublicSchedule ตรวจเวลาชนกับข้อมูลล่าสุดและกันกดบันทึกซ้ำ ไม่สร้าง Booking จากการลาก
- ช่องที่มีรายการจองและนัดที่โค้ชลงเองเป็นสีน้ำเงิน พร้อมสนามทุกช่วงเวลา ปฏิทินเดือนกดเพิ่มนัดได้
- Font บน Android เพิ่มความอ่านง่าย: ช่องกรอก/ปุ่ม/ข้อความแชท 16px รายละเอียด 14px พร้อมขอบเขต viewport, safe area และพื้นที่แป้นพิมพ์

## Push ที่ตรวจพบใน Firebase
ตรวจ Console วันที่ 7 กันยายน 2026: มี sendPushOnNotificationCreated, notifyDirectChatMessage, notifyBookingChatMessage, notifySupportChatMessage และ reminder functions อยู่แล้ว
sendPushOnNotificationCreated อ่าน fcmTokens/{uid} ที่ enabled=true ไม่กรอง platform และส่ง data-only payload: title, body, type, notificationId, url
จึงใช้บริการเดิม ไม่สร้างตัวส่งซ้ำ เพิ่ม Capacitor Push Notifications และ native data-message service, POST_NOTIFICATIONS พร้อม runtime permission จากปุ่มเปิดแจ้งเตือน
ลงทะเบียน Android com.coachdi.app ใน Firebase coach-di โดยใช้ applicationId เดิม; google-services.json เป็น public client configuration ไม่ใช่ service-account key
Native service ใช้ channel, icon และ notification tag คงที่เพื่อแทนที่การส่งซ้ำ ไม่บันทึก token ลง log และปิดการแจ้งเตือนฝั่งเครื่องก่อน logout
Payload เดิมไม่มี recipient UID: ข้อความบนระบบ Android จึงเป็นข้อความทั่วไป เมื่อแตะจึงตรวจว่า notificationId อยู่ใน notifications/{ผู้ใช้ปัจจุบัน} ก่อนเปิดข้อมูล ไม่เปิด URL จาก payload โดยตรง
Push ครอบคลุมรายการที่ระบบสร้างใน notifications รวมการจอง แชท ชำระเงิน คืนเงิน และ reminder; validation เช่นกรอกช่องไม่ครบยังแสดงในหน้าจอ ไม่ส่งข้อความผิดพลาดส่วนตัวขึ้น Push
FCM data messages เดิมไม่มี android.priority=high จึงอาจล่าช้าเมื่อเครื่องอยู่ใน Doze; force-stop หรือปิดสิทธิ์ระบบจะไม่รับตามปกติ ต้องทดสอบเปิดแอป เบื้องหลัง ล็อกจอ และกดแจ้งเตือนบน Fold7 อีกครั้ง

## ตารางที่นักกีฬาคนอื่นจอง
เดิมนักกีฬาอ่านได้เฉพาะ Booking ของตน และ coachPublicSchedule เก็บเฉพาะนัดที่โค้ชลงเอง จึงแสดงการจองของผู้อื่นไม่ได้
เพิ่ม functions-mobile/syncCoachBookingSchedule เป็น codebase แยก อัปเดต coachBookingSchedule แบบอนุญาตเฉพาะวัน เวลา สนาม ไม่เผยชื่อ เบอร์ บัญชี สลิป หรือ Booking ID จริง มี revision และ tombstone กัน event ย้อนลำดับสร้างช่องจองเก่ากลับมา
ยังต้อง deploy function และ Rules ที่ผ่านการรวมกับ export ปัจจุบัน และ backfill รายการเดิมก่อนใช้งานส่วนนี้จริง ไม่ deploy อัตโนมัติ

## ก่อนเปิดใช้งานบน Production
สำเนา Rules ที่อ่านจาก Console วันที่ 7 กันยายน 2026 อยู่ใน test-rules/production-baseline.rules.json และ database.rules.json เป็นข้อเสนอที่รวมกับสำเนานี้แล้ว รักษา Nodes เดิมรวม Omise, Group Class และกฎอนุมัติโค้ช พร้อมทดสอบเทียบกับ baseline ไม่ได้ publish ไป Firebase
กฎ fcmTokens ที่ใช้งานจริงรองรับ platform android อยู่แล้ว และให้เจ้าของกับ Admin เข้าถึง จึงรักษากฎเดิมทั้งหมดไว้
1. ตรวจและรวม Rules ปัจจุบันด้วย prepare-refund-rules.cjs (ถ้ายังไม่ได้เพิ่มฟีเจอร์คืนเงิน) แล้ว prepare-mobile-rules.cjs ห้ามทับ Rules ปัจจุบันจาก repository ทั้งไฟล์
2. ตรวจ fcmTokens rules ปัจจุบันว่าเจ้าของเขียน platform android ได้ และรักษาสิทธิ์ private ของบัญชี/Booking
3. ติดตั้ง dependency ใน functions-mobile แล้ว deploy เฉพาะ syncCoachBookingSchedule ด้วย firebase.mobile.json ห้ามลบ/แทนที่ Functions การชำระเงินหรือ Push เดิม
4. รัน node functions-mobile/backfill.cjs เป็น dry run ก่อน แล้วจึง --apply หลังตรวจอนุมัติ ผลลัพธ์ log มีเฉพาะจำนวน ไม่แสดงข้อมูลลูกค้า
5. ทดสอบ Push บน Fold7 ด้วยบัญชีเจ้าของที่ยินยอม หลังเปิดสิทธิ์ใน APK ใหม่ ทดสอบ Logout/เปลี่ยนบัญชีไม่แสดงเนื้อหาจากบัญชีเก่า
6. ทดสอบการจอง/ชำระ/คืนเงินจริงตามโค้ช วันเวลา สนาม และวงเงินที่ตกลงก่อน Release

ยังไม่มีการ merge main, deploy Netlify, publish Firebase Rules หรือ deploy Functions ในการแก้ไขนี้
