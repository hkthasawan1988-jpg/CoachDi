import {mkdir, writeFile} from 'node:fs/promises';
// Test the exact compat SDK shipped by the public client. Tests block all external browser traffic.
await mkdir('.auth-test-sdk', {recursive:true});
for (const name of ['firebase-app-compat.js','firebase-auth-compat.js']) {
  const response=await fetch(`https://www.gstatic.com/firebasejs/10.14.1/${name}`);
  if(!response.ok)throw Error(`Firebase test SDK download failed: ${response.status}`);
  await writeFile(`.auth-test-sdk/${name}`,await response.text());
}
