// Numbers by ear: the browser's own voice reads the numbers, so the hands stay on the buttons. No quiz cards.
// Ducking: this module only REPORTS speech starting and stopping through the hook set by setDucking(fn) (fn(true) when a clip
// or a browser utterance starts, fn(false) when it ends, is hushed or paused). How long to hold the music down is narrate.js's call.
let voice = null, on = true, last = '';
function pickVoice() {
  const vs = speechSynthesis.getVoices(); if (!vs.length) return;
  voice = vs.find(v => /Samantha|Karen|Moira|Tessa|Google US English/.test(v.name)) || vs.find(v => v.lang.startsWith('en')) || vs[0];
}
const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;
if (HAS_TTS) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }

// The number rule's gate (narrate.js sets it): guard(text, id) → false drops the line unsaid (narrate.js records why).
// Checked before the voice switch, so a silent test run (voice=0) still records what would have been said.
let guard = null;
export function setSpeechGuard(fn) { guard = typeof fn === 'function' ? fn : null; }
const blocked = (text, id = null) => { try { return !!(guard && text && guard(text, id) === false); } catch { return false; } };

let utter = null;   // the browser utterance this module started last; only its own end reports a stop
export function say(text, { interrupt = true, rate = .95, pitch = 1.1 } = {}) {
  if (blocked(text)) return;
  if (!on || !HAS_TTS || !text || text === last) return; last = text; setTimeout(() => { if (last === text) last = ''; }, 4000);
  if (interrupt) speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text); if (voice) u.voice = voice; u.rate = rate; u.pitch = pitch;
  u.onstart = () => { if (utter === u) duck?.(true); };
  u.onend = u.onerror = () => { if (utter !== u) return; utter = null; if (!current) duck?.(false); };
  utter = u; speechSynthesis.speak(u);
}
export function setVoiceOn(v) { on = v; if (!v) hush(); }
export function voiceOn() { return on; }

// "one million two hundred thousand" the way a kid hears it: short, with the unit
export function numberWords(n) {
  if (n >= 1e12) return `${trim(n / 1e12)} trillion`; if (n >= 1e9) return `${trim(n / 1e9)} billion`; if (n >= 1e6) return `${trim(n / 1e6)} million`; if (n >= 1e3) return `${trim(n / 1e3)} thousand`;
  return String(Math.round(n));
}
const trim = x => { const r = Math.round(x * 10) / 10; return Number.isInteger(r) ? String(r) : String(r); };

// Pre-rendered clips (web/audio/, Kokoro narrator + Chatterbox villain, see web/audio/README.md). Falls back to the browser voice.
const clips = {}; let current = null; let duck = null; let paused = null;
export function setDucking(fn) { duck = fn; }
export function play(id, fallbackText = '', { interrupt = true, volume = 1 } = {}) {
  if (blocked(fallbackText, id)) return;   // the clip's text breaks the number rule: its mp3 would say it too
  if (!on) return; if (interrupt && current) { current.pause(); current = null; if (HAS_TTS) { utter = null; speechSynthesis.cancel(); } }
  if (interrupt) paused = null;   // a queued line (the narrator reading the Paused card) leaves a paused story clip waiting for resumeVoice
  const a = clipEl(id); a._used = performance.now();
  a.volume = volume; a.currentTime = 0; current = a; duck?.(true);
  a.onended = () => { if (current !== a) return; current = null; if (!utter) duck?.(false); };
  a.play().catch(() => { if (current !== a) return; current = null; duck?.(false); if (fallbackText) { last = ''; say(fallbackText, { interrupt }); } });   // hushed or replaced meanwhile: no fallback voice
}
// stop whatever is talking now (a skipped prologue must go quiet). keepPaused: stop only what plays, keep a paused story clip
// for resumeVoice (narrate.js stopping its own line when the Paused card closes).
export function hush({ keepPaused = false } = {}) { utter = null; if (!keepPaused) paused = null; if (HAS_TTS) speechSynthesis.cancel(); if (current) { current.pause(); current = null; } duck?.(false); }
export function preload(ids) { for (const id of ids) if (!clips[id]) { const a = clips[id] = new Audio(`audio/${id}.mp3`); a.preload = 'auto'; a._id = id; } }

// iPad: iOS lets an <audio> element start by itself only once it has played inside a tap, and the story's clips start on
// timers. unlock() (main.js calls it on every tap) plays and at once pauses each clip element not yet unlocked, plus a few
// spares. A clip first asked for after that takes a spare, or the least recently used unlocked element, by swapping its src:
// an element stays unlocked across a new src. The first unlock also speaks an empty line, which unlocks the browser voice.
const unlockedEls = new Set(), spares = []; let gestured = false;
function wake(a) { try { const p = a.play(); a.pause(); p?.catch?.(() => {}); unlockedEls.add(a); } catch {} }
export function unlock() {
  if (!gestured) { gestured = true; for (let i = 0; i < 6; i++) { const a = new Audio('audio/go.mp3'); a.preload = 'none'; spares.push(a); wake(a); }
    if (HAS_TTS && on) { try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch {} } }
  for (const a of Object.values(clips)) if (!unlockedEls.has(a) && a.paused && a !== current && a !== paused) wake(a);
}
export function unlocked() { return gestured; }
function clipEl(id) {
  let a = clips[id]; if (a) return a;
  if (gestured) { a = spares.pop();
    if (!a) { let best = null; for (const el of unlockedEls) if (el !== current && el !== paused && el._id && (!best || (el._used || 0) < (best._used || 0))) best = el;
      if (best) { delete clips[best._id]; a = best; } } }
  if (a) { a.preload = 'auto'; a.src = `audio/${id}.mp3`; } else { a = new Audio(`audio/${id}.mp3`); a.preload = 'auto'; }
  a._id = id; clips[id] = a; return a;
}

// Pause and resume the voice where it is (the menu during a cinematic). Pausing reports a stop, resuming a start.
let ttsPaused = false;
export function pauseVoice() {
  let any = false;
  if (current && !current.paused) { current.pause(); paused = current; any = true; }
  if (HAS_TTS && utter && speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); ttsPaused = true; any = true; }
  if (any) duck?.(false);
  return any;
}
export function resumeVoice() {
  if (!on) { paused = null; ttsPaused = false; return false; }
  let any = false;
  if (paused) { const a = paused; paused = null; any = true; if (current && current !== a) current.pause(); current = a; a.play().catch(() => { if (current !== a) return; current = null; if (!utter) duck?.(false); }); }   // keeps its currentTime
  paused = null;
  if (ttsPaused && HAS_TTS) { ttsPaused = false; speechSynthesis.resume(); any = true; }
  if (any) duck?.(true);
  return any;
}

// Clip lengths in seconds, from web/audio/render/durations.json (write it with web/audio/render/durations.py). Fetched once;
// null until it has loaded, and null for an id it does not list.
let lengths = null;
if (typeof fetch === 'function') fetch(new URL('../audio/render/durations.json', import.meta.url)).then(r => r.ok ? r.json() : null).then(j => { if (j && typeof j === 'object') lengths = j; }).catch(() => {});
export function clipLength(id) { const s = lengths?.[id]; return typeof s === 'number' ? s : null; }
