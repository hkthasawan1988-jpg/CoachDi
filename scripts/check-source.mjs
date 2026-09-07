import { readFile, readdir } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
let count = 0;
for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
  if (/\bsrc\s*=/.test(match[1]) || /type=["']application\//.test(match[1])) continue;
  new vm.Script(match[2], { filename: `index.html:inline-${++count}` });
}
new vm.Script(await readFile(new URL('../mobile-layout.js', import.meta.url), 'utf8'));
let external = 0;
for (const match of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
  const url = new URL(match[1], 'https://coach-di.netlify.app/');
  if (url.hostname !== 'coach-di.netlify.app') continue;
  const source = await readFile(new URL(`../dist${url.pathname}`, import.meta.url), 'utf8');
  new vm.Script(source, { filename: url.pathname });
  external++;
}
const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8');
if (!manifest.includes('POST_NOTIFICATIONS') || !manifest.includes('CoachDiMessagingService')) throw new Error('Native push requires notification permission and its data-message service');
const assets = await readdir(new URL('../dist/', import.meta.url));
for (const forbidden of ['database.rules.json', 'firebase.json', 'package.json']) {
  if (assets.includes(forbidden)) throw new Error(`${forbidden} must not be bundled as a web asset`);
}
console.log(`Syntax OK: ${count} inline and ${external} local external scripts; Android permission and web asset checks passed.`);
