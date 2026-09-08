import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const root = new URL('../', import.meta.url);
const hash = data => createHash('sha256').update(data).digest('hex');
const baseline = JSON.parse(await readFile(new URL('docs/web-compatibility-baseline.json', root), 'utf8'));
let html = (await readFile(new URL('index.html', root), 'utf8')).replace(/\r\n/g, '\n');
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
