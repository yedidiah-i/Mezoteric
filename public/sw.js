// Offline shell cache. The node on the LAN serves the app; this keeps the
// interface usable across reloads even if the node is briefly unreachable.
// Message data never goes through here: it lives in IndexedDB, encrypted.
const CACHE = 'mezoteric-shell-v2';
const SHELL = [
  '/', '/index.html', '/app.css', '/icon.svg', '/manifest.webmanifest',
  '/js/app.js',
  '/js/core/crypto.js', '/js/core/db.js', '/js/core/net.js', '/js/core/state.js',
  '/js/core/authority.js', '/js/core/rtc.js', '/js/core/util.js',
  '/js/ui/dom.js', '/js/ui/conversation.js',
  '/js/views/auth.js', '/js/views/chats.js', '/js/views/channels.js',
  '/js/views/streams.js', '/js/views/shorts.js', '/js/views/school.js',
  '/js/views/admin.js', '/js/views/settings.js', '/js/views/dashboard.js',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) return;

  event.respondWith(
    fetch(request)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(request).then(hit => hit || caches.match('/index.html')))
  );
});
