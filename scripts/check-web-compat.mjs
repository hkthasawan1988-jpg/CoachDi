import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
const baseline = JSON.parse(await readFile(new URL('docs/web-compatibility-baseline.json', root), 'utf8'));
let html = (await readFile(new URL('index.html', root), 'utf8')).replace(/\r\n/g, '\n');
const legacyInlineModules = [
  { id: null, path: 'app-core.js', label: 'Application core', trailingNewline: true },
  { id: null, path: 'coach-schedule-ui.js', label: 'Coach schedule UI', trailingNewline: true },
  { id: null, path: 'legacy-sprint-3.9-ui.js', label: 'Sprint 3.9 UI' },
  { id: null, path: 'legacy-sprint-3.9.2-ui.js', label: 'Sprint 3.9.2 UI' },
  { id: 'c43-js', path: 'coach-operations-ui.js', label: 'Coach operations UI' },
  { id: 'c76-coach-group-classes', path: 'group-class-ui.js', label: 'Group Class UI' },
  { id: 'c70-admin-live-modules', path: 'admin-live-ui.js', label: 'Admin live modules' },
  { id: 'c71-coach-existing-appointments', path: 'coach-appointments-ui.js', label: 'Coach appointments UI' },
  { id: 'c51-logo', path: 'brand-logo-ui.js', label: 'Brand logo UI' },
  { id: 'c80-coach-approval-inbox-script', path: 'coach-approval-inbox-ui.js', label: 'Coach approval inbox UI' },
  { id: 'c81-coach-approval-production-safety', path: 'coach-approval-safety-ui.js', label: 'Coach approval safety UI' },
  { id: 'c82-coach-approval-final-hardening', path: 'coach-approval-hardening-ui.js', label: 'Coach approval hardening UI' },
  { id: 'c83-coach-approval-fencing-and-recovery', path: 'coach-approval-recovery-ui.js', label: 'Coach approval recovery UI' },
  { id: 'c84-coach-approval-transaction-finalizer', path: 'coach-approval-transaction-ui.js', label: 'Coach approval transaction UI' },
  { id: 'c85-coach-rejection-repair', path: 'coach-rejection-ui.js', label: 'Coach rejection UI' },
  { id: 'sprint395-patch', path: 'legacy-sprint-3.9.5-ui.js', label: 'Sprint 3.9.5 UI' },
  { id: 'sprint396-patch', path: 'legacy-sprint-3.9.6-ui.js', label: 'Sprint 3.9.6 UI' },
  { id: 'sprint398-patch', path: 'legacy-sprint-3.9.8-ui.js', label: 'Sprint 3.9.8 UI' },
  { id: 'sprint400-patch', path: 'legacy-sprint-4.0-ui.js', label: 'Sprint 4.0 UI' },
  { id: 'sprint41-patch', path: 'legacy-sprint-4.1-ui.js', label: 'Sprint 4.1 UI' },
  { id: 'sprint42', path: 'legacy-sprint-4.2-ui.js', label: 'Sprint 4.2 UI' },
  { id: 'c59-group-play', path: 'group-play-ui.js', label: 'Group play UI' },
  { id: 'c69-hitting-partner-consent', path: 'hitting-partner-ui.js', label: 'Hitting partner UI' },
  { id: 'c72-knocker-direct-coach', path: 'knocker-direct-coach-ui.js', label: 'Knocker direct coach UI' },
  { id: 'c73-knocker-application-status', path: 'knocker-application-status-ui.js', label: 'Knocker application status UI' },
  { id: 'c75-knocker-admin-queue', path: 'knocker-admin-queue-ui.js', label: 'Knocker Admin queue UI' },
  { id: 'c79-open-play-production-ui-script', path: 'open-play-ui.js', label: 'Open Play UI' },
  { id: 'c60-athlete-calendar-nav', path: 'athlete-calendar-ui.js', label: 'Athlete calendar UI' },
  { id: 'c88-athlete-booking-status-date-safety', path: 'athlete-booking-status-ui.js', label: 'Athlete booking status UI' },
  { id: 'c89-coach-group-class-discovery', path: 'coach-group-class-discovery-ui.js', label: 'Coach Group Class discovery UI' },
  { id: 'c90-group-class-paid-booking', path: 'group-class-payment-ui.js', label: 'Group Class payment UI' },
  { id: 'c91-group-class-onboarding-auto-coach', path: 'group-class-onboarding-ui.js', label: 'Group Class onboarding UI' },
  { id: 'c111-group-class-date-edit-script', path: 'group-class-date-edit-ui.js', label: 'Group Class date editing UI' },
];
for (const { id, path, label, trailingNewline = false } of legacyInlineModules) {
  const include = `<script src="${path}"></script>`;
  const source = (await readFile(new URL(path, root), 'utf8')).replace(/\r\n/g, '\n');
  assert.equal(html.split(include).length, 2, `Expected one ${label} module at its legacy load position`);
  assert.equal(await readFile(new URL(`dist/${path}`, root), 'utf8'), await readFile(new URL(path, root), 'utf8'),
    `${label} module must be copied byte-for-byte into the web build`);
  const openingTag = id ? `<script id="${id}">` : '<script>';
  html = html.replace(include, `${openingTag}\n${source}${trailingNewline ? '\n' : ''}</script>`);
}
const serverClientIncludes = '<script src="booking-server-client-core.js"></script>\n<script src="booking-server-client.js"></script>\n<script src="group-class-server-client.js"></script>\n<script src="chat-server-client.js"></script>\n';
assert.ok(html.endsWith(serverClientIncludes), 'Expected reviewed server-owned booking client includes');
html = html.slice(0, -serverClientIncludes.length);
const accountIncludes = '<link rel=\"stylesheet\" href=\"account-views.css\">\n<script src=\"account-views.js\"></script>\n';
assert.ok(html.endsWith(accountIncludes), 'Expected reviewed account view includes');
html = html.slice(0, -accountIncludes.length);
const accountChanges = JSON.parse(await readFile(new URL('docs/account-compatibility-changes.json', root), 'utf8'));
assert.equal(accountChanges.length, 4);
for (const {before, after} of accountChanges) {
  assert.equal(html.split(after).length, 2, 'Account boundary adaptation must match once');
  html = html.replace(after, before);
}
const timeOffIncludes = '<link rel="stylesheet" href="coach-time-off.css">\n<script src="coach-time-off-core.js"></script>\n<script src="coach-time-off.js"></script>\n';
assert.ok(html.endsWith(timeOffIncludes), 'Expected reviewed coach time off includes');
html = html.slice(0, -timeOffIncludes.length);
const navigationIncludes = '<link rel="stylesheet" href="athlete-navigation.css">\n<script src="athlete-navigation.js"></script>\n';
assert.ok(html.endsWith(navigationIncludes), 'Expected reviewed athlete settings and guided navigation includes');
html = html.slice(0, -navigationIncludes.length);
const themeIncludes = '<link rel="stylesheet" href="court-theme.css">\n<script src="court-theme-core.js"></script>\n<script src="court-theme.js"></script>\n';
assert.ok(html.endsWith(themeIncludes), 'Expected the reviewed court theme, week calendar and profile includes');
html = html.slice(0, -themeIncludes.length);
const updatesIncludes = '<link rel="stylesheet" href="app-updates.css">\n<script src="app-updates-core.js"></script>\n<script src="app-updates.js"></script>\n';
assert.ok(html.endsWith(updatesIncludes), 'Expected the reviewed customer summary and Group Class update includes');
html = html.slice(0, -updatesIncludes.length);
const payoutIncludes = '<link rel="stylesheet" href="payout-approval.css">\n<script src="payout-approval-core.js"></script>\n<script src="payout-approval.js"></script>\n';
assert.ok(html.endsWith(payoutIncludes), 'Expected the reviewed payout queue includes');
html = html.slice(0, -payoutIncludes.length);
const nativeShare = "const base=window.Capacitor?.isNativePlatform()?window.COACH_DI_PUBLIC_CONFIG.appUrl:location.origin+'/';const url=new URL(base);";
const chatRoute = "try{showChat396=function(){if(state.role==='athlete')return showAthleteMenu('chat');if(state.role==='coach')return showCoach('messages');if(state.role==='admin')return s41ShowAdmin('support')}}catch(e){}";
const mobileIncludes = '\n<link rel="stylesheet" href="mobile-layout.css">\n<script src="mobile-layout.js"></script>\n<link rel="stylesheet" href="athlete-refunds.css">\n<script src="athlete-refunds-core.js"></script>\n<script src="athlete-refunds.js"></script>\n<link rel="stylesheet" href="app-experience.css">\n<script src="schedule-core.js"></script>\n<script src="app-experience.js"></script>\n<script src="native-push.js"></script>\n';
assert.equal(html.split(nativeShare).length, 2, 'Expected exactly one reviewed native share adaptation');
assert.equal(html.split(chatRoute).length, 2, 'Expected exactly one reviewed legacy chat navigation fix');
assert.ok(html.endsWith(mobileIncludes), 'Expected the reviewed mobile layout includes');
html = html.slice(0, -mobileIncludes.length).replace(nativeShare, "const url=new URL(location.origin+'/');");
html = html.replace(chatRoute, "try{showChat396=cd398ChatPage}catch(e){}");
const functionsSdk = '<script src="https://www.gstatic.com/firebasejs/10.14.1/firebase-functions-compat.js"></script>\n';
assert.equal(html.split(functionsSdk).length, 2, 'Expected one reviewed Firebase Functions client SDK');
html = html.replace(functionsSdk, '');
const appCheckBridge = '<script src="/app-check-bridge.js"></script>\n';
assert.equal(html.split(appCheckBridge).length, 2, 'Expected one reviewed native App Check bridge');
html = html.replace(appCheckBridge, '');
const appCheckActivation = "try{window.CoachDiAppCheck?.activate(coachDiFirebaseApp,coachDiPublicConfig.appCheckSiteKey)}catch(error){console.warn('App Check monitor client could not start',error)}";
const originalAppCheckActivation = "if(coachDiPublicConfig.appCheckSiteKey){try{coachDiFirebaseApp.appCheck().activate(coachDiPublicConfig.appCheckSiteKey,true)}catch(error){console.warn('App Check monitor client could not start',error)}}";
assert.equal(html.split(appCheckActivation).length, 2, 'Expected reviewed App Check activation');
html = html.replace(appCheckActivation, originalAppCheckActivation);
const sessionChanges = JSON.parse(await readFile(new URL('docs/session-compatibility-changes.json', root), 'utf8'));
assert.equal(sessionChanges.length, 7, 'Expected seven reviewed session restoration adaptations');
for (const {before, after} of sessionChanges) {
  assert.equal(html.split(after).length, 2, 'Session adaptation must match exactly once: ' + after.slice(0, 70));
  html = html.replace(after, before);
}
assert.equal(hash(html), baseline.normalized_index_sha256,
  'Unexpected changes to the Production web client. Review the change and migration baseline before proceeding.');

const assets = JSON.parse(await readFile(new URL('docs/production-assets.json', root), 'utf8'));
for (const asset of assets) {
  assert.equal(hash(await readFile(new URL(asset.path, root))), asset.sha256, `Production source changed: ${asset.path}`);
  assert.equal(hash(await readFile(new URL(`dist/${asset.path}`, root))), asset.sha256, `Production asset omitted or changed in build: ${asset.path}`);
}
assert.equal(await readFile(new URL('dist/index.html', root), 'utf8'), await readFile(new URL('index.html', root), 'utf8'));
console.log(`Web compatibility passed: Production HTML preserved except reviewed layout/chat/session adaptations; ${assets.length} client assets match in source and build.`);
