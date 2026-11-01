// narrate.js — the read-aloud layer. One of the players is 5 and can't read, so every card, toast and instruction is spoken.
//
//   narrate(text, { id, interrupt = true, stale })   speak any text or HTML (id: play that exact clip instead of the lookup;
//                                              stale: ms after which a still-queued line is dropped unsaid)
//   narrateCard(title, bodyHTML, choices)      the card: title, body, then "You can pick: a, or b."
//   narrateToast(text, sub)                    a toast and its small line
//   narrateHint(html, key = html)              the instruction bar: spoken once per key (the mode) per session, minus
//                                              any sentence the goal line already says
//   narrateGoal(text)                          the goal line: spoken only when the goal changes (never the same text twice
//                                              in a row); waits out the 2.5 s gap
//   noteHeard(text)                            a game clip said this (the prologue's call): a goal or toast that repeats it is not spoken
//   watchCard(bodyEl, choicesEl)               speak what fight.js / approach.js append to an open card (the answer, the Go! button)
//   stopNarration()                            drop the queue and stop our own clip (never a story clip)
//   setNarration(on), narrationOn()            the toggle (remembered in localStorage)
//   setDucking(fn)                             use this instead of speech.js's setDucking: narrate listens on the same hook
//   narrationMisses()                          sentences that had no clip this session (feed them to collect_cards.mjs)
//   numberRuleOK(text)                         the number rule (C7): true when the spoken words keep it
//   narrationViolations()                      every line dropped for breaking it this session: [{ text, why, from, id }]
//
// THE NUMBER RULE (Round 3, docs/LESSON-PLAN.md): the voice never says a number above ten, except "twenty dollars", "sixty
// dollars", "fifteen" (the bags) and "zero dollars"; never hundred, thousand, million, billion or trillion; never a year.
// Fraction and ratio words are fine (half, quarter, one and a half, twice, almost three times). Every sentence is checked
// after speakableText, wherever it comes from (a card, a toast, the bar, the goal, narrate(), and speech.js say() and
// play(id, text) through setSpeechGuard); a sentence that breaks it is dropped unsaid and recorded. Anything with class
// "grownups" is never spoken at all, and a card choice with silent:true is never read in "You can pick".
//
// Text is cut into short sentences. Each sentence is looked up by a hash of its normalized text, c_<8 hex>, in
// audio/render/cards.json (Kokoro af_heart clips, rendered offline by audio/render/collect_cards.mjs). A sentence with a
// clip plays through speech.js play(); one without falls back to the browser voice. One thing talks at a time: a clip the
// game is already playing (the prologue, the giant, a boss name) is waited out, never talked over.
//
// The text functions at the top touch no browser API, so the collector imports this file in Node to get the same keys.
import { play, hush, voiceOn, setDucking as speechSetDucking, setSpeechGuard } from './speech.js';

// ---------- numbers as words ----------
const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
// (verify) intWords/SCALES only turn digits into words so the number rule can see them: numberRuleWhy() drops any sentence that then
// holds a big number word, unsaid. That filter is the only gate; never call intWords to say a figure aloud.
const SCALES = [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand']];
function under1000(n) {
  const h = Math.floor(n / 100), r = n % 100; const parts = [];
  if (h) parts.push(`${ONES[h]} hundred`);
  if (r) parts.push((h ? 'and ' : '') + (r < 20 ? ONES[r] : TENS[Math.floor(r / 10)] + (r % 10 ? '-' + ONES[r % 10] : '')));
  return parts.join(' ');
}
export function intWords(n) {
  n = Math.round(n); if (n === 0) return 'zero'; if (n < 0) return 'minus ' + intWords(-n);
  const parts = []; let rest = n;
  for (const [v, w] of SCALES) if (rest >= v) { parts.push(`${intWords(Math.floor(rest / v))} ${w}`); rest %= v; }
  if (rest) parts.push((parts.length && rest < 100 ? 'and ' : '') + under1000(rest));
  return parts.join(' ');
}
function yearWords(y) {   // 2018 → twenty eighteen, 2007 → two thousand seven, 1999 → nineteen ninety-nine
  if (y >= 2000 && y < 2010) return 'two thousand' + (y % 10 ? ' ' + ONES[y % 10] : '');
  const a = Math.floor(y / 100), b = y % 100; return `${intWords(a)} ${b === 0 ? 'hundred' : b < 10 ? 'oh ' + ONES[b] : intWords(b)}`;
}
function numWords(raw) {   // "2,304" "6.5" "0.0002" "15"
  const s = raw.replace(/,/g, ''); const v = Number(s); if (!isFinite(v)) return raw;
  if (!s.includes('.')) return intWords(v);
  if (v > 0 && v < .01) return 'almost zero';
  const [i, d] = s.split('.');
  if (/^50*$/.test(d) && Number(i) < 20) return Number(i) === 0 ? 'a half' : `${intWords(Number(i))} and a half`;
  return `${intWords(Number(i))} point ${[...d.replace(/0+$/, '')].map(c => ONES[+c]).join(' ')}`;
}

// ---------- HTML → short spoken sentences ----------
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–', rarr: '→', times: '×', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”' };
const decode = s => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e.toLowerCase()] ?? m);
const SCALE_RE = '(?:\\s+(thousand|million|billion|trillion))?';

// HTML or plain text → one plain string, with "·", <br>, </p>, table rows etc. as sentence breaks
// drop every element whose class list holds `cls`, nested content and same-tag children included
function stripClass(s, cls) {
  const open = new RegExp(`<([a-z][a-z0-9]*)\\b[^>]*\\bclass\\s*=\\s*(["'])(?:(?!\\2).)*\\b${cls}\\b(?:(?!\\2).)*\\2[^>]*>`, 'i');
  for (let guard = 0; guard < 50; guard++) {
    const m = open.exec(s); if (!m) return s;
    const tag = m[1].toLowerCase(), start = m.index; let i = start + m[0].length, depth = 1;
    if (/\/>$/.test(m[0]) || /^(br|img|hr|input|meta|link)$/.test(tag)) { s = s.slice(0, start) + s.slice(i); continue; }
    const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'gi'); re.lastIndex = i; let t;
    while (depth && (t = re.exec(s))) { depth += t[1] ? -1 : 1; i = re.lastIndex; }
    s = s.slice(0, start) + (depth ? '' : s.slice(i));   // unclosed: drop the rest
  }
  return s;
}
export function speakableText(html, { touch = false } = {}) {
  let s = stripClass(String(html ?? ''), 'grownups');   // the grown-ups' figures are shown (collapsed), never spoken
  s = s.replace(new RegExp(`<span\\b[^>]*class="[^"]*\\b${touch ? 'mouseOnly' : 'touchOnly'}\\b[^"]*"[^>]*>[\\s\\S]*?</span>`, 'gi'), '');   // the other device's words
  s = s.replace(/<a\b[^>]*>[\s\S]*?<\/a>/gi, '');                                                                   // source links
  s = s.replace(/<(p|div|span|small)\b[^>]*class="[^"]*\b(foot|byline)\b[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '');        // footnotes, quote bylines
  s = s.replace(/<tr>(\s*<th\b[\s\S]*?<\/th>\s*)+<\/tr>/gi, '');                                                   // table header rows
  s = s.replace(/<\/t[dh]>/gi, ', ').replace(/<\/tr>|<br\s*\/?>|<\/(p|li|div|h\d|ul|ol|table)>|<li\b[^>]*>/gi, ' ¶ ');
  s = decode(s.replace(/<[^>]+>/g, ''));
  s = s.replace(/Every number has a source:?/gi, '');
  s = s.replace(/\s*[·•|]\s*/g, ' ¶ ').replace(/\s*[—–]\s*/g, ', ').replace(/…/g, '.');
  s = s.replace(/[“”"]/g, '').replace(/[‘’]/g, "'");
  s = s.replace(/[←-⇿☀-➿⬀-⯿■-◿✓✔️]|[\u{1f300}-\u{1faff}]/gu, '');
  s = s.replace(/\b(Mr|Ms|Mrs|Dr)\.\s/g, (m, t) => ({ Mr: 'Mister ', Ms: 'Miss ', Mrs: 'Missus ', Dr: 'Doctor ' })[t]);
  s = s.replace(/×\s*(\d+)/g, (m, n) => `${numWords(n)} times`).replace(/(\d+)\s*×/g, (m, n) => `${numWords(n)} times`);
  s = s.replace(new RegExp(`\\$\\s?(\\d[\\d,]*(?:\\.\\d+)?)${SCALE_RE}`, 'g'), (m, n, sc) => `${numWords(n)}${sc ? ' ' + sc : ''} dollar${n === '1' && !sc ? '' : 's'}`);
  s = s.replace(/\s=\s/g, ' is ').replace(/(\d)\s*\/\s*(\d)/g, '$1 of $2').replace(/(\d)\s*%/g, '$1 percent').replace(/\s&\s/g, ' and ');
  s = s.replace(/(\b(?:in|since|from|to|through|by|until|before|after|between|of|and|or)\s+)(1[1-9]\d\d|20\d\d)\b(?![.,]\d)/gi, (m, pre, y) => pre + yearWords(+y));
  s = s.replace(/\d[\d,]*(?:\.\d+)?/g, m => /^\d{1,3}(,\d{3})+(\.\d+)?$|^\d+(\.\d+)?$/.test(m) ? numWords(m) : m.replace(/[\d.]+/g, numWords));
  return s.replace(/\s+/g, ' ').trim();
}
const words = s => s.split(/\s+/).filter(Boolean).length;
function shorten(sent) {   // a long sentence splits at the comma nearest its middle
  if (words(sent) <= 28) return [sent];
  const marks = [...sent.matchAll(/[,;:]\s/g)].map(m => m.index); if (!marks.length) return [sent];
  const mid = sent.length / 2, at = marks.reduce((a, b) => Math.abs(b - mid) < Math.abs(a - mid) ? b : a);
  const a = sent.slice(0, at).trim() + '.', b = sent.slice(at + 1).trim();
  return [...shorten(a), ...shorten(b.charAt(0).toUpperCase() + b.slice(1))];
}
// plain text → [sentence, ...], each ending in . ! or ?
export function sentencesOf(html, opts) {
  const out = [];
  for (const block of speakableText(html, opts).split('¶')) {
    for (let s of block.split(/(?<=[.!?])\s+/)) {
      s = s.replace(/^[\s,;:.]+/, '').replace(/[\s,;:]+$/, '').replace(/[,;:]\s*([.!?])/g, '$1').replace(/([.!?])\s*\.+/g, '$1').trim();
      if (!/[a-z]/i.test(s)) continue;
      if (!/[.!?]$/.test(s)) s += '.';
      s = s.charAt(0).toUpperCase() + s.slice(1);
      out.push(...shorten(s));
    }
  }
  return out;
}
// a button's words as part of a list: first line only, no end mark, lower-case unless it starts with a name
function choiceWords(label) {
  let s = speakableText(String(label ?? '').split(/<br\s*\/?>/i)[0]).replace(/¶/g, ' ').replace(/[.!?]+$/, '').trim();
  if (!s) return '';
  const w = s.split(' '); const isName = w.length > 1 && /^[A-Z]/.test(w[1]) && !/^(A|An|The|Free|Back|Go|Open|Watch|Play|See|Next|Not|Give|Get|Look|Yes|No|True|Trick|Keep|Try|Start|Skip|Buy)$/.test(w[0]) || /^(I|I'm)$/.test(w[0]);
  return isName ? s : s.charAt(0).toLowerCase() + s.slice(1);
}
export function choicesSentence(choices) {
  const ws = (choices || []).filter(c => !c?.silent).map(c => choiceWords(typeof c === 'string' ? c : c?.label)).filter(Boolean);
  if (!ws.length) return '';
  return ws.length === 1 ? `Press: ${ws[0]}.` : `You can pick: ${ws.join(', or ')}.`;
}
export function cardSentences(title, bodyHTML, choices, touch = false) {
  const s = [...sentencesOf(title), ...sentencesOf(bodyHTML, { touch })]; const c = choicesSentence(choices); if (c) s.push(c); return s;
}
export const toastSentences = (text, sub) => [...sentencesOf(text), ...sentencesOf(sub)];
export const hintSentences = (html, touch = false) => sentencesOf(html, { touch });

// ---------- the number rule ----------
const BIG_RE = /\b(hundreds?|thousands?|millions?|billions?|trillions?|zillions?|gazillions?)\b/i;
const TEEN_RE = /\b(eleven|twelve|thirteen|fourteen|sixteen|seventeen|eighteen|nineteen)(th)?\b/i;
const TENS_RE = /\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(-[a-z]+)?\b(\s+dollars?\b)?/gi;
// why a sentence breaks the rule, or '' when it keeps it (works on HTML, digits or words: it reads them as speakableText does)
export function numberRuleWhy(text) {
  const s = speakableText(text).replace(/¶/g, ' ');
  let m;
  if ((m = BIG_RE.exec(s))) return `says "${m[1]}"`;
  if ((m = TEEN_RE.exec(s))) return `says "${m[0]}"`;
  TENS_RE.lastIndex = 0;
  while ((m = TENS_RE.exec(s))) { const w = m[1].toLowerCase(); if (m[2] || !m[3] || (w !== 'twenty' && w !== 'sixty')) return `says "${m[0].trim()}"`; }
  if ((m = /\d+/.exec(s)) && Number(m[0]) > 10 && Number(m[0]) !== 15) return `says "${m[0]}"`;
  return '';
}
export const numberRuleOK = text => !numberRuleWhy(text);
const violations = [], violationSeen = new Set();
// record one dropped line (and log it on ?dbg); the same text is listed once
function violation(text, why, from, id = null) {
  const k = from + '|' + text; if (violationSeen.has(k)) return; violationSeen.add(k);
  violations.push({ text: String(text), why, from, id, at: Math.round(HAS_WIN_EARLY() && typeof performance !== 'undefined' ? performance.now() : 0) });
  if (HAS_WIN_EARLY() && /(^|[?&])dbg=/.test(location.search)) console.warn('[number rule] dropped', from, id || '', JSON.stringify(String(text)), why);
}
export const narrationViolations = () => violations.slice();
// keep only the sentences that keep the rule; record the rest
function ruleFilter(sentences, from, id = null) { return sentences.filter(s => { const why = numberRuleWhy(s); if (why) violation(s, why, from, id); return !why; }); }
// speech.js's say() and play(id, text) ask this before they speak (the story clips, the boss lines, anything not narrated here)
setSpeechGuard?.((text, id = null) => { if (!text) return true; const why = numberRuleWhy(text); if (why) violation(text, why, id ? 'play' : 'say', id); return !why; });

// the clip key: FNV-1a over the sentence, lower-cased, spaces collapsed
export function clipKey(sentence) {
  const s = String(sentence).toLowerCase().replace(/\s+/g, ' ').trim(); let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'c_' + h.toString(16).padStart(8, '0');
}

// ---------- the player: one voice at a time ----------
const HAS_WIN = typeof window !== 'undefined' && typeof document !== 'undefined';
const HAS_TTS = HAS_WIN && 'speechSynthesis' in window;
const RATE = .95, DEDUPE_MS = 4000, STALE_MS = 12000;
// The pacing rules (Eric, 10/31: "follow the arrows up the road, follow the arrows up the road"):
//   one goal is spoken once, when it changes; hints once per mode per session; a sentence the goal (or a clip just played)
//   already says is dropped; ambient lines (goal, hint, plain toasts) keep GAP_MS from the last line; nothing follows a
//   story clip (the prologue, a beat, a boss name) for AFTER_CLIP_MS. Cards and the player's own results are not held.
const GAP_MS = 2500, AFTER_CLIP_MS = 1500;
const DBG = HAS_WIN_EARLY() && /(^|[?&])dbg=voice\b/.test(location.search);
function HAS_WIN_EARLY() { return typeof window !== 'undefined' && typeof location !== 'undefined'; }
const log = (...a) => { if (DBG) console.log('[voice]', ...a); };
// the toggle is remembered; a test page (test-*.html) keeps its own key so switching it off there never mutes the game
const NARRATE_KEY = HAS_WIN_EARLY() && /\/test-[^/]*$/.test(location.pathname) ? 'gatm-narrate-test' : 'gatm-narrate';
let enabled = true; try { enabled = localStorage.getItem(NARRATE_KEY) !== 'off'; } catch {}
let clips = null; const ready = HAS_WIN ? fetch(new URL('../audio/render/cards.json', import.meta.url)).then(r => r.ok ? r.json() : {}).then(m => { clips = new Set(Object.keys(m)); }).catch(() => { clips = new Set(); }) : Promise.resolve();
const misses = new Map();
let queue = [], pumpT = null, lastSaid = new Map(), lastHint = null, hintsSaid = new Set(), wasBusy = false, freeAt = 0;
let dryUntil = 0, lastLineAt = -1e9, lastGroup = 0, groupN = 0, quietUntil = 0, goalSaid = '', goalNow = '', heard = [];   // heard: [{ words, at }] from noteHeard
// what is talking: speech.js tells us through the ducking hook (true when a clip starts, false when it ends or is hushed)
let downstreamDuck = null, speechBusy = false, busyUntil = 0, expectMine = false, mineClip = false, myUtter = null;
// The music duck (sfx) is held here, not per clip: down when the queue fills or anything starts talking, back up only
// UNDUCK_MS after the queue is empty and nothing talks, so it doesn't pump between sentences.
const UNDUCK_MS = 500; let ducked = false, unduckT = null;
function wantDuck() { return queue.length > 0 || speechBusy || !!myUtter || ttsBusy(); }
function updateDuck() {
  if (!HAS_WIN) return;
  if (wantDuck()) { clearTimeout(unduckT); unduckT = null; if (!ducked) { ducked = true; downstreamDuck?.(true); } return; }
  if (ducked && !unduckT) unduckT = setTimeout(() => { unduckT = null; if (wantDuck()) { updateDuck(); return; } ducked = false; downstreamDuck?.(false); }, UNDUCK_MS);
}
function onDuck(on) {
  if (on) { speechBusy = true; if (expectMine) { expectMine = false; mineClip = true; } else { mineClip = false; busyUntil = performance.now() + 20000; } }
  else { if (!mineClip && speechBusy) quietUntil = performance.now() + AFTER_CLIP_MS; speechBusy = false; mineClip = false; lastLineAt = performance.now(); schedule(60); }
  updateDuck();
}
if (HAS_WIN) speechSetDucking(onDuck);
export function setDucking(fn) { downstreamDuck = fn; speechSetDucking(onDuck); }

let voice = null;
function pickVoice() {
  const vs = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); if (!vs.length) return;
  const rank = v => /Samantha/.test(v.name) && /Enhanced|Premium/.test(v.name) ? 0 : /Natural|Enhanced|Premium|Neural/.test(v.name) && /en[-_]US/i.test(v.lang) ? 1 : /Samantha/.test(v.name) ? 2 : /Google US English/.test(v.name) ? 3
    : /Natural|Enhanced|Premium|Neural/.test(v.name) ? 4 : /en[-_]US/i.test(v.lang) ? 5 : 6;
  voice = vs.slice().sort((a, b) => rank(a) - rank(b))[0];
}
if (HAS_TTS) { pickVoice(); speechSynthesis.addEventListener?.('voiceschanged', pickVoice); }

const ttsBusy = () => HAS_TTS && (speechSynthesis.speaking || speechSynthesis.pending);
function busy() {
  if (myUtter || performance.now() < dryUntil) return true;
  if (speechBusy && performance.now() < busyUntil) return true;
  if (ttsBusy()) { quietUntil = performance.now() + AFTER_CLIP_MS; return true; }   // the game's own say(): wait it out, then the after-clip hush
  return performance.now() < quietUntil;
}
function schedule(ms = 120) { if (!pumpT && queue.length) pumpT = setTimeout(pump, ms); }
async function pump() {
  pumpT = null; if (!clips) await ready;
  if (!enabled || !voiceOn() && !(DBG && !voiceOn())) { queue = []; return; }
  if (busy()) { wasBusy = true; schedule(150); updateDuck(); return; }
  const now = performance.now(); if (wasBusy) { wasBusy = false; freeAt = now; }
  // stale counts from when the line could first have been said: a goal queued behind a boss-name clip isn't dropped for waiting
  let it; while ((it = queue.shift()) && it.stale && Math.max(it.at, freeAt) + it.stale < now) log('dropped (stale):', it.text);
  if (!it) { updateDuck(); return; }
  if (it.ambient && it.group !== lastGroup && now - lastLineAt < GAP_MS) { queue.unshift(it); schedule(GAP_MS - (now - lastLineAt) + 20); return; }   // the 2.5 s gap
  if (it.goal && it.goal !== goalNow) { log('dropped (goal changed before it was said):', it.text); schedule(30); return; }
  if (it.hint) { const why = repeats(it.text); if (why) { log(`dropped hint sentence (${why}):`, it.text); schedule(30); return; } }   // checked now: the goal may have appeared since
  const dry = DBG && !voiceOn();   // ?dbg=voice&voice=0: the pacing runs and logs, nothing is played
  for (const q of queue) if (q.group === it.group) q.at = now;   // F: a group once started is finished (the bar's three sentences), never cut as stale halfway
  lastLineAt = now + 900 + it.text.length * 60; lastGroup = it.group; log(dry ? 'say (muted):' : 'say:', it.text, it.ambient ? '(ambient)' : '');
  const est = 900 + it.text.length * 75;   // a cap, in case an end event never comes
  if (dry) { if (!it.id && !clips.has(it.key)) { misses.set(it.text, (misses.get(it.text) || 0) + 1); log('  (no clip: browser voice)'); }   // F: the dry run lists the lines with no clip too
    dryUntil = now + est; lastLineAt = now + est; schedule(est + 20); return; }
  if (it.id || clips.has(it.key)) {
    expectMine = true; speechBusy = true; busyUntil = now + est * 2 + 2000;
    play(it.id || it.key, it.text, { interrupt: false });
    setTimeout(() => { if (expectMine) { expectMine = false; busyUntil = now + est; } }, 400);   // no word from the hook (main.js kept speech.js's setDucking): time it by length
  } else {
    misses.set(it.text, (misses.get(it.text) || 0) + 1);
    if (HAS_TTS) {
      const u = new SpeechSynthesisUtterance(it.text); if (voice) u.voice = voice; u.lang = voice?.lang || 'en-US'; u.rate = RATE; u.pitch = 1.05;
      myUtter = u; const done = () => { if (myUtter === u) { myUtter = null; schedule(80); } };
      u.onend = u.onerror = () => { lastLineAt = performance.now(); done(); updateDuck(); }; setTimeout(() => { done(); updateDuck(); }, est * 2 + 2000); speechSynthesis.speak(u);
    }
  }
  updateDuck(); schedule(150);
}
function stopMine() {
  if (mineClip) { mineClip = false; hush({ keepPaused: true }); }   // never the story clip the Start menu paused
  if (myUtter) { myUtter = null; if (HAS_TTS) speechSynthesis.cancel(); }
}
function enqueue(sentences, { id = null, interrupt = true, stale = 0, ambient = false, goal = null, hint = false } = {}) {
  sentences = ruleFilter(sentences || [], goal ? 'goal' : hint ? 'hint' : 'narrate', id);   // checked first, voice on or off, so a silent test run still records
  if (!HAS_WIN || !enabled || !sentences.length) return false;
  const whole = sentences.join(' '), now = performance.now();
  if (now - (lastSaid.get(whole) ?? -1e9) < DEDUPE_MS) { log('suppressed (said < 4 s ago):', whole); return false; } lastSaid.set(whole, now);
  if (lastSaid.size > 200) lastSaid = new Map([...lastSaid].slice(-50));
  if (interrupt) { queue = []; stopMine(); }
  const group = ++groupN, at = now, items = id ? [{ text: whole, key: id, id, at, stale, ambient, goal, group, hint }] : sentences.map(s => ({ text: s, key: clipKey(s), at, stale, ambient, goal, group, hint }));
  if (goal) queue.unshift(...items);   // the goal goes ahead of waiting hints and toasts
  else if (!ambient) { let at = queue.findIndex(q => q.ambient && q.group !== lastGroup); if (at < 0) at = queue.length; queue.splice(at, 0, ...items); }   // the player's own result goes ahead of ambient lines
  else queue.push(...items);
  updateDuck(); schedule(interrupt ? 30 : 120); return true;
}

// ---------- the API ----------
// the touch words when the game shows the touch controls (main.js puts class "touch" on <body>), else the keyboard's
const isTouch = () => HAS_WIN && (document.body?.classList.contains('touch') || !!window.matchMedia?.('(pointer:coarse)').matches);
export function narrate(text, { id = null, interrupt = true, stale = 0 } = {}) { return enqueue(id ? [speakableText(text).replace(/\s*¶\s*/g, '. ')] : sentencesOf(text), { id, interrupt, stale }); }
let card = { body: [], choices: '', touch: false };
// { silent: true }: the card is taken as read (watchCard stays quiet about it) and nothing is said; what was talking stops
export function narrateCard(title, bodyHTML, choices, { silent = false } = {}) {
  const touch = isTouch();   // a body with keyboard / touch words (the menu's help line) reads the device's
  card = { body: sentencesOf(bodyHTML, { touch }), choices: choicesSentence(choices), touch, silent };
  if (silent) { if (HAS_WIN) { queue = []; stopMine(); updateDuck(); } return false; }
  return enqueue(cardSentences(title, bodyHTML, choices, touch), { interrupt: true });
}
// does this sentence only repeat the goal line, or a clip heard in the last 20 s? (3 of 4 of its content words)
const STOP = new Set(['the', 'and', 'you', 'your', 'to', 'a', 'an', 'up', 'of', 'in', 'on', 'at', 'it', 'is', 'for', 'with', 'go', 'get', 'that', 'this', 'from']);
const content = s => String(s).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w));
function covered(sentence, by) { const w = content(sentence); if (!w.length) return false; const b = new Set(by); let n = 0; for (const x of w) if (b.has(x) || b.has(x.replace(/s$/, ''))) n++; return n / w.length >= .75; }
function repeats(sentence) {
  if (goalNow && covered(sentence, content(goalNow))) return 'repeats the goal line';
  const now = performance.now(); heard = heard.filter(h => now - h.at < 20000);
  for (const h of heard) if (covered(sentence, h.words)) return 'repeats a clip just played';
  return '';
}
// clip: the id of the game clip that said it; under ?dbg=voice with the voice off it is logged as a muted line, so the
// dry run shows every line the player would hear (the story clips never pass through the queue)
export function noteHeard(text, clip = null) {
  if (!text) return; heard.push({ words: content(speakableText(text)), at: performance.now() });
  if (clip && DBG && HAS_WIN && !voiceOn()) log('say (muted):', speakableText(text), `[clip ${clip}]`);
}
// A toast: its headline repeating the goal (or a clip) drops the whole toast; an action's result is spoken at once.
export function narrateToast(text, sub = '', { response = true } = {}) {
  const why = repeats(sentencesOf(text).join(' ')); if (why) { log(`suppressed toast (${why}):`, text); return false; }
  return enqueue(toastSentences(text, sub), { interrupt: false, stale: STALE_MS, ambient: !response });
}
export function narrateHint(html, key = html) {
  if (key === lastHint) return false; lastHint = key; if (!html) return false;
  if (hintsSaid.has(key)) { log('suppressed hint (already said this session):', key); return false; } hintsSaid.add(key);
  const ss = hintSentences(html, isTouch()).filter(s => { const why = repeats(s); if (why) log(`suppressed hint sentence (${why}):`, s); return !why; });
  return enqueue(ss, { interrupt: false, stale: STALE_MS, ambient: true, hint: true });
}
// The goal line. Re-setting the same text says nothing, and the same goal is never said twice in a row.
export function goalShown(text) { goalNow = text || ''; }   // the goal line changed on screen (said or not): toasts and hints compare against it
export function narrateGoal(text) {
  goalNow = text || ''; if (!text) return false;
  if (text === goalSaid) { log('suppressed goal (same as the last goal said):', text); return false; }
  goalSaid = text;
  const now = performance.now(); heard = heard.filter(h => now - h.at < 20000);
  for (const h of heard) if (covered(text, h.words)) { log('suppressed goal (a clip just said it):', text); return false; }
  return enqueue(sentencesOf(text), { interrupt: false, stale: STALE_MS, ambient: true, goal: text });
}
// fight.js and approach.js append the answer to an open card and swap in a Go! button without calling card(): speak that part
export function watchCard(bodyEl, choicesEl) {
  if (!HAS_WIN || !bodyEl || typeof MutationObserver === 'undefined') return;
  let t = null;
  const check = () => {
    t = null; const box = bodyEl.closest('.screen') || bodyEl.parentElement; if (box?.classList.contains('hidden')) return;
    const now = sentencesOf(bodyEl.innerHTML, { touch: card.touch }); let k = 0; while (k < card.body.length && k < now.length && card.body[k] === now[k]) k++;
    const fresh = now.slice(k); const ch = choicesEl ? choicesSentence([...choicesEl.querySelectorAll('button:not([data-silent])')].map(b => b.innerHTML)) : '';
    const newChoice = ch && ch !== card.choices ? ch : '';
    card = { body: now, choices: ch || card.choices, touch: card.touch, silent: card.silent };
    if (card.silent) return;   // a silent card (the grown-ups' page) stays silent whatever is added to it
    if (fresh.length || newChoice) enqueue([...fresh, ...(newChoice ? [newChoice] : [])], { interrupt: true });
  };
  const mo = new MutationObserver(() => { if (!t) t = setTimeout(check, 50); });
  mo.observe(bodyEl, { childList: true, subtree: true, characterData: true }); if (choicesEl) mo.observe(choicesEl, { childList: true });
}
export function stopNarration() { queue = []; clearTimeout(pumpT); pumpT = null; stopMine(); updateDuck(); }
export function setNarration(on) { enabled = !!on; try { localStorage.setItem(NARRATE_KEY, enabled ? 'on' : 'off'); } catch {} if (!enabled) stopNarration(); }
export const narrationOn = () => enabled;
export const narrationMisses = () => [...misses.keys()];
if (HAS_WIN) window.__narrate = { narrationMisses, narrationViolations, numberRuleOK, numberRuleWhy, clipKey, sentencesOf, queue: () => queue.map(q => q.text) };   // for a console or a test page
