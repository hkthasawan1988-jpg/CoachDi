const { expect } = require('@playwright/test');

async function openIsolatedApp(page, native = false, entry = '/') {
  const pageErrors = [];
  const missingAssets = [];
  page.on('response', response => { if (response.url().startsWith('http://127.0.0.1:') && response.status() >= 400) missingAssets.push(response.url()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  // All external traffic is blocked: these tests cannot reach Production Firebase.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' ? route.continue() : route.fulfill({ status: 200, body: '', contentType: 'text/javascript' });
  });
  await page.addInitScript(isNative => {
    window.Capacitor = { isNativePlatform: () => isNative };
    window.testWrites = [];
    window.testAuthCalls = [];
    const snapshot = value => ({ val: () => value, exists: () => value != null, forEach: () => false });
    const ref = path => ({
      key: 'test-key',
      child: name => ref(`${path}/${name}`),
      once: async () => snapshot(path.startsWith('users/') ? { displayName: 'Test Athlete', phone: '0800000000' } : null),
      on: (event, callback) => {
        if (Object.hasOwn(window.testRealtimeValues || {}, path)) {
          queueMicrotask(() => callback(snapshot(window.testRealtimeValues[path])));
        }
        return callback;
      }, off: () => {},
      orderByChild() { return this; }, equalTo() { return this; }, limitToLast() { return this; },
      push: () => ref(`${path}/test-key`),
      set: async value => { window.testWrites.push({ path, value }); },
      update: async value => { window.testWrites.push({ path, value }); await new Promise(resolve => setTimeout(resolve, 80)); },
      remove: async () => { window.testWrites.push({ path, remove: true }); },
      transaction: async () => ({ committed: true, snapshot: snapshot(null) }),
    });
    const auth = { currentUser: null, onAuthStateChanged: () => () => {}, setPersistence: async value => { window.testAuthCalls.push({type: 'persistence', value}); }, signOut: async () => {}, signInWithEmailAndPassword: async (email, password) => { window.testAuthCalls.push({type: 'login', email, password}); if (window.testAuthError) throw window.testAuthError; return {user: {uid: 'test-athlete'}}; } };
    window.testAuth = auth;
    const authFn = () => auth;
    authFn.Auth = { Persistence: { LOCAL: 'local', SESSION: 'session', NONE: 'none' } };
    const database = () => ({ ref: path => ref(path || '') });
    database.ServerValue = { TIMESTAMP: { '.sv': 'timestamp' } };
    const app = { auth: authFn, database, appCheck: () => ({ activate: () => {} }) };
    window.firebase = { initializeApp: () => app, apps: [], auth: authFn, database };
  }, native);
  await page.goto(entry);
  await expect(page.locator('#loginView')).toBeVisible();
  expect(pageErrors).toEqual([]);
  expect(await page.evaluate(() => typeof state)).toBe('object');
  expect(missingAssets).toEqual([]);
  return { pageErrors, missingAssets };
}

module.exports = { openIsolatedApp };
