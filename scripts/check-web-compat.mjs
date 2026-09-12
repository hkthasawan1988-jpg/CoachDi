import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
const baseline = JSON.parse(await readFile(new URL('docs/web-compatibility-baseline.json', root), 'utf8'));
let html = (await readFile(new URL('index.html', root), 'utf8')).replace(/\r\n/g, '\n');
const serverClientIncludes = '<script src="booking-server-client-core.js"></script>\n<script src="booking-server-client.js"></script>\n';
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
