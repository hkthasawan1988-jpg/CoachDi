(function (root) {
  'use strict';
  const routeKey = 'coachdi-session-route:v1';
  const roles = ['athlete', 'coach', 'admin'];
  const read = key => { try { return localStorage.getItem(key); } catch (_) { return null; } };
  const write = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (_) {} };
  function entry(search) {
    const params = new URLSearchParams(search), requested = params.get('portal');
    let saved;
    try { saved = JSON.parse(read(routeKey)); } catch (_) {}
    // The installed PWA's old start URL names athlete even when a coach used it last.
    const pwaStart = params.get('pwa') === '1' && requested === 'athlete';
    if (roles.includes(requested) && !pwaStart) return {scope: requested, role: requested};
    if (roles.includes(saved?.scope) && roles.includes(saved?.role)) return saved;
    return {scope: 'athlete', role: 'athlete'};
  }
  const preferenceKey = scope => 'coachdi-keep-signed-in:v1:' + scope;
  const keep = scope => read(preferenceKey(scope)) !== 'false';
  function preference(scope, value) { write(preferenceKey(scope), String(value)); }
  function remember(scope, role, enabled) {
    if (enabled) write(routeKey, JSON.stringify({scope, role}));
    else forget(scope);
  }
  function forget(scope) {
    try { if (JSON.parse(read(routeKey))?.scope === scope) write(routeKey, null); } catch (_) { write(routeKey, null); }
  }
  function status(message, retry) {
    document.getElementById('loginView')?.classList.add('hidden');
    document.getElementById('portal')?.classList.add('hidden');
    let panel = document.getElementById('sessionStatus');
    if (!panel) {
      panel = document.createElement('section'); panel.id = 'sessionStatus'; panel.className = 'auth card';
      panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
      document.getElementById('loginView')?.before(panel);
    }
    panel.replaceChildren(); panel.classList.remove('hidden');
    const title = document.createElement('h1'); title.textContent = retry ? 'ยังคงเข้าสู่ระบบอยู่' : 'กำลังเปิด Coach Di';
    const text = document.createElement('p'); text.textContent = message;
    panel.append(title, text);
    if (retry) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'pill primary';
      button.textContent = 'ลองเชื่อมต่ออีกครั้ง'; button.onclick = retry; panel.append(button);
    }
  }
  function finish() { document.getElementById('sessionStatus')?.classList.add('hidden'); }
  root.CoachDiSession = {entry, keep, preference, remember, forget, status, finish};
})(window);
