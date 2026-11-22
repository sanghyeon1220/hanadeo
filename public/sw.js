// 하나더 서비스 워커 — 앱 화면을 기기에 저장해 두고, 인터넷이 끊겨도 앱이 열리게 합니다.
// 상품·거래 데이터(Supabase)는 항상 네트워크로만 가져오고 저장하지 않습니다.
const VERSION = 'hanadeo-v3'
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // 화면 이동: 네트워크 우선, 끊기면 저장해 둔 앱 화면
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put('/index.html', copy)); return res })
        .catch(() => caches.match('/index.html'))
    )
    return
  }

  // 빌드된 JS·CSS·아이콘: 저장본 우선 (파일 이름에 해시가 있어 바뀌면 새로 받음)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)) }
        return res
      }))
    )
    return
  }

  // 구글 글꼴: 저장본을 먼저 쓰고 뒤에서 갱신
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => { caches.open(VERSION).then(c => c.put(req, res.clone())); return res }).catch(() => hit)
        return hit || net
      })
    )
  }
  // 그 밖(Supabase 등)은 서비스 워커가 관여하지 않음
})
