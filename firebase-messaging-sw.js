/* Coach Di PWA + Firebase Messaging service worker. */
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

const CACHE_NAME = "coach-di-shell-v2-omise";
const APP_SHELL = [
  "/?portal=athlete&pwa=1",
  "/manifest.webmanifest",
  "/app-config.js",
  "/scaling.css",
  "/scaling.js",
  "/icons/coach-di-192.png",
  "/icons/coach-di-512.png"
];

const firebaseConfig = {
  apiKey: "AIzaSyCKr76AFSvi6G1N_BF_IfpcsV7VWlzOcIc",
  authDomain: "coach-di.firebaseapp.com",
  databaseURL: "https://coach-di-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "coach-di",
  storageBucket: "coach-di.firebasestorage.app",
  messagingSenderId: "41680156013",
  appId: "1:41680156013:web:0c24e900e60495d9189664"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  const requestUrl = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match("/?portal=athlete&pwa=1").then(hit => hit || new Response("Coach Di ต้องเชื่อมต่ออินเทอร์เน็ตเพื่อเข้าสู่ระบบ", {headers:{"Content-Type":"text/plain; charset=utf-8"}}))));
    return;
  }
  if (requestUrl.pathname === "/app-config.js") {
    event.respondWith(fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match(event.request)));
    return;
  }
  if (APP_SHELL.includes(requestUrl.pathname)) {
    event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
      return response;
    })));
  }
});

messaging.onBackgroundMessage(payload => {
  const data = payload.data || {};
  const title = data.title || "Coach Di";
  return self.registration.showNotification(title, {
    body: data.body || "คุณมีการแจ้งเตือนใหม่",
    icon: "/icons/coach-di-192.png",
    badge: "/icons/coach-di-192.png",
    tag: data.notificationId || data.type || "coach-di",
    renotify: true,
    data: {url: data.url || "/"}
  });
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(clients.matchAll({type:"window", includeUncontrolled:true}).then(list => {
    const match = list.find(client => client.url.startsWith(self.location.origin));
    if (match) return match.focus().then(() => match.navigate(target));
    return clients.openWindow(target);
  }));
});
