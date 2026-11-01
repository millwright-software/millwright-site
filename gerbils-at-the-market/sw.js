// sw.js: the offline worker (docs/OFFLINE.md). It saves every file in precache.json into one versioned cache, then answers
// the game from that cache, so the home-screen app runs with no network at all (an iPad on a plane).
// VERSION is stamped by tools/build-offline.mjs: a new list means a new sw.js, which is what makes the browser install it.
const VERSION = 'e45f54a402af';
const PREFIX = 'gerbil-market-';
const CACHE = PREFIX + VERSION;
const BATCH = 24;
const BASE = new URL('./', self.location).href;   // the game's folder (the worker's scope)

// ---------- install: save every file, in batches, each failure retried once ----------
async function post(msg) { for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage(msg); }
const fresh = url => new Request(url, { cache: 'reload' });   // past the HTTP cache: GitHub Pages serves max-age=600
// A redirected response can't answer a navigation in Safari; store a clean copy of the body instead.
async function storable(res) { return res.redirected ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers }) : res; }
async function addOne(cache, url) { const res = await fetch(fresh(url)); if (!res.ok) throw new Error(`${res.status} ${url}`); await cache.put(url, await storable(res)); }

async function precache() {
  const list = await (await fetch(fresh(BASE + 'precache.json'))).json();
  const urls = list.files.map(f => new URL(f, BASE).href); const total = urls.length;
  const cache = await caches.open(CACHE);
  await cache.put(BASE + 'precache.json', new Response(JSON.stringify(list), { headers: { 'Content-Type': 'application/json' } }));   // for status()
  const have = new Set((await cache.keys()).map(r => r.url));   // a retried install keeps what the last attempt saved
  let done = urls.filter(u => have.has(u)).length; const todo = urls.filter(u => !have.has(u)); const failed = [];
  post({ type: 'offline-progress', done, total, version: VERSION });
  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    try { await cache.addAll(batch.map(fresh)); done += batch.length; }
    catch {   // addAll is all-or-nothing: save this batch one by one so one bad file doesn't sink the rest
      for (const u of batch) { try { await addOne(cache, u); done++; } catch { failed.push(u); } }
    }
    post({ type: 'offline-progress', done, total, version: VERSION });
  }
  for (const u of failed.splice(0)) { try { await addOne(cache, u); done++; } catch (e) { failed.push(u); } }   // the one retry
  post({ type: 'offline-progress', done, total, version: VERSION, failed: failed.length });
  // Anything still missing fails the install: the old worker (if any) keeps running and the next launch tries again,
  // picking up where this one stopped.
  if (failed.length) throw new Error(`offline: ${failed.length} files failed: ${failed.slice(0, 5).join(', ')}`);
}

self.addEventListener('install', e => { e.waitUntil(precache().then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
    post({ type: 'offline-activated', version: VERSION });
  })());
});
// the page asks how much of the list is saved (js/offline.js): n of N for this worker's version
async function status() {
  const cache = await caches.open(CACHE), saved = await cache.match(BASE + 'precache.json');
  if (!saved) return { type: 'offline-status', done: 0, total: 0, version: VERSION };
  const urls = (await saved.json()).files.map(f => new URL(f, BASE).href), have = new Set((await cache.keys()).map(r => r.url));
  return { type: 'offline-status', done: urls.filter(u => have.has(u)).length, total: urls.length, version: VERSION };
}
self.addEventListener('message', e => { if (e.data?.type === 'offline-status') e.waitUntil(status().then(s => e.source?.postMessage(s))); });

// ---------- fetch: cache first, then the network (and keep what it brings) ----------
const TYPES = { mp3: 'audio/mpeg', wav: 'audio/wav', json: 'application/json', js: 'text/javascript', html: 'text/html; charset=utf-8', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', glb: 'model/gltf-binary', woff2: 'font/woff2', webmanifest: 'application/manifest+json' };
const typeOf = (url, res) => res?.headers.get('Content-Type') || TYPES[new URL(url).pathname.split('.').pop().toLowerCase()] || 'application/octet-stream';

async function lookup(req) {
  const cache = await caches.open(CACHE); const url = new URL(req.url);
  let key = url.href; if (url.pathname.endsWith('/')) key = url.origin + url.pathname;   // ./?player=alex is ./
  // the game reads query params (?player=, ?touch=1): documents and json match whatever the query
  return (await cache.match(key, { ignoreVary: true })) || (await cache.match(key, { ignoreSearch: true, ignoreVary: true }))
    || (url.pathname.endsWith('/') ? await cache.match(url.origin + url.pathname + 'index.html', { ignoreSearch: true, ignoreVary: true }) : null)
    || (await caches.match(req, { ignoreSearch: true, ignoreVary: true }));   // any older cache still around
}

// iOS Safari plays <audio> through Range requests and won't play a plain 200 from a worker: cut a real 206 from the blob.
async function partial(req, res) {
  const blob = await res.blob(), size = blob.size, type = typeOf(req.url, res);
  const m = /^bytes=(\d*)-(\d*)$/.exec((req.headers.get('Range') || '').trim());
  let start, end;
  if (!m || (m[1] === '' && m[2] === '')) { start = 0; end = size - 1; }
  else if (m[1] === '') { start = Math.max(0, size - Number(m[2])); end = size - 1; }   // bytes=-500: the last 500
  else { start = Number(m[1]); end = m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1); }
  if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}`, 'Accept-Ranges': 'bytes' } });
  return new Response(blob.slice(start, end + 1, type), { status: 206, statusText: 'Partial Content', headers: {
    'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' } });
}

async function keep(req, res) {
  if (!res || res.status !== 200 || res.type !== 'basic') return;
  const cache = await caches.open(CACHE); const url = new URL(req.url);
  await cache.put(url.pathname.endsWith('/') ? url.origin + url.pathname : req.url, await storable(res));
}

async function respond(e) {
  const req = e.request, range = req.headers.has('Range');
  const hit = await lookup(req);
  if (hit) return range ? partial(req, hit) : hit;
  try {
    if (range) {   // not saved yet: let the network answer this range, and save the whole file for next time
      e.waitUntil(fetch(req.url).then(r => keep(new Request(req.url), r)).catch(() => {}));
      return await fetch(req);
    }
    const res = await fetch(req); e.waitUntil(keep(req, res.clone()).catch(() => {})); return res;
  } catch (err) {
    if (req.mode === 'navigate') { const doc = await caches.match(BASE + 'index.html', { ignoreSearch: true, ignoreVary: true }) || await caches.match(BASE, { ignoreSearch: true, ignoreVary: true }); if (doc) return doc; }
    return new Response('', { status: 504, statusText: 'Offline and not saved' });
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(BASE)) return;   // only the game's own files; anything else goes straight out
  if (new URL(req.url).pathname.endsWith('/sw.js')) return;
  e.respondWith(respond(e));
});
