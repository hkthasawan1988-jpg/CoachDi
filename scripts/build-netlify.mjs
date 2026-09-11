import './build-web.mjs';
import { readFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Preserve the four routes already published on main. Keep these UAT pages out
// of the Android bundle, which continues to use the ordinary web build.
const manifest = JSON.parse(await readFile(new URL('../docs/preserved-uat.json', import.meta.url), 'utf8'));
for (const asset of manifest.assets) {
  if (!/^uat\/[a-z0-9.-]+\.html$/.test(asset.path)) throw new Error('Invalid UAT path');
  const source = new URL('../' + asset.path, import.meta.url);
  const bytes = await readFile(source);
  const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if (sha !== asset.gitBlobSha) throw new Error(`Published UAT content changed: ${asset.path}`);
  await mkdir(new URL('../dist/uat/', import.meta.url), { recursive: true });
  await copyFile(source, new URL('../dist/' + asset.path, import.meta.url));
}
console.log(`Preserved ${manifest.assets.length} published UAT routes for Netlify only`);
