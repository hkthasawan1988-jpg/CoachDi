import { readFileSync, existsSync } from 'node:fs';

const read = path => readFileSync(path, 'utf8');
const project = read('ios/App/App.xcodeproj/project.pbxproj');
const info = read('ios/App/App/Info.plist');
const appDelegate = read('ios/App/App/AppDelegate.swift');
const notifications = read('ios/App/App/CoachDiNotificationsPlugin.swift');
const packageFile = read('ios/App/CapApp-SPM/Package.swift');

const required = [
  [project.includes('PRODUCT_BUNDLE_IDENTIFIER = com.coachdi.app;'), 'bundle id com.coachdi.app'],
  [project.includes('IPHONEOS_DEPLOYMENT_TARGET = 15.0;'), 'iOS 15 deployment target'],
  [info.includes('<string>Coach Di</string>'), 'Coach Di display name'],
  [appDelegate.includes('.capacitorDidRegisterForRemoteNotifications'), 'APNs registration bridge'],
  [notifications.includes('#if DEBUG') && notifications.includes('["debug": false]'), 'release-safe App Check selection'],
  [packageFile.includes('CapacitorFirebaseAppCheck') && packageFile.includes('CapacitorPushNotifications'), 'native App Check and push packages']
];

for (const [ok, label] of required) {
  if (!ok) throw new Error(`iOS readiness check failed: ${label}`);
}

if (/DEVELOPMENT_TEAM\s*=\s*[^;\s]+/.test(project)) {
  throw new Error('iOS readiness check failed: a personal Apple Development Team must not be committed');
}
if (existsSync('ios/App/App/GoogleService-Info.plist')) {
  throw new Error('iOS readiness check failed: GoogleService-Info.plist must be injected securely and must not be committed');
}

console.log('iOS source readiness checks passed (unsigned build configuration).');

