# Coach Di — iOS และ App Store Readiness

สถานะปัจจุบัน: Repository เดิมมี Capacitor iOS source แล้ว ใช้ Bundle ID `com.coachdi.app`, iOS 15 ขึ้นไป, App Check และ Push Notification bridge พร้อมสำหรับการ Compile แบบไม่เซ็นใน GitHub Actions

## สิ่งที่ CI ตรวจอัตโนมัติ

- ติดตั้ง Node 22 และ dependencies จาก lockfile
- ตรวจ Bundle ID, deployment target, App Check และ APNs bridge
- Build Web ก่อน `cap sync ios`
- เตรียม App Check plugin ใน path ที่ไม่ชน SwiftPM package identity ของ Google
- Resolve Swift Package Manager dependencies
- Build Debug สำหรับ iOS Simulator โดยปิด Code Signing
- อัปโหลด `App.app` สำหรับ Simulator เป็น GitHub Actions Artifact

Simulator build ใช้ตรวจว่า source compile ได้ แต่ติดตั้งบน iPhone จริงหรือส่ง App Store ไม่ได้

## Blocker ภายนอกก่อนทดสอบบน iPhone จริง

1. สมัคร Apple Developer Program แบบบุคคลธรรมดาและเปิด 2FA
2. ยืนยันว่า App ID `com.coachdi.app` ยังว่างในบัญชี Apple
3. สร้าง Firebase iOS app ด้วย Bundle ID เดียวกัน แล้วดาวน์โหลด `GoogleService-Info.plist`
4. สร้าง APNs Authentication Key (`.p8`) และนำ Key ID/Team ID ไปตั้งใน Firebase Cloud Messaging
5. เปิด Push Notifications capability และเลือก Apple Development Team ใน Xcode บน Mac
6. ลงทะเบียน App Check สำหรับ iOS และทดสอบ Debug token ก่อนเปิด Enforcement

`GoogleService-Info.plist`, `.p8`, certificate, provisioning profile และรหัสผ่านทุกชนิดเป็น secrets ห้าม commit ลง Git

## Blocker ก่อนส่ง App Store

- สร้าง App record ใน App Store Connect
- เตรียมชื่อแอป คำอธิบาย Keywords หมวดหมู่ Support URL และ Privacy Policy URL
- ตอบ App Privacy ให้ครอบคลุมข้อมูลที่ระบบใช้ เช่น ชื่อ อีเมล เบอร์โทร รูปโปรไฟล์ ตำแหน่ง การจอง แชท บัญชีรับเงิน หลักฐานชำระ/คืนเงิน และ Push token
- เตรียม Screenshot ตามชนิดอุปกรณ์ที่รองรับ
- ทำ UAT บน iPhone จริง: login ค้างหลังปิดแอป, booking, payment proof, refund, chat, notification และ notification tap routing
- Archive/Upload ด้วย Distribution signing ของเจ้าของบัญชี และใช้ TestFlight ก่อนส่ง Review

ยังไม่มี workflow สร้าง IPA หรือ Upload App Store อัตโนมัติ เพราะ Repository ยังไม่มี Apple signing credentials และการส่ง Store ต้องผ่าน UAT บนอุปกรณ์จริงก่อน

