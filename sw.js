const CACHE_VERSION = 'v10';
const CACHE_ENV = 'staging'; // 운영 배포 시 'prod'로 변경하시면 됩니다.
const CACHE_NAME = `signature-app-${CACHE_VERSION}-${CACHE_ENV}`;

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
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
      .catch(err => console.error('Service Worker Install Error:', err))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log(`[Service Worker] Deleting old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const reqUrl = req.url;

  // 1. http/https 프로토콜이 아닌 경우 처리 안 함 (크롬 익스텐션 등 방어)
  if (!reqUrl.startsWith('http')) return;

  // 2. POST 요청 제외 (숙제 제출, 로그인 등 데이터 전송)
  if (req.method === 'POST') return; 

  // 3. 백엔드 API 및 관리자/보안 파일 캐싱 절대 배제
  if (reqUrl.includes('script.google.com') || 
      reqUrl.includes('googleusercontent.com') || 
      reqUrl.includes('Admin.html')) {
    // 네트워크로 바로 통과시킵니다.
    return; 
  }

  // 4. HTML 문서 요청 처리 (Network-First, 보수적 Fallback)
  const acceptHeader = req.headers.get('accept');
  // acceptHeader가 null이 아닐 때만 includes를 호출하도록 엄격한 null-safe 처리
  const isHtmlRequest = req.mode === 'navigate' || (acceptHeader && typeof acceptHeader.includes === 'function' && acceptHeader.includes('text/html'));

  if (isHtmlRequest) {
    event.respondWith(
      fetch(req)
        .then(networkResponse => {
          // 네트워크 응답 성공 시 캐시 최신화
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, responseClone));
          }
          return networkResponse;
        })
        .catch(async () => {
          // 네트워크 실패(오프라인 등) 시 캐시 폴백 (보수적 운영)
          console.warn('[Service Worker] Network failed, serving HTML from cache.');
          
          const cachedResponse = await caches.match(req);
          if (cachedResponse) return cachedResponse;
          
          // 요청한 HTML이 캐시에 없을 경우 기본 앱 화면으로 폴백
          const fallback = await caches.match('./Signature%20App.html');
          if (fallback) return fallback;
          
          // 완전히 오프라인이고 캐시도 없는 경우 에러 텍스트 응답
          return new Response("오프라인 상태이며 캐시된 화면이 없습니다. 인터넷 연결을 확인해주세요.", {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' }
          });
        })
    );
    return;
  }

  // 5. 정적 리소스(JS, CSS, 이미지 등) 요청 (Stale-While-Revalidate 전략)
  event.respondWith(
    caches.match(req).then(cachedResponse => {
      if (cachedResponse) {
        // 이미지가 캐시에 있으면 먼저 바로 보여주고, 백그라운드에서 몰래 새 이미지가 있는지 확인해서 갱신
        fetch(req).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then(cache => cache.put(req, networkResponse));
          }
        }).catch(() => {/* 오프라인 시 무시 */});
        return cachedResponse;
      }

      // 캐시에 없으면 다운로드 후 캐시에 저장
      return fetch(req).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, responseClone));
        }
        return networkResponse;
      }).catch(err => {
        console.warn('[Service Worker] Static resource fetch failed', err);
      });
    })
  );
});
