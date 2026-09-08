import { mkdir, copyFile, readFile, readdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist');
// Only the fixed build output is cleaned; Firebase rules and docs are not web assets.
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const names = (await readdir(root)).filter(name =>
  /^(index|athlete|coach|admin)\.html$/.test(name) ||
  /^coach-di-[\w-]+\.(png|jpg)$/.test(name) ||
  /^(auth-session\.js|mobile-layout\.css|mobile-layout\.js|app-experience\.(?:js|css)|schedule-core\.js|native-push\.js|athlete-refunds(?:-core)?\.(?:js|css)|_headers)$/.test(name));
const productionAssets = JSON.parse(await readFile(path.join(root, 'docs/production-assets.json'), 'utf8'));
const all = [...new Set([...names, ...productionAssets.map(asset => asset.path)])];
for (const name of all) {
  const target = path.resolve(output, name);
  if (!target.startsWith(output + path.sep)) throw new Error(`Invalid asset path: ${name}`);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, name), target);
}
console.log(`Built ${all.length} web assets into dist/`);
