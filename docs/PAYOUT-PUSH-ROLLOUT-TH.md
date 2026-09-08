# Coach Di: คิวอนุมัติบัญชีรับเงินและ Android Push

แก้ใน branch `fix/booking-alert-and-android-target-sdk` เท่านั้น ไม่ Merge main หรือ Deploy Production อัตโนมัติ

## สาเหตุและสิ่งที่แก้

โค้ชส่งบัญชีรับเงินไปยัง `coachPaymentAccounts/<uid>` ด้วยสถานะ pending แต่เมนู Admin รุ่นล่าสุดใน `admin-management.js` ไม่มีคิว `verify` และไม่ได้ติดตาม node นี้ ตัวนับอนุมัติเดิมนับคำขอสมัครโค้ช ไม่ใช่บัญชีรับเงิน จึงมองไม่เห็นคำขอเดิมที่ส่งสำเร็จแล้ว

เพิ่มเมนู **อนุมัติบัญชีรับเงิน** พร้อมตัวนับและทางเข้าจากภาพรวม อ่านคำขอเดิมแบบ realtime แยกสถานะโหลดไม่สำเร็จจากไม่มีรายการ บัญชีแสดงเลขท้ายจนกว่า Admin เปิดรายละเอียด ส่งซ้ำไม่สร้างคำขอซ้ำ อนุมัติ/ไม่อนุมัติด้วย transaction ตรวจว่าข้อมูลยังตรงกับที่เปิดอ่านอยู่ ถ้าอัปเดตข้อมูลรับชำระเงินไม่ครบ แสดงปุ่มลองใหม่

Rules จำกัดโค้ชให้ส่ง pending และป้องกันการอนุมัติตนเอง/แก้ paymentPublic โดยตรง Admin ยังพิจารณาตามขั้นตอนเดิม การปรับ Rules ใช้สคริปต์รวมกับ export ล่าสุดและต้องตรวจ diff ก่อนเผยแพร่

`syncCoachPayoutVerification` สร้างแจ้งเตือนทั่วไปที่ key คงที่สำหรับคำขอ/ผลพิจารณาเพื่อกันซ้ำ และซิงก์บัญชีสาธารณะตามลำดับการแก้ไข ไม่ใส่ธนาคาร เลขบัญชี ชื่อจริง QR หรือเหตุผลปฏิเสธในแจ้งเตือน

ตรวจ source ตัวส่ง `sendPushOnNotificationCreated` ที่ใช้งานจริงจาก Google Cloud Console วันที่ 8 กันยายน 2026: payload เดิมเป็น data-only มี web urgency แต่ไม่มี Android priority และไม่มี userId `functions-push` เก็บเฉพาะตัวส่งเดิมกับ helper ที่ต้องใช้ เพิ่มรหัสผู้รับและ Android high priority พร้อม TTL 24 ชั่วโมง คง data-only และค่าของเว็บเดิม ไม่สร้างตัวส่งที่สองมาส่งซ้ำ และไม่รวมฟังก์ชันการเงินอื่น

ฝั่ง Android ตรวจทั้งสิทธิ์ระบบและ channel มีทางเปิด Settings ลองลงทะเบียนใหม่หลังเครือข่ายกลับมา ป้องกัน callback เก่าส่งผลหลัง Logout/สลับบัญชี รองรับ minSdk24 และตรวจผู้รับก่อนแสดง/เปิดแจ้งเตือน ช่องเสียงเดิมที่ผู้ใช้หรือรุ่นเก่าตั้งไว้จะไม่ถูกบังคับเปลี่ยน

## ขอบเขตของรุ่นนี้

รวมงานหน้าจอ Fold7/Alert ตกขอบ แชทสองฝั่ง ขนาดตัวอักษร ลากช่วงตาราง บัญชีคืนเงิน และ Keep Sign In จาก branch เดิม Android versionCode 5, package/namespace `com.coachdi.app`, compile/target 36, min 24 ไม่มีการเปลี่ยน Production Signing Key

## ขั้นตอนเปิดใช้หลังอนุมัติการเผยแพร่

1. เก็บ Netlify deploy เดิมและ export Firebase Rules ล่าสุด ตรวจว่าหน้าเว็บจริงยังตรง baseline; คงไฟล์และการตั้งค่า Production เดิม ทำ preview และ smoke test ก่อน publish
2. รวม Rules ล่าสุดด้วย `scripts/prepare-mobile-rules.cjs` และ `scripts/prepare-payout-rules.cjs` ตรวจ diff/Rules emulator แล้วจึง publish เฉพาะ Rules ที่ผ่านการตรวจ
3. ติดตั้ง dependencies แล้ว Deploy เฉพาะสองฟังก์ชันใหม่ใน codebase เดิมที่เตรียมไว้:

   `firebase deploy --project coach-di --config firebase.mobile.json --only functions:coach-di-mobile:syncCoachBookingSchedule,functions:coach-di-mobile:syncCoachPayoutVerification`

4. อัปเดต **เฉพาะชื่อฟังก์ชันส่ง Push เดิม**:

   `firebase deploy --project coach-di --config firebase.push.json --only functions:sendPushOnNotificationCreated`

   ห้ามใช้ `--only functions` หรือ `--force` กับ config นี้ เพราะ source ครอบคลุมตัวส่งเดียว ไม่มี source ของฟังก์ชันการเงินอื่น หาก CLI ขอเปลี่ยน codebase/ลบฟังก์ชัน ให้หยุดตรวจ ห้ามยืนยันการลบ
5. ตารางสาธารณะเก่าต้องรัน backfill แบบ dry run ก่อนนำผลที่ตรวจแล้วไป apply คำขอบัญชีรับเงินที่ pending เดิมแสดงใน Admin ได้ทันที ไม่ต้องส่งซ้ำ และไม่ส่งแจ้งเตือนย้อนหลังให้ทุกคนโดยอัตโนมัติ
6. เผยแพร่เว็บ/ติดตั้ง APK ทดสอบรุ่นที่ผ่าน CI ตรวจ Admin คิวเดิม การส่งใหม่ ผลพิจารณาและการรับ Push กับบัญชีทดสอบที่ตกลงกัน

ขั้นตอนนี้ยังไม่ใช่การอนุมัติบัญชีรับเงินจริง การอนุมัติข้อมูลของโค้ชจริงเป็นการตัดสินใจของ Admin

## การตรวจรับบนเครื่องจริง

- เปิดแอพ/อยู่เบื้องหลัง/ล็อกจอและพักเครื่อง แล้วรับแจ้งเตือน แตะกลับเข้าหน้าที่ถูกต้อง
- ปิดสิทธิ์แจ้งเตือนแล้วเปิดคืนผ่าน Settings แอพต้องแสดงสถานะตรงและลงทะเบียนได้
- Logout/เปลี่ยนบัญชีต้องไม่แสดงข้อความของบัญชีก่อนหน้า
- ตรวจ `pushDelivery` แยก no_enabled_devices, failed, partial, delivered โดยค่า delivered ของตัวส่งเดิมหมายถึง FCM รับข้อความ ไม่ใช่หลักฐานว่าเครื่องแสดงแล้ว
- ยืนยัน Fold7 พับ/กาง การเลื่อนท้ายหน้า และลากตารางบน APK นี้ การจอง/ชำระ/คืนเงินจริงยังต้อง UAT ตามเงื่อนไขที่ผู้ใช้กำหนด
- APK จาก CI เป็น Debug สำหรับทดสอบ ลายเซ็นต้องเทียบกับรุ่นที่ติดตั้งก่อนอัปเดต ห้ามใช้ Debug signing ส่ง Production

อ้างอิง: [Firebase Android message priority](https://firebase.google.com/docs/cloud-messaging/android-message-priority), [Deploy selected functions](https://firebase.google.com/docs/functions/manage-functions), [Function codebases](https://firebase.google.com/docs/functions/organize-functions)
