// Deep Tide offline (M9 part 6). Network first: online, every load fetches the files as it always did, so a push to main
// shows on the next load and no version number has to be bumped. Each file that arrives is kept, and the copy answers only
// when the network does not (offline, or the site unreachable). Same origin only; every path is relative, because GitHub
// Pages serves the game under /deep-tide/.
const CACHE = 'deep-tide'; // one cache; change the name only if what is kept in it changes shape
const CORE = ['./', 'index.html', 'sim.js', 'deep.js', 'sprites.js', 'scene.js', 'boats.js', 'deepview.js', 'render.js', 'coach.js',
  'audio.js', 'ui.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache, so the first copy is the current one
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  // only our own old caches: every GitHub Pages repo of the account shares one origin, and so one Cache Storage
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('deep-tide') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  // the page is kept once, whatever its ?seed=: an ocean link opened offline gets the page, which reads the seed itself
  const nav = req.mode === 'navigate', key = nav ? new URL('./', self.registration.scope).href : req;
  e.respondWith(fetch(req).then(res => {
    if (res.ok && (!nav || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'))) {
      const copy = res.clone(); e.waitUntil(caches.open(CACHE).then(c => c.put(key, copy)));
    }
    return res;
  }).catch(() => caches.match(key, { ignoreSearch: true }).then(m => m || Response.error())));
});
