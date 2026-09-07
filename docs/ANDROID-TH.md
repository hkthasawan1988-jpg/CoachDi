# Coach Di Android

Android source ชุดแรกของ Repository นี้ ใช้ Capacitor 8.5.1 ชื่อแอป Coach Di,
Application ID / namespace `com.coachdi.app`, versionCode `1`, versionName `1.0.0`.
ไม่มี Android รุ่นก่อนหน้าให้เพิ่มเลขเวอร์ชันหรือรักษา signing key เดิม

## ต้นฉบับเว็บ

`main` ที่ commit `120abd1feab7359015a07751df2c1127dcceb880` ไม่ตรงกับ Production
จึงบันทึก public client ของ https://coach-di.netlify.app/ ไว้ใน Branch นี้
ดู URL และ SHA-256 ใน `production-baseline.json` และ `production-assets.json`.
นี่เป็นการเก็บไฟล์ที่หน้าเว็บให้บริการ ไม่ใช่การยืนยัน commit ที่ Netlify Deploy
และไม่รวม Source ของ Cloud Functions, backend secrets หรือ Firebase rules ที่ Deploy อยู่.
ไฟล์ `database.rules.json` และ `firebase.json` ใน Repository ไม่ได้ถูกแก้หรือ Deploy.

## Root cause และการแก้ Booking Alert

เดิม `.sheet` เป็นกล่องเลื่อนทั้งใบ ทำให้ `.sheetActions` และปุ่มรับทราบเลื่อนหายไปพร้อมข้อความ
และ CSS หลายชุดทับค่า `max-height` ระหว่าง `vh` กับ `dvh`.
`mobile-layout.css` จำกัดกล่องด้วย visual viewport / 100dvh และ safe area ทั้งสี่ด้าน
ส่วน `mobile-layout.js` ย้าย DOM เดิมลง body ที่เลื่อนได้ โดยคง footer ไว้นอกพื้นที่เลื่อน.
ปุ่มถูกย้าย ไม่ถูกโคลนหรือผูก booking handler เพิ่ม; โค้ดเขียน Booking ยังคงเดิม.
รองรับข้อความภาษาไทยยาว การหมุนจอ คีย์บอร์ดที่ลด visual viewport และการคืน focus.

## Notifications

Booking warning และเมนูแจ้งเตือนเป็น in-app UI.
Production มี Web Push ของ PWA แยกต่างหากใน `scaling.js` / `firebase-messaging-sw.js`.
Android รุ่นนี้ไม่ได้เพิ่ม native Push plugin หรือ POST_NOTIFICATIONS; ซ่อนปุ่ม Web Push
ใน Android แต่คงเมนูแจ้งเตือนภายในแอป. การส่ง native Push ขณะปิดแอปยังไม่อยู่ในรุ่นนี้.
ลิงก์แชร์โค้ชจาก Android ใช้ appUrl สาธารณะ แทน origin localhost ของ Capacitor.

## Build

- Node.js 22 ขึ้นไป, JDK 21
- Android compileSdk / targetSdk 36, minSdk 24 (Android 7.0 ตาม Capacitor 8)
- Android Gradle Plugin 8.13.0, Gradle 8.14.3 พร้อม SHA-256 ของ distribution

```sh
npm ci
npm run build
npm run check
npx playwright install chromium
npm test
npx cap sync android
cd android
./gradlew clean assembleDebug lintDebug
```

บน Windows ใช้ `gradlew.bat` แทน `./gradlew` และตั้ง JAVA_HOME ไปที่ JDK 21.
ไฟล์ APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
GitHub Actions รันทุก Pull Request; ดาวน์โหลดได้จาก Run > Artifacts > `coach-di-debug-<sha>`.
รายงานทดสอบและ Android lint อยู่ใน `coach-di-reports-<sha>`.

## Release AAB

ไม่มีการ Publish หรือ Deploy อัตโนมัติ. หลัง PR ผ่านการตรวจและ workflow อยู่บน default branch แล้ว
เรียก Actions > Android build > Run workflow และเลือก release_aab.
ตั้ง environment `android-release` พร้อม Secrets เหล่านี้:

- `ANDROID_KEYSTORE_BASE64`: keystore ของแอปที่เข้ารหัส base64
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_SIGNING_CERT_SHA256`: SHA-256 fingerprint ของ certificate ใน keystore

เก็บ keystore และรหัสผ่านแยกจาก Source. Workflow ไม่สร้างหรือเปลี่ยน key ให้
ถ้า Secrets ไม่ครบจะข้าม Release. หาก key/certificate ไม่ถูกต้องจะ Build ไม่ผ่าน.
Gradle ปฏิเสธ Android Debug certificate และ fingerprint ที่ไม่ตรง แม้สั่ง bundleRelease เอง.
AAB อยู่ที่ `android/app/build/outputs/bundle/release/app-release.aab`.
Debug APK ใช้ทดสอบเท่านั้นและไม่ใช่ไฟล์ Production.

## ขอบเขตการทดสอบ

Browser tests รันกับ Firebase mock และบล็อก network ภายนอก รวมถึง service workers.
ครอบคลุม 320, 360, 390, 412px, ข้อความยาว, safe-area จำลอง, viewport เปลี่ยนขนาด,
เปิด/ปิดซ้ำ, acknowledgement ไม่เขียน Booking, และดับเบิลคลิกส่งคำขอเดิมได้หนึ่งครั้ง.
การเข้าสู่ระบบ Firebase จริง, App Check/reCAPTCHA บน Android WebView, การอัปโหลดสลิป,
การชำระเงิน และอุปกรณ์ Android จริงยังต้องผ่าน UAT ก่อนออก Release.
ตัว Build ไม่เปลี่ยนหรือปิด App Check/กฎสิทธิ์ของ Production.

## การรักษาพฤติกรรมเว็บเดิม

`npm run check` ตรวจทั้ง source และ dist ว่า public client assets ทั้ง 25 ไฟล์ตรงกับ Production snapshot
และตรวจ index.html ทั้งไฟล์ โดยอนุญาตเฉพาะ mobile layout includes, native share URL และ legacy chat route ที่ผ่าน review
หากตั้งใจเปลี่ยนเว็บในอนาคต ให้ review และปรับ `docs/web-compatibility-baseline.json` พร้อมการเปลี่ยนนั้น
ไม่ควรแก้ hash เพียงเพื่อข้าม failure ที่ไม่ทราบสาเหตุ

ชุดทดสอบเพิ่มเติมครอบคลุมทางเข้า Athlete/Coach/Admin, validation และ remember-login (Firebase mock),
เปิด/ยกเลิกสมัคร Coach, validation ก่อนจอง, สนามอื่น, ฟอร์มเลือกพื้นที่, หน้า Booking/History/Profile/Chat
และ URL แชร์จากเว็บปกติ พร้อมตรวจไฟล์ local ที่โหลดไม่สำเร็จ
การทดสอบนี้ไม่ได้ยืนยันธุรกรรมจริงหรือสิทธิ์ Backend; ยังต้องใช้ UAT แยกสำหรับขั้นตอนเหล่านั้น

## แก้ปุ่มแชทเก่าที่ทำให้เมนูอื่นใช้งานไม่ได้

การตรวจ Production หลังผู้ใช้เข้าสู่ระบบพบว่า `cd396ChatNav` เรียกฟังก์ชันรุ่นเก่าที่แทนที่
`main.innerHTML` ทั้งหมด ทำให้ `athletePage` และ `coachPage` หายไป และกลับหน้าหลักแล้วเกิด
`Cannot read properties of null (reading 'children')`.
แก้ `showChat396` ให้เรียก router ปัจจุบันตาม role: Athlete Chat, Coach Messages หรือ Admin Support.
จึงรักษาส่วนหน้าเว็บหลักและผ่าน subscription gate เดิมของ Coach; ไม่เปลี่ยนการส่งข้อความหรือ Booking/Firebase.
Regression tests คลิกปุ่มที่ฉีดลง sidebar จริงและกลับหน้าหลักซ้ำ ครอบคลุมทั้งสาม role
รวมถึง Coach ที่ subscription ถูกล็อก. Compatibility guard อนุญาตเฉพาะการแก้ route ตรงจุดนี้
และยังใช้ hash ของ Production เดิม.

Live UI ตรวจโปรไฟล์ รายการจอง ประวัติ ตาราง Coach และเปิด/ยกเลิกขั้นตอนเลือกสนามแล้ว.
ไม่มีการส่งข้อความ สร้างรายการจอง ชำระเงิน หรือแก้ไขโปรไฟล์จริงในการตรวจนี้.
ผล live เป็นของเว็บ Production ก่อน deploy; การแก้ใน PR ต้องผ่าน UAT หลังนำขึ้น staging/อุปกรณ์.
