const CACHE_NAME = 'signature-app-v6-staging';

const urlsToCache = [
  './',
  './Signature%20App.html',
  './Install.html',
  './manifest.json',
  './icon-192x192.png',
  './icon-512x512.png'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache)));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const reqUrl = event.request.url;

  // 크롬 익스텐션 등 차단
  if (!reqUrl.startsWith('http')) return;

  // ★ 보안 및 기능 우회: 외부 API 및 관리자 페이지(Admin.html)는 절대 캐시 금지
  if (reqUrl.includes('script.google.com') || 
      reqUrl.includes('googleusercontent.com') || 
      reqUrl.includes('Admin.html')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 메인 앱: Network-First
  if (event.request.mode === 'navigate' || event.request.headers.get('accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(networkResponse => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then(cached => cached || caches.match('./Signature%20App.html')))
    );
    return;
  }

  // 정적 리소스: Stale-while-revalidate
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch(err => console.warn('Fetch failed', err));
      return cachedResponse || fetchPromise;
    })
  );
});
