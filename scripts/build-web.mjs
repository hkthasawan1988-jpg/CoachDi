import { mkdir, copyFile, readdir, rm } from 'node:fs/promises';
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
  /^(mobile-layout\.css|mobile-layout\.js|_headers)$/.test(name));
for (const name of names) await copyFile(path.join(root, name), path.join(output, name));
console.log(`Built ${names.length} web assets into dist/`);
