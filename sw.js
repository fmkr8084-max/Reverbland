const VERSION = 'reverbland-v4';
const LAME = 'https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/style.css',
  'js/db.js', 'js/meta.js', 'js/audio.js', 'js/ambient.js', 'js/core.js', 'js/ui.js',
  'data/fa.json', 'data/en.json', 'data/effects.json', 'data/playlists-default.json', 'data/about.json',
  'fonts/Vazir-Regular.ttf', 'fonts/Vazir-Medium.ttf', 'fonts/Vazir-Bold.ttf',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png', 'icons/logo-96.png',
  'img/empty-hero.webp', 'audio/rain.mp3', 'audio/fire.mp3'
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.url === LAME) {
    e.respondWith(caches.open(VERSION).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => { if (res && res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
    if (hit) { e.waitUntil(net); return hit; }
    const res = await net;
    if (res) return res;
    if (req.mode === 'navigate') return c.match('index.html');
    return new Response('', { status: 504 });
  }));
});
