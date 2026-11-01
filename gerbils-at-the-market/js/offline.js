// offline.js: registers the offline worker (web/sw.js) and shows a small chip while it saves the game:
// "Saving for offline… 120 of 640", then "Ready to play offline ✓" for a few seconds (docs/OFFLINE.md).
// Its own module script, not imported by main.js, so the game failing to start never stops the saving (and vice versa).
// Only on https or localhost (a service worker needs a secure page). window.__offline holds the last state, for tests.
const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
window.__offline = { state: 'off', done: 0, total: 0 };
if ('serviceWorker' in navigator && secure) start();

function chip() {
  let el = document.getElementById('offlineChip'); if (el) return el;
  el = document.createElement('div'); el.id = 'offlineChip'; el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
  el.style.cssText = 'position:fixed;left:calc(10px + env(safe-area-inset-left,0px));top:calc(10px + env(safe-area-inset-top,0px));z-index:50;'
    + 'font:600 13px/1.2 Fredoka,-apple-system,system-ui,sans-serif;color:#2b2418;background:rgba(255,248,231,.92);border:2px solid #e2d4b2;'
    + 'border-radius:999px;padding:5px 11px;pointer-events:none;transition:opacity .6s ease;opacity:0';
  document.body.appendChild(el); return el;
}
let hideT = 0, readyShown = false;
function show(text, ms = 0) {
  const el = chip(); el.textContent = text; el.style.opacity = '1'; clearTimeout(hideT);
  if (ms) hideT = setTimeout(() => { el.style.opacity = '0'; }, ms);
}
function update(m) {
  if (!m || (m.type !== 'offline-status' && m.type !== 'offline-progress')) return;
  const O = window.__offline; O.done = m.done; O.total = m.total; O.version = m.version;
  if (m.total && m.done >= m.total) { O.state = 'ready'; if (!readyShown) { readyShown = true; show('Ready to play offline ✓', 4000); } }
  else if (m.failed) { O.state = 'retry'; show('Saving for offline paused · open again on Wi-Fi', 6000); }
  else if (m.total) { O.state = 'saving'; readyShown = false; show(`Saving for offline… ${m.done} of ${m.total}`); }
}

async function start() {
  navigator.serviceWorker.addEventListener('message', e => update(e.data));
  let reg; try { reg = await navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }); } catch (e) { console.warn('offline: no service worker', e); return; }
  navigator.storage?.persist?.().catch(() => {});   // ask the browser not to evict the saved game under storage pressure
  // Ask the running worker how much is saved, until all of it is. While a new version installs, its progress messages
  // arrive on their own; the active worker's answer covers a launch after the saving finished.
  const ask = () => { const w = reg.installing || reg.waiting ? null : reg.active; w?.postMessage({ type: 'offline-status' }); };
  ask(); const iv = setInterval(() => { if (window.__offline.state === 'ready' && !reg.installing && !reg.waiting) { clearInterval(iv); return; } ask(); }, 1500);
  navigator.serviceWorker.addEventListener('controllerchange', ask);
}
